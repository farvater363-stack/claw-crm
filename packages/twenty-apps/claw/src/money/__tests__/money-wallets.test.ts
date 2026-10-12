import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it, vi } from 'vitest';

import {
  createMoneyEntry,
  deleteMoneyEntries,
  restoreMoneyEntries,
} from 'src/money/load-money-books';
import {
  buildMoneyMoves,
  type ClientPaymentRecord,
  lastRecount,
  ledgerDays,
  linkedEntryIds,
  type MoneyEntryRecord,
  monthFlow,
  walletBalances,
} from 'src/money/money-books';
import {
  buildRecord,
  buildRecount,
  emptyRecord,
  emptyRecount,
  entryEditMode,
  recordChange,
  recordDraftFromEntry,
} from 'src/money/money-forms';
import { buildProfit } from 'src/money/money-profit';

const TODAY = '2026-10-08';

const payment = (
  overrides: Partial<ClientPaymentRecord> = {},
): ClientPaymentRecord => ({
  id: 'p1',
  date: '2026-10-01',
  createdAt: '2026-10-01T09:00:00Z',
  amount: 10_000_000,
  method: 'CASH',
  receivedById: null,
  orderId: null,
  orderTitle: null,
  ...overrides,
});

const entry = (
  overrides: Partial<MoneyEntryRecord> = {},
): MoneyEntryRecord => ({
  id: 'e1',
  date: TODAY,
  createdAt: `${TODAY}T11:00:00Z`,
  kind: 'EXPENSE',
  amount: 180_000,
  wallet: 'CASH',
  name: null,
  comment: null,
  category: 'FUEL',
  workerId: null,
  orderId: null,
  recurringExpenseId: null,
  countedAmount: null,
  toWallet: null,
  recountId: null,
  ...overrides,
});

const moves = (
  entries: MoneyEntryRecord[],
  payments: ClientPaymentRecord[] = [payment()],
) => buildMoneyMoves({ payments, payouts: [], entries, workers: [] });

describe('«Перевод» between wallets', () => {
  const transfer = entry({
    id: 'transfer',
    kind: 'TRANSFER',
    amount: 3_000_000,
    wallet: 'CASH',
    toWallet: 'CARD',
    category: null,
    name: 'Перевод · Наличные → карта',
  });

  it('moves money from one wallet to another, neither in nor out', () => {
    const ledger = moves([transfer]);
    const balances = walletBalances(ledger);

    expect(balances.get('CASH')).toBe(7_000_000);
    expect(balances.get('CARD')).toBe(3_000_000);
    expect(monthFlow(ledger, '2026-10')).toEqual({
      in: 10_000_000,
      out: 0,
      net: 10_000_000,
    });
    expect(ledgerDays(ledger, '2026-10', 'all')[0]?.moves[0]).toMatchObject({
      title: 'Перевод · Наличные → карта',
      walletText: 'Наличные → карта',
      flow: 0,
      amount: 3_000_000,
    });
    expect(ledgerDays(ledger, '2026-10', 'out')).toEqual([]);
  });

  it('does not touch the profit or its bridge to the cash', () => {
    const ledger = moves([transfer]);
    const profit = buildProfit({
      month: '2026-10',
      readyOrders: [],
      accruals: [],
      entries: [transfer],
      moves: ledger,
      stock: null,
    });

    expect(profit.profit).toBe(0);
    expect(
      profit.profit + profit.bridge.reduce((sum, line) => sum + line.amount, 0),
    ).toBe(profit.cashNet);
  });

  it('is written in «Записать» from one wallet to another', () => {
    const draft = {
      ...emptyRecord(TODAY),
      direction: 'TRANSFER' as const,
      amount: '3 000 000',
      category: 'FUEL' as const,
      orderId: 'o1',
      comment: 'на карту',
    };

    expect(buildRecord(draft)).toEqual({
      ok: true,
      data: expect.objectContaining({
        kind: 'TRANSFER',
        name: 'Перевод · Наличные → карта, на карту',
        amount: 3_000_000,
        wallet: 'CASH',
        toWallet: 'CARD',
        category: null,
        orderId: null,
      }),
    });
    expect(buildRecord({ ...draft, toWallet: 'CASH' })).toEqual({
      ok: false,
      errors: { toWallet: 'Выберите другой кошелёк' },
    });
  });

  it('opens again in «Записать», and a change clears the wallet it went to once it is no transfer', () => {
    expect(entryEditMode(transfer)).toBe('record');

    const draft = recordDraftFromEntry(transfer);

    expect(draft).toMatchObject({
      direction: 'TRANSFER',
      wallet: 'CASH',
      toWallet: 'CARD',
    });

    const built = buildRecord({
      ...draft,
      direction: 'EXPENSE',
      category: 'FUEL',
    });

    if (!built.ok) throw new Error('expected a valid record');

    expect(recordChange(built.data)).toMatchObject({
      kind: 'EXPENSE',
      toWallet: null,
    });
  });
});

