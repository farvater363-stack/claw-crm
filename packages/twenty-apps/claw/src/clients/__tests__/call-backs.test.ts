import { describe, expect, it } from 'vitest';

import {
  buildCallBackLists,
  callBackWhen,
  refusalsByReason,
} from 'src/clients/call-backs';
import { type ClientCard } from 'src/clients/load-clients';

const TODAY = '2026-10-06';

const client = (id: string, overrides: Partial<ClientCard>): ClientCard => ({
  id,
  name: id,
  phone: null,
  clientStatus: 'NEW',
  ordersCount: 1,
  totalSpent: 0,
  owes: 0,
  quoted: null,
  firstOrderAt: null,
  lastOrderAt: null,
  refusalReason: null,
  source: null,
  callBackAt: null,
  callBackReason: null,
  lastCallAt: null,
  lastCallNote: null,
  ...overrides,
});

describe('buildCallBackLists', () => {
  const clients = [
    client('later', { callBackAt: '2026-10-20' }),
    client('today', { callBackAt: TODAY }),
    client('late', { callBackAt: '2026-10-01' }),
    client('soon', { callBackAt: '2026-10-09' }),
    client('thinking-new', {
      clientStatus: 'THINKING',
      lastOrderAt: '2026-10-05',
    }),
    client('thinking-old', {
      clientStatus: 'THINKING',
      lastOrderAt: '2026-09-20',
    }),
    client('refused', { clientStatus: 'REFUSED', lastOrderAt: '2026-10-02' }),
  ];
  const ids = (list: ClientCard[]) => list.map(({ id }) => id);

  it('puts the missed calls first, then today, and this week under «Скоро»', () => {
    const lists = buildCallBackLists(clients, TODAY);

    expect(ids(lists.due)).toEqual(['late', 'today']);
    expect(ids(lists.soon)).toEqual(['soon']);
  });

  it('lists who waits longest to decide first', () => {
    expect(ids(buildCallBackLists(clients, TODAY).thinking)).toEqual([
      'thinking-old',
      'thinking-new',
    ]);
  });

  it('lists refusals apart', () => {
    expect(ids(buildCallBackLists(clients, TODAY).refused)).toEqual([
      'refused',
    ]);
  });
});

describe('callBackWhen', () => {
  it.each([
    ['2026-10-06', 'сегодня'],
    ['2026-10-05', 'вчера'],
    ['2026-10-02', '4 дн. назад'],
    ['2026-10-07', 'завтра'],
    ['2026-10-13', 'через 7 дн.'],
  ])('reads %s as «%s»', (day, text) => {
    expect(callBackWhen(day, TODAY)).toBe(text);
  });
});

describe('refusalsByReason', () => {
  it('counts this month refusals by reason, commonest first', () => {
    expect(
      refusalsByReason(
        [
          client('a', {
            clientStatus: 'REFUSED',
            refusalReason: 'TOO_EXPENSIVE',
            lastOrderAt: '2026-10-01',
          }),
          client('b', {
            clientStatus: 'REFUSED',
            refusalReason: 'TOO_EXPENSIVE',
            lastOrderAt: '2026-10-03',
          }),
          client('c', {
            clientStatus: 'REFUSED',
            refusalReason: null,
            lastOrderAt: '2026-10-04',
          }),
          client('d', {
            clientStatus: 'REFUSED',
            refusalReason: 'COMPETITOR',
            lastOrderAt: '2026-09-30',
          }),
        ],
        TODAY,
      ),
    ).toEqual([
      { reason: 'TOO_EXPENSIVE', label: 'Дорого', count: 2 },
      { reason: 'OTHER', label: 'Другое', count: 1 },
    ]);
  });
});
