"""Create the owner dashboard record and its sidebar item. Safe to rerun.

TWENTY_API_URL=... TWENTY_API_KEY=... python setup-owner-dashboard.py [--dry-run]
Run after `yarn twenty apply` has installed the «Аналитика» page layout.
Apps cannot create records or record menu items, hence this script.
"""
import json
import os
import sys
import urllib.request

REQUEST_TIMEOUT_SECONDS = 30
PAGE_LAYOUT_UNIVERSAL_IDENTIFIER = '260281fc-4390-42d0-90f7-91afdeacd969'
DASHBOARD_TITLE = 'Аналитика'
# Above «Новый замер» (-1): Twenty lands each user on their first readable
# item, and only admins can read dashboards.
MENU_POSITION = -2


def request(path, query, variables=None):
    http_request = urllib.request.Request(
        f"{os.environ['TWENTY_API_URL']}/{path}",
        data=json.dumps({'query': query, 'variables': variables or {}}).encode(),
        headers={'Content-Type': 'application/json',
                 'Authorization': f"Bearer {os.environ['TWENTY_API_KEY']}"},
    )
    with urllib.request.urlopen(http_request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        body = json.loads(response.read())
    if body.get('errors'):
        raise RuntimeError(json.dumps(body['errors'], ensure_ascii=False))
    return body['data']


def plan_setup(dashboards, menu_items, page_layout_id):
    """Decide what to write, given the dashboards titled «Аналитика», the menu items and the installed layout id."""
    dashboard = dashboards[0] if dashboards else None
    dashboard_id = dashboard['id'] if dashboard else None
    has_menu_item = dashboard_id is not None and any(
        item['type'] == 'RECORD' and item['targetRecordId'] == dashboard_id for item in menu_items)
    return {'dashboard_id': dashboard_id, 'create_dashboard': dashboard is None,
            # An app reinstall gives the layout a new id; the old record must follow it.
            'repoint_dashboard': dashboard is not None and dashboard['pageLayoutId'] != page_layout_id,
            'create_menu_item': not has_menu_item}


def check_plan_setup():
    item = {'type': 'RECORD', 'targetRecordId': 'd1'}
    assert plan_setup([], [], 'l1') == {
        'dashboard_id': None, 'create_dashboard': True, 'repoint_dashboard': False, 'create_menu_item': True}
    assert plan_setup([{'id': 'd1', 'pageLayoutId': 'l1'}], [item], 'l1') == {
        'dashboard_id': 'd1', 'create_dashboard': False, 'repoint_dashboard': False, 'create_menu_item': False}
    assert plan_setup([{'id': 'd1', 'pageLayoutId': 'old'}], [item], 'l1') == {
        'dashboard_id': 'd1', 'create_dashboard': False, 'repoint_dashboard': True, 'create_menu_item': False}
    assert plan_setup([{'id': 'd1', 'pageLayoutId': 'l1'}], [], 'l1')['create_menu_item']
    assert plan_setup([{'id': 'd1', 'pageLayoutId': 'l1'}], [{'type': 'RECORD', 'targetRecordId': 'other'}],
                      'l1')['create_menu_item']


def find_page_layout_id():
    layouts = request('metadata', 'query { getPageLayouts(pageLayoutType: DASHBOARD) { id universalIdentifier } }')
    for layout in layouts['getPageLayouts']:
        if layout['universalIdentifier'] == PAGE_LAYOUT_UNIVERSAL_IDENTIFIER:
            return layout['id']
    sys.exit('The «Аналитика» page layout is not installed; run `yarn twenty apply` first.')


def find_dashboard_object_id():
    objects = request('metadata', 'query { objects(paging: { first: 1000 }) { edges { node { id nameSingular } } } }')
    for edge in objects['objects']['edges']:
        if edge['node']['nameSingular'] == 'dashboard':
            return edge['node']['id']
    sys.exit('The workspace has no dashboard object; nothing was written.')


def main():
    check_plan_setup()
    dry_run = '--dry-run' in sys.argv
    page_layout_id = find_page_layout_id()
    dashboards = request('graphql', '''query($title: String) { dashboards(filter: { title: { eq: $title } }) {
        edges { node { id pageLayoutId } } } }''', {'title': DASHBOARD_TITLE})['dashboards']['edges']
    menu_items = request('metadata', 'query { navigationMenuItems { id type targetRecordId } }')['navigationMenuItems']
    plan = plan_setup([edge['node'] for edge in dashboards], menu_items, page_layout_id)
    print(plan)
    # Resolved before any write so a failure cannot leave a half-done setup.
    dashboard_object_id = find_dashboard_object_id() if plan['create_menu_item'] else None
    if dry_run:
        return
    dashboard_id = plan['dashboard_id']
    if plan['create_dashboard']:
        dashboard_id = request('graphql', 'mutation($data: DashboardCreateInput!) { createDashboard(data: $data) { id } }',
                               {'data': {'title': DASHBOARD_TITLE, 'pageLayoutId': page_layout_id}})['createDashboard']['id']
        print('created dashboard', dashboard_id)
    if plan['repoint_dashboard']:
        request('graphql', 'mutation($id: UUID!, $data: DashboardUpdateInput!) { updateDashboard(id: $id, data: $data) { id } }',
                {'id': dashboard_id, 'data': {'pageLayoutId': page_layout_id}})
        print('repointed dashboard', dashboard_id)
    if plan['create_menu_item']:
        request('metadata', 'mutation($input: CreateNavigationMenuItemInput!) { createNavigationMenuItem(input: $input) { id } }',
                {'input': {'type': 'RECORD', 'targetRecordId': dashboard_id,
                           'targetObjectMetadataId': dashboard_object_id, 'position': MENU_POSITION}})
        print('created menu item')


if __name__ == '__main__':
    main()