describe('a recount sets the wallet to what was counted', () => {
  const recount = entry({
    id: 'recount',
    kind: 'COUNT_DIFFERENCE',
    date: '2026-10-05',
    createdAt: '2026-10-05T18:00:00Z',
    amount: -200_000,
    countedAmount: 9_800_000,
    category: null,
  });
  // Dated before the count, written down after it
  const late = entry({
    id: 'late',
    date: '2026-10-04',
    createdAt: '2026-10-07T09:00:00Z',
    amount: 150_000,
  });
  const after = entry({
    id: 'after',
    date: '2026-10-06',
    createdAt: '2026-10-06T09:00:00Z',
    amount: 300_000,
  });

  it('keeps the count and what came after it, whatever is dated before it', () => {
    expect(walletBalances(moves([recount, after])).get('CASH')).toBe(9_500_000);
    expect(walletBalances(moves([recount, after, late])).get('CASH')).toBe(
      9_500_000,
    );
  });

  it('shows the recount line as the count against everything before it', () => {
    const ledger = moves([recount, after, late]);
    const line = ledger.find((move) => move.key === 'entry:recount');

    expect(line).toMatchObject({
      changes: [{ wallet: 'CASH', amount: -50_000 }],
      flow: -50_000,
      amount: 50_000,
    });
    expect(lastRecount([recount, after, late], 'CASH', ledger)).toMatchObject({
      counted: 9_800_000,
      expected: 9_850_000,
      difference: -50_000,
    });
  });

  it('counts each wallet on its own and moves the opening balance too', () => {
    const opening = entry({
      id: 'opening',
      kind: 'OPENING_BALANCE',
      wallet: 'CARD',
      date: '2026-10-02',
      createdAt: '2026-10-02T09:00:00Z',
      amount: 1_000_000,
      countedAmount: 1_000_000,
      category: null,
    });
    const earlierCard = entry({
      id: 'earlier-card',
      kind: 'INCOME',
      wallet: 'CARD',
      date: '2026-10-01',
      createdAt: '2026-10-07T09:00:00Z',
      amount: 400_000,
      category: null,
    });
    const ledger = moves([opening, earlierCard, recount]);

    expect(walletBalances(ledger).get('CARD')).toBe(1_000_000);
    expect(walletBalances(ledger).get('CASH')).toBe(9_800_000);
    expect(ledger.find((move) => move.key === 'entry:opening')).toMatchObject({
      changes: [{ wallet: 'CARD', amount: 600_000 }],
      flow: 0,
    });
  });

  it('still explains the month’s cash from the profit', () => {
    const entries = [recount, after, late];
    const ledger = moves(entries);
    const profit = buildProfit({
      month: '2026-10',
      readyOrders: [],
      accruals: [],
      entries,
      moves: ledger,
      stock: null,
    });

    expect(profit.bridge).toContainEqual({
      label: 'Разница при пересчёте кассы',
      amount: -50_000,
    });
    expect(
      profit.profit + profit.bridge.reduce((sum, line) => sum + line.amount, 0),
    ).toBe(profit.cashNet);
    expect(profit.cashNet).toBe(monthFlow(ledger, '2026-10').net);
  });
});

