"""One-off after the apply that adds «Имя» and «Фамилия»: copy each one-line name
into first name and last name. The first word becomes the first name, the rest
the last name.

TWENTY_API_URL=... TWENTY_API_KEY=... python3 split-names.py [--apply]
Dry by default: prints what it would write. Safe to run twice: a record that
already has a first or last name is left alone. Names worth a look (one word,
or more than two) are listed at the end.
"""
import json
import os
import sys
import urllib.request

REQUEST_TIMEOUT_SECONDS = 30
PAGE_SIZE = 200


def graphql(query, variables=None):
    request = urllib.request.Request(
        f"{os.environ['TWENTY_API_URL']}/graphql",
        data=json.dumps({'query': query, 'variables': variables or {}}).encode(),
        headers={'Content-Type': 'application/json',
                 'Authorization': f"Bearer {os.environ['TWENTY_API_KEY']}"},
    )
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        body = json.loads(response.read())
    if body.get('errors'):
        raise RuntimeError(json.dumps(body['errors'], ensure_ascii=False))
    return body['data']


def all_nodes(plural, fields):
    nodes, after = [], None
    while True:
        data = graphql(
            f'query($after: String) {{ {plural}(first: {PAGE_SIZE}, after: $after) {{'
            f' edges {{ node {{ id {fields} }} }} pageInfo {{ hasNextPage endCursor }} }} }}',
            {'after': after})
        nodes += [edge['node'] for edge in data[plural]['edges']]
        if not data[plural]['pageInfo']['hasNextPage']:
            return nodes
        after = data[plural]['pageInfo']['endCursor']


def split(text):
    words = (text or '').split()
    return {'firstName': words[0] if words else '', 'lastName': ' '.join(words[1:])}


def is_empty(full_name):
    return not ((full_name or {}).get('firstName') or '').strip() and \
        not ((full_name or {}).get('lastName') or '').strip()


def looks_like_phone(text):
    digits = [char for char in text if char.isdigit()]
    return len(digits) >= 7 and len(digits) >= len(text.replace(' ', '')) - 2


def main():
    unknown = [arg for arg in sys.argv[1:] if arg != '--apply']
    if unknown:
        sys.exit(f'unknown argument: {" ".join(unknown)}')
    apply = '--apply' in sys.argv
    print(f"server: {os.environ['TWENTY_API_URL']} ({'writing' if apply else 'dry run'})")

    # (what, label, old one-line name, mutation, field to write)
    plan = []
    for order in all_nodes('orders', 'name clientName clientFullName { firstName lastName }'):
        if (order['clientName'] or '').strip() and is_empty(order['clientFullName']):
            plan.append(('Заказ', order['name'], order['clientName'], 'updateOrder', order['id'], 'clientFullName'))
    for worker in all_nodes('masters', 'name fullName { firstName lastName }'):
        if (worker['name'] or '').strip() and is_empty(worker['fullName']):
            plan.append(('Работник', '', worker['name'], 'updateMaster', worker['id'], 'fullName'))
    to_check = []
    # A client named before the split has the whole line in the first name.
    for person in all_nodes('people', 'name { firstName lastName }'):
        first_name = (person['name'] or {}).get('firstName') or ''
        last_name = (person['name'] or {}).get('lastName') or ''
        if last_name.strip() or not first_name.strip() or looks_like_phone(first_name):
            continue
        if len(first_name.split()) > 1:
            plan.append(('Клиент', '', first_name, 'updatePerson', person['id'], 'name'))
        else:
            to_check.append(f'Клиент: «{first_name.strip()}» (нет фамилии)')

    for what, label, text, mutation, record_id, field in plan:
        name = split(text)
        title = f'{what} {label}'.strip()
        print(f"{title}: «{text.strip()}» -> Имя «{name['firstName']}», Фамилия «{name['lastName']}»")
        if len(text.split()) != 2:
            reason = 'нет фамилии' if len(text.split()) == 1 else 'больше двух слов'
            to_check.append(f"{title}: «{text.strip()}» ({reason})")
        if apply:
            graphql(f'mutation($id: UUID!, $first: String, $last: String) {{ {mutation}(id: $id,'
                    f' data: {{ {field}: {{ firstName: $first, lastName: $last }} }}) {{ id }} }}',
                    {'id': record_id, 'first': name['firstName'], 'last': name['lastName']})

    print(f'{len(plan)} names {"split" if apply else "to split"}')
    if to_check:
        print('Worth a look:')
        for line in to_check:
            print(f'  {line}')


if __name__ == '__main__':
    main()
