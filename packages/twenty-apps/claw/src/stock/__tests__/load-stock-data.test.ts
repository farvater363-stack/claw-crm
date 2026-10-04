import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import {
  createMaterial,
  createStockMovement,
  loadLatestMovements,
  loadStockData,
  updateMinimumStock,
} from 'src/stock/load-stock-data';

type Request = Record<string, { __args?: unknown; edges?: { node?: object } }>;

const page = (nodes: Record<string, unknown>[]) => ({
  edges: nodes.map((node) => ({ node })),
  pageInfo: { hasNextPage: false, endCursor: null },
});

const MATERIAL = {
  id: 'material-1',
  name: 'Профиль',
  unit: 'SQUARE_METER',
  minimumStock: 20,
  onHand: 37,
  reserved: 96,
  toBuy: 59,
  stockState: 'BUY',
  overrunPercent: 8,
};

const line = (overrides: Record<string, unknown>) => ({
  id: 'line',
  materialId: 'material-1',
  plannedQuantity: 4,
  writtenOffQuantity: null,
  order: { id: 'order-1', name: '№1001', status: 'MEASURED' },
  ...overrides,
});

const fakeClient = ({
  materials = [MATERIAL] as Record<string, unknown>[],
  lines = [] as Record<string, unknown>[],
  movements = [] as Record<string, unknown>[],
  priceError = null as Error | null,
} = {}) => {
  const queries: Request[] = [];
  const mutations: Record<string, unknown>[] = [];
  const client = {
    query: async (request: Request) => {
      queries.push(request);

      const node = request.materials?.edges?.node;

      if (node && 'lastPurchasePrice' in node && priceError) throw priceError;

      return {
        materials: page(materials),
        orderMaterials: page(lines),
        stockMovements: page(movements),
      };
    },
    mutation: async (request: Record<string, unknown>) => {
      mutations.push(request);

      return {};
    },
  } as unknown as CoreApiClient;

  return { client, queries, mutations };
};

describe('loadStockData', () => {
  it('maps a material and words its unit', async () => {
    const { client } = fakeClient();

    expect((await loadStockData(client)).materials).toEqual([
      {
        id: 'material-1',
        name: 'Профиль',
        unitLabel: 'м²',
        minimumStock: 20,
        onHand: 37,
        reserved: 96,
        toBuy: 59,
        stockState: 'BUY',
        overrunPercent: 8,
      },
    ]);
  });

  it('counts a line as a need only while it is not written off and its order is at the measured step', async () => {
    const { client, queries } = fakeClient({
      lines: [
        line({ id: 'needed' }),
        line({ id: 'written-off', writtenOffQuantity: 4 }),
        line({
          id: 'in-production',
          order: { id: 'order-2', name: '№1002', status: 'PRODUCTION' },
        }),
        line({ id: 'no-order', order: null }),
        line({ id: 'no-material', materialId: null }),
      ],
    });

    expect((await loadStockData(client)).needs).toEqual([
      {
        materialId: 'material-1',
        orderId: 'order-1',
        orderName: '№1001',
        quantity: 4,
      },
    ]);
    expect(
      queries.find((request) => request.orderMaterials)?.orderMaterials.__args,
    ).toMatchObject({ filter: { writtenOffQuantity: { is: 'NULL' } } });
  });

  it('shows the price field only to a role that may read purchase prices', async () => {
    expect((await loadStockData(fakeClient().client)).canSeePrice).toBe(true);
    expect(
      (
        await loadStockData(
          fakeClient({ priceError: new Error('Forbidden: no permission') })
            .client,
        )
      ).canSeePrice,
    ).toBe(false);
  });

  it('fails the load when the price check breaks for another reason', async () => {
    await expect(
      loadStockData(
        fakeClient({ priceError: new Error('Failed to fetch') }).client,
      ),
    ).rejects.toThrow('Failed to fetch');
  });

  it('does not ask about prices again when the answer is already known', async () => {
    const { client, queries } = fakeClient({
      priceError: new Error('Forbidden: no permission'),
    });

    expect((await loadStockData(client, true)).canSeePrice).toBe(true);
    expect(JSON.stringify(queries)).not.toContain('lastPurchasePrice');
  });
});

