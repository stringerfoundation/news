"""Publish checked site artifacts without executing pull-request code (Python 3.10+)."""
import argparse
import base64
import io
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
import zipfile

BRANCH = 'pages-state'
ARTIFACT = 'checked-site'
MARKER = '<!-- stringer-pr-preview -->'
MAX_BYTES = 64 * 1024 * 1024
SCREENSHOTS = ('news-375.png', 'news-768.png', 'news-1280.png')
EDITION_PATHS = ('br', 'pt', 'fr', 'es', 'ar', 'zh', 'ru', 'nl', 'de')
REQUIRED_FILES = {
    'index.html', 'app.js', 'style.css', 'news-model.js', 'relay-config.js',
    'stringer-media.js', 'relay-reader.js',
    '.well-known/nostr.json', '.nojekyll', 'robots.txt',
    *('assets/' + name for name in ['stringer-logo.png', 'nostr-banner.png',
      'favicon-16.png', 'favicon-32.png', 'favicon-192.png', 'favicon-180.png']),
}
EDITION_FILES = {
    'atomstr-reader.js',
    *{f'{edition}/index.html' for edition in EDITION_PATHS},
}
SHARED_MODULE_FILES = {'response.js', 'publications.js'}
FILES = REQUIRED_FILES | EDITION_FILES | SHARED_MODULE_FILES


def allowed(path):
    return path in FILES or re.fullmatch(r'assets/stringer-thumbnails/[a-zA-Z0-9-]+\.png', path)


