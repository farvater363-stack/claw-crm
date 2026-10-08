"""Remove the old «Сегодня» dashboard record and its sidebar item. Safe to rerun.

TWENTY_API_URL=... TWENTY_API_KEY=... python3 retire-owner-dashboard.py [--apply | --check]
Dry by default: prints the server and the plan, and writes only with --apply.
Run after the `yarn twenty apply` that makes «Сегодня» a page with its own menu item.
The record goes to «Удалённые» and can be restored from there.
"""
import json
import os
import sys
import urllib.request

REQUEST_TIMEOUT_SECONDS = 30
PAGE_LAYOUT_UNIVERSAL_IDENTIFIER = '260281fc-4390-42d0-90f7-91afdeacd969'
DASHBOARD_TITLES = ('Сегодня', 'Аналитика')
KNOWN_FLAGS = ('--apply', '--check')
USAGE = 'usage: TWENTY_API_URL=... TWENTY_API_KEY=... python3 retire-owner-dashboard.py [--apply | --check]'


def request(path, query, variables=None):
    http_request = urllib.request.Request(
        f"{os.environ['TWENTY_API_URL']}/{path}",
        data=json.dumps({'query': query, 'variables': variables or {}}).encode(),
        headers={'Content-Type': 'application/json',
                 'Authorization': f"Bearer {os.environ['TWENTY_API_KEY'].strip()}"},
    )
    with urllib.request.urlopen(http_request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        body = json.loads(response.read())
    if body.get('errors'):
        raise RuntimeError(json.dumps(body['errors'], ensure_ascii=False))
    return body['data']


def plan_retire(dashboards, menu_items, page_layout_id):
    """The dashboards on the layout, else those with a known title, and the record menu items that open them."""
    on_layout = [item for item in dashboards if item['pageLayoutId'] == page_layout_id]
    retired = on_layout or [item for item in dashboards if item['title'] in DASHBOARD_TITLES]
    retired_ids = {item['id'] for item in retired}
    return {'dashboards': retired,
            'menu_items': [item for item in menu_items
                           if item['type'] == 'RECORD' and item['targetRecordId'] in retired_ids]}


def check_plan_retire():
    fresh = {'id': 'd1', 'title': 'Сегодня', 'pageLayoutId': 'l1'}
    old = {'id': 'd2', 'title': 'Аналитика', 'pageLayoutId': 'old'}
    other = {'id': 'd3', 'title': 'Чужой', 'pageLayoutId': 'x'}
    item = {'id': 'm1', 'type': 'RECORD', 'targetRecordId': 'd1'}
    page_item = {'id': 'm2', 'type': 'PAGE_LAYOUT', 'targetRecordId': None}
    assert plan_retire([], [], 'l1') == {'dashboards': [], 'menu_items': []}
    assert plan_retire([fresh, other], [item, page_item], 'l1') == {'dashboards': [fresh], 'menu_items': [item]}
    # The layout match wins over a title match.
    assert plan_retire([old, fresh], [item], 'l1')['dashboards'] == [fresh]
    assert plan_retire([old, other], [], 'l1')['dashboards'] == [old]
    assert plan_retire([other], [{**item, 'targetRecordId': 'd3'}], 'l1') == {'dashboards': [], 'menu_items': []}


def find_page_layout_id():
    layouts = request('metadata', 'query { getPageLayouts { id universalIdentifier } }')
    return next((layout['id'] for layout in layouts['getPageLayouts']
                 if layout['universalIdentifier'] == PAGE_LAYOUT_UNIVERSAL_IDENTIFIER), None)


def main():
    arguments = sys.argv[1:]
    unknown = [argument for argument in arguments if argument not in KNOWN_FLAGS]
    if unknown:
        sys.exit(f"unknown argument: {' '.join(unknown)}\n{USAGE}")
    check_plan_retire()
    if '--check' in arguments:
        print('ok')
        return
    print('server:', os.environ['TWENTY_API_URL'])
    dashboards = [edge['node'] for edge in request('graphql', '''query { dashboards(first: 200) {
        edges { node { id title pageLayoutId } } } }''')['dashboards']['edges']]
    menu_items = request('metadata', 'query { navigationMenuItems { id type targetRecordId } }')['navigationMenuItems']
    plan = plan_retire(dashboards, menu_items, find_page_layout_id())
    if not plan['dashboards'] and not plan['menu_items']:
        print('nothing to remove')
        return
    for dashboard in plan['dashboards']:
        print(f"would delete dashboard {dashboard['id']} «{dashboard['title']}»")
    for menu_item in plan['menu_items']:
        print(f"would remove sidebar item {menu_item['id']}")
    if '--apply' not in arguments:
        print('dry run: nothing was written; rerun with --apply to write.')
        return
    for menu_item in plan['menu_items']:
        request('metadata', 'mutation($id: UUID!) { deleteNavigationMenuItem(id: $id) { id } }', {'id': menu_item['id']})
        print('removed sidebar item', menu_item['id'])
    for dashboard in plan['dashboards']:
        request('graphql', 'mutation($id: UUID!) { deleteDashboard(id: $id) { id } }', {'id': dashboard['id']})
        print('deleted dashboard', dashboard['id'])


if __name__ == '__main__':
    main()
