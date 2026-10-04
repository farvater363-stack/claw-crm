import { describe, expect, it } from 'vitest';

import {
  computeMaterialStock,
  formatQuantity,
  planWarehouseRecalc,
  type WarehouseMaterial,
  type WarehouseMovement,
  type WarehouseNorm,
  type WarehouseOrder,
  type WarehouseOrderMaterial,
} from 'src/warehouse/plan-warehouse-recalc';

const material = (
  overrides: Partial<WarehouseMaterial> = {},
): WarehouseMaterial => ({
  id: 'material-1',
  name: 'Профиль 20×20',
  unit: 'METER',
  safetyPercent: 10,
  minimumStock: 0,
  onHand: null,
  reserved: null,
  available: null,
  toBuy: null,
  stockState: null,
  lastPurchasePrice: null,
  overrunPercent: null,
  ...overrides,
});

const movement = (
  overrides: Partial<WarehouseMovement> = {},
): WarehouseMovement => ({
  id: 'movement-1',
  name: null,
  kind: 'RECEIPT',
  materialId: 'material-1',
  quantity: 100,
  countedQuantity: null,
  unitPrice: null,
  date: '2026-10-01',
  createdAt: '2026-10-01T05:00:00.000Z',
  ...overrides,
});

const orderLine = (
  overrides: Partial<WarehouseOrderMaterial> = {},
): WarehouseOrderMaterial => ({
  id: 'line-1',
  name: 'Профиль 20×20 — 60 м',
  orderId: 'order-1',
  materialId: 'material-1',
  plannedQuantity: 60,
  writtenOffQuantity: null,
  actualQuantity: null,
  ...overrides,
});

const order = (overrides: Partial<WarehouseOrder> = {}): WarehouseOrder => ({
  id: 'order-1',
  status: 'PRICE_APPROVAL',
  materialState: null,
  materialNote: null,
  missingNorms: null,
  ...overrides,
});

const plan = (
  materials: WarehouseMaterial[],
  movements: WarehouseMovement[] = [],
  norms: WarehouseNorm[] = [],
  lines: WarehouseOrderMaterial[] = [],
  orders: WarehouseOrder[] = [],
) => planWarehouseRecalc({ materials, norms, movements, lines, orders });

describe('computeMaterialStock', () => {
  it('is OK when stock covers reserve, safety and minimum', () => {
    expect(
      computeMaterialStock({
        onHand: 200,
        reserved: 100,
        safetyPercent: 10,
        minimumStock: 50,
      }),
    ).toEqual({
      onHand: 200,
      reserved: 100,
      available: 100,
      toBuy: 0,
      stockState: 'OK',
    });
  });

  it('is LOW when orders are covered but safety or minimum are not', () => {
    expect(
      computeMaterialStock({
        onHand: 120,
        reserved: 100,
        safetyPercent: 10,
        minimumStock: 50,
      }),
    ).toMatchObject({ available: 20, toBuy: 40, stockState: 'LOW' });
  });

  it('is BUY when confirmed orders are not covered', () => {
    expect(
      computeMaterialStock({
        onHand: 80,
        reserved: 100,
        safetyPercent: 10,
        minimumStock: 0,
      }),
    ).toMatchObject({ available: -20, toBuy: 30, stockState: 'BUY' });
  });

  it('rounds to 2 decimals', () => {
    expect(
      computeMaterialStock({
        onHand: 0.1 + 0.2,
        reserved: 0,
        safetyPercent: 0,
        minimumStock: 0,
      }).onHand,
    ).toBe(0.3);
  });
});

describe('formatQuantity', () => {
  it('uses a decimal comma and at most 2 decimals', () => {
    expect(formatQuantity(5.5)).toBe('5,5');
    expect(formatQuantity(0.256)).toBe('0,26');
    expect(formatQuantity(-3)).toBe('-3');
  });
});

