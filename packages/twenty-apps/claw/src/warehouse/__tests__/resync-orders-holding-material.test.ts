import { type CoreApiClient } from 'twenty-client-sdk/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';
import { resyncOrdersHoldingMaterial } from 'src/warehouse/resync-orders-holding-material';
import { syncOrderMaterials } from 'src/warehouse/sync-order-materials';

vi.mock('src/warehouse/recalc-warehouse');
vi.mock('src/warehouse/sync-order-materials');

const fakeClient = (orderIds: string[]) => {
  const requests: Record<string, unknown>[] = [];
  const client = {
    query: async (request: Record<string, unknown>) => {
      requests.push(request);

      return {
        orders: {
          edges: orderIds.map((id) => ({ node: { id } })),
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    },
  } as unknown as CoreApiClient;

  return { client, requests };
};

describe('resyncOrdersHoldingMaterial', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('re-syncs orders at price approval, in production and at quality check', async () => {
    const { client, requests } = fakeClient(['order-1', 'order-2']);

    await resyncOrdersHoldingMaterial(client);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      orders: {
        __args: {
          filter: {
            status: { in: ['PRICE_APPROVAL', 'PRODUCTION', 'QUALITY_CHECK'] },
          },
        },
      },
    });
    expect(vi.mocked(syncOrderMaterials).mock.calls).toEqual([
      [client, 'order-1'],
      [client, 'order-2'],
    ]);
    expect(recalcWarehouse).toHaveBeenCalledTimes(1);
  });
});
