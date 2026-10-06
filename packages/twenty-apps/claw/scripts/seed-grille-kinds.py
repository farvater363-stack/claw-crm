"""One-off: make «Прут», «Профиль», «Арматура» kinds of the owner's list and give
every grille the kind its old metal named.

TWENTY_API_URL=... TWENTY_API_KEY=... python seed-grille-kinds.py [--dry-run]
Safe to run twice: a kind that exists is reused, a grille with a kind is left alone.
"""
import json
import os
import sys
import urllib.request

REQUEST_TIMEOUT_SECONDS = 30
KIND_OF_METAL = {'ROD': 'Прут', 'PROFILE': 'Профиль', 'REBAR': 'Арматура'}


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


def nodes(data, key):
    return [edge['node'] for edge in data[key]['edges']]


def main():
    dry_run = '--dry-run' in sys.argv
    # ponytail: one page of 200 each; page when the price list outgrows it.
    data = graphql('{ grilleKinds(first: 200) { edges { node { id name } } }'
                   ' designs(first: 200) { edges { node { id name metal grilleKindId } } } }')
    kind_id_by_name = {kind['name']: kind['id'] for kind in nodes(data, 'grilleKinds')}

    for name in KIND_OF_METAL.values():
        if name in kind_id_by_name:
            continue
        print(f'add kind {name}')
        if not dry_run:
            created = graphql('mutation($name: String) { createGrilleKind(data: { name: $name }) { id } }',
                              {'name': name})
            kind_id_by_name[name] = created['createGrilleKind']['id']

    for design in nodes(data, 'designs'):
        name = KIND_OF_METAL.get(design['metal'])
        if design['grilleKindId'] or name is None:
            continue
        print(f"{design['name']}: {name}")
        if not dry_run:
            graphql('mutation($id: UUID!, $kind: UUID) { updateDesign(id: $id, data: { grilleKindId: $kind }) { id } }',
                    {'id': design['id'], 'kind': kind_id_by_name[name]})


if __name__ == '__main__':
    main()
