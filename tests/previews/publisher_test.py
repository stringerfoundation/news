import copy
import importlib.util
import io
import json
import os
import subprocess
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).resolve().parents[2] / 'scripts/pages-preview.py')
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
REPO = 'example/news'
SHA = 'a' * 40
NEW_SHA = 'b' * 40


def archive(extra=None, omit=None, files=None):
    contents = {name: b'fixture' for name in (files or publisher.FILES) if name != omit}
    page = b'<html><head><meta name="robots" content="noindex"></head><body>News</body></html>'
    for name in list(contents):
        if name.endswith('/index.html'):
            contents[name] = page
    contents['index.html'] = page
    contents.update(extra or {})
    tar_data = io.BytesIO()
    with tarfile.open(fileobj=tar_data, mode='w') as packed:
        for name, value in contents.items():
            if isinstance(value, tarfile.TarInfo):
                packed.addfile(value)
            else:
                entry = tarfile.TarInfo(name)
                entry.size = len(value)
                packed.addfile(entry, io.BytesIO(value))
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w') as packed:
        packed.writestr('public-site.tar', tar_data.getvalue())
    return output.getvalue()


def pull(number=18, sha=SHA, repo=REPO):
    return {'number': number, 'state': 'open', 'head': {'ref': 'feature', 'sha': sha, 'repo': {'full_name': repo}}}


def run(event='pull_request', sha=SHA, number=18, run_id=100):
    return {'id': run_id, 'run_attempt': 1, 'event': event, 'conclusion': 'success', 'workflow_id': 7,
            'repository': {'full_name': REPO}, 'head_repository': {'full_name': REPO},
            'head_branch': 'main' if event == 'push' else 'feature', 'head_sha': sha,
            'pull_requests': [{'number': number}] if event == 'pull_request' else []}


