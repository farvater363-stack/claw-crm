import { describe, expect, it } from 'vitest';

import {
  type ExtraServiceLineSnapshot,
  type ItemSnapshot,
  type OrderSnapshot,
  planOrderRecalc,
  type RecalcInput,
} from 'src/pricing/plan-order-recalc';

const emptyOrder: OrderSnapshot = {
  areaSquareMeters: null,
  total: null,
  prepayment: null,
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
  designId: 'design-1',
  metal: 'ROD',
  metalSize: 'SIZE_10',
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
  priceList: [
    {
      designId: null,
      metal: 'ROD',
      metalSize: null,
      pricePerSquareMeter: 180_000,
      costPerSquareMeter: 90_000,
    },
  ],
  master: { ratePerSquareMeter: 10_000, penaltyPercentPerDay: 4 },
  today: '2026-10-01',
  refreshPriceItemIds: [],
  refreshPriceExtraServiceLineIds: [],
  ...overrides,
});

describe('planOrderRecalc', () => {
  it('prices an item from the price list and totals the order', () => {
    const plan = planOrderRecalc(input());

    expect(plan.itemUpdates).toEqual([
      {
        id: 'item-1',
        update: {
          name: '140×150×30',
          areaSquareMeters: 3.84,
          pricePerSquareMeter: 180_000,
          costPerSquareMeter: 90_000,
          lineTotal: 1_382_400,
          lineCost: 691_200,
        },
      },
    ]);
    expect(plan.orderUpdate).toMatchObject({
      areaSquareMeters: 7.68,
      total: 1_382_400,
      costTotal: 691_200,
      balance: 1_382_400,
      margin: 691_200,
      marginPercent: 50,
      masterPayCalculated: 76_800,
      masterPayTotal: 76_800,
    });
  });

  it('keeps a manually typed price until design, metal or size changes', () => {
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
    ).toBe(180_000);
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
    expect(plan.orderUpdate.total).toBe(1_382_400 + 240_000 + 40_000 + 115_200);
  });

  it('computes balance, deadline and late master pay', () => {
    const plan = planOrderRecalc(
      input({
        order: {
          ...emptyOrder,
          prepayment: 1_000_000,
          productionStartDate: '2026-06-17',
          readyAt: '2026-06-27',
          masterBonus: 10_000,
        },
      }),
    );

    expect(plan.orderUpdate).toMatchObject({
      balance: 382_400,
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
        master: { ratePerSquareMeter: 10_000, penaltyPercentPerDay: 4 },
      }),
    );

    expect(plan.orderUpdate.daysLate).toBe(3);
    expect(plan.orderUpdate.masterPayCalculated).toBe(88_000);
    expect(plan.orderUpdate.masterPenalty).toBe(12_000);
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
        order: {
          ...emptyOrder,
          areaSquareMeters: 12.5,
          total: 4_000_000,
          costTotal: 2_500_000,
          prepayment: 500_000,
        },
      }),
    );

    expect(plan.orderUpdate).toEqual({
      balance: 3_500_000,
      margin: 1_500_000,
      marginPercent: 37.5,
      masterPayCalculated: 125_000,
      masterPenalty: 0,
      masterPayTotal: 125_000,
    });
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
