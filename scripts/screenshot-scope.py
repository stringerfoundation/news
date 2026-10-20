"""Select PR screenshots from the complete base-to-head frontend diff."""
import json
import os
from pathlib import PurePosixPath
import subprocess


def affects_reader(name):
    path = PurePosixPath(name)
    if path.parts[0] in ('.github', 'tests', 'scripts', 'deploy', 'docs'):
        return False
    if path.name in ('eslint.config.ts', 'eslint.config.js', 'public-assets.ts'):
        return False
    if path.suffix in ('.html', '.css', '.scss'):
        return True
    if path.parts[0] == 'assets':
        return path.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2')
    return path.suffix in ('.ts', '.tsx', '.js', '.jsx', '.mjs') and (
        len(path.parts) == 1 or path.parts[0] in ('relay', 'src'))


def main():
    enabled = False
    if os.environ.get('GITHUB_EVENT_NAME') == 'pull_request':
        with open(os.environ['GITHUB_EVENT_PATH']) as source:
            pull = json.load(source)['pull_request']
        # argv and NUL separators keep filenames out of shell syntax.
        result = subprocess.run(
            ['git', 'diff', '--name-only', '--no-renames', '-z',
             pull['base']['sha'] + '...' + pull['head']['sha'], '--'],
            check=True, capture_output=True)
        enabled = any(affects_reader(name) for name in result.stdout.decode().split('\0') if name)
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write('enabled=' + str(enabled).lower() + '\n')


if __name__ == '__main__':
    main()
