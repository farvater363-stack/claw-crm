import { describe, expect, it } from 'vitest';

import { type PayMethod } from 'src/constants/select-options';
import {
  applyLatePenalty,
  computeMasterBasePay,
  describePayRule,
  isAllowedPayRulePair,
  type PayRule,
  type PayWork,
  withLegacyMasterRate,
} from 'src/payroll/pay-rules';

// toLocaleString groups thousands with a no-break space
const plain = (value: string) => value.replace(/\s/g, ' ');

const rule = (overrides: Partial<PayRule>): PayRule => ({
  id: 'rule',
  workerId: 'worker-3',
  method: 'PER_SQUARE_METER',
  work: 'MASTER',
  amount: 25_000,
  percent: null,
  ...overrides,
});

describe('isAllowedPayRulePair', () => {
  const methods: PayMethod[] = [
    'FIXED',
    'PER_SQUARE_METER',
    'PER_ORDER',
    'PERCENT_OF_SALES',
    'PER_MEASUREMENT',
  ];
  const works: (PayWork | null)[] = [
    null,
    'MASTER',
    'INSTALLER',
    'MEASURER',
    'SALES',
  ];

  it('allows exactly the nine pairs of the spec out of the twenty-five', () => {
    const allowed = methods.flatMap((method) =>
      works
        .filter((work) => isAllowedPayRulePair(method, work))
        .map((work) => `${method}:${work}`),
    );

    expect(allowed).toEqual([
      'FIXED:null',
      'PER_SQUARE_METER:MASTER',
      'PER_SQUARE_METER:INSTALLER',
      'PER_SQUARE_METER:MEASURER',
      'PER_ORDER:MASTER',
      'PER_ORDER:INSTALLER',
      'PER_ORDER:MEASURER',
      'PERCENT_OF_SALES:SALES',
      'PER_MEASUREMENT:MEASURER',
    ]);
  });

  it.each<[PayMethod, PayWork | null]>([
    ['FIXED', 'MASTER'],
    ['PER_SQUARE_METER', null],
    ['PER_SQUARE_METER', 'SALES'],
    ['PER_ORDER', 'SALES'],
    ['PERCENT_OF_SALES', 'MASTER'],
    ['PERCENT_OF_SALES', null],
    ['PER_MEASUREMENT', 'INSTALLER'],
    ['PER_MEASUREMENT', null],
  ])('refuses %s for %s', (method, work) => {
    expect(isAllowedPayRulePair(method, work)).toBe(false);
  });
});

describe('describePayRule', () => {
  it.each<[Partial<PayRule>, string]>([
    [{ work: 'INSTALLER', amount: 15_000 }, 'Установщик: 15 000 сум за м²'],
    [
      { method: 'PERCENT_OF_SALES', work: 'SALES', amount: null, percent: 3 },
      'Продажник: 3 % от продаж',
    ],
    [
      { method: 'FIXED', work: null, amount: 2_000_000 },
      'Фикса 2 000 000 сум в месяц',
    ],
    [
      { method: 'PER_MEASUREMENT', work: 'MEASURER', amount: 50_000 },
      'Замерщик: 50 000 сум за замер',
    ],
    [
      { method: 'PER_ORDER', work: 'MASTER', amount: 100_000 },
      'Мастер: 100 000 сум за заказ',
    ],
  ])('words %o', (overrides, text) => {
    expect(plain(describePayRule(rule(overrides)))).toBe(text);
  });
});

