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
  minimumStock: 0,
  onHand: null,
  reserved: null,
  toBuy: null,
  stockState: null,
  lastPurchasePrice: null,
  averagePrice: null,
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
  ...overrides,
});

const order = (overrides: Partial<WarehouseOrder> = {}): WarehouseOrder => ({
  id: 'order-1',
  status: 'MEASURED',
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

describe('stock rules', () => {
  it('asks to buy what orders need plus the minimum, less what is there', () => {
    expect(
      computeMaterialStock({ onHand: 10, reserved: 25, minimumStock: 5 }),
    ).toEqual({
      onHand: 10,
      reserved: 25,
      toBuy: 20,
      stockState: 'BUY',
    });
  });

  it('is LOW when orders are covered but the minimum is not', () => {
    expect(
      computeMaterialStock({ onHand: 30, reserved: 25, minimumStock: 10 }),
    ).toMatchObject({
      toBuy: 5,
      stockState: 'LOW',
    });
  });

  it('is OK when both are covered', () => {
    expect(
      computeMaterialStock({ onHand: 40, reserved: 25, minimumStock: 10 }),
    ).toMatchObject({
      toBuy: 0,
      stockState: 'OK',
    });
  });

  it('rounds to 2 decimals', () => {
    expect(
      computeMaterialStock({
        onHand: 0.1 + 0.2,
        reserved: 0,
        minimumStock: 0,
      }).onHand,
    ).toBe(0.3);
  });

  it('does not ask to buy over a float remainder when stock equals the reserve', () => {
    expect(
      computeMaterialStock({
        onHand: 0.3,
        reserved: 0.1 + 0.2,
        minimumStock: 0,
      }),
    ).toMatchObject({ toBuy: 0, stockState: 'OK' });
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
          id: 'write-off',
          kind: 'WRITE_OFF',
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
          toBuy: 0,
          stockState: 'OK',
        },
      },
    ]);
    expect(result.movementUpdates).toEqual([
      { id: 'receipt', update: { name: 'Купил · Профиль 20×20 · +100 м' } },
      {
        id: 'write-off',
        update: { name: 'Ушло на заказ · Профиль 20×20 · -2,5 м' },
      },
    ]);
  });

  it('returns nothing when every stored value is current', () => {
    const result = plan(
      [
        material({
          onHand: 100,
          reserved: 0,
          toBuy: 0,
          stockState: 'OK',
        }),
      ],
      [movement({ name: 'Купил · Профиль 20×20 · +100 м' })],
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
        name: 'Пересчёт · Профиль 20×20 · -7 м',
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
        name: 'Пересчёт · Профиль 20×20 · +30 м',
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
          id: 'write-off',
          kind: 'WRITE_OFF',
          unitPrice: 1,
          date: '2026-10-02',
        }),
      ],
    );

    expect(result.materialUpdates[0]?.update.lastPurchasePrice).toBe(10_000);
  });

  it('averages the purchase price over what is on the shelf', () => {
    const result = plan(
      [material()],
      [
        movement({ id: 'first', quantity: 100, unitPrice: 8_500, date: '2026-09-01' }),
        movement({
          id: 'used',
          kind: 'WRITE_OFF',
          quantity: -60,
          date: '2026-09-10',
        }),
        // 40 left at 8 500 and 120 bought at 9 000
        movement({ id: 'second', quantity: 120, unitPrice: 9_000, date: '2026-10-01' }),
      ],
    );

    expect(result.materialUpdates[0]?.update.averagePrice).toBe(8_875);
    expect(result.materialUpdates[0]?.update.lastPurchasePrice).toBe(9_000);
  });

  it('leaves the average alone on a receipt without a price', () => {
    const result = plan(
      [material()],
      [
        movement({ id: 'first', unitPrice: 8_500, date: '2026-09-01' }),
        movement({ id: 'second', unitPrice: null, date: '2026-10-01' }),
      ],
    );

    expect(result.materialUpdates[0]?.update.averagePrice).toBe(8_500);
  });

  it('uses reserved quantities for to-buy and state', () => {
    const result = plan(
      [material()],
      [movement({ quantity: 50 })],
      [],
      [orderLine({ plannedQuantity: 60 })],
      [order()],
    );

    expect(result.materialUpdates[0]?.update).toMatchObject({
      reserved: 60,
      toBuy: 10,
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
  it('reserves only unwritten lines', () => {
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
        }),
      ],
      [order()],
    );

    expect(result.materialUpdates[0]?.update.reserved).toBe(10);
  });

  it('reserves only lines of orders still at the measured step', () => {
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

  it('flags an order at the measured step whose material is short', () => {
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

  it('returns nothing for a settled order at the measured step', () => {
    const result = plan(
      [
        material({
          onHand: 100,
          reserved: 60,
          toBuy: 0,
          stockState: 'OK',
        }),
      ],
      [movement({ name: 'Купил · Профиль 20×20 · +100 м' })],
      [],
      [orderLine()],
      [order({ materialState: 'ENOUGH' })],
    );

    expect(result.orderUpdates).toEqual([]);
  });

  it('clears the state once the order leaves the measured step', () => {
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

describe('overuse from recounts', () => {
  const profile = material({ id: 'profile' });
  const at = (
    date: string,
    kind: 'RECEIPT' | 'STOCKTAKE' | 'WRITE_OFF',
    values: object,
  ) =>
    movement({
      id: `${kind}-${date}`,
      materialId: 'profile',
      kind,
      date,
      createdAt: `${date}T08:00:00Z`,
      ...values,
    });

  it('is empty after the first recount only', () => {
    const result = plan(
      [profile],
      [at('2026-10-01', 'STOCKTAKE', { countedQuantity: 100 })],
    );

    expect(result.materialUpdates[0]?.update.overrunPercent ?? null).toBeNull();
  });

  it('is empty after the first recount even when orders took stock before it', () => {
    const result = plan(
      [material({ id: 'profile', overrunPercent: null })],
      [
        at('2026-09-29', 'RECEIPT', { quantity: 200 }),
        at('2026-09-30', 'WRITE_OFF', { quantity: -70 }),
        at('2026-10-01', 'STOCKTAKE', { countedQuantity: 100 }),
      ],
    );

    expect(result.materialUpdates[0]?.update.overrunPercent ?? null).toBeNull();
  });

  it('compares the shortage at the latest recount with what orders took since the previous one', () => {
    const result = plan(
      [profile],
      [
        at('2026-10-01', 'STOCKTAKE', { countedQuantity: 100 }),
        at('2026-10-02', 'WRITE_OFF', { quantity: -50 }),
        at('2026-10-03', 'STOCKTAKE', { countedQuantity: 46 }),
      ],
    );

    // Expected 50 left, found 46: 4 short on 50 written off.
    expect(result.materialUpdates[0].update.overrunPercent).toBe(8);
  });

  it('is empty when nothing was written off between recounts', () => {
    const result = plan(
      [profile],
      [
        at('2026-10-01', 'STOCKTAKE', { countedQuantity: 100 }),
        at('2026-10-03', 'STOCKTAKE', { countedQuantity: 90 }),
      ],
    );

    expect(result.materialUpdates[0]?.update.overrunPercent ?? null).toBeNull();
  });

  it('leaves out what was written off before the first recount', () => {
    const result = plan(
      [profile],
      [
        at('2026-09-29', 'RECEIPT', { quantity: 200 }),
        at('2026-09-30', 'WRITE_OFF', { quantity: -70 }),
        at('2026-10-01', 'STOCKTAKE', { countedQuantity: 100 }),
        at('2026-10-02', 'WRITE_OFF', { quantity: -50 }),
        at('2026-10-03', 'STOCKTAKE', { countedQuantity: 46 }),
      ],
    );

    expect(result.materialUpdates[0]?.update.overrunPercent).toBe(8);
  });

  it('follows the latest recount, so a later one with nothing written off clears it', () => {
    const result = plan(
      [material({ id: 'profile', overrunPercent: 8 })],
      [
        at('2026-10-01', 'STOCKTAKE', { countedQuantity: 100 }),
        at('2026-10-02', 'WRITE_OFF', { quantity: -50 }),
        at('2026-10-03', 'STOCKTAKE', { countedQuantity: 46 }),
        at('2026-10-05', 'STOCKTAKE', { countedQuantity: 46 }),
      ],
    );

    expect(result.materialUpdates[0]?.update.overrunPercent).toBeNull();
  });

  it('goes negative when the recount finds more than expected', () => {
    const result = plan(
      [profile],
      [
        at('2026-10-01', 'STOCKTAKE', { countedQuantity: 100 }),
        at('2026-10-02', 'WRITE_OFF', { quantity: -50 }),
        at('2026-10-03', 'STOCKTAKE', { countedQuantity: 54 }),
      ],
    );

    expect(result.materialUpdates[0]?.update.overrunPercent).toBe(-8);
  });

  it('counts a same-day write-off by entry time: before the recount it is in, after it waits for the next', () => {
    const overrunWithWriteOffEnteredAt = (createdAt: string) =>
      plan(
        [profile],
        [
          at('2026-10-01', 'STOCKTAKE', { countedQuantity: 100 }),
          at('2026-10-02', 'WRITE_OFF', { quantity: -40 }),
          at('2026-10-03', 'WRITE_OFF', { quantity: -10, createdAt }),
          at('2026-10-03', 'STOCKTAKE', { countedQuantity: 46 }),
        ],
      ).materialUpdates[0]?.update.overrunPercent;

    // Entered before the recount: 50 expected, 4 short on 50 written off.
    expect(overrunWithWriteOffEnteredAt('2026-10-03T07:00:00Z')).toBe(8);
    // Entered after it: 60 expected at the recount, 14 short on 40 written off.
    expect(overrunWithWriteOffEnteredAt('2026-10-03T09:00:00Z')).toBe(35);
  });
});