def unpack(data, destination):
    """Validate both archives entirely before writing any files; never extract links."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) != 1 or entries[0].filename != 'public-site.tar' or entries[0].file_size > MAX_BYTES:
            raise ValueError('Unexpected artifact archive')
        payload = archive.read(entries[0])
    files = {}
    total = 0
    with tarfile.open(fileobj=io.BytesIO(payload), mode='r:') as archive:
        for entry in archive:
            path = entry.name.removeprefix('./').rstrip('/')
            if entry.isdir() and path in ('', '.', 'assets', 'assets/stringer-thumbnails', '.well-known', *EDITION_PATHS):
                continue
            if not entry.isfile() or not allowed(path) or path in files or entry.size > MAX_BYTES:
                raise ValueError('Unexpected artifact entry: ' + entry.name)
            total += entry.size
            if total > MAX_BYTES:
                raise ValueError('Artifact exceeds size limit')
            files[path] = archive.extractfile(entry).read()
    if not REQUIRED_FILES.issubset(files):
        raise ValueError('Incomplete site artifact')
    if files.keys() & EDITION_FILES and not EDITION_FILES.issubset(files):
        raise ValueError('Incomplete multilingual site artifact')
    if files.keys() & SHARED_MODULE_FILES and not SHARED_MODULE_FILES.issubset(files):
        raise ValueError('Incomplete shared module set')
    destination.mkdir(parents=True, exist_ok=True)
    for name, contents in files.items():
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(contents)


def unpack_screenshots(data, destination):
    """Accept only the three browser-generated PNGs, never paths or executable assets."""
    files = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for entry in archive.infolist():
            if (entry.filename not in SCREENSHOTS or entry.filename in files
                    or entry.file_size > 8 * 1024 * 1024
                    or (entry.external_attr >> 16) & 0o170000 == 0o120000):
                raise ValueError('Unexpected screenshot entry')
            contents = archive.read(entry)
            if not contents.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('Expected PNG screenshot')
            files[entry.filename] = contents
    if set(files) != set(SCREENSHOTS):
        raise ValueError('Incomplete screenshots')
    destination.mkdir(parents=True, exist_ok=True)
    for name, contents in files.items():
        (destination / name).write_bytes(contents)


def robots(html, preview, sha=''):
    # noindex must be crawlable: do not hide previews behind a robots.txt Disallow.
    if preview and not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Invalid preview commit')
    content = 'noindex, nofollow, noarchive, noimageindex' if preview else 'index, follow'
    tags = f'<meta name="robots" content="{content}">'
    if preview:
        tags += f'\n<meta name="preview-commit" content="{sha}">'
    lines, offset = [], 0
    for line in html.splitlines(keepends=True):
        lines.append(offset)
        offset += len(line)

    class Metadata(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.edits, self.head = [], False

        def handle_starttag(self, tag, attrs):
            start = lines[self.getpos()[0] - 1] + self.getpos()[1]
            end = start + len(self.get_starttag_text())
            if tag == 'head' and not self.head:
                self.edits.append((end, end, '\n' + tags))
                self.head = True
            if tag == 'meta' and (dict(attrs).get('name') or '').lower() in ('robots', 'googlebot', 'bingbot', 'preview-commit'):
                self.edits.append((start, end, ''))

        handle_startendtag = handle_starttag

    parsed = Metadata()
    parsed.feed(html)
    if not parsed.head:
        raise ValueError('Site HTML must contain a head element')
    for start, end, replacement in sorted(parsed.edits, reverse=True):
        html = html[:start] + replacement + html[end:]
    return html


def apply_site(site, incoming, preview=None, sha=''):
    if preview is not None and not re.fullmatch(r'[1-9][0-9]*', str(preview)):
        raise ValueError('Invalid pull request number')
    site.mkdir(parents=True, exist_ok=True)
    target = site if preview is None else site / 'pr-preview' / str(preview)
    if preview is None:
        for child in site.iterdir():
            if child.name != 'pr-preview':
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()
    elif target.exists():
        shutil.rmtree(target)
    shutil.copytree(incoming, target, dirs_exist_ok=True)
    for page in (target / 'index.html', *(target / edition / 'index.html' for edition in EDITION_PATHS)):
        if not page.is_file():
            continue
        html = page.read_text()
        page.write_text(robots(html, preview is not None, sha))
    (target / 'robots.txt').write_text('User-agent: *\nDisallow:\n')


def select_update(run, repo, workflow_id, pulls, main_sha):
    if (run.get('conclusion') != 'success' or run.get('workflow_id') != workflow_id
            or run.get('repository', {}).get('full_name') != repo
            or (run.get('head_repository') or {}).get('full_name') != repo):
        return None
    if run['event'] in ('push', 'workflow_dispatch') and run['head_branch'] == 'main' and run['head_sha'] == main_sha:
        return 'production'
    if run['event'] != 'pull_request':
        return None
    for pull in pulls:
        if ((pull['head'].get('repo') or {}).get('full_name') == repo
                and pull['head']['sha'] == run['head_sha']
                and pull['head']['ref'] == run['head_branch']
                and any(item['number'] == pull['number'] for item in run.get('pull_requests', []))):
            return str(pull['number'])
    return None


class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        result = super().redirect_request(req, fp, code, msg, headers, newurl)
        if result and urlsplit(req.full_url).netloc != urlsplit(newurl).netloc:
            result.remove_header('Authorization')
        return result


class GitHub:
    def __init__(self, repo, token):
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo):
            raise ValueError('Invalid repository')
        self.repo, self.token = repo, token
        self.opener = build_opener(SafeRedirect())

    def request(self, path, method='GET', value=None, binary=False):
        url = path if path.startswith('https://') else 'https://api.github.com/repos/' + self.repo + '/' + path
        request = Request(url, method=method,
                          data=None if value is None else json.dumps(value).encode(),
                          headers={'Authorization': 'Bearer ' + self.token, 'Accept': 'application/vnd.github+json',
                                   'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28'})
        with self.opener.open(request, timeout=60) as response:
            data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('GitHub response exceeds size limit')
        return data if binary else json.loads(data or 'null')

    def items(self, path):
        result, page = [], 1
        while True:
            batch = self.request(path + ('&' if '?' in path else '?') + f'per_page=100&page={page}')
            result.extend(batch)
            if len(batch) < 100:
                return result
            page += 1


def git(state, token, *args):
    env = {**os.environ, 'GIT_CONFIG_COUNT': '1', 'GIT_CONFIG_KEY_0': 'http.https://github.com/.extraheader',
           'GIT_CONFIG_VALUE_0': 'AUTHORIZATION: basic ' + base64.b64encode(('x-access-token:' + token).encode()).decode()}
    return subprocess.run(['git', '-C', str(state), *args], env=env, check=True, capture_output=True, text=True).stdout


def checkout_state(api, state):
    state.mkdir(parents=True, exist_ok=False)
    git(state, api.token, 'init', '-b', BRANCH)
    git(state, api.token, 'config', 'core.hooksPath', '/dev/null')
    git(state, api.token, 'remote', 'add', 'origin', 'https://github.com/' + api.repo + '.git')
    try:
        api.request('git/ref/heads/' + BRANCH)
    except HTTPError as error:
        if error.code != 404:
            raise
    else:
        git(state, api.token, 'fetch', '--depth=1', 'origin', 'refs/heads/' + BRANCH)
        git(state, api.token, 'checkout', '-B', BRANCH, 'FETCH_HEAD')


def load_state(path):
    return json.loads(path.read_text()) if path.exists() else {'production': None, 'previews': {}}


def prune(site, metadata, pulls):
    open_numbers = {str(pull['number']) for pull in pulls}
    removed = []
    for number in list(metadata['previews']):
        if not re.fullmatch(r'[1-9][0-9]*', number):
            raise ValueError('Invalid stored preview number')
        if number not in open_numbers:
            shutil.rmtree(site / 'pr-preview' / number, ignore_errors=True)
            del metadata['previews'][number]
            removed.append(number)
    return removed


def save_state(api, state, metadata):
    (state / 'state.json').write_text(json.dumps(metadata, sort_keys=True) + '\n')
    git(state, api.token, 'add', '--', 'site', 'state.json')
    if git(state, api.token, 'diff', '--cached', '--name-only'):
        git(state, api.token, '-c', 'user.name=github-actions[bot]', '-c',
            'user.email=41898282+github-actions[bot]@users.noreply.github.com',
            'commit', '-m', 'Update checked production and PR previews')
        git(state, api.token, 'push', 'origin', 'HEAD:refs/heads/' + BRANCH)


def prepare(api, state, incoming, plan_path):
    checkout_state(api, state)
    metadata = load_state(state / 'state.json')
    site = state / 'site'
    pulls = api.items('pulls?state=open')
    open_numbers = {str(pull['number']) for pull in pulls}
    metadata['removed'] = sorted(set(metadata.get('removed', [])) | set(prune(site, metadata, pulls)))
    metadata['removed'] = [number for number in metadata['removed'] if number not in open_numbers]
    workflow = api.request('actions/workflows/pages.yml')
    main_sha = api.request('commits/main')['sha']
    # Reconcile current heads on every event. GitHub concurrency may replace pending
    # runs, so deployment must never depend on receiving every individual event.
    targets = [('production', main_sha, [])] + [
        (str(pull['number']), pull['head']['sha'], [pull]) for pull in pulls
        if (pull['head'].get('repo') or {}).get('full_name') == api.repo]
    by_sha = {}
    for update, sha, relevant_pulls in targets:
        if sha not in by_sha:
            by_sha[sha] = api.request(f'actions/workflows/pages.yml/runs?status=success&head_sha={sha}&per_page=100')['workflow_runs']
        run = next((run for run in by_sha[sha]
                    if select_update(run, api.repo, workflow['id'], relevant_pulls, main_sha) == update), None)
        if not run:
            continue
        previous = metadata['production'] if update == 'production' else metadata['previews'].get(update)
        build = {'sha': run['head_sha'], 'run': run['id'], 'attempt': run.get('run_attempt', 1)}
        if previous and all(previous.get(key) == value for key, value in build.items()):
            continue
        artifacts = api.request(f"actions/runs/{run['id']}/artifacts")['artifacts']
        artifact = next((item for item in artifacts if item['name'] == ARTIFACT and not item['expired']), None)
        if not artifact:
            print(f"No checked site artifact for run {run['id']}; retain the last published build.")
            continue
        if artifact['size_in_bytes'] > MAX_BYTES:
            raise ValueError('Checked site artifact exceeds size limit')
        if update != 'production' and not metadata['production']:
            continue
        if incoming.exists():
            shutil.rmtree(incoming)
        unpack(api.request(f"actions/artifacts/{artifact['id']}/zip", binary=True), incoming)
        if update == 'production':
            apply_site(site, incoming)
            metadata['production'] = build
        else:
            apply_site(site, incoming, update, run['head_sha'])
            screenshots = next((item for item in artifacts
                                if item['name'] == 'preview-screenshots' and not item['expired']), None)
            if screenshots:
                if screenshots['size_in_bytes'] > MAX_BYTES:
                    raise ValueError('Screenshot artifact exceeds size limit')
                unpack_screenshots(api.request(f"actions/artifacts/{screenshots['id']}/zip", binary=True),
                                   site / 'pr-preview' / update / 'screenshots' / run['head_sha'])
                build['screenshots'] = True
            metadata['previews'][update] = build
    if not metadata['production'] or not (site / 'index.html').is_file():
        print('No checked production build yet; wait for main CI before publishing previews.')
        return False
    # The branch contains generated assets and deployment metadata, never source.
    save_state(api, state, metadata)
    plan_path.write_text(json.dumps({'previews': metadata['previews'], 'removed': metadata['removed']}))
    return True


def comment_body(repo, number, build, pages_url):
    url = pages_url.rstrip('/') + '/pr-preview/' + str(number) + '/'
    body = (f'{MARKER}\n[Open preview]({url}) · commit '
            f"[`{build['sha'][:7]}`](https://github.com/{repo}/commit/{build['sha']})\n\n"
            'This preview updates after CI passes and is removed when the PR closes. Search engines are instructed not to index it.')
    if build.get('screenshots'):
        body += '\n\n### Automated screenshots\n\nCurrent build, using synthetic test data.'
        for name, label in zip(SCREENSHOTS, ('Mobile (375px)', 'Tablet (768px)', 'Desktop (1280px)')):
            body += f"\n\n#### {label}\n\n![{label}]({url}screenshots/{build['sha']}/{name})"
    return body


def report(api, plan, pages_url):
    if not pages_url.startswith('https://'):
        raise ValueError('Invalid Pages deployment URL')
    for number in dict.fromkeys([*plan['previews'], *plan['removed']]):
        pull = api.request('pulls/' + number)
        if number in plan['previews']:
            if pull['state'] != 'open':
                continue
            body = comment_body(api.repo, number, plan['previews'][number], pages_url)
        else:
            if pull['state'] == 'open':
                continue
            body = MARKER + '\nPreview removed because this PR is closed.'
        comments = api.items(f'issues/{number}/comments')
        previous = next((item for item in comments if item['user']['login'] == 'github-actions[bot]' and MARKER in item['body']), None)
        if previous and previous['body'] != body:
            api.request(f"issues/comments/{previous['id']}", 'PATCH', {'body': body})
        elif not previous and number in plan['previews']:
            api.request(f'issues/{number}/comments', 'POST', {'body': body})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['prepare', 'report'])
    parser.add_argument('--state', type=Path, required=True)
    parser.add_argument('--incoming', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    args = parser.parse_args()
    api = GitHub(os.environ['GITHUB_REPOSITORY'], os.environ['GH_TOKEN'])
    if args.mode == 'prepare':
        result = prepare(api, args.state, args.incoming, args.plan)
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write('publish=' + str(result).lower() + '\n')
    else:
        plan = json.loads(args.plan.read_text())
        report(api, plan, os.environ['PAGES_URL'])
        if plan['removed']:
            metadata = load_state(args.state / 'state.json')
            metadata['removed'] = []
            save_state(api, args.state, metadata)


if __name__ == '__main__':
    main()
