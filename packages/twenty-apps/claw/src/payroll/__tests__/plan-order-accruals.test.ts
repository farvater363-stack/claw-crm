import { describe, expect, it } from 'vitest';

import {
  computeMasterBasePay,
  masterRuleRate,
  type PayRule,
} from 'src/payroll/pay-rules';
import {
  accrualId,
  type AccrualLine,
  type OrderForAccruals,
  planOrderAccruals,
} from 'src/payroll/plan-order-accruals';
import {
  EMPTY_WORKSHOP_CATALOG,
  NO_KEPT_RATES,
  planSquareMeterParts,
  type WorkshopCatalog,
} from 'src/payroll/workshop-pay';

// toLocaleString groups thousands with a no-break space
const plain = (value: string) => value.replace(/\s/g, ' ');

const order = (
  overrides: Partial<OrderForAccruals> = {},
): OrderForAccruals => ({
  id: 'order-1',
  name: '№1042',
  status: 'INSTALLED',
  areaSquareMeters: 3.84,
  total: 1_410_000,
  masterId: null,
  installerId: null,
  measurerWorkerId: null,
  soldById: null,
  masterBonus: null,
  masterPenalty: null,
  installedOn: '2026-10-12',
  measuredOn: null,
  items: [],
  ...overrides,
});

const rule = (overrides: Partial<PayRule> = {}): PayRule => ({
  id: 'rule',
  workerId: 'worker-2',
  method: 'PER_SQUARE_METER',
  work: 'INSTALLER',
  amount: 15_000,
  percent: null,
  ...overrides,
});

const MEASURE_RULE = rule({
  id: 'measure',
  workerId: 'sardor',
  method: 'PER_MEASUREMENT',
  work: 'MEASURER',
  amount: 50_000,
});

// What the recalc stores on an order with no lines: its area at the master's rule.
const orderPay = (rules: PayRule[], areaSquareMeters: number | null) =>
  computeMasterBasePay({
    rules,
    keptRates: [],
    squareMeterParts: planSquareMeterParts({
      catalog: EMPTY_WORKSHOP_CATALOG,
      masterId: 'worker-3',
      items: [],
      orderAreaSquareMeters: areaSquareMeters,
      ruleRate: masterRuleRate(rules),
      kept: NO_KEPT_RATES,
    }),
  });

const plan = (
  overrides: Partial<OrderForAccruals>,
  rules: PayRule[],
  existing: AccrualLine[] = [],
) => planOrderAccruals({ order: order(overrides), rules, existing });

