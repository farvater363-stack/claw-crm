import { describe, expect, it } from 'vitest';

import {
  computeMonthlyPayroll,
  type PayrollPayment,
  type PayrollWorker,
} from 'src/payroll/compute-monthly-payroll';
import { type AccrualLine } from 'src/payroll/plan-order-accruals';

const worker = (overrides: Partial<PayrollWorker> = {}): PayrollWorker => ({
  id: 'worker-1',
  name: 'Работник 1',
  isActive: true,
  categories: ['MASTER'],
  ...overrides,
});

const line = (overrides: Partial<AccrualLine> = {}): AccrualLine => ({
  id: 'line',
  workerId: 'worker-1',
  orderId: 'order-1',
  earnedOn: '2026-10-10',
  method: 'PER_SQUARE_METER',
  work: 'MASTER',
  basis: 10,
  rate: 10_000,
  amount: 100_000,
  name: '№1001',
  part: null,
  ...overrides,
});

const payment = (overrides: Partial<PayrollPayment> = {}): PayrollPayment => ({
  id: 'payment',
  masterId: 'worker-1',
  paidOn: '2026-10-05',
  amount: 40_000,
  kind: 'ADVANCE',
  comment: null,
  ...overrides,
});

const october = (input: { workers?: PayrollWorker[]; accruals?: AccrualLine[]; payments?: PayrollPayment[] }) =>
  computeMonthlyPayroll({ month: '2026-10', workers: [worker()], accruals: [], payments: [], ...input });

describe('computeMonthlyPayroll', () => {
  it('adds up the lines of the month, a penalty included, and subtracts the payments', () => {
    const [row] = october({
      accruals: [
        line({ id: 'base' }),
        line({ id: 'bonus', method: 'BONUS', amount: 10_000 }),
        line({ id: 'penalty', method: 'PENALTY', amount: -12_000 }),
      ],
      payments: [payment({ id: 'p1' }), payment({ id: 'p2', paidOn: '2026-10-31', amount: 58_000, kind: 'SETTLEMENT' })],
    });

    expect(row).toMatchObject({
      workerId: 'worker-1',
      workerName: 'Работник 1',
      categories: ['MASTER'],
      isActive: true,
      earned: 98_000,
      carriedOver: 0,
      paidThisMonth: 98_000,
      owed: 0,
    });
    expect(row.lines.map((entry) => entry.id)).toEqual(['base', 'bonus', 'penalty']);
    expect(row.payments.map((entry) => entry.id)).toEqual(['p1', 'p2']);
  });

  it('carries what was earned and not paid before the month', () => {
    const [row] = october({
      accruals: [line({ id: 'september', earnedOn: '2026-09-20' }), line({ id: 'october', amount: 50_000 })],
      payments: [payment({ paidOn: '2026-09-25', amount: 30_000 })],
    });

    expect(row).toMatchObject({ carriedOver: 70_000, earned: 50_000, paidThisMonth: 0, owed: 120_000 });
    expect(row.lines.map((entry) => entry.id)).toEqual(['october']);
    expect(row.payments).toEqual([]);
  });

  it('carries an overpayment as a negative balance', () => {
    const [row] = october({
      accruals: [line({ earnedOn: '2026-09-20' })],
      payments: [payment({ paidOn: '2026-09-25', amount: 130_000 })],
    });

    expect(row).toMatchObject({ carriedOver: -30_000, owed: -30_000 });
  });

  it('leaves out what is earned or paid after the month', () => {
    const [row] = october({
      accruals: [line({ earnedOn: '2026-11-02' })],
      payments: [payment({ paidOn: '2026-11-03' })],
    });

    expect(row).toMatchObject({ earned: 0, carriedOver: 0, paidThisMonth: 0, owed: 0 });
  });

  it('lists every active worker, and an inactive one only while he is owed or was paid', () => {
    const rows = october({
      workers: [
        worker(),
        worker({ id: 'gone', name: 'Работник 5', isActive: false }),
        worker({ id: 'owed', name: 'Работник 3', isActive: false }),
        worker({ id: 'paid', name: 'Работник 4', isActive: false }),
      ],
      accruals: [line({ workerId: 'owed', earnedOn: '2026-09-20' }), line({ workerId: 'paid' })],
      payments: [payment({ masterId: 'paid', amount: 100_000 })],
    });

    expect(rows.map((row) => row.workerId)).toEqual(['worker-1', 'owed', 'paid']);
  });

  it('sorts by name and shows a worker without a name as an empty one', () => {
    const rows = october({
      workers: [worker({ id: 'b', name: 'Работник 2' }), worker({ id: 'a', name: 'Работник 1' }), worker({ id: 'n', name: null })],
    });

    expect(rows.map((row) => row.workerName)).toEqual(['', 'Работник 1', 'Работник 2']);
  });

  it('keeps an amount that is not a number out of every sum', () => {
    const [row] = october({
      accruals: [
        line({ id: 'good' }),
        line({ id: 'broken', amount: Number.NaN }),
        line({ id: 'old', earnedOn: '2026-09-20', amount: Number.POSITIVE_INFINITY }),
      ],
      payments: [payment({ amount: Number.NaN })],
    });

    expect(row).toMatchObject({ earned: 100_000, carriedOver: 0, paidThisMonth: 0, owed: 100_000 });
  });
});