describe('loadLatestMovements', () => {
  it('asks for the five latest purchases, recounts and write-offs of one material', async () => {
    const { client, queries } = fakeClient();

    await loadLatestMovements(client, 'material-1');

    expect(queries[0].stockMovements.__args).toEqual({
      filter: {
        materialId: { eq: 'material-1' },
        kind: { in: ['RECEIPT', 'STOCKTAKE', 'WRITE_OFF'] },
      },
      orderBy: [{ date: 'DescNullsLast' }, { createdAt: 'DescNullsLast' }],
      first: 5,
    });
  });

  it('reads a recount as the counted amount and a write-off with its order', async () => {
    const { client } = fakeClient({
      movements: [
        {
          id: 'a',
          kind: 'STOCKTAKE',
          quantity: -2,
          countedQuantity: 55,
          date: '2026-10-03',
          order: null,
        },
        {
          id: 'b',
          kind: 'WRITE_OFF',
          quantity: -23,
          countedQuantity: null,
          date: null,
          createdAt: '2026-10-01T08:00:00.000Z',
          order: { name: '№1031' },
        },
      ],
    });

    expect(await loadLatestMovements(client, 'material-1')).toEqual([
      {
        id: 'a',
        kind: 'STOCKTAKE',
        quantity: 55,
        date: '2026-10-03',
        orderName: null,
      },
      {
        id: 'b',
        kind: 'WRITE_OFF',
        quantity: -23,
        date: '2026-10-01',
        orderName: '№1031',
      },
    ]);
  });
});

describe('stock writes', () => {
  it('records a purchase with its price', async () => {
    const { client, mutations } = fakeClient();

    await createStockMovement(client, 'attempt-1', {
      kind: 'RECEIPT',
      materialId: 'material-1',
      quantity: 60,
      unitPrice: 1000,
      date: '2026-10-04',
    });

    expect(mutations).toEqual([
      {
        createStockMovement: {
          __args: {
            data: {
              id: 'attempt-1',
              kind: 'RECEIPT',
              materialId: 'material-1',
              quantity: 60,
              unitPrice: { amountMicros: 1_000_000_000, currencyCode: 'UZS' },
              date: '2026-10-04',
            },
            upsert: true,
          },
          id: true,
        },
      },
    ]);
  });

  // A role that cannot see prices may not write one either, not even an empty one.
  it('sends no price with a purchase that has none', async () => {
    const { client, mutations } = fakeClient();

    await createStockMovement(client, 'attempt-1', {
      kind: 'RECEIPT',
      materialId: 'material-1',
      quantity: 60,
      unitPrice: null,
      date: '2026-10-04',
    });

    expect(mutations).toEqual([
      {
        createStockMovement: {
          __args: {
            data: {
              id: 'attempt-1',
              kind: 'RECEIPT',
              materialId: 'material-1',
              quantity: 60,
              date: '2026-10-04',
            },
            upsert: true,
          },
          id: true,
        },
      },
    ]);
  });

  it('records a recount as the counted amount', async () => {
    const { client, mutations } = fakeClient();

    await createStockMovement(client, 'attempt-1', {
      kind: 'STOCKTAKE',
      materialId: 'material-1',
      countedQuantity: 55,
      date: '2026-10-04',
    });

    expect(mutations).toEqual([
      {
        createStockMovement: {
          __args: {
            data: {
              id: 'attempt-1',
              kind: 'STOCKTAKE',
              materialId: 'material-1',
              countedQuantity: 55,
              date: '2026-10-04',
            },
            upsert: true,
          },
          id: true,
        },
      },
    ]);
  });

  it('saves the minimum stock of a material', async () => {
    const { client, mutations } = fakeClient();

    await updateMinimumStock(client, 'material-1', 20);

    expect(mutations).toEqual([
      {
        updateMaterial: {
          __args: { id: 'material-1', data: { minimumStock: 20 } },
          id: true,
        },
      },
    ]);
  });

  it('adds a material under the id of its attempt', async () => {
    const { client, mutations } = fakeClient();

    await createMaterial(client, 'attempt-1', {
      name: 'Прут',
      unit: 'METER',
      minimumStock: 5,
    });

    expect(mutations).toEqual([
      {
        createMaterial: {
          __args: {
            data: {
              id: 'attempt-1',
              name: 'Прут',
              unit: 'METER',
              minimumStock: 5,
            },
            upsert: true,
          },
          id: true,
        },
      },
    ]);
  });
});
