import { describe, expect, it } from 'vitest';

import { type PayRule } from 'src/payroll/pay-rules';
import {
  fixedAccrualId,
  planFixedAccruals,
} from 'src/payroll/plan-fixed-accruals';

const rule = (overrides: Partial<PayRule> = {}): PayRule => ({
  id: 'fixed-1',
  workerId: 'farhod',
  method: 'FIXED',
  work: null,
  amount: 2_000_000,
  percent: null,
  ...overrides,
});

const workers = [
  { id: 'farhod', isActive: true },
  { id: 'aziz', isActive: false },
];
const OCTOBER_ID = fixedAccrualId({ workerId: 'farhod', month: '2026-10' });

describe('planFixedAccruals', () => {
  it('writes one line per active worker with a fixed rule, dated the first day of the month', () => {
    expect(
      planFixedAccruals({
        month: '2026-10',
        workers,
        rules: [rule()],
        existingIds: [],
      }),
    ).toEqual([
      {
        id: OCTOBER_ID,
        workerId: 'farhod',
        orderId: null,
        earnedOn: '2026-10-01',
        method: 'FIXED',
        work: null,
        basis: 1,
        rate: 2_000_000,
        amount: 2_000_000,
        name: 'Фикса · Октябрь 2026',
      },
    ]);
  });

  it('adds up the fixed rules of one worker into his one line of the month', () => {
    const rules = [rule(), rule({ id: 'fixed-2', amount: 500_000 })];

    expect(
      planFixedAccruals({ month: '2026-10', workers, rules, existingIds: [] }),
    ).toMatchObject([{ id: OCTOBER_ID, rate: 2_500_000, amount: 2_500_000 }]);
  });

  it('skips a worker whose line exists, even under a new rule, an inactive worker and a rule that is not fixed', () => {
    const rules = [
      rule({ id: 'fixed-replaced', amount: 3_000_000 }),
      rule({ id: 'fixed-2', workerId: 'aziz' }),
      rule({ id: 'per-order', method: 'PER_ORDER', work: 'INSTALLER' }),
    ];

    expect(
      planFixedAccruals({
        month: '2026-10',
        workers,
        rules,
        existingIds: [OCTOBER_ID],
      }),
    ).toEqual([]);
  });

  it('gives each month a line of its own', () => {
    const [november] = planFixedAccruals({
      month: '2026-11',
      workers,
      rules: [rule()],
      existingIds: [OCTOBER_ID],
    });

    expect(november).toMatchObject({
      earnedOn: '2026-11-01',
      name: 'Фикса · Ноябрь 2026',
    });
    expect(november.id).not.toBe(OCTOBER_ID);
  });

  it.each([null, 0, Number.NaN, Number.POSITIVE_INFINITY, -100])(
    'writes no line while the fixed amount is %s',
    (amount) => {
      expect(
        planFixedAccruals({
          month: '2026-10',
          workers,
          rules: [rule({ amount })],
          existingIds: [],
        }),
      ).toEqual([]);
    },
  );

  it('rounds the sum to whole sums', () => {
    expect(
      planFixedAccruals({
        month: '2026-10',
        workers,
        rules: [rule({ amount: 1_000_000.4 })],
        existingIds: [],
      }),
    ).toMatchObject([{ rate: 1_000_000, amount: 1_000_000 }]);
  });
});
