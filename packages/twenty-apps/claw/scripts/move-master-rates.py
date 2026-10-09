"""One-off: a master's old rule «Мастер · за м²» moves into «Ставки цеха».

For every grille that has neither the usual rate nor this master's own, the
master gets his own rate equal to the rule's sum; then the rule is removed.
After it a master's rate per m² is set in the table and nowhere else.

TWENTY_API_URL=... TWENTY_API_KEY=... python move-master-rates.py [--dry-run]
Safe to run twice: a cell that has a rate is left alone, a removed rule is gone.
"""
import json
import os
import sys
import urllib.request

REQUEST_TIMEOUT_SECONDS = 30
MICROS = 1_000_000


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


def cells_to_fill(rule, designs, rates):
    """The grilles this master would be paid for by the rule alone."""
    covered = {rate['designId'] for rate in rates
               if rate['designId'] and rate['workerId'] in (None, rule['workerId'])}
    return [design for design in designs if design['id'] not in covered]


def check():
    rule = {'workerId': 'w'}
    designs = [{'id': 'a'}, {'id': 'b'}, {'id': 'c'}]
    rates = [{'designId': 'a', 'workerId': None}, {'designId': 'b', 'workerId': 'w'},
             {'designId': 'c', 'workerId': 'other'}, {'designId': None, 'workerId': None}]
    assert [design['id'] for design in cells_to_fill(rule, designs, rates)] == ['c']


def main():
    check()
    dry_run = '--dry-run' in sys.argv
    # ponytail: one page of 200 each; page when the lists outgrow it.
    data = graphql("""{
      payRules(first: 200, filter: { method: { eq: PER_SQUARE_METER }, work: { eq: MASTER } }) {
        edges { node { id workerId amount { amountMicros currencyCode } worker { name } } } }
      designs(first: 200) { edges { node { id name } } }
      workshopRates(first: 200) { edges { node { id designId workerId } } }
    }""")
    designs, rates = nodes(data, 'designs'), nodes(data, 'workshopRates')

    for rule in nodes(data, 'payRules'):
        amount = rule['amount'] or {}
        worker = (rule.get('worker') or {}).get('name') or rule['workerId']
        if not rule['workerId'] or not amount.get('amountMicros'):
            print(f'skip a rule without a master or a sum: {rule["id"]}')
            continue
        sum_text = int(amount['amountMicros']) // MICROS
        for design in cells_to_fill(rule, designs, rates):
            print(f'{worker}: {design["name"]} = {sum_text}')
            if not dry_run:
                graphql("""mutation($data: WorkshopRateCreateInput!) { createWorkshopRate(data: $data) { id } }""",
                        {'data': {'name': f'{design["name"]} · {worker}', 'designId': design['id'],
                                  'workerId': rule['workerId'], 'rate': amount}})
        print(f'{worker}: remove the old rule of {sum_text} за м²')
        if not dry_run:
            graphql('mutation($id: UUID!) { deletePayRule(id: $id) { id } }', {'id': rule['id']})


if __name__ == '__main__':
    main()