describe('computeMasterBasePay', () => {
  it('pays the area at the per-m² rule', () => {
    expect(
      computeMasterBasePay({
        rules: [rule({})],
        keptRates: [],
        areaSquareMeters: 48.2,
      }),
    ).toBe(1_205_000);
  });

  it('adds a per-order rule to the per-m² one', () => {
    const rules = [
      rule({}),
      rule({ id: 'per-order', method: 'PER_ORDER', amount: 100_000 }),
    ];

    expect(
      computeMasterBasePay({ rules, keptRates: [], areaSquareMeters: 10 }),
    ).toBe(350_000);
  });

  it('counts only rules for the master work', () => {
    const rules = [
      rule({ work: 'INSTALLER' }),
      rule({ id: 'fixed', method: 'FIXED', work: null, amount: 2_000_000 }),
    ];

    expect(
      computeMasterBasePay({ rules, keptRates: [], areaSquareMeters: 10 }),
    ).toBe(0);
  });

  it('takes the first of two rules of one method, as the single accrual line does', () => {
    const rules = [rule({}), rule({ id: 'second', amount: 40_000 })];

    expect(
      computeMasterBasePay({ rules, keptRates: [], areaSquareMeters: 10 }),
    ).toBe(250_000);
  });

  it('uses the kept rates in place of the rules', () => {
    expect(
      computeMasterBasePay({
        rules: [
          rule({}),
          rule({ id: 'per-order', method: 'PER_ORDER', amount: 100_000 }),
        ],
        keptRates: [{ method: 'PER_SQUARE_METER', rate: 20_000 }],
        areaSquareMeters: 10,
      }),
    ).toBe(200_000);
  });

  it('is unknown while a per-m² rate has no area, and known for a per-order rate alone', () => {
    expect(
      computeMasterBasePay({
        rules: [rule({})],
        keptRates: [],
        areaSquareMeters: null,
      }),
    ).toBeNull();
    expect(
      computeMasterBasePay({
        rules: [rule({ method: 'PER_ORDER', amount: 100_000 })],
        keptRates: [],
        areaSquareMeters: null,
      }),
    ).toBe(100_000);
  });

  it.each([null, Number.NaN, Number.POSITIVE_INFINITY])(
    'pays nothing, and never NaN, for a rule whose amount is %s',
    (amount) => {
      const rules = [
        rule({ amount }),
        rule({ id: 'per-order', method: 'PER_ORDER', amount: 100_000 }),
      ];

      expect(
        computeMasterBasePay({ rules, keptRates: [], areaSquareMeters: 10 }),
      ).toBe(100_000);
    },
  );

  it('pays nothing, and never NaN, for a kept rate or an area that is not a number', () => {
    expect(
      computeMasterBasePay({
        rules: [],
        keptRates: [{ method: 'PER_SQUARE_METER', rate: Number.NaN }],
        areaSquareMeters: 10,
      }),
    ).toBe(0);
    expect(
      computeMasterBasePay({
        rules: [rule({})],
        keptRates: [],
        areaSquareMeters: Number.NaN,
      }),
    ).toBe(0);
  });
});

describe('applyLatePenalty', () => {
  it.each([
    [0, 100_000],
    [3, 88_000],
    [25, 0],
  ])(
    'after %i late days at 4 %% a day leaves %i of 100 000',
    (daysLate, pay) => {
      expect(
        applyLatePenalty({
          basePay: 100_000,
          penaltyPercentPerDay: 4,
          daysLate,
        }),
      ).toBe(pay);
    },
  );
});

describe('withLegacyMasterRate', () => {
  const master = { workerId: 'worker-3', ratePerSquareMeter: 25_000 };
  const legacy = {
    id: 'legacy-rate:worker-3',
    workerId: 'worker-3',
    method: 'PER_SQUARE_METER',
    work: 'MASTER',
    amount: 25_000,
    percent: null,
  };

  it('pays a master without a rule for his work by the old rate', () => {
    const fixed = rule({
      id: 'fixed',
      method: 'FIXED',
      work: null,
      amount: 2_000_000,
    });

    expect(withLegacyMasterRate([fixed], master)).toEqual([fixed, legacy]);
  });

  it('keeps the old per-m² rate next to a per-order rule alone', () => {
    const perOrder = rule({
      id: 'per-order',
      method: 'PER_ORDER',
      amount: 100_000,
    });
    const rules = withLegacyMasterRate([perOrder], master);

    expect(rules).toEqual([perOrder, legacy]);
    expect(
      computeMasterBasePay({ rules, keptRates: [], areaSquareMeters: 10 }),
    ).toBe(350_000);
  });

  it('adds nothing once the master has a per-m² rule, or when the old rate is zero', () => {
    expect(withLegacyMasterRate([rule({})], master)).toEqual([rule({})]);
    expect(
      withLegacyMasterRate([], { workerId: 'worker-3', ratePerSquareMeter: 0 }),
    ).toEqual([]);
  });

  it("does not take another worker's rule for the master's", () => {
    const other = rule({ workerId: 'worker-2' });

    expect(withLegacyMasterRate([other], master)).toHaveLength(2);
  });
});
