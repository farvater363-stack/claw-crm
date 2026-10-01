"""One-off: rewrite every order's clientPhone to +998XXXXXXXXX.

TWENTY_API_URL=... TWENTY_API_KEY=... python normalize-phones.py [--dry-run]
Numbers that do not parse are printed and left alone.
"""
import json
import os
import re
import sys
import urllib.request

REQUEST_TIMEOUT_SECONDS = 30


def to_stored_uzbek_phone(raw):
    digits = re.sub(r'\D', '', raw or '')
    national = digits[3:] if len(digits) == 12 and digits.startswith('998') else digits
    return f'+998{national}' if len(national) == 9 else None


def graphql(query, variables):
    request = urllib.request.Request(
        f"{os.environ['TWENTY_API_URL']}/graphql",
        data=json.dumps({'query': query, 'variables': variables}).encode(),
        headers={'Content-Type': 'application/json',
                 'Authorization': f"Bearer {os.environ['TWENTY_API_KEY']}"},
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        body = json.loads(response.read())
    if body.get('errors'):
        raise RuntimeError(json.dumps(body['errors'], ensure_ascii=False))
    return body['data']


def check_normalization():
    for raw, expected in [('998997776655', '+998997776655'), ('+998 90 123 45 67', '+998901234567'),
                          ('901234567', '+998901234567'), ('12345', None), (None, None)]:
        assert to_stored_uzbek_phone(raw) == expected, (raw, to_stored_uzbek_phone(raw))


ORDERS_PAGE_QUERY = '''query($cursor: String) { orders(first: 200, after: $cursor) {
  pageInfo { hasNextPage endCursor } edges { node { id name clientPhone } } } }'''


def all_orders():
    # Collected up front: rewriting phones while paging must not shift the cursor.
    orders, cursor = [], None
    while True:
        page = graphql(ORDERS_PAGE_QUERY, {'cursor': cursor})['orders']
        orders += [edge['node'] for edge in page['edges']]
        if not page['pageInfo']['hasNextPage']:
            return orders
        cursor = page['pageInfo']['endCursor']


def main():
    check_normalization()
    dry_run = '--dry-run' in sys.argv
    for order in all_orders():
        current = order['clientPhone']
        if not current:
            continue
        stored = to_stored_uzbek_phone(current)
        if stored is None:
            print(f"left as is: {order['name']} {current!r}")
        elif stored != current:
            print(f"{order['name']}: {current} -> {stored}")
            if not dry_run:
                graphql('mutation($id: UUID!, $data: OrderUpdateInput!) { updateOrder(id: $id, data: $data) { id } }',
                        {'id': order['id'], 'data': {'clientPhone': stored}})


if __name__ == '__main__':
    main()
