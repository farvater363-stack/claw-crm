import { describe, expect, it } from 'vitest';

import { buildMoneyMoves, type MoneyEntryRecord } from 'src/money/money-books';
import {
  buildEntrySum,
  buildRecord,
  entryEditMode,
  entrySumDraft,
  recordChange,
  recordDraftFromEntry,
} from 'src/money/money-forms';

const entry = (overrides: Partial<MoneyEntryRecord> = {}): MoneyEntryRecord => ({
  id: 'entry-1',
  date: '2026-10-09',
  createdAt: '2026-10-09T08:00:00Z',
  kind: 'EXPENSE',
  amount: 180_000,
  wallet: 'CARD',
  name: 'Бензин, Дамас',
  comment: 'Дамас',
  category: 'FUEL',
  workerId: null,
  orderId: 'order-1',
  recurringExpenseId: null,
  countedAmount: null,
  ...overrides,
});

describe('changing a money entry', () => {
  it('opens a typed-in entry in «Записать» again, as it was', () => {
    expect(entryEditMode(entry())).toBe('record');
    expect(recordDraftFromEntry(entry())).toEqual({
      direction: 'EXPENSE',
      amount: '180,000',
      category: 'FUEL',
      wallet: 'CARD',
      date: '2026-10-09',
      comment: 'Дамас',
      orderId: 'order-1',
    });
  });

  it('rewrites the name with the change and never sends the links the entry was made with', () => {
    const built = buildRecord({
      ...recordDraftFromEntry(entry()),
      category: 'TRAVEL',
      comment: 'Самарканд',
    });

    if (!built.ok) throw new Error('expected a valid record');

    const change = recordChange(built.data);

    expect(change).toMatchObject({
      name: 'Дорожные расходы, Самарканд',
      category: 'TRAVEL',
      amount: 180_000,
    });
    expect(change).not.toHaveProperty('recurringExpenseId');
    expect(change).not.toHaveProperty('workerId');
  });

  it('changes only the sum of a bill paid, a supplier payment or a handover', () => {
    expect(entryEditMode(entry({ recurringExpenseId: 'rent' }))).toBe('sum');
    expect(entryEditMode(entry({ kind: 'SUPPLIER_PAYMENT' }))).toBe('sum');
    expect(entryEditMode(entry({ kind: 'HANDOVER', workerId: 'w' }))).toBe(
      'sum',
    );
    expect(
      buildEntrySum({ ...entrySumDraft(entry()), amount: '200 000' }),
    ).toEqual({
      ok: true,
      data: {
        amount: 200_000,
        wallet: 'CARD',
        date: '2026-10-09',
        comment: 'Дамас',
      },
    });
  });

  it('only deletes a recount line, whose sum is what the count differed by', () => {
    expect(entryEditMode(entry({ kind: 'COUNT_DIFFERENCE' }))).toBe('remove');
    expect(entryEditMode(entry({ kind: 'OPENING_BALANCE' }))).toBe('remove');
  });

  it('asks again for a sum and a date', () => {
    expect(
      buildEntrySum({ amount: '', wallet: 'CASH', date: '', comment: '' }),
    ).toEqual({
      ok: false,
      errors: { amount: 'Введите сумму', date: 'Выберите дату' },
    });
  });

  it('tells each line of the ledger which record it was built from', () => {
    const moves = buildMoneyMoves({
      payments: [
        {
          id: 'payment-1',
          date: '2026-10-09',
          createdAt: '2026-10-09T08:00:00Z',
          amount: 1_000_000,
          method: 'CASH',
          receivedById: null,
          orderId: 'order-7',
          orderTitle: '№1007',
        },
      ],
      payouts: [
        {
          id: 'payout-1',
          date: '2026-10-09',
          createdAt: '2026-10-09T08:00:00Z',
          amount: 500_000,
          wallet: 'CASH',
          kind: 'ADVANCE',
          workerId: null,
        },
      ],
      entries: [entry()],
      workers: [],
    });

    expect(moves.map((move) => move.record)).toEqual([
      { kind: 'payment', id: 'payment-1', orderId: 'order-7' },
      { kind: 'payout', id: 'payout-1' },
      { kind: 'entry', id: 'entry-1' },
    ]);
  });
});
