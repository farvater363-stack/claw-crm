import { describe, expect, it } from 'vitest';

import { type RecurringRecord } from 'src/money/money-books';
import {
  buildHandover,
  buildRecord,
  buildRecount,
  buildRecurring,
  buildRecurringPayment,
  emptyRecord,
  emptyRecount,
  emptyRecurring,
  recountDifference,
} from 'src/money/money-forms';

const TODAY = '2026-10-08';

describe('buildRecord', () => {
  it('asks for a sum and what the расход was for', () => {
    expect(buildRecord(emptyRecord(TODAY))).toEqual({
      ok: false,
      errors: { amount: 'Введите сумму', category: 'Выберите, на что' },
    });
  });

  it('names a расход by its category and comment', () => {
    const built = buildRecord({
      ...emptyRecord(TODAY),
      amount: '180,000',
      category: 'FUEL',
      comment: ' Дамас ',
      orderId: 'o1',
    });

    expect(built).toEqual({
      ok: true,
      data: expect.objectContaining({
        kind: 'EXPENSE',
        name: 'Бензин, Дамас',
        amount: 180_000,
        category: 'FUEL',
        comment: 'Дамас',
        orderId: 'o1',
        date: TODAY,
      }),
    });
  });

  it('needs no category when the owner takes money for himself', () => {
    const built = buildRecord({
      ...emptyRecord(TODAY),
      direction: 'OWNER_DRAW',
      amount: '2000000',
      category: 'FUEL',
      orderId: 'o1',
    });

    expect(built).toEqual({
      ok: true,
      data: expect.objectContaining({
        kind: 'OWNER_DRAW',
        name: 'Взял себе',
        category: null,
        orderId: null,
      }),
    });
  });
});

describe('buildRecount', () => {
  const recount = (
    overrides: Partial<ReturnType<typeof emptyRecount>>,
    isFirst = false,
  ) =>
    buildRecount({
      draft: { ...emptyRecount(), ...overrides },
      expected: 8_600_000,
      isFirst,
      today: TODAY,
    });

  it('shows the difference once a sum is typed', () => {
    expect(recountDifference(emptyRecount(), 8_600_000)).toBeNull();
    expect(
      recountDifference({ ...emptyRecount(), counted: '8,420,000' }, 8_600_000),
    ).toBe(-180_000);
  });

  it('sets the starting balance on the first count', () => {
    expect(recount({ counted: '5,000,000' }, true)).toEqual({
      ok: true,
      data: [
        expect.objectContaining({
          kind: 'OPENING_BALANCE',
          name: 'Начальный остаток · Наличные',
          amount: -3_600_000,
          countedAmount: 5_000_000,
        }),
      ],
    });
  });

  it('writes a forgotten расход and a recount that then matches', () => {
    const built = recount({
      counted: '8,420,000',
      category: 'FOOD',
      comment: 'обед',
    });

    expect(built).toEqual({
      ok: true,
      data: [
        expect.objectContaining({
          kind: 'EXPENSE',
          name: 'Еда, обед',
          amount: 180_000,
          category: 'FOOD',
        }),
        expect.objectContaining({
          kind: 'COUNT_DIFFERENCE',
          amount: 0,
          countedAmount: 8_420_000,
        }),
      ],
    });
  });

  it('asks what a forgotten расход was for', () => {
    expect(recount({ counted: '8,420,000' })).toEqual({
      ok: false,
      errors: { category: 'Выберите, на что ушли деньги' },
    });
  });

  it('keeps money not found as its own line', () => {
    expect(recount({ counted: '8,420,000', choice: 'NOT_FOUND' })).toEqual({
      ok: true,
      data: [
        expect.objectContaining({
          kind: 'COUNT_DIFFERENCE',
          name: 'Не нашли при пересчёте · Наличные',
          amount: -180_000,
        }),
      ],
    });
  });
});

describe('recurring expenses', () => {
  const rent: RecurringRecord = {
    id: 'rent',
    name: 'Аренда цеха',
    amount: 4_000_000,
    dayOfMonth: 5,
    wallet: 'ACCOUNT',
    category: 'RENT',
    isActive: true,
  };

  it('needs a day of the month that exists', () => {
    const built = buildRecurring({
      ...emptyRecurring(),
      name: 'Аренда',
      amount: '4,000,000',
      dayOfMonth: '32',
      category: 'RENT',
    });

    expect(built).toEqual({
      ok: false,
      errors: { dayOfMonth: 'Введите число от 1 до 31' },
    });
  });

  it('pays the month at the sum and wallet typed in', () => {
    expect(
      buildRecurringPayment(
        { recurringId: 'rent', amount: '4,200,000', wallet: 'CASH', date: TODAY },
        rent,
      ),
    ).toEqual({
      ok: true,
      data: expect.objectContaining({
        kind: 'EXPENSE',
        name: 'Аренда цеха',
        amount: 4_200_000,
        wallet: 'CASH',
        category: 'RENT',
        recurringExpenseId: 'rent',
      }),
    });
  });
});

describe('buildHandover', () => {
  const holders = [{ workerId: 'avazbek', name: 'AVAZBEK', amount: 2_400_000 }];

  it('moves cash from the worker into the wallet', () => {
    expect(
      buildHandover(
        { workerId: 'avazbek', amount: '2,400,000', wallet: 'CASH', date: TODAY },
        holders,
      ),
    ).toEqual({
      ok: true,
      data: expect.objectContaining({
        kind: 'HANDOVER',
        name: 'Сдал деньги · AVAZBEK',
        amount: 2_400_000,
        workerId: 'avazbek',
      }),
    });
  });

  it('refuses more than the worker holds', () => {
    expect(
      buildHandover(
        { workerId: 'avazbek', amount: '3,000,000', wallet: 'CASH', date: TODAY },
        holders,
      ),
    ).toEqual({ ok: false, errors: { amount: 'У него только 2,400,000 сум' } });
  });
});