class PublisherTests(unittest.TestCase):
    def test_screenshots_validate_all_entries_before_writing(self):
        png = b'\x89PNG\r\n\x1a\nfixture'
        valid = {name: png for name in publisher.SCREENSHOTS}
        for files in [valid, {**valid, '../escape.png': png}, {**valid, 'index.html': b'html'},
                      {**valid, 'news-375.png': b'not png'}, {'news-375.png': png}]:
            output = io.BytesIO()
            with zipfile.ZipFile(output, 'w') as packed:
                for name, contents in files.items():
                    packed.writestr(name, contents)
            with tempfile.TemporaryDirectory() as directory:
                target = Path(directory) / 'screenshots'
                if files == valid:
                    publisher.unpack_screenshots(output.getvalue(), target)
                    self.assertEqual({p.name for p in target.iterdir()}, set(valid))
                else:
                    with self.assertRaises(ValueError):
                        publisher.unpack_screenshots(output.getvalue(), target)
                    self.assertFalse(target.exists())

    def test_screenshots_are_embedded_in_existing_preview_comment_only_when_available(self):
        build = {'sha': SHA, 'screenshots': True}
        body = publisher.comment_body(REPO, 18, build, 'https://example.github.io/news/')
        self.assertIn(publisher.MARKER, body)
        self.assertIn('[Open preview]', body)
        for name in publisher.SCREENSHOTS:
            self.assertIn(f'/pr-screenshots/18/{SHA}/{name}', body)
        self.assertIn('synthetic test data', body)
        self.assertNotIn('Automated screenshots', publisher.comment_body(
            REPO, 18, {'sha': SHA}, 'https://example.github.io/news/'))

    def test_extracts_only_complete_public_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'incoming'
            publisher.unpack(archive(), root)
            self.assertEqual({str(path.relative_to(root)) for path in root.rglob('*') if path.is_file()}, publisher.FILES)

    def test_accepts_legacy_complete_artifact_without_multilingual_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            incoming, site = root / 'incoming', root / 'site'
            publisher.unpack(archive(files=publisher.REQUIRED_FILES), incoming)
            publisher.apply_site(site, incoming)
            self.assertIn('content="index, follow"', (site / 'index.html').read_text())
            self.assertFalse((site / 'fr/index.html').exists())

    def test_accepts_current_main_shared_modules_without_editions(self):
        with tempfile.TemporaryDirectory() as directory:
            incoming = Path(directory) / 'incoming'
            publisher.unpack(archive(files=publisher.REQUIRED_FILES | publisher.SHARED_MODULE_FILES), incoming)
            self.assertTrue((incoming / 'response.js').exists())
            self.assertFalse((incoming / 'fr/index.html').exists())

    def test_rejects_traversal_links_source_extra_files_and_missing_assets_before_writing(self):
        link = tarfile.TarInfo('assets/stringer-thumbnails/link.png')
        link.type, link.linkname = tarfile.SYMTYPE, '/tmp/outside'
        hardlink = copy.copy(link)
        hardlink.type = tarfile.LNKTYPE
        for extra, omit in [({'../escape': b'bad'}, None), ({'/index.html': b'bad'}, None),
                            ({'scripts/private.js': b'bad'}, None), ({'README.md': b'bad'}, None),
                            ({'fr/private.js': b'bad'}, None), ({'it/index.html': b'bad'}, None),
                            ({link.name: link}, None), ({hardlink.name: hardlink}, None), ({}, 'app.js'), ({}, 'fr/index.html'), ({}, 'atomstr-reader.js'),
                            ({}, 'response.js'), ({}, 'publications.js')]:
            with self.subTest(extra=extra, omit=omit), tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / 'incoming'
                with self.assertRaises(ValueError):
                    publisher.unpack(archive(extra, omit), root)
                self.assertFalse(root.exists())

    def test_production_and_independent_previews_survive_updates_and_close_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            incoming, site = root / 'incoming', root / 'site'
            publisher.unpack(archive(), incoming)
            publisher.apply_site(site, incoming)
            for edition in publisher.EDITION_PATHS:
                self.assertIn('content="index, follow"', (site / edition / 'index.html').read_text())
                self.assertNotIn('noindex', (site / edition / 'index.html').read_text())
            publisher.apply_site(site, incoming, '18', SHA)
            publisher.apply_site(site, incoming, '19', NEW_SHA)
            before = (site / 'pr-preview/19/index.html').read_text()
            publisher.apply_site(site, incoming)
            publisher.apply_site(site, incoming, '18', NEW_SHA)
            self.assertEqual((site / 'pr-preview/19/index.html').read_text(), before)
            self.assertIn('content="index, follow"', (site / 'index.html').read_text())
            self.assertNotIn('noindex', (site / 'index.html').read_text())
            self.assertIn('noindex, nofollow', (site / 'pr-preview/18/index.html').read_text())
            for edition in publisher.EDITION_PATHS:
                preview_page = (site / 'pr-preview/18' / edition / 'index.html').read_text()
                self.assertIn('noindex, nofollow', preview_page)
                self.assertIn(NEW_SHA, preview_page)
            self.assertIn(NEW_SHA, (site / 'pr-preview/18/index.html').read_text())
            self.assertNotIn('Disallow: /', (site / 'robots.txt').read_text())
            self.assertNotIn('Disallow: /', (site / 'pr-preview/18/robots.txt').read_text())
            metadata = {'previews': {'18': {}, '19': {}}}
            self.assertEqual(publisher.prune(site, metadata, [pull(19)]), ['18'])
            self.assertFalse((site / 'pr-preview/18').exists())
            self.assertTrue((site / 'pr-preview/19').exists())
            self.assertTrue((site / 'index.html').exists())
            with self.assertRaises(ValueError):
                publisher.apply_site(site, incoming, '../escape', SHA)

    def test_indexing_metadata_handles_case_order_unquoted_values_and_script_text(self):
        html = """<HTML><HEAD>
        <meta content='noindex' NAME=Robots><meta name=googlebot content=noindex>
        <meta name='bingbot' content='noindex'/><script>const example = '<head>';</script>
        </HEAD><BODY>News</BODY></HTML>"""
        production = publisher.robots(html, False)
        self.assertNotIn('noindex', production)
        self.assertEqual(production.count('name="robots"'), 1)
        preview = publisher.robots(html, True, SHA)
        self.assertIn('noindex, nofollow', preview)
        self.assertEqual(preview.count('name="robots"'), 1)
        with self.assertRaises(ValueError):
            publisher.robots('<body>No head</body>', True, SHA)

    def test_only_successful_correct_workflow_current_same_repo_heads_are_eligible(self):
        valid = run()
        self.assertEqual(publisher.select_update(valid, REPO, 7, [pull()], NEW_SHA), '18')
        production = run('push', NEW_SHA)
        self.assertEqual(publisher.select_update(production, REPO, 7, [], NEW_SHA), 'production')
        for mutation in [dict(conclusion='failure'), dict(conclusion=None), dict(workflow_id=8),
                         dict(head_sha=NEW_SHA), dict(head_repository={'full_name': 'fork/news'}),
                         dict(repository={'full_name': 'other/news'}), dict(event='pull_request_target'),
                         dict(pull_requests=[]), dict(head_branch='different')]:
            self.assertIsNone(publisher.select_update({**valid, **mutation}, REPO, 7, [pull()], NEW_SHA))
        self.assertIsNone(publisher.select_update(production, REPO, 7, [], SHA))
        self.assertIsNone(publisher.select_update(valid, REPO, 7, [], NEW_SHA))
        self.assertIsNone(publisher.select_update(valid, REPO, 7, [pull(repo='fork/news')], NEW_SHA))

    def test_report_updates_one_bot_comment_and_marks_closed_previews_removed(self):
        class API:
            repo = REPO
            def __init__(self):
                self.writes = []
            def request(self, path, method='GET', value=None):
                if method != 'GET':
                    self.writes.append((path, method, value))
                elif path.startswith('pulls/'):
                    return {'state': 'closed' if path.endswith('19') else 'open'}
            def items(self, path):
                return [{'id': 1, 'user': {'login': 'human'}, 'body': publisher.MARKER},
                        {'id': 2 if '/18/' in path else 3, 'user': {'login': 'github-actions[bot]'}, 'body': publisher.MARKER}]
        api = API()
        plan = {'previews': {'18': {'sha': SHA}}, 'removed': ['19'],
                'screenshots': {'19': {'sha': SHA, 'screenshots': True}}}
        publisher.report(api, plan, 'https://example.github.io/news/')
        self.assertEqual(len(api.writes), 2)
        self.assertEqual(api.writes[0][:2], ('issues/comments/2', 'PATCH'))
        self.assertIn('https://example.github.io/news/pr-preview/18/', api.writes[0][2]['body'])
        self.assertIn(SHA[:7], api.writes[0][2]['body'])
        self.assertIn('removed', api.writes[1][2]['body'])
        self.assertIn(f'/pr-screenshots/19/{SHA}/news-375.png', api.writes[1][2]['body'])
        self.assertNotIn('[Open preview]', api.writes[1][2]['body'])

    def test_reconcile_recovers_coalesced_events_and_retains_previous_builds(self):
        screenshots = io.BytesIO()
        with zipfile.ZipFile(screenshots, 'w') as packed:
            for name in publisher.SCREENSHOTS:
                packed.writestr(name, b'\x89PNG\r\n\x1a\nfixture')
        class API:
            repo, token = REPO, 'fixture'
            def items(self, path):
                return [pull()]
            def request(self, path, **_options):
                if path == 'actions/workflows/pages.yml':
                    return {'id': 7}
                if path == 'commits/main':
                    return {'sha': NEW_SHA}
                if '/runs?status=success&head_sha=' + NEW_SHA in path:
                    return {'workflow_runs': [run('push', NEW_SHA, run_id=101)]}
                if '/runs?status=success&head_sha=' + SHA in path:
                    return {'workflow_runs': [run()]}
                if path.endswith('/artifacts'):
                    return {'artifacts': [
                        {'id': 1, 'name': publisher.ARTIFACT, 'expired': False, 'size_in_bytes': 1000},
                        {'id': 2, 'name': 'preview-screenshots', 'expired': False, 'size_in_bytes': 1000}]}
                if path == 'actions/artifacts/1/zip':
                    return archive()
                if path == 'actions/artifacts/2/zip':
                    return screenshots.getvalue()
                raise AssertionError(path)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state, incoming, plan = root / 'state', root / 'incoming', root / 'plan.json'
            with patch.object(publisher, 'checkout_state', side_effect=lambda _api, path: path.mkdir()), patch.object(publisher, 'save_state'):
                self.assertTrue(publisher.prepare(API(), state, incoming, plan))
            self.assertTrue((state / 'site/index.html').is_file())
            self.assertTrue((state / 'site/pr-preview/18/index.html').is_file())
            self.assertEqual(json.loads(plan.read_text())['previews']['18']['sha'], SHA)
            self.assertTrue(json.loads(plan.read_text())['previews']['18']['screenshots'])
            self.assertTrue((state / f'site/pr-screenshots/18/{SHA}/news-375.png').is_file())
            self.assertFalse((state / 'site/screenshots').exists())
            metadata = json.loads(plan.read_text())
            publisher.prune(state / 'site', metadata, [])
            self.assertFalse((state / 'site/pr-preview/18').exists())
            self.assertTrue(metadata['screenshots']['18']['screenshots'])
            publisher.apply_site(state / 'site', incoming)
            self.assertTrue((state / f'site/pr-screenshots/18/{SHA}/news-375.png').is_file())

        # Two PRs may share a head commit; each still needs its own preview and provenance.
        class SharedHeadAPI(API):
            def items(self, _path):
                return [pull(), pull(19)]
            def request(self, path, **options):
                if '/runs?status=success&head_sha=' + SHA in path:
                    return {'workflow_runs': [run(number=19, run_id=102), run()]}
                return super().request(path, **options)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(publisher, 'checkout_state', side_effect=lambda _api, path: path.mkdir()), patch.object(publisher, 'save_state'):
                self.assertTrue(publisher.prepare(SharedHeadAPI(), root / 'state', root / 'incoming', root / 'plan'))
            self.assertEqual(set(json.loads((root / 'plan').read_text())['previews']), {'18', '19'})

    def test_generated_branch_persists_assets_and_pending_builds_then_removes_closed_preview(self):
        class API:
            repo, token = REPO, 'fixture'
            pulls = [pull()]
            def items(self, _path):
                return self.pulls
            def request(self, path, **_options):
                if path == 'actions/workflows/pages.yml':
                    return {'id': 7}
                if path == 'commits/main':
                    return {'sha': NEW_SHA}
                if '/runs?status=success&head_sha=' + NEW_SHA in path:
                    return {'workflow_runs': [run('push', NEW_SHA, run_id=101)]}
                if '/runs?status=success&head_sha=' + SHA in path:
                    return {'workflow_runs': [run()]}
                if '/runs?status=success' in path:
                    return {'workflow_runs': []}  # New PR head has not passed CI.
                if path.endswith('/artifacts'):
                    return {'artifacts': [{'id': 1, 'name': publisher.ARTIFACT, 'expired': False, 'size_in_bytes': 1000}]}
                if path == 'actions/artifacts/1/zip':
                    return archive()
                raise AssertionError(path)
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1'}):
            root = Path(directory)
            remote = root / 'remote.git'
            subprocess.run(['git', 'init', '--bare', str(remote)], check=True, capture_output=True)
            def checkout(_api, path):
                path.mkdir()
                publisher.git(path, 'fixture', 'init', '-b', publisher.BRANCH)
                publisher.git(path, 'fixture', 'remote', 'add', 'origin', str(remote))
                if (remote / 'refs/heads' / publisher.BRANCH).exists():
                    publisher.git(path, 'fixture', 'fetch', 'origin', publisher.BRANCH)
                    publisher.git(path, 'fixture', 'checkout', '-B', publisher.BRANCH, 'FETCH_HEAD')
            api = API()
            with patch.object(publisher, 'checkout_state', side_effect=checkout):
                first = root / 'first'
                self.assertTrue(publisher.prepare(api, first, root / 'incoming1', root / 'plan1'))
                self.assertTrue((first / 'site/pr-preview/18/index.html').exists())
                self.assertFalse((first / 'scripts').exists())
                api.pulls = [pull(sha='c' * 40)]
                second = root / 'second'
                self.assertTrue(publisher.prepare(api, second, root / 'incoming2', root / 'plan2'))
                self.assertEqual(publisher.load_state(second / 'state.json')['previews']['18']['sha'], SHA)
                self.assertIn('index, follow', (second / 'site/index.html').read_text())
                api.pulls = []
                third = root / 'third'
                self.assertTrue(publisher.prepare(api, third, root / 'incoming3', root / 'plan3'))
                self.assertFalse((third / 'site/pr-preview/18').exists())
                self.assertTrue((third / 'site/index.html').exists())
                self.assertEqual(json.loads((root / 'plan3').read_text())['removed'], ['18'])

    def test_cross_origin_redirect_does_not_forward_github_token(self):
        request = publisher.Request('https://api.github.com/artifact', headers={'Authorization': 'Bearer fixture'})
        redirected = publisher.SafeRedirect().redirect_request(request, None, 302, '', {}, 'https://storage.example.test/archive')
        self.assertIsNone(redirected.get_header('Authorization'))



if __name__ == '__main__':
    unittest.main()
