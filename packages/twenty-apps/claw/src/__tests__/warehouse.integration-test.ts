import { CoreApiClient } from 'twenty-client-sdk/core';
import { afterAll, describe, expect, it } from 'vitest';

const client = new CoreApiClient();

type Destroyable = 'destroyStockMovement' | 'destroyMaterial';

const created: { mutation: Destroyable; id: string }[] = [];

const waitFor = async <TValue>(
  read: () => Promise<TValue>,
  isDone: (value: TValue) => boolean,
): Promise<TValue> => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const value = await read();

    if (isDone(value)) return value;

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error('Timed out waiting for the warehouse recalc');
};

const readMaterial = async (id: string) => {
  const { materials } = await client.query({
    materials: {
      __args: { filter: { id: { eq: id } }, first: 1 },
      edges: {
        node: {
          onHand: true,
          toBuy: true,
          stockState: true,
          lastPurchasePrice: { amountMicros: true },
        },
      },
    },
  });

  return materials?.edges[0]?.node;
};

const createMovement = async (data: Record<string, unknown>) => {
  const { createStockMovement } = await client.mutation({
    createStockMovement: { __args: { data }, id: true },
  });

  created.push({
    mutation: 'destroyStockMovement',
    id: createStockMovement?.id as string,
  });

  return createStockMovement?.id as string;
};

describe('warehouse recalculation', () => {
  // The suite runs against a real workspace, so it removes everything it made.
  afterAll(async () => {
    for (const { mutation, id } of [...created].reverse()) {
      await client.mutation({ [mutation]: { __args: { id }, id: true } });
    }
  });

  it('tracks receipts, stocktakes and the minimum', async () => {
    const { createMaterial } = await client.mutation({
      createMaterial: {
        __args: {
          data: {
            name: 'Профиль (тест)',
            unit: 'METER',
            safetyPercent: 10,
            minimumStock: 5,
          },
        },
        id: true,
      },
    });
    const materialId = createMaterial?.id as string;

    created.push({ mutation: 'destroyMaterial', id: materialId });

    // Let the creation recalc settle so the receipt starts from a known state.
    const afterCreate = await waitFor(
      () => readMaterial(materialId),
      (material) => material?.stockState === 'LOW',
    );

    expect(afterCreate?.toBuy).toBe(5);

    await createMovement({
      kind: 'RECEIPT',
      materialId,
      quantity: 10,
      date: '2026-10-01',
      unitPrice: { amountMicros: 1_000_000_000, currencyCode: 'UZS' },
    });

    const afterReceipt = await waitFor(
      () => readMaterial(materialId),
      (material) => material?.onHand === 10,
    );

    expect(afterReceipt?.stockState).toBe('OK');
    expect(Number(afterReceipt?.lastPurchasePrice?.amountMicros)).toBe(
      1_000_000_000,
    );

    const stocktakeId = await createMovement({
      kind: 'STOCKTAKE',
      materialId,
      countedQuantity: 7,
      date: '2026-10-02',
    });

    await waitFor(
      () => readMaterial(materialId),
      (material) => material?.onHand === 7,
    );

    const { stockMovements } = await client.query({
      stockMovements: {
        __args: { filter: { id: { eq: stocktakeId } }, first: 1 },
        edges: { node: { quantity: true } },
      },
    });

    expect(stockMovements?.edges[0]?.node?.quantity).toBe(-3);

    await client.mutation({
      updateMaterial: {
        __args: { id: materialId, data: { minimumStock: 8 } },
        id: true,
      },
    });

    const afterMinimum = await waitFor(
      () => readMaterial(materialId),
      (material) => material?.stockState === 'LOW',
    );

    expect(afterMinimum?.toBuy).toBe(1);
  });
});
