import { type CoreApiClient } from 'twenty-client-sdk/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RESERVING_STATUSES } from 'src/warehouse/plan-order-materials';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';
import {
  resyncOrdersHoldingMaterial,
  STATUSES_HOLDING_MATERIAL,
} from 'src/warehouse/resync-orders-holding-material';
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

const syncedOrderIds = () =>
  vi.mocked(syncOrderMaterials).mock.calls.map(([, orderId]) => orderId);

describe('resyncOrdersHoldingMaterial', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ['only orders awaiting approval', RESERVING_STATUSES, ['PRICE_APPROVAL']],
    [
      'orders up to quality check',
      STATUSES_HOLDING_MATERIAL,
      ['PRICE_APPROVAL', 'PRODUCTION', 'QUALITY_CHECK'],
    ],
  ])('queries %s when given those statuses', async (_, statuses, expected) => {
    const { client, requests } = fakeClient(['order-1', 'order-2']);

    await resyncOrdersHoldingMaterial(client, statuses);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      orders: { __args: { filter: { status: { in: expected } } } },
    });
    expect(vi.mocked(syncOrderMaterials).mock.calls).toEqual([
      [client, 'order-1'],
      [client, 'order-2'],
    ]);
    expect(recalcWarehouse).toHaveBeenCalledTimes(1);
  });

  it('does not sync the orders it is told to skip', async () => {
    const { client } = fakeClient(['order-1', 'order-2', 'order-3']);

    await resyncOrdersHoldingMaterial(
      client,
      STATUSES_HOLDING_MATERIAL,
      new Set(['order-2']),
    );

    expect(syncedOrderIds()).toEqual(['order-1', 'order-3']);
  });

  it('keeps going and recalculates the warehouse when one order fails', async () => {
    const { client } = fakeClient(['order-1', 'order-2']);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(syncOrderMaterials).mockRejectedValueOnce(new Error('boom'));

    await resyncOrdersHoldingMaterial(client, STATUSES_HOLDING_MATERIAL);

    expect(syncedOrderIds()).toEqual(['order-1', 'order-2']);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(recalcWarehouse).toHaveBeenCalledTimes(1);
  });
});