describe('planWarehouseRecalc', () => {
  it('sums movements into on-hand and names them', () => {
    const result = plan(
      [material()],
      [
        movement({ id: 'receipt', quantity: 100 }),
        movement({
          id: 'correction',
          kind: 'CORRECTION',
          quantity: -2.5,
          createdAt: '2026-10-01T06:00:00.000Z',
        }),
      ],
    );

    expect(result.materialUpdates).toEqual([
      {
        id: 'material-1',
        update: {
          onHand: 97.5,
          reserved: 0,
          available: 97.5,
          toBuy: 0,
          stockState: 'OK',
        },
      },
    ]);
    expect(result.movementUpdates).toEqual([
      { id: 'receipt', update: { name: 'Приход · Профиль 20×20 · +100 м' } },
      {
        id: 'correction',
        update: { name: 'Корректировка · Профиль 20×20 · -2,5 м' },
      },
    ]);
  });

  it('returns nothing when every stored value is current', () => {
    const result = plan(
      [
        material({
          onHand: 100,
          reserved: 0,
          available: 100,
          toBuy: 0,
          stockState: 'OK',
        }),
      ],
      [movement({ name: 'Приход · Профиль 20×20 · +100 м' })],
    );

    expect(result).toEqual({
      materialUpdates: [],
      normUpdates: [],
      movementUpdates: [],
      lineUpdates: [],
      orderUpdates: [],
    });
  });

  it('sets a stocktake quantity to the counted amount minus earlier movements', () => {
    const result = plan(
      [material()],
      [
        movement({ id: 'receipt', quantity: 100 }),
        movement({
          id: 'stocktake',
          kind: 'STOCKTAKE',
          quantity: null,
          countedQuantity: 93,
          date: '2026-10-05',
          createdAt: '2026-10-05T05:00:00.000Z',
        }),
      ],
    );

    expect(result.movementUpdates).toContainEqual({
      id: 'stocktake',
      update: {
        quantity: -7,
        name: 'Инвентаризация · Профиль 20×20 · -7 м',
      },
    });
    expect(result.materialUpdates[0]?.update.onHand).toBe(93);
  });

  it('absorbs a back-dated receipt entered after the stocktake', () => {
    const result = plan(
      [material()],
      [
        movement({
          id: 'stocktake',
          kind: 'STOCKTAKE',
          quantity: null,
          countedQuantity: 50,
          date: '2026-10-05',
          createdAt: '2026-10-05T05:00:00.000Z',
        }),
        movement({
          id: 'late-receipt',
          quantity: 20,
          date: '2026-10-03',
          createdAt: '2026-10-06T05:00:00.000Z',
        }),
      ],
    );

    expect(result.movementUpdates).toContainEqual({
      id: 'stocktake',
      update: {
        quantity: 30,
        name: 'Инвентаризация · Профиль 20×20 · +30 м',
      },
    });
    expect(result.materialUpdates[0]?.update.onHand).toBe(50);
  });

  it('fills an empty date from the creation time in Tashkent', () => {
    const result = plan(
      [material()],
      [movement({ date: null, createdAt: '2026-10-01T20:00:00.000Z' })],
    );

    expect(result.movementUpdates[0]?.update.date).toBe('2026-10-02');
  });

  it('keeps the price of the latest receipt', () => {
    const result = plan(
      [material()],
      [
        movement({ id: 'old', unitPrice: 9_000, date: '2026-09-01' }),
        movement({ id: 'new', unitPrice: 10_000, date: '2026-10-01' }),
        movement({
          id: 'correction',
          kind: 'CORRECTION',
          unitPrice: 1,
          date: '2026-10-02',
        }),
      ],
    );

    expect(result.materialUpdates[0]?.update.lastPurchasePrice).toBe(10_000);
  });

  it('uses reserved quantities for available, to-buy and state', () => {
    const result = plan(
      [material({ safetyPercent: 10 })],
      [movement({ quantity: 50 })],
      [],
      [orderLine({ plannedQuantity: 60 })],
      [order()],
    );

    expect(result.materialUpdates[0]?.update).toMatchObject({
      reserved: 60,
      available: -10,
      toBuy: 16,
      stockState: 'BUY',
    });
  });

  it('ignores movements without a known material', () => {
    const result = plan([material()], [movement({ materialId: null })]);

    expect(result.movementUpdates).toEqual([]);
    expect(result.materialUpdates[0]?.update.onHand).toBe(0);
  });

  it('names norms after their material and unit', () => {
    const result = plan(
      [material()],
      [],
      [
        {
          id: 'norm-1',
          name: null,
          materialId: 'material-1',
          quantityPerUnit: 5.5,
        },
        { id: 'norm-2', name: null, materialId: null, quantityPerUnit: 1 },
      ],
    );

    expect(result.normUpdates).toEqual([
      { id: 'norm-1', update: { name: 'Профиль 20×20 — 5,5 м' } },
      { id: 'norm-2', update: { name: '' } },
    ]);
  });

  it('restores a typed-over norm name and leaves a current one alone', () => {
    const result = plan(
      [material()],
      [],
      [
        {
          id: 'norm-1',
          name: 'Своё название',
          materialId: 'material-1',
          quantityPerUnit: 5.5,
        },
        {
          id: 'norm-2',
          name: 'Профиль 20×20 — 5,5 м',
          materialId: 'material-1',
          quantityPerUnit: 5.5,
        },
      ],
    );

    expect(result.normUpdates).toEqual([
      { id: 'norm-1', update: { name: 'Профиль 20×20 — 5,5 м' } },
    ]);
  });
});

