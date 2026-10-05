import { describe, expect, it } from 'vitest';

import {
  keptMasterRates,
  toAccrualLine,
  toPayRule,
  toPayRules,
} from 'src/payroll/pay-records';

const node = {
  id: 'rule-1',
  workerId: 'worker-3',
  method: 'PER_SQUARE_METER',
  work: 'MASTER',
  amount: { amountMicros: 25_000_000_000 },
  percent: null,
};

describe('toPayRule', () => {
  it('reads the amount as whole sums', () => {
    expect(toPayRule(node)).toEqual({
      id: 'rule-1',
      workerId: 'worker-3',
      method: 'PER_SQUARE_METER',
      work: 'MASTER',
      amount: 25_000,
      percent: null,
    });
  });

  it('reads a fixed rule without a work and a percent rule without an amount', () => {
    expect(
      toPayRule({ ...node, method: 'FIXED', work: null })?.work,
    ).toBeNull();
    expect(
      toPayRule({
        ...node,
        method: 'PERCENT_OF_SALES',
        work: 'SALES',
        amount: null,
        percent: 3,
      }),
    ).toMatchObject({
      amount: null,
      percent: 3,
    });
  });

  it('reads an amount or a percent that is not a number as empty', () => {
    expect(
      toPayRule({
        ...node,
        amount: { amountMicros: 'many' },
        percent: Number.NaN,
      }),
    ).toMatchObject({ amount: null, percent: null });
  });

  it('drops a rule without a worker or with a method it does not know', () => {
    expect(
      toPayRules([
        { ...node, workerId: null },
        { ...node, method: 'PER_HOUR' },
        node,
      ]),
    ).toHaveLength(1);
  });
});

describe('keptMasterRates', () => {
  it("keeps the per-m² and per-order rates on the master's own lines", () => {
    const lines = [
      {
        workerId: 'worker-3',
        work: 'MASTER',
        method: 'PER_SQUARE_METER',
        rate: 25_000,
      },
      {
        workerId: 'worker-3',
        work: 'MASTER',
        method: 'PER_ORDER',
        rate: 100_000,
      },
      { workerId: 'worker-3', work: 'MASTER', method: 'BONUS', rate: 10_000 },
      {
        workerId: 'worker-3',
        work: 'INSTALLER',
        method: 'PER_SQUARE_METER',
        rate: 15_000,
      },
      {
        workerId: 'worker-2',
        work: 'MASTER',
        method: 'PER_SQUARE_METER',
        rate: 30_000,
      },
    ];

    expect(keptMasterRates(lines, 'worker-3')).toEqual([
      { method: 'PER_SQUARE_METER', rate: 25_000 },
      { method: 'PER_ORDER', rate: 100_000 },
    ]);
  });
});

describe('toAccrualLine', () => {
  const line = {
    id: 'line-1',
    workerId: 'worker-2',
    orderId: 'order-1',
    earnedOn: '2026-10-12',
    method: 'PER_SQUARE_METER',
    work: 'INSTALLER',
    basis: 3.84,
    rate: 15_000,
    amount: { amountMicros: 57_600_000_000 },
    name: '№1042',
  };

  it('reads a stored line', () => {
    expect(toAccrualLine(line)).toEqual({ ...line, amount: 57_600 });
  });

  it('reads a fixed monthly line, which has no order and no work', () => {
    expect(
      toAccrualLine({ ...line, orderId: null, method: 'FIXED', work: null }),
    ).toMatchObject({ orderId: null, work: null });
  });

  it.each([{ workerId: null }, { earnedOn: null }, { method: 'PER_HOUR' }])(
    'drops a line with %o',
    (broken) => {
      expect(toAccrualLine({ ...line, ...broken })).toBeNull();
    },
  );

  it('reads a number that is not finite as zero', () => {
    expect(
      toAccrualLine({
        ...line,
        basis: Number.NaN,
        rate: Number.POSITIVE_INFINITY,
        amount: { amountMicros: 'много' },
      }),
    ).toMatchObject({ basis: 0, rate: 0, amount: 0 });
  });
});