describe('accrualId', () => {
  it('is the same for the same order, worker, method and work, and differs by work', () => {
    const parts = {
      orderId: 'order-1',
      workerId: 'worker-2',
      method: 'PER_SQUARE_METER',
      work: 'INSTALLER',
    } as const;

    expect(accrualId(parts)).toBe(accrualId({ ...parts }));
    expect(accrualId(parts)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(accrualId({ ...parts, work: 'MEASURER' })).not.toBe(
      accrualId(parts),
    );
  });
});

describe('planOrderAccruals', () => {
  it('pays the installer per m² when the order is installed', () => {
    const { upserts, deleteIds } = plan({ installerId: 'worker-2' }, [rule()]);

    expect(deleteIds).toEqual([]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      id: accrualId({
        orderId: 'order-1',
        workerId: 'worker-2',
        method: 'PER_SQUARE_METER',
        work: 'INSTALLER',
      }),
      workerId: 'worker-2',
      orderId: 'order-1',
      earnedOn: '2026-10-12',
      method: 'PER_SQUARE_METER',
      work: 'INSTALLER',
      basis: 3.84,
      rate: 15_000,
      amount: 57_600,
    });
    expect(plain(upserts[0].name)).toBe(
      '№1042 · Установщик · 3,84 м² × 15,000',
    );
  });

  it('pays a fixed amount per order', () => {
    const { upserts } = plan({ masterId: 'worker-3' }, [
      rule({
        workerId: 'worker-3',
        method: 'PER_ORDER',
        work: 'MASTER',
        amount: 100_000,
      }),
    ]);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      method: 'PER_ORDER',
      work: 'MASTER',
      basis: 1,
      rate: 100_000,
      amount: 100_000,
    });
    expect(plain(upserts[0].name)).toBe('№1042 · Мастер · за заказ 100,000');
  });

  it('pays the salesperson a percent of the total', () => {
    const { upserts } = plan({ soldById: 'worker-2' }, [
      rule({
        method: 'PERCENT_OF_SALES',
        work: 'SALES',
        amount: null,
        percent: 3,
      }),
    ]);

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      method: 'PERCENT_OF_SALES',
      work: 'SALES',
      basis: 1_410_000,
      rate: 3,
      amount: 42_300,
    });
    expect(plain(upserts[0].name)).toBe('№1042 · Продажник · 3 % от 1,410,000');
  });

  it('pays the measurer for the measurement as soon as it is done, and nothing else before the installation', () => {
    const { upserts } = plan(
      {
        status: 'MEASURED',
        installedOn: null,
        measuredOn: '2026-10-03',
        measurerWorkerId: 'sardor',
        installerId: 'worker-2',
      },
      [rule(), MEASURE_RULE],
    );

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      workerId: 'sardor',
      earnedOn: '2026-10-03',
      method: 'PER_MEASUREMENT',
      work: 'MEASURER',
      basis: 1,
      rate: 50_000,
      amount: 50_000,
    });
    expect(plain(upserts[0].name)).toBe('№1042 · Замерщик · за замер 50,000');
  });

  it("adds the master's bonus and penalty so his lines add up to his pay", () => {
    const { upserts } = plan(
      { masterId: 'worker-3', masterBonus: 100_000, masterPenalty: 12_000 },
      [rule({ workerId: 'worker-3', work: 'MASTER', amount: 25_000 })],
    );

    expect(upserts.map((line) => [line.method, line.amount])).toEqual([
      ['PER_SQUARE_METER', 96_000],
      ['BONUS', 100_000],
      ['PENALTY', -12_000],
    ]);
    expect(upserts.map((line) => plain(line.name)).slice(1)).toEqual([
      '№1042 · Мастер · премия 100,000',
      '№1042 · Мастер · штраф 12,000',
    ]);
  });

  it('writes no bonus or penalty line for zero', () => {
    const { upserts } = plan(
      { masterId: 'worker-3', masterBonus: 0, masterPenalty: 0 },
      [],
    );

    expect(upserts).toEqual([]);
  });

  it('writes one line per rule when a worker has two rules for one work', () => {
    const { upserts } = plan({ masterId: 'worker-3' }, [
      rule({ id: 'a', workerId: 'worker-3', work: 'MASTER', amount: 25_000 }),
      rule({
        id: 'b',
        workerId: 'worker-3',
        work: 'MASTER',
        method: 'PER_ORDER',
        amount: 100_000,
      }),
    ]);

    expect(upserts.map((line) => line.amount)).toEqual([96_000, 100_000]);
  });

  it('takes the first of two rules of one method and work, as the pay on the order does', () => {
    const { upserts } = plan({ masterId: 'worker-3' }, [
      rule({ id: 'a', workerId: 'worker-3', work: 'MASTER', amount: 25_000 }),
      rule({ id: 'b', workerId: 'worker-3', work: 'MASTER', amount: 40_000 }),
    ]);

    expect(upserts.map((line) => [line.rate, line.amount])).toEqual([
      [25_000, 96_000],
    ]);
  });

  it('pays one worker for each of his works on the order, and no fixed pay', () => {
    const { upserts } = plan(
      { installerId: 'worker-2', soldById: 'worker-2' },
      [
        rule(),
        rule({
          id: 'sales',
          method: 'PERCENT_OF_SALES',
          work: 'SALES',
          amount: null,
          percent: 3,
        }),
        rule({ id: 'fixed', method: 'FIXED', work: null, amount: 2_000_000 }),
      ],
    );

    expect(upserts.map((line) => [line.work, line.amount])).toEqual([
      ['INSTALLER', 57_600],
      ['SALES', 42_300],
    ]);
  });

  it('moves the lines to the new worker when the installer changes', () => {
    const written = plan({ installerId: 'worker-2' }, [rule()]).upserts;
    const rules = [
      rule(),
      rule({ id: 'worker-1', workerId: 'worker-1', amount: 12_000 }),
    ];
    const { upserts, deleteIds } = plan(
      { installerId: 'worker-1' },
      rules,
      written,
    );

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      workerId: 'worker-1',
      rate: 12_000,
      amount: 46_080,
    });
    expect(deleteIds).toEqual([written[0].id]);
  });

  it.each(['QUALITY_CHECK', 'CANCELLED'])(
    'removes the installation lines and keeps the measurement line when the order becomes %s',
    (status) => {
      const people = {
        installerId: 'worker-2',
        measurerWorkerId: 'sardor',
        measuredOn: '2026-10-03',
      };
      const written = plan(people, [rule(), MEASURE_RULE]).upserts;
      const { upserts, deleteIds } = plan(
        { ...people, status },
        [rule(), MEASURE_RULE],
        written,
      );

      expect(written.map((line) => line.method)).toEqual([
        'PER_SQUARE_METER',
        'PER_MEASUREMENT',
      ]);
      expect(upserts).toEqual([]);
      expect(deleteIds).toEqual([written[0].id]);
    },
  );

  it('keeps the rate of an installed order when the rule changes later', () => {
    const written = plan({ installerId: 'worker-2' }, [rule()]).upserts;

    expect(
      plan({ installerId: 'worker-2' }, [rule({ amount: 20_000 })], written),
    ).toEqual({ upserts: [], deleteIds: [] });
  });

  it('recounts a line at its kept rate when the area changes after the installation', () => {
    const written = plan({ installerId: 'worker-2' }, [rule()]).upserts;
    const { upserts, deleteIds } = plan(
      { installerId: 'worker-2', areaSquareMeters: 5 },
      [rule({ amount: 20_000 })],
      written,
    );

    expect(deleteIds).toEqual([]);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      id: written[0].id,
      basis: 5,
      rate: 15_000,
      amount: 75_000,
    });
  });

  it('plans nothing without a worker, without a rule, or for a rule of another work', () => {
    const empty = { upserts: [], deleteIds: [] };

    expect(plan({}, [rule()])).toEqual(empty);
    expect(plan({ installerId: 'worker-2' }, [])).toEqual(empty);
    expect(
      plan({ installerId: 'worker-2' }, [rule({ work: 'MASTER' })]),
    ).toEqual(empty);
  });

  it('plans nothing for an installed order that has no installation date yet', () => {
    expect(
      plan({ installerId: 'worker-2', installedOn: null }, [rule()]).upserts,
    ).toEqual([]);
  });

  it('plans nothing when the lines are already written', () => {
    const written = plan({ installerId: 'worker-2' }, [rule()]).upserts;

    expect(plan({ installerId: 'worker-2' }, [rule()], written)).toEqual({
      upserts: [],
      deleteIds: [],
    });
  });

  it('never writes a sum that is not a number', () => {
    const people = {
      masterId: 'worker-3',
      installerId: 'worker-2',
      soldById: 'worker-1',
      measurerWorkerId: 'sardor',
      measuredOn: '2026-10-03',
    };
    const rules = [
      rule({ id: 'a', workerId: 'worker-3', work: 'MASTER', amount: NaN }),
      rule({ id: 'b', amount: null }),
      rule({
        id: 'c',
        workerId: 'worker-1',
        method: 'PERCENT_OF_SALES',
        work: 'SALES',
        amount: null,
        percent: null,
      }),
      { ...MEASURE_RULE, amount: Infinity },
    ];
    const broken = {
      ...people,
      areaSquareMeters: NaN,
      total: NaN,
      masterBonus: NaN,
      masterPenalty: NaN,
    };
    const { upserts } = plan(broken, rules);

    expect(
      upserts.map((line) => [line.method, line.basis, line.rate, line.amount]),
    ).toEqual([
      ['PER_SQUARE_METER', 0, 0, 0],
      ['PER_SQUARE_METER', 0, 0, 0],
      ['PERCENT_OF_SALES', 0, 0, 0],
      ['PER_MEASUREMENT', 1, 0, 0],
    ]);
    expect(plan(broken, rules, upserts)).toEqual({
      upserts: [],
      deleteIds: [],
    });
  });

  describe('an order without an area', () => {
    const MASTER_RULES = [
      rule({ id: 'a', workerId: 'worker-3', work: 'MASTER', amount: 25_000 }),
      rule({
        id: 'b',
        workerId: 'worker-3',
        work: 'MASTER',
        method: 'PER_ORDER',
        amount: 100_000,
      }),
    ];
    const master = {
      masterId: 'worker-3',
      masterBonus: 100_000,
      masterPenalty: 12_000,
    };

    it('writes no line for a master paid per m², as the order shows no pay for him', () => {
      expect(
        orderPay(MASTER_RULES, null),
      ).toBeNull();
      expect(plan({ ...master, areaSquareMeters: null }, MASTER_RULES)).toEqual(
        { upserts: [], deleteIds: [] },
      );
    });

    it('removes the lines of a master paid per m² when the order loses its area', () => {
      const written = plan(master, MASTER_RULES).upserts;
      const { upserts, deleteIds } = plan(
        { ...master, areaSquareMeters: null },
        [],
        written,
      );

      expect(written).toHaveLength(4);
      expect(upserts).toEqual([]);
      expect(deleteIds).toEqual(written.map((line) => line.id));
    });

    it('still pays a worker who has no per-m² rate, and the master his bonus', () => {
      const { upserts } = plan(
        { ...master, installerId: 'worker-2', areaSquareMeters: null },
        [
          ...MASTER_RULES,
          rule({ id: 'c', method: 'PER_ORDER', amount: 80_000 }),
        ],
      );

      expect(
        upserts.map((line) => [line.workerId, line.method, line.amount]),
      ).toEqual([['worker-2', 'PER_ORDER', 80_000]]);
      expect(
        plan({ ...master, areaSquareMeters: null }, [
          MASTER_RULES[1],
        ]).upserts.map((line) => [line.method, line.amount]),
      ).toEqual([
        ['PER_ORDER', 100_000],
        ['BONUS', 100_000],
        ['PENALTY', -12_000],
      ]);
    });
  });

  it("makes the master's lines add up to the pay the order shows", () => {
    const rules = [
      rule({ id: 'a', workerId: 'worker-3', work: 'MASTER', amount: 25_000 }),
      rule({
        id: 'b',
        workerId: 'worker-3',
        work: 'MASTER',
        method: 'PER_ORDER',
        amount: 100_000,
      }),
    ];
    const { upserts } = plan(
      { masterId: 'worker-3', masterBonus: 100_000, masterPenalty: 12_000 },
      rules,
    );
    const basePay = orderPay(rules, 3.84);

    expect(basePay).toBe(196_000);
    expect(upserts.reduce((sum, line) => sum + line.amount, 0)).toBe(
      (basePay ?? 0) + 100_000 - 12_000,
    );
  });

  it('counts a kept rate that is not a number as zero', () => {
    const written = plan({ installerId: 'worker-2' }, [rule()]).upserts;
    const { upserts } = plan(
      { installerId: 'worker-2' },
      [rule()],
      [{ ...written[0], rate: NaN, amount: NaN }],
    );

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ rate: 0, amount: 0 });
  });

  describe('by «Ставки цеха»', () => {
    const CATALOG: WorkshopCatalog = {
      kinds: [
        { id: 'simple', name: 'Простая' },
        { id: 'forged', name: 'Кованая' },
      ],
      designs: [
        { id: 'classic', name: 'Классик', grilleKindId: 'simple' },
        { id: 'vine', name: 'Лоза', grilleKindId: 'forged' },
        { id: 'leaf', name: 'Лист', grilleKindId: 'forged' },
        { id: 'loose', name: 'Сота', grilleKindId: null },
      ],
      rates: [
        { id: 'r1', grilleKindId: 'simple', designId: null, workerId: null, rate: 25_000 },
        { id: 'r2', grilleKindId: 'forged', designId: null, workerId: null, rate: 50_000 },
        { id: 'r3', grilleKindId: 'forged', designId: null, workerId: 'worker-3', rate: 55_000 },
        { id: 'r4', grilleKindId: null, designId: 'vine', workerId: null, rate: 65_000 },
        { id: 'r5', grilleKindId: null, designId: null, workerId: null, rate: 30_000 },
      ],
    };
    const ITEMS = [
      { designId: 'vine', areaSquareMeters: 2.1, quantity: 1 },
      { designId: 'classic', areaSquareMeters: 1.8, quantity: 2 },
      { designId: 'leaf', areaSquareMeters: 1.5, quantity: 1 },
      { designId: 'loose', areaSquareMeters: 1, quantity: 1 },
    ];
    const MASTER_RULE = rule({ id: 'm', workerId: 'worker-3', work: 'MASTER', amount: 20_000 });
    const planByKind = (
      overrides: Partial<OrderForAccruals> = {},
      existing: AccrualLine[] = [],
      catalog = CATALOG,
    ) =>
      planOrderAccruals({
        order: order({ masterId: 'worker-3', items: ITEMS, ...overrides }),
        rules: [MASTER_RULE],
        existing,
        catalog,
      });

    it("pays each проём at its grille's row, the master's own cell first", () => {
      const { upserts } = planByKind();

      expect(
        upserts.map((line) => [line.part, line.basis, line.rate, line.amount]),
      ).toEqual([
        ['design:vine', 2.1, 65_000, 136_500],
        ['kind:simple', 3.6, 25_000, 90_000],
        ['kind:forged', 1.5, 55_000, 82_500],
        ['none', 1, 30_000, 30_000],
      ]);
      expect(new Set(upserts.map((line) => line.id)).size).toBe(4);
      expect(plain(upserts[0].name)).toBe('№1042 · Мастер · «Лоза» 2,1 м² × 65,000');
    });

    it('pays by the old rule what the table has no rate for', () => {
      const { upserts } = planByKind({}, [], {
        ...CATALOG,
        rates: CATALOG.rates.filter((rate) => rate.id === 'r1'),
      });

      expect(
        upserts.map((line) => [line.part, line.basis, line.rate]),
      ).toEqual([
        ['rule', 4.6, 20_000],
        ['kind:simple', 3.6, 25_000],
      ]);
    });

    it('keeps the rates written at the installation when the table changes', () => {
      const written = planByKind().upserts;
      const raised = {
        ...CATALOG,
        rates: CATALOG.rates.map((rate) => ({ ...rate, rate: rate.rate * 2 })),
      };

      expect(planByKind({}, written, raised)).toEqual({
        upserts: [],
        deleteIds: [],
      });
    });

    it('keeps paying an order installed before the table the old way', () => {
      const legacy = plan({ masterId: 'worker-3' }, [MASTER_RULE]).upserts.map(
        (line) => ({ ...line, part: null }),
      );
      const legacyLine = {
        ...legacy[0],
        id: accrualId({
          orderId: 'order-1',
          workerId: 'worker-3',
          method: 'PER_SQUARE_METER',
          work: 'MASTER',
        }),
        name: '№1042 · Мастер · 3,84 м² × 20,000',
      };

      expect(planByKind({}, [legacyLine])).toEqual({
        upserts: [],
        deleteIds: [],
      });
    });

    it("adds up to the pay the order shows", () => {
      const { upserts } = planByKind();

      expect(upserts.reduce((sum, line) => sum + line.amount, 0)).toBe(
        computeMasterBasePay({
          rules: [MASTER_RULE],
          keptRates: [],
          squareMeterParts: planSquareMeterParts({
            catalog: CATALOG,
            masterId: 'worker-3',
            items: ITEMS,
            orderAreaSquareMeters: 6.4,
            ruleRate: 20_000,
            kept: NO_KEPT_RATES,
          }),
        }),
      );
    });
  });
});
