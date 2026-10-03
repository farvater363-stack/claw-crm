import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import { orderMaterialLineId } from 'src/warehouse/plan-order-materials';
import { syncOrderMaterials } from 'src/warehouse/sync-order-materials';

const LINE_ID = orderMaterialLineId('order-1', 'material-1');

const fakeClient = (
  lines: Record<string, unknown>[],
  { status = 'PRICE_APPROVAL', missingNorms = null as string | null } = {},
) => {
  const mutations: Record<string, unknown>[] = [];
  let queryCount = 0;
  const page = (nodes: Record<string, unknown>[]) => ({
    edges: nodes.map((node) => ({ node })),
    pageInfo: { hasNextPage: false, endCursor: null },
  });
  const client = {
    query: async () => {
      queryCount += 1;

      return {
        orders: page([{ id: 'order-1', status, missingNorms }]),
        orderItems: page([
          {
            name: '100×100',
            designId: 'design-1',
            metal: 'ROD',
            metalSize: null,
            areaSquareMeters: 1,
            quantity: 2,
          },
        ]),
        orderExtraServices: page([]),
        orderMaterials: page(lines),
        stockMovements: page([]),
        priceListItems: page([
          {
            id: 'row-1',
            name: 'Тест',
            designId: 'design-1',
            metal: 'ROD',
            metalSize: null,
          },
        ]),
        materialNorms: page([
          {
            priceListItemId: 'row-1',
            extraServiceId: null,
            materialId: 'material-1',
            quantityPerUnit: 2,
          },
        ]),
      };
    },
    mutation: async (request: Record<string, unknown>) => {
      mutations.push(request);

      return {};
    },
  } as unknown as CoreApiClient;

  return { client, mutations, queryCount: () => queryCount };
};

describe('syncOrderMaterials', () => {
  it('upserts the reserved line under its deterministic id', async () => {
    const { client, mutations } = fakeClient([]);

    expect(await syncOrderMaterials(client, 'order-1')).toBe(true);
    expect(mutations).toEqual([
      {
        createOrderMaterial: {
          __args: {
            data: {
              id: LINE_ID,
              orderId: 'order-1',
              materialId: 'material-1',
              plannedQuantity: 4,
            },
            upsert: true,
          },
          id: true,
        },
      },
    ]);
  });

  it('writes nothing when the line already matches', async () => {
    const { client, mutations } = fakeClient([
      {
        id: LINE_ID,
        materialId: 'material-1',
        plannedQuantity: 4,
        writtenOffQuantity: null,
        actualQuantity: null,
      },
    ]);

    expect(await syncOrderMaterials(client, 'order-1')).toBe(false);
    expect(mutations).toEqual([]);
  });

  it('loads nothing more and writes nothing for a NEW order without lines', async () => {
    const { client, mutations, queryCount } = fakeClient([], {
      status: 'NEW',
    });

    expect(await syncOrderMaterials(client, 'order-1')).toBe(false);
    expect(queryCount()).toBe(1);
    expect(mutations).toEqual([]);
  });

  it('clears stale missing norms on a NEW order', async () => {
    const { client, mutations } = fakeClient([], {
      status: 'NEW',
      missingNorms: 'Нет нормы: x',
    });

    expect(await syncOrderMaterials(client, 'order-1')).toBe(true);
    expect(mutations).toEqual([
      {
        updateOrder: {
          __args: { id: 'order-1', data: { missingNorms: null } },
          id: true,
        },
      },
    ]);
  });

  it('writes off new lines only for an order entering production', async () => {
    const seenOnly = fakeClient([], { status: 'PRODUCTION' });
    const entering = fakeClient([], { status: 'PRODUCTION' });

    expect(await syncOrderMaterials(seenOnly.client, 'order-1')).toBe(false);
    expect(seenOnly.mutations).toEqual([]);

    expect(
      await syncOrderMaterials(entering.client, 'order-1', {
        entersWrittenOff: true,
      }),
    ).toBe(true);
    expect(entering.mutations.map((request) => Object.keys(request))).toEqual([
      ['createOrderMaterial'],
      ['createStockMovement'],
    ]);
  });
});
