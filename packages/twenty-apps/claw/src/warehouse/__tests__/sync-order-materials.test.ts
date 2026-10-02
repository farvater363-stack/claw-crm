import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import { orderMaterialLineId } from 'src/warehouse/plan-order-materials';
import { syncOrderMaterials } from 'src/warehouse/sync-order-materials';

const LINE_ID = orderMaterialLineId('order-1', 'material-1');

const fakeClient = (lines: Record<string, unknown>[]) => {
  const mutations: Record<string, unknown>[] = [];
  const page = (nodes: Record<string, unknown>[]) => ({
    edges: nodes.map((node) => ({ node })),
    pageInfo: { hasNextPage: false, endCursor: null },
  });
  const client = {
    query: async () => ({
      orders: page([
        { id: 'order-1', status: 'PRICE_APPROVAL', missingNorms: null },
      ]),
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
    }),
    mutation: async (request: Record<string, unknown>) => {
      mutations.push(request);

      return {};
    },
  } as unknown as CoreApiClient;

  return { client, mutations };
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
              writtenOffQuantity: null,
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
});
