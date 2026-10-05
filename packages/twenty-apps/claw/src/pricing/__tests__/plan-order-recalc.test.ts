import { describe, expect, it } from 'vitest';

import {
  type ExtraServiceLineSnapshot,
  type ItemSnapshot,
  type MasterSnapshot,
  type OrderSnapshot,
  planOrderRecalc,
  type RecalcInput,
} from 'src/pricing/plan-order-recalc';

const emptyOrder: OrderSnapshot = {
  areaSquareMeters: null,
  subtotal: null,
  discountKind: null,
  discountValue: null,
  discount: null,
  total: null,
  paid: null,
  balance: null,
  costTotal: null,
  margin: null,
  marginPercent: null,
  productionStartDate: null,
  installationDeadline: null,
  installedAt: null,
  readyAt: null,
  daysLate: null,
  masterBonus: null,
  masterPayCalculated: null,
  masterPenalty: null,
  masterPayTotal: null,
  status: 'PRODUCTION',
  deadlineState: null,
};

const item = (overrides: Partial<ItemSnapshot> = {}): ItemSnapshot => ({
  id: 'item-1',
  name: null,
  designId: 'grille-1',
  widthCm: 140,
  heightCm: 150,
  projectionCm: 30,
  quantity: 2,
  areaSquareMeters: null,
  pricePerSquareMeter: null,
  costPerSquareMeter: null,
  lineTotal: null,
  lineCost: null,
  ...overrides,
});

const serviceLine = (
  overrides: Partial<ExtraServiceLineSnapshot> = {},
): ExtraServiceLineSnapshot => ({
  id: 'line-1',
  name: null,
  extraServiceId: 'canopy-50',
  quantity: 3,
  price: null,
  cost: null,
  lineTotal: null,
  lineCost: null,
  ...overrides,
});

const paidPerSquareMeter = (
  rate: number,
  penaltyPercentPerDay: number,
): MasterSnapshot => ({
  penaltyPercentPerDay,
  rules: [
    {
      id: 'rule',
      workerId: 'master',
      method: 'PER_SQUARE_METER',
      work: 'MASTER',
      amount: rate,
      percent: null,
    },
  ],
  keptRates: [],
});

const input = (overrides: Partial<RecalcInput> = {}): RecalcInput => ({
  order: emptyOrder,
  items: [item()],
  extraServiceLines: [],
  extraServiceCatalog: [
    {
      id: 'canopy-50',
      name: 'Козырёк пластик 50',
      unit: 'PER_RUNNING_METER',
      price: 80_000,
      cost: 50_000,
    },
    {
      id: 'delivery',
      name: 'Доставка',
      unit: 'FIXED',
      price: 40_000,
      cost: 20_000,
    },
    {
      id: 'painting',
      name: 'Покраска',
      unit: 'PER_SQUARE_METER',
      price: 15_000,
      cost: 8_000,
    },
  ],
  grilles: [
    {
      id: 'grille-1',
      pricePerSquareMeter: 100_000,
      costPerSquareMeter: 60_000,
    },
    {
      id: 'grille-2',
      pricePerSquareMeter: 150_000,
      costPerSquareMeter: 90_000,
    },
  ],
  master: paidPerSquareMeter(10_000, 4),
  paymentsTotal: 0,
  today: '2026-10-01',
  refreshPriceItemIds: [],
  refreshPriceExtraServiceLineIds: [],
  ...overrides,
});

