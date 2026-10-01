import { describe, expect, it } from 'vitest';

import {
  computeMonthlyPayroll,
  type PayrollOrder,
  type PayrollPayment,
} from 'src/payroll/compute-monthly-payroll';

const masters = [
  { id: 'anvar', name: 'Анвар' },
  { id: 'botir', name: 'Ботир' },
  { id: 'nodir', name: 'Нодир' },
];

const order = (overrides: Partial<PayrollOrder>): PayrollOrder => ({
  id: 'order',
  name: '№1001',
  masterId: 'anvar',
  readyAt: '2026-10-10',
  status: 'READY',
  areaSquareMeters: 10,
  masterPayCalculated: 88_000,
  masterPenalty: 12_000,
  masterBonus: 10_000,
  masterPayTotal: 98_000,
  ...overrides,
});

const payment = (overrides: Partial<PayrollPayment>): PayrollPayment => ({
  id: 'payment',
  masterId: 'anvar',
  paidOn: '2026-10-05',
  amount: 40_000,
  kind: 'ADVANCE',
  comment: null,
  ...overrides,
});

describe('computeMonthlyPayroll', () => {
  it('sums the month and subtracts advances and the settlement', () => {
    const { rows } = computeMonthlyPayroll({
      month: '2026-10',
      masters,
      orders: [order({})],
      payments: [
        payment({ id: 'p1', amount: 40_000 }),
        payment({
          id: 'p2',
          paidOn: '2026-10-31',
          amount: 58_000,
          kind: 'SETTLEMENT',
        }),
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      masterName: 'Анвар',
      squareMeters: 10,
      basePay: 100_000,
      penalty: 12_000,
      bonus: 10_000,
      earned: 98_000,
      paidThisMonth: 98_000,
      carriedOver: 0,
      owed: 0,
    });
  });

  it('carries an unpaid balance into the next month', () => {
    const { rows } = computeMonthlyPayroll({
      month: '2026-11',
      masters,
      orders: [
        order({}),
        order({
          id: 'o2',
          readyAt: '2026-11-03',
          masterPayTotal: 20_000,
          masterPayCalculated: 20_000,
          masterPenalty: 0,
          masterBonus: 0,
          areaSquareMeters: 2,
        }),
      ],
      payments: [payment({ amount: 40_000 })],
    });

    expect(rows[0]).toMatchObject({
      carriedOver: 58_000,
      earned: 20_000,
      paidThisMonth: 0,
      owed: 78_000,
    });
  });

  it('ignores cancelled orders', () => {
    const { rows } = computeMonthlyPayroll({
      month: '2026-10',
      masters,
      orders: [order({ status: 'CANCELLED' })],
      payments: [],
    });

    expect(rows).toEqual([]);
  });

  it('keeps a master who only has a carried balance and drops empty ones', () => {
    const { rows } = computeMonthlyPayroll({
      month: '2026-11',
      masters,
      orders: [order({ masterId: 'botir' })],
      payments: [],
    });

    expect(rows.map((row) => row.masterName)).toEqual(['Ботир']);
    expect(rows[0]).toMatchObject({
      earned: 0,
      carriedOver: 98_000,
      owed: 98_000,
    });
  });

  it('carries an overpayment as a negative balance', () => {
    const { rows } = computeMonthlyPayroll({
      month: '2026-11',
      masters,
      orders: [order({})],
      payments: [payment({ amount: 120_000 })],
    });

    expect(rows[0].owed).toBe(-22_000);
  });

  it('totals every column and sorts masters by name', () => {
    const { rows, totals } = computeMonthlyPayroll({
      month: '2026-10',
      masters,
      orders: [
        order({ masterId: 'nodir' }),
        order({ id: 'o2', masterId: 'anvar' }),
      ],
      payments: [],
    });

    expect(rows.map((row) => row.masterName)).toEqual(['Анвар', 'Нодир']);
    expect(totals).toMatchObject({
      squareMeters: 20,
      earned: 196_000,
      owed: 196_000,
    });
  });
});
