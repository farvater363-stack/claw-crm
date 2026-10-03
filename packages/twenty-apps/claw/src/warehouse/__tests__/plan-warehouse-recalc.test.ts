import { describe, expect, it } from 'vitest';

import {
  computeMaterialStock,
  formatQuantity,
  planWarehouseRecalc,
  type WarehouseMaterial,
  type WarehouseMovement,
  type WarehouseNorm,
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

const plan = (
  materials: WarehouseMaterial[],
  movements: WarehouseMovement[] = [],
  norms: WarehouseNorm[] = [],
  reservedByMaterialId: Record<string, number> = {},
) =>
  planWarehouseRecalc({ materials, norms, movements, reservedByMaterialId });

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
      { 'material-1': 60 },
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
});
