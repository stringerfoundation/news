import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'scope', Path(__file__).resolve().parents[2] / 'scripts/screenshot-scope.py')
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


class ScreenshotScopeTests(unittest.TestCase):
    def test_full_pr_diff_and_non_pr_events(self):
        for event, changed, expected in (
                ('pull_request', b'README.md\0app.ts\0', True),
                ('pull_request', b'.github/workflows/pages.yml\0', False),
                ('push', b'app.ts\0', False),
                ('workflow_dispatch', b'style.css\0', False)):
            with self.subTest(event=event, changed=changed), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'event.json').write_text(json.dumps({
                    'pull_request': {'base': {'sha': 'a' * 40}, 'head': {'sha': 'b' * 40}}}))
                with patch.dict(os.environ, {
                        'GITHUB_EVENT_NAME': event, 'GITHUB_EVENT_PATH': str(root / 'event.json'),
                        'GITHUB_OUTPUT': str(root / 'output')}), patch.object(
                            scope.subprocess, 'run', return_value=subprocess.CompletedProcess(
                                [], 0, stdout=changed)) as diff:
                    scope.main()
                self.assertEqual((root / 'output').read_text(), f'enabled={str(expected).lower()}\n')
                if event == 'pull_request':
                    self.assertEqual(diff.call_args.args[0], [
                        'git', 'diff', '--name-only', '--no-renames', '-z', 'a' * 40 + '...' + 'b' * 40, '--'])
                else:
                    diff.assert_not_called()

    def test_reader_markup_styles_typescript_javascript_and_images(self):
        for name in ('index.html', 'pt/index.html', 'style.css', 'app.ts', 'app.js',
                     'news-model.ts', 'relay/reader.ts', 'src/Card.tsx',
                     'assets/stringer-logo.png', 'assets/font.woff2'):
            with self.subTest(name=name):
                self.assertTrue(scope.affects_reader(name))

    def test_docs_tests_tooling_and_ci_do_not_publish_screenshots(self):
        for name in ('README.md', 'package-lock.json', 'package.json', 'tsconfig.json',
                     'eslint.config.ts', 'public-assets.ts', '.github/workflows/pages.yml',
                     'scripts/build.ts', 'scripts/pages-preview.py',
                     'tests/browser.spec.ts', 'tests/fixtures/page.html',
                     'deploy/homepage-worker/worker.ts', 'assets/README.md'):
            with self.subTest(name=name):
                self.assertFalse(scope.affects_reader(name))
