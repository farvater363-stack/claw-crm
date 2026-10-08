import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import {
  createMaterial,
  createStockMovement,
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

  it('does not ask about prices again once the role is known not to see them', async () => {
    const { client, queries } = fakeClient();

    expect((await loadStockData(client, false)).canSeePrice).toBe(false);
    expect(JSON.stringify(queries)).not.toContain('lastPurchasePrice');
  });

  it('reads the last and the average purchase price of each material', async () => {
    const { client } = fakeClient({
      materials: [
        {
          ...MATERIAL,
          lastPurchasePrice: { amountMicros: 9_000_000_000 },
          averagePrice: { amountMicros: 8_875_000_000 },
        },
      ],
    });

    expect((await loadStockData(client)).prices).toEqual({
      'material-1': { last: 9_000, average: 8_875 },
    });
  });
});

describe('stock writes', () => {
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