describe('planWarehouseRecalc with orders', () => {
  it('reserves only unwritten lines and computes the overrun of booked actuals', () => {
    const result = plan(
      [material()],
      [movement({ quantity: 100 })],
      [],
      [
        orderLine({ id: 'reserved', plannedQuantity: 10 }),
        orderLine({
          id: 'done',
          plannedQuantity: 20,
          writtenOffQuantity: 20,
          actualQuantity: 22,
        }),
        orderLine({
          id: 'no-actual',
          plannedQuantity: 30,
          writtenOffQuantity: 30,
        }),
      ],
      [order()],
    );

    expect(result.materialUpdates[0]?.update).toMatchObject({
      reserved: 10,
      overrunPercent: 10,
    });
  });

  it('reserves only lines of orders still at price approval', () => {
    const reservedFor = (orders: WarehouseOrder[]) =>
      plan(
        [material()],
        [movement({ quantity: 100 })],
        [],
        [orderLine({ plannedQuantity: 10 })],
        orders,
      ).materialUpdates[0]?.update.reserved;

    expect(reservedFor([])).toBe(0);
    expect(reservedFor([order({ status: 'CANCELLED' })])).toBe(0);
    expect(reservedFor([order()])).toBe(10);
  });

  it('names lines after their material and planned quantity', () => {
    const result = plan(
      [material()],
      [],
      [],
      [orderLine({ name: null, plannedQuantity: 5.5 })],
    );

    expect(result.lineUpdates).toEqual([
      { id: 'line-1', update: { name: 'Профиль 20×20 — 5,5 м' } },
    ]);
  });

  it('flags an order at price approval whose material is short', () => {
    const result = plan(
      [material()],
      [movement({ quantity: 50 })],
      [],
      [orderLine()],
      [order({ missingNorms: 'Не указано, из чего делается: Волна' })],
    );

    expect(result.orderUpdates).toEqual([
      {
        id: 'order-1',
        update: {
          materialState: 'SHORTAGE',
          materialNote:
            'Не хватает: Профиль 20×20 — 10 м. Не указано, из чего делается: Волна',
        },
      },
    ]);
  });

  it('says ENOUGH when covered, NO_NORM when a norm is missing', () => {
    const covered = plan(
      [material()],
      [movement({ quantity: 100 })],
      [],
      [orderLine()],
      [order()],
    );
    const noNorm = plan(
      [material()],
      [],
      [],
      [],
      [order({ missingNorms: 'Не указано, из чего делается: Волна' })],
    );

    expect(covered.orderUpdates[0]?.update).toEqual({
      materialState: 'ENOUGH',
    });
    expect(noNorm.orderUpdates[0]?.update).toEqual({
      materialState: 'NO_NORM',
      materialNote: 'Не указано, из чего делается: Волна',
    });
  });

  it('returns nothing for a settled order at price approval', () => {
    const result = plan(
      [
        material({
          onHand: 100,
          reserved: 60,
          available: 40,
          toBuy: 0,
          stockState: 'OK',
        }),
      ],
      [movement({ name: 'Приход · Профиль 20×20 · +100 м' })],
      [],
      [orderLine()],
      [order({ materialState: 'ENOUGH' })],
    );

    expect(result.orderUpdates).toEqual([]);
  });

  it('clears the state once the order leaves price approval', () => {
    const result = plan(
      [material()],
      [],
      [],
      [],
      [
        order({
          status: 'PRODUCTION',
          materialState: 'SHORTAGE',
          materialNote: 'x',
        }),
      ],
    );

    expect(result.orderUpdates).toEqual([
      { id: 'order-1', update: { materialState: null, materialNote: null } },
    ]);
  });
});
