"""Real Firestore rules checks, local demo emulator only. No production access.

Start the official emulator on 127.0.0.1:8787 with
--project_id demo-coordinator-query-guard --rules security/firestore-query-guard.rules
then run python tests/query-guard-emulator.py.
"""
import json
import urllib.error
import urllib.request

PROJECT = 'demo-coordinator-query-guard'
BASE = f'http://127.0.0.1:8787/v1/projects/{PROJECT}/databases/(default)/documents'


def call(method, suffix, data=None, admin=False):
    headers = {'Content-Type': 'application/json'}
    if admin:
        headers['Authorization'] = 'Bearer owner'  # Emulator fixture seed only.
    request = urllib.request.Request(BASE + suffix,
        data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def eq(field, value):
    return {'fieldFilter': {'field': {'fieldPath': field}, 'op': 'EQUAL',
                            'value': {'stringValue': value}}}


def date_filter(field, op, value):
    return {'fieldFilter': {'field': {'fieldPath': field}, 'op': op,
                            'value': {'timestampValue': value}}}


def run_query(filters=(), limit=None, collection='attendanceLogs', cursor=None):
    query = {'from': [{'collectionId': collection}]}
    if filters:
        query['where'] = {'compositeFilter': {'op': 'AND', 'filters': list(filters)}}
    if limit is not None:
        query['limit'] = limit
        query['orderBy'] = [{'field': {'fieldPath': '__name__'}, 'direction': 'ASCENDING'}]
    if cursor:
        query['startAt'] = {'values': [{'referenceValue': cursor}], 'before': False}
    return call('POST', ':runQuery', {'structuredQuery': query})


def records(result):
    return [row['document'] for row in result if 'document' in row]


def expect(status, result, label):
    assert status == result[0], (label, result)
    print('PASS:', label)
    return result[1]


# Include current, previous month, other user, visit-only time and legacy
# undated records. These are synthetic fixtures, never employee data.
fixtures = [
    ('today', {'userName': {'stringValue': 'tester'}, 'timestamp': {'timestampValue': '2026-10-19T01:00:00Z'}}),
    ('other', {'userName': {'stringValue': 'other'}, 'timestamp': {'timestampValue': '2026-10-19T02:00:00Z'}}),
    ('previous', {'userName': {'stringValue': 'tester'}, 'timestamp': {'timestampValue': '2026-09-19T01:00:00Z'}}),
    ('visit', {'coordinatorName': {'stringValue': 'tester'}, 'visitDateTime': {'timestampValue': '2026-10-19T03:00:00Z'}}),
    ('legacy', {'userName': {'stringValue': 'tester'}}),
]
for name, fields in fixtures:
    expect(200, call('PATCH', '/attendanceLogs/' + name, {'fields': fields}, admin=True), 'seed ' + name)

expect(403, run_query(), '6.10 unfiltered full collection query denied')
expect(403, run_query([eq('userName', 'tester')]), 'unbounded personal-history query denied')
expect(403, run_query(limit=501), 'oversized unfiltered page denied')
start, end = '2026-10-18T15:00:00Z', '2026-10-19T15:00:00Z'
span = [date_filter('timestamp', 'GREATER_THAN_OR_EQUAL', start), date_filter('timestamp', 'LESS_THAN', end)]
rows = records(expect(200, run_query([eq('userName', 'tester'), *span]), 'new app personal daily query allowed'))
assert [r['name'].rsplit('/', 1)[1] for r in rows] == ['today']
expect(200, run_query([eq('coordinatorName', 'tester'), *span]), 'new app coordinator-name compatibility query allowed')
expect(200, run_query(span), 'administrator daily query allowed')
month = [date_filter('timestamp', 'GREATER_THAN_OR_EQUAL', '2026-09-30T15:00:00Z'),
         date_filter('timestamp', 'LESS_THAN', '2026-10-31T15:00:00Z')]
expect(200, run_query(month), 'administrator selected-month query allowed')
visit = [date_filter('visitDateTime', 'GREATER_THAN_OR_EQUAL', start), date_filter('visitDateTime', 'LESS_THAN', end)]
rows = records(expect(200, run_query(visit), 'administrator visit-time-only query allowed'))
assert len(rows) == 1 and rows[0]['name'].endswith('/visit')
expect(200, run_query([eq('userName', 'tester'), *span]), 'selected-user/day boundary reset lookup allowed')

# Exercise cursor pagination including undated legacy rows. A tiny page size
# forces multiple requests and proves no records disappear at page boundaries.
all_rows, cursor = [], None
while True:
    page = records(expect(200, run_query(limit=2, cursor=cursor), 'explicit admin all-period page allowed'))
    all_rows.extend(page)
    if len(page) < 2:
        break
    cursor = page[-1]['name']
assert len(all_rows) == len(fixtures)
assert len({row['name'] for row in all_rows}) == len(fixtures)
assert any(row['name'].endswith('/legacy') for row in all_rows)

expect(200, call('GET', '/attendanceLogs/today'), 'document read for save transaction retained')
expect(200, call('PATCH', '/attendanceLogs/outbox', {'fields': fixtures[0][1]}), 'queued attendance write retained')
expect(200, call('PATCH', '/settings/appUpdateConfig', {'fields': {'minVersionCode': {'integerValue': '63'}}}), 'update config write retained')
expect(200, call('GET', '/settings/appUpdateConfig'), 'old-client update configuration read retained')
expect(200, run_query(collection='settings'), 'other shared-project collection queries retained')
expect(403, run_query(), 'legacy full scan still denied after successful writes')
print('PASS: real local Firestore rules; legacy full scan denied; current queries, admin pagination and writes retained.')
