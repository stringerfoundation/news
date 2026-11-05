"""Post numeric coverage summaries from CI artifacts without executing PR code."""
import io
import json
import math
import os
import re
import subprocess
import zipfile

MARKER = '<!-- stringer-coverage -->'
METRICS = ('lines', 'branches', 'functions', 'statements')
MAX_ARCHIVE = 128 * 1024 * 1024


def api(path, method='GET', value=None, binary=False, paginate=False):
    args = ['gh', 'api', path, '--method', method]
    if paginate:
        args += ['--paginate', '--slurp']
    if value is not None:
        args += ['--input', '-']
    result = subprocess.run(args, input=None if value is None else json.dumps(value).encode(),
                            check=True, capture_output=True)
    if len(result.stdout) > MAX_ARCHIVE:
        raise ValueError('Coverage API response exceeds size limit')
    return result.stdout if binary else json.loads(result.stdout)


def read_summary(data):
    if len(data) > MAX_ARCHIVE:
        raise ValueError('Coverage artifact exceeds size limit')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = [entry for entry in archive.infolist() if entry.filename == 'coverage-summary.json']
        if len(entries) != 1 or entries[0].file_size > 1_000_000:
            raise ValueError('Missing or oversized coverage summary')
        total = json.loads(archive.read(entries[0]))['total']
    result = []
    for metric in METRICS:
        value = total[metric]['pct']
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 100:
            raise ValueError('Invalid coverage percentage')
        result.append(value)
    return result


def report(repo, run_id, request=api):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+', repo) or repo.split('/')[-1] in ('.', '..') or not str(run_id).isdigit():
        raise ValueError('Invalid coverage run identity')
    root = 'repos/' + repo + '/'
    run = request(root + 'actions/runs/' + str(run_id))
    workflow = request(root + 'actions/workflows/coverage.yml')
    if (run.get('status') != 'completed' or run.get('workflow_id') != workflow['id']
            or run.get('repository', {}).get('full_name') != repo):
        return
    sha = run['head_sha']
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Invalid coverage commit')
    pulls = [pull for page in request(root + 'pulls?state=open&per_page=100', paginate=True)
             for pull in page if pull['head']['sha'] == sha]
    if not pulls:
        return
    url = f'https://github.com/{repo}/actions/runs/{int(run_id)}'
    rows = []
    for artifact in request(root + f'actions/runs/{run_id}/artifacts?per_page=100')['artifacts']:
        match = re.fullmatch(r'frontend-coverage-node-(24|26)', artifact['name'])
        if not match or artifact['expired']:
            continue
        try:
            if artifact['size_in_bytes'] > MAX_ARCHIVE:
                raise ValueError('Coverage artifact exceeds size limit')
            values = read_summary(request(root + f"actions/artifacts/{int(artifact['id'])}/zip", binary=True))
            cells = ' | '.join(f'{value:g}%' for value in values)
        except (ValueError, KeyError, TypeError, zipfile.BadZipFile):
            cells = 'Unavailable | Unavailable | Unavailable | Unavailable'
        rows.append((match[1], f'| Node {match[1]} | {cells} |'))
    state = {'success': 'Passed', 'failure': 'Failed', 'cancelled': 'Cancelled', 'timed_out': 'Timed out'}.get(run.get('conclusion'), 'Incomplete')
    body = f'{MARKER}\n### Test coverage\n\nCommit `{sha[:7]}` · CI: **{state}**\n\n'
    if rows:
        body += '| Runtime | Lines | Branches | Functions | Statements |\n|---|---:|---:|---:|---:|\n'
        body += '\n'.join(row for _, row in sorted(rows)) + '\n\n'
    else:
        body += 'Coverage report unavailable for this run.\n\n'
    body += f'[View CI and download the annotated coverage reports]({url})\n\nTarget: **100% per source file** for every metric.'
    for pull in pulls:
        number = int(pull['number'])
        current = request(root + f'pulls/{number}')
        if current['state'] != 'open' or current['head']['sha'] != sha:
            continue
        comments = [comment for page in request(root + f'issues/{number}/comments?per_page=100', paginate=True) for comment in page]
        previous = next((comment for comment in comments if comment['user']['login'] == 'github-actions[bot]' and MARKER in comment['body']), None)
        if previous:
            if previous['body'] != body:
                request(root + f"issues/comments/{int(previous['id'])}", 'PATCH', {'body': body})
        else:
            request(root + f'issues/{number}/comments', 'POST', {'body': body})


def main():
    report(os.environ['GITHUB_REPOSITORY'], os.environ['COVERAGE_RUN_ID'])


if __name__ == '__main__':
    main()