describe('planOrderRecalc', () => {
  it('prices an item from its grille and totals the order', () => {
    const plan = planOrderRecalc(input());

    expect(plan.itemUpdates).toEqual([
      {
        id: 'item-1',
        update: {
          name: '140×150×30',
          areaSquareMeters: 3.84,
          pricePerSquareMeter: 100_000,
          costPerSquareMeter: 60_000,
          lineTotal: 768_000,
          lineCost: 460_800,
        },
      },
    ]);
    expect(plan.orderUpdate).toMatchObject({
      areaSquareMeters: 7.68,
      subtotal: 768_000,
      discount: 0,
      total: 768_000,
      costTotal: 460_800,
      paid: 0,
      balance: 768_000,
      margin: 307_200,
      marginPercent: 40,
      masterPayCalculated: 76_800,
      masterPayTotal: 76_800,
    });
  });

  it('keeps a manually typed price until the grille changes', () => {
    const manual = item({
      pricePerSquareMeter: 210_000,
      costPerSquareMeter: 90_000,
    });

    expect(
      planOrderRecalc(input({ items: [manual] })).itemUpdates[0].update
        .pricePerSquareMeter,
    ).toBeUndefined();
    expect(
      planOrderRecalc(
        input({ items: [manual], refreshPriceItemIds: ['item-1'] }),
      ).itemUpdates[0].update.pricePerSquareMeter,
    ).toBe(100_000);
  });

  describe('price by grille', () => {
    it('fills an empty price and cost from the item grille', () => {
      const plan = planOrderRecalc(
        input({ items: [item({ designId: 'grille-2' })] }),
      );

      expect(plan.itemUpdates[0].update).toMatchObject({
        pricePerSquareMeter: 150_000,
        costPerSquareMeter: 90_000,
      });
    });

    it('keeps a hand-typed price when the grille did not change', () => {
      const plan = planOrderRecalc(
        input({
          items: [
            item({ pricePerSquareMeter: 120_000, costPerSquareMeter: 60_000 }),
          ],
        }),
      );

      expect(plan.itemUpdates[0]?.update.pricePerSquareMeter).toBeUndefined();
    });

    it('takes the new grille price when the grille changed', () => {
      const plan = planOrderRecalc(
        input({
          items: [
            item({
              id: 'item-1',
              designId: 'grille-2',
              pricePerSquareMeter: 100_000,
            }),
          ],
          refreshPriceItemIds: ['item-1'],
        }),
      );

      expect(plan.itemUpdates[0].update.pricePerSquareMeter).toBe(150_000);
    });

    it('keeps a stored cost when the grille did not change', () => {
      const plan = planOrderRecalc(
        input({
          items: [
            item({ pricePerSquareMeter: 100_000, costPerSquareMeter: 55_000 }),
          ],
        }),
      );

      expect(plan.itemUpdates[0].update.costPerSquareMeter).toBeUndefined();
      expect(plan.itemUpdates[0].update.lineCost).toBe(422_400);
    });

    it('takes the new grille cost when the grille changed', () => {
      const plan = planOrderRecalc(
        input({
          items: [
            item({
              designId: 'grille-2',
              pricePerSquareMeter: 100_000,
              costPerSquareMeter: 55_000,
            }),
          ],
          refreshPriceItemIds: ['item-1'],
        }),
      );

      expect(plan.itemUpdates[0].update.costPerSquareMeter).toBe(90_000);
    });

    it('leaves the price empty for an item without a grille', () => {
      const plan = planOrderRecalc(
        input({ items: [item({ designId: null })] }),
      );

      expect(plan.itemUpdates[0]?.update.pricePerSquareMeter).toBeUndefined();
      expect(plan.itemUpdates[0]?.update.lineTotal).toBeUndefined();
    });
  });

  it('prices extra services by unit', () => {
    const plan = planOrderRecalc(
      input({
        extraServiceLines: [
          serviceLine(),
          serviceLine({
            id: 'line-2',
            extraServiceId: 'delivery',
            quantity: null,
          }),
          serviceLine({
            id: 'line-3',
            extraServiceId: 'painting',
            quantity: null,
          }),
        ],
      }),
    );

    expect(plan.extraServiceLineUpdates).toEqual([
      {
        id: 'line-1',
        update: {
          name: 'Козырёк пластик 50',
          price: 80_000,
          cost: 50_000,
          lineTotal: 240_000,
          lineCost: 150_000,
        },
      },
      {
        id: 'line-2',
        update: {
          name: 'Доставка',
          quantity: 1,
          price: 40_000,
          cost: 20_000,
          lineTotal: 40_000,
          lineCost: 20_000,
        },
      },
      {
        id: 'line-3',
        update: {
          name: 'Покраска',
          quantity: 7.68,
          price: 15_000,
          cost: 8_000,
          lineTotal: 115_200,
          lineCost: 61_440,
        },
      },
    ]);
    expect(plan.orderUpdate.total).toBe(768_000 + 240_000 + 40_000 + 115_200);
  });

  it('computes balance, deadline and late master pay', () => {
    const plan = planOrderRecalc(
      input({
        paymentsTotal: 1_000_000,
        order: {
          ...emptyOrder,
          productionStartDate: '2026-06-17',
          readyAt: '2026-06-27',
          masterBonus: 10_000,
        },
      }),
    );

    expect(plan.orderUpdate).toMatchObject({
      paid: 1_000_000,
      balance: -232_000,
      installationDeadline: '2026-06-24',
      daysLate: 3,
      masterPayCalculated: 67_584,
      masterPayTotal: 77_584,
    });
  });

  it('counts lateness to the ready date and stores the penalty', () => {
    const plan = planOrderRecalc(
      input({
        items: [],
        order: {
          ...emptyOrder,
          areaSquareMeters: 10,
          installationDeadline: '2026-09-20',
          readyAt: '2026-09-23',
        },
        master: paidPerSquareMeter(10_000, 4),
      }),
    );

    expect(plan.orderUpdate.daysLate).toBe(3);
    expect(plan.orderUpdate.masterPayCalculated).toBe(88_000);
    expect(plan.orderUpdate.masterPenalty).toBe(12_000);
  });

  it('pays the master by all his rules for the master work', () => {
    const master = paidPerSquareMeter(10_000, 0);
    const plan = planOrderRecalc(
      input({
        items: [],
        order: { ...emptyOrder, areaSquareMeters: 10 },
        master: {
          ...master,
          rules: [
            ...master.rules,
            {
              id: 'per-order',
              workerId: 'master',
              method: 'PER_ORDER',
              work: 'MASTER',
              amount: 50_000,
              percent: null,
            },
          ],
        },
      }),
    );

    expect(plan.orderUpdate).toMatchObject({
      masterPayCalculated: 150_000,
      masterPenalty: 0,
      masterPayTotal: 150_000,
    });
  });

  it('keeps the rates written on the accrual lines of an installed order', () => {
    const plan = planOrderRecalc(
      input({
        items: [],
        order: { ...emptyOrder, areaSquareMeters: 10 },
        master: {
          ...paidPerSquareMeter(10_000, 0),
          keptRates: [{ method: 'PER_SQUARE_METER', rate: 8_000 }],
        },
      }),
    );

    expect(plan.orderUpdate.masterPayCalculated).toBe(80_000);
  });

  it('settles the pay of a master whose rule has no amount', () => {
    const master: MasterSnapshot = {
      penaltyPercentPerDay: 4,
      rules: [{ ...paidPerSquareMeter(0, 4).rules[0], amount: null }],
      keptRates: [],
    };
    const order = { ...emptyOrder, areaSquareMeters: 10 };
    const first = planOrderRecalc(input({ items: [], order, master }));

    expect(first.orderUpdate).toMatchObject({
      masterPayCalculated: 0,
      masterPenalty: 0,
      masterPayTotal: 0,
    });
    expect(
      planOrderRecalc(
        input({ items: [], order: { ...order, ...first.orderUpdate }, master }),
      ).orderUpdate,
    ).toEqual({});
  });

  it('has no penalty without a master', () => {
    const plan = planOrderRecalc(
      input({
        items: [],
        order: { ...emptyOrder, areaSquareMeters: 10 },
        master: null,
      }),
    );

    expect(plan.orderUpdate.masterPenalty ?? null).toBeNull();
  });

  it('marks an open order past its deadline as overdue', () => {
    const plan = planOrderRecalc({
      ...input(),
      order: { ...emptyOrder, installationDeadline: '2026-09-28' },
      today: '2026-10-01',
    });

    expect(plan.orderUpdate.deadlineState).toBe('OVERDUE');
  });

  it('keeps imported totals when the order has no lines', () => {
    const plan = planOrderRecalc(
      input({
        items: [],
        paymentsTotal: 500_000,
        order: {
          ...emptyOrder,
          areaSquareMeters: 12.5,
          total: 4_000_000,
          costTotal: 2_500_000,
        },
      }),
    );

    expect(plan.orderUpdate).toEqual({
      subtotal: 4_000_000,
      discount: 0,
      paid: 500_000,
      balance: 3_500_000,
      margin: 1_500_000,
      marginPercent: 37.5,
      masterPayCalculated: 125_000,
      masterPenalty: 0,
      masterPayTotal: 125_000,
    });
  });

  it('takes a percent discount off the sum and counts the margin from what is left', () => {
    const plan = planOrderRecalc(
      input({
        order: { ...emptyOrder, discountKind: 'PERCENT', discountValue: 5 },
      }),
    );

    expect(plan.orderUpdate).toMatchObject({
      subtotal: 768_000,
      discount: 38_400,
      total: 729_600,
      balance: 729_600,
      margin: 268_800,
      marginPercent: 36.84,
    });
  });

  it('takes a discount in сум', () => {
    const plan = planOrderRecalc(
      input({
        order: { ...emptyOrder, discountKind: 'AMOUNT', discountValue: 68_000 },
      }),
    );

    expect(plan.orderUpdate).toMatchObject({
      subtotal: 768_000,
      discount: 68_000,
      total: 700_000,
    });
  });

  it('never discounts more than the sum', () => {
    const plan = planOrderRecalc(
      input({
        order: {
          ...emptyOrder,
          discountKind: 'AMOUNT',
          discountValue: 900_000,
        },
      }),
    );

    expect(plan.orderUpdate).toMatchObject({
      discount: 768_000,
      total: 0,
      margin: -460_800,
    });
  });

  it('discounts the stored sum of an order without lines', () => {
    const plan = planOrderRecalc(
      input({
        items: [],
        order: {
          ...emptyOrder,
          areaSquareMeters: 12.5,
          total: 4_000_000,
          costTotal: 2_500_000,
          discountKind: 'PERCENT',
          discountValue: 10,
        },
      }),
    );

    expect(plan.orderUpdate).toMatchObject({
      subtotal: 4_000_000,
      discount: 400_000,
      total: 3_600_000,
      margin: 1_100_000,
    });
  });

  it('keeps the sum once it is stored, so a second run does not discount twice', () => {
    const order = {
      ...emptyOrder,
      subtotal: 4_000_000,
      discountKind: 'PERCENT' as const,
      discountValue: 10,
      discount: 400_000,
      total: 3_600_000,
    };

    expect(
      planOrderRecalc(input({ items: [], order, master: null })).orderUpdate,
    ).toEqual({ paid: 0, balance: 3_600_000 });
  });

  it('counts what is paid and what is left from the payments, after the discount', () => {
    const plan = planOrderRecalc(
      input({
        paymentsTotal: 500_000,
        order: { ...emptyOrder, discountKind: 'AMOUNT', discountValue: 68_000 },
      }),
    );

    expect(plan.orderUpdate).toMatchObject({
      total: 700_000,
      paid: 500_000,
      balance: 200_000,
    });
  });

  it('shows what is paid even while the total is unknown', () => {
    const plan = planOrderRecalc(
      input({ items: [], paymentsTotal: 100_000, master: null }),
    );

    expect(plan.orderUpdate).toEqual({ paid: 100_000 });
  });

  it('plans nothing when everything is already up to date', () => {
    const first = planOrderRecalc(input());
    const settledItem = { ...item(), ...first.itemUpdates[0].update };
    const settledOrder = { ...emptyOrder, ...first.orderUpdate };

    expect(
      planOrderRecalc(input({ items: [settledItem], order: settledOrder })),
    ).toEqual({
      orderUpdate: {},
      itemUpdates: [],
      extraServiceLineUpdates: [],
    });
  });

  it('waits for an order area before filling a per-m² service quantity', () => {
    const line = serviceLine({
      id: 'line-3',
      extraServiceId: 'painting',
      quantity: null,
    });
    const beforeItems = planOrderRecalc(
      input({ items: [], extraServiceLines: [line] }),
    );

    expect(
      beforeItems.extraServiceLineUpdates[0].update.quantity,
    ).toBeUndefined();
    expect(
      planOrderRecalc(input({ extraServiceLines: [line] }))
        .extraServiceLineUpdates[0].update.quantity,
    ).toBe(7.68);
  });
});
