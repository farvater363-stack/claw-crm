import { describe, expect, it } from 'vitest';

import {
  keptMasterRates,
  toPayRule,
  toPayRules,
} from 'src/payroll/pay-records';

const node = {
  id: 'rule-1',
  workerId: 'rustam',
  method: 'PER_SQUARE_METER',
  work: 'MASTER',
  amount: { amountMicros: 25_000_000_000 },
  percent: null,
};

describe('toPayRule', () => {
  it('reads the amount as whole sums', () => {
    expect(toPayRule(node)).toEqual({
      id: 'rule-1',
      workerId: 'rustam',
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
        workerId: 'rustam',
        work: 'MASTER',
        method: 'PER_SQUARE_METER',
        rate: 25_000,
      },
      {
        workerId: 'rustam',
        work: 'MASTER',
        method: 'PER_ORDER',
        rate: 100_000,
      },
      { workerId: 'rustam', work: 'MASTER', method: 'BONUS', rate: 10_000 },
      {
        workerId: 'rustam',
        work: 'INSTALLER',
        method: 'PER_SQUARE_METER',
        rate: 15_000,
      },
      {
        workerId: 'farhod',
        work: 'MASTER',
        method: 'PER_SQUARE_METER',
        rate: 30_000,
      },
    ];

    expect(keptMasterRates(lines, 'rustam')).toEqual([
      { method: 'PER_SQUARE_METER', rate: 25_000 },
      { method: 'PER_ORDER', rate: 100_000 },
    ]);
  });
});
