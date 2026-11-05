import importlib.util
import io
import json
import os
from pathlib import Path
import runpy
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

PATH = Path(__file__).resolve().parents[2] / 'scripts/report-coverage.py'
spec = importlib.util.spec_from_file_location('coverage_report', PATH)
reporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reporter)
REPO, SHA = 'example/news', 'a' * 40


def summary(value=100):
    return {'total': {metric: {'pct': value} for metric in reporter.METRICS}}


def archive(value=None, name='coverage-summary.json'):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as packed:
        packed.writestr(name, json.dumps(summary() if value is None else value))
    return output.getvalue()


class API:
    def __init__(self):
        self.run = {'status': 'completed', 'conclusion': 'success', 'workflow_id': 7,
                    'repository': {'full_name': REPO}, 'head_sha': SHA}
        self.pulls = [{'number': 29, 'head': {'sha': SHA}}]
        self.current = {'state': 'open', 'head': {'sha': SHA}}
        self.comments, self.writes = [], []
        self.artifacts = [{'name': 'frontend-coverage-node-' + node, 'id': int(node),
                           'expired': False, 'size_in_bytes': 1000} for node in ('24', '26')]
        self.data = archive()

    def __call__(self, path, method='GET', value=None, binary=False, paginate=False):
        if method != 'GET':
            self.writes.append((path, method, value))
            return {}
        if path.endswith('actions/runs/123'):
            return self.run
        if path.endswith('actions/workflows/coverage.yml'):
            return {'id': 7}
        if 'pulls?state=open' in path:
            assert paginate
            return [self.pulls]
        if path.endswith('pulls/29'):
            return self.current
        if path.endswith('/artifacts?per_page=100'):
            return {'artifacts': self.artifacts}
        if path.endswith('/zip'):
            assert binary
            return self.data
        if '/comments?per_page' in path:
            assert paginate
            return [self.comments]
        raise AssertionError(path)


class CoverageReportTests(unittest.TestCase):
    def test_summary_reads_only_numeric_metrics(self):
        self.assertEqual(reporter.read_summary(archive(summary(99.5))), [99.5] * 4)
        for value in (True, '100', None, -1, 101, float('nan'), float('inf')):
            with self.subTest(value=value), self.assertRaises(ValueError):
                reporter.read_summary(archive(summary(value)))
        for data in (archive(name='../../coverage-summary.json'), archive({'total': {}})):
            with self.assertRaises((ValueError, KeyError)):
                reporter.read_summary(data)
        with patch.object(reporter, 'MAX_ARCHIVE', 10), self.assertRaises(ValueError):
            reporter.read_summary(b'x' * 11)
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w') as packed:
            packed.writestr('coverage-summary.json', ' ' * 1_000_001)
        with self.assertRaises(ValueError):
            reporter.read_summary(output.getvalue())

    def test_api_uses_arguments_and_json_stdin_without_shell(self):
        with patch.object(reporter.subprocess, 'run', return_value=SimpleNamespace(stdout=b'{}')) as run:
            self.assertEqual(reporter.api('repos/example/news'), {})
            reporter.api('path', 'PATCH', {'body': 'literal $(no execution)'}, paginate=True)
            args, options = run.call_args
            self.assertIn('--paginate', args[0])
            self.assertIn('--input', args[0])
            self.assertEqual(json.loads(options['input']), {'body': 'literal $(no execution)'})
            self.assertEqual(reporter.api('path', binary=True), b'{}')
        with patch.object(reporter, 'MAX_ARCHIVE', 1), patch.object(reporter.subprocess, 'run', return_value=SimpleNamespace(stdout=b'{}')), self.assertRaises(ValueError):
            reporter.api('path')

    def test_posts_report_and_preserves_human_comments(self):
        api = API()
        api.comments = [{'id': 1, 'user': {'login': 'human'}, 'body': reporter.MARKER}]
        reporter.report(REPO, 123, api)
        self.assertEqual(len(api.writes), 1)
        path, method, value = api.writes[0]
        self.assertEqual(method, 'POST')
        self.assertTrue(path.endswith('issues/29/comments'))
        self.assertIn('| Node 24 | 100% | 100% | 100% | 100% |', value['body'])
        self.assertIn('**Passed**', value['body'])
        self.assertIn('/actions/runs/123', value['body'])

    def test_updates_one_bot_comment_and_skips_identical_results(self):
        api = API()
        api.comments = [{'id': 8, 'user': {'login': 'github-actions[bot]'}, 'body': reporter.MARKER}]
        reporter.report(REPO, 123, api)
        self.assertTrue(api.writes[0][0].endswith('issues/comments/8'))
        self.assertEqual(api.writes[0][1], 'PATCH')
        api.comments[0]['body'] = api.writes[0][2]['body']
        api.writes.clear()
        reporter.report(REPO, 123, api)
        self.assertFalse(api.writes)

    def test_reports_missing_expired_and_corrupt_artifacts_honestly(self):
        for data in (b'not a zip', archive({'total': []}), archive({'total': {}})):
            api = API()
            api.data = data
            reporter.report(REPO, 123, api)
            self.assertIn('Unavailable', api.writes[0][2]['body'])
        api = API()
        api.artifacts[0]['size_in_bytes'] = reporter.MAX_ARCHIVE + 1
        api.artifacts[1]['expired'] = True
        api.run['conclusion'] = 'failure'
        reporter.report(REPO, 123, api)
        self.assertIn('**Failed**', api.writes[0][2]['body'])
        self.assertIn('Unavailable', api.writes[0][2]['body'])
        api = API()
        api.artifacts = [{'name': 'unrelated', 'expired': False}]
        api.run['conclusion'] = 'unknown'
        reporter.report(REPO, 123, api)
        self.assertIn('report unavailable', api.writes[0][2]['body'])
        self.assertIn('**Incomplete**', api.writes[0][2]['body'])

    def test_stale_closed_and_unrelated_runs_never_post(self):
        for change in ({'status': 'in_progress'}, {'workflow_id': 8}, {'repository': {'full_name': 'other/news'}}):
            api = API()
            api.run.update(change)
            reporter.report(REPO, 123, api)
            self.assertFalse(api.writes)
        api = API()
        api.pulls = []
        reporter.report(REPO, 123, api)
        self.assertFalse(api.writes)
        for current in ({'state': 'closed', 'head': {'sha': SHA}}, {'state': 'open', 'head': {'sha': 'b' * 40}}):
            api = API()
            api.current = current
            reporter.report(REPO, 123, api)
            self.assertFalse(api.writes)
        for repo, run_id in (('../bad', 123), ('example/..', 123), (REPO, 'invalid')):
            with self.assertRaises(ValueError):
                reporter.report(repo, run_id, API())
        api = API()
        api.run['head_sha'] = 'bad'
        with self.assertRaises(ValueError):
            reporter.report(REPO, 123, api)

    def test_command_entry_uses_workflow_environment(self):
        api = API()
        api.pulls = []
        def command(args, **_options):
            return SimpleNamespace(stdout=json.dumps(api(args[2], paginate='--paginate' in args)).encode())
        with patch.dict(os.environ, {'GITHUB_REPOSITORY': REPO, 'COVERAGE_RUN_ID': '123'}), patch('subprocess.run', side_effect=command):
            runpy.run_path(str(PATH), run_name='__main__')
        with patch.object(reporter, 'report') as report, patch.dict(os.environ, {'GITHUB_REPOSITORY': REPO, 'COVERAGE_RUN_ID': '123'}):
            reporter.main()
            report.assert_called_once_with(REPO, '123')


if __name__ == '__main__':
    unittest.main()