describe('a forgotten расход written at a recount', () => {
  const built = buildRecount({
    draft: {
      ...emptyRecount(),
      counted: '9,820,000',
      category: 'FOOD',
    },
    expected: 10_000_000,
    isFirst: false,
    today: TODAY,
    recountId: 'recount',
  });

  if (!built.ok) throw new Error('expected a valid recount');

  const [expenseEntry, recountEntry] = built.data;
  const stored = (
    data: (typeof built.data)[number] | undefined,
    id: string,
    createdAt: string,
  ): MoneyEntryRecord => {
    if (data === undefined) throw new Error('expected an entry');

    return { ...data, id, createdAt };
  };
  const expense = stored(expenseEntry, 'expense', `${TODAY}T12:00:00Z`);
  const line = stored(recountEntry, 'recount', `${TODAY}T12:00:01Z`);

  it('points to its recount line', () => {
    expect(expense).toMatchObject({ kind: 'EXPENSE', recountId: 'recount' });
    expect(line).toMatchObject({ kind: 'COUNT_DIFFERENCE', recountId: null });
  });

  it('shows the real difference on «Последний пересчёт кассы»', () => {
    const entries = [expense, line];

    expect(lastRecount(entries, 'CASH', moves(entries))).toEqual({
      date: TODAY,
      wallet: 'CASH',
      counted: 9_820_000,
      expected: 10_000_000,
      difference: -180_000,
      forgotten: 180_000,
      isOpening: false,
    });
    expect(walletBalances(moves(entries)).get('CASH')).toBe(9_820_000);
  });

  it('goes and comes back with its recount line, from either side', () => {
    const other = entry({ id: 'other' });
    const entries = [expense, line, other];

    expect(linkedEntryIds(entries, 'recount')).toEqual(['recount', 'expense']);
    expect(linkedEntryIds(entries, 'expense')).toEqual(['expense', 'recount']);
    expect(linkedEntryIds(entries, 'other')).toEqual(['other']);
  });

  it('leaves an old pair without the link as it was: each goes alone', () => {
    const entries = [{ ...expense, recountId: null }, line];

    expect(linkedEntryIds(entries, 'recount')).toEqual(['recount']);
    expect(lastRecount(entries, 'CASH', moves(entries))).toMatchObject({
      difference: 0,
      forgotten: 0,
    });
  });
});

describe('writing money entries', () => {
  const fakeClient = () => {
    const mutation = vi.fn().mockResolvedValue({});

    return { client: { mutation } as unknown as CoreApiClient, mutation };
  };

  it('sends empty fields as null, so a retry clears what the first try wrote', async () => {
    const { client, mutation } = fakeClient();
    const built = buildRecord({
      ...emptyRecord(TODAY),
      direction: 'INCOME',
      amount: '500,000',
    });

    if (!built.ok) throw new Error('expected a valid record');

    await createMoneyEntry(client, 'entry-1', built.data);

    expect(mutation.mock.calls[0][0].createMoneyEntry.__args).toEqual({
      upsert: true,
      data: {
        id: 'entry-1',
        kind: 'INCOME',
        name: 'Приход',
        amount: { amountMicros: 500_000_000_000, currencyCode: 'UZS' },
        wallet: 'CASH',
        date: TODAY,
        category: null,
        comment: null,
        orderId: null,
        workerId: null,
        recurringExpenseId: null,
        toWallet: null,
        recountId: null,
        countedAmount: { amountMicros: null, currencyCode: 'UZS' },
      },
    });
  });

  it('deletes and restores a pair by its ids', async () => {
    const { client, mutation } = fakeClient();

    await deleteMoneyEntries(client, ['recount', 'expense']);
    await restoreMoneyEntries(client, ['recount', 'expense']);

    expect(mutation.mock.calls[0][0].deleteMoneyEntries.__args).toEqual({
      filter: { id: { in: ['recount', 'expense'] } },
    });
    expect(mutation.mock.calls[1][0].restoreMoneyEntries.__args).toEqual({
      filter: { id: { in: ['recount', 'expense'] } },
    });
  });
});

describe('money inputs', () => {
  it('take at most 12 digits', () => {
    const draft = { ...emptyRecord(TODAY), direction: 'INCOME' as const };

    expect(buildRecord({ ...draft, amount: '999,999,999,999' })).toMatchObject({
      ok: true,
      data: { amount: 999_999_999_999 },
    });
    expect(buildRecord({ ...draft, amount: '1,000,000,000,000' })).toEqual({
      ok: false,
      errors: { amount: 'Не больше 12 цифр' },
    });
    expect(
      buildRecount({
        draft: { ...emptyRecount(), counted: '10000000000000' },
        expected: 0,
        isFirst: true,
        today: TODAY,
        recountId: 'r',
      }),
    ).toEqual({ ok: false, errors: { counted: 'Не больше 12 цифр' } });
  });
});
