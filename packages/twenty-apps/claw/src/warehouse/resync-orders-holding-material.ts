import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type OrderStatus } from 'src/constants/select-options';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';
import { syncOrderMaterials } from 'src/warehouse/sync-order-materials';

const PAGE_SIZE = 200;

// The composition of a grille or service can change under a measured order,
// and a reserve or write-off left behind by a failed sync heals only on the next sync.
export const resyncOrdersHoldingMaterial = async (
  client: CoreApiClient,
  statuses: readonly OrderStatus[],
  orderIdsToSkip: ReadonlySet<string> = new Set(),
): Promise<void> => {
  const orders = await fetchAllPages(async (after) => {
    const { orders } = await client.query({
      orders: {
        __args: {
          filter: { status: { in: [...statuses] } },
          first: PAGE_SIZE,
          after,
        },
        edges: { node: { id: true } },
        pageInfo: PAGE_INFO,
      },
    });

    return orders;
  });

  // ponytail: one unpaced sync per order, at least 3 requests each, against the 500 requests/min budget; load the grilles and composition rows once per run if the orders covered grow past a hundred.
  for (const { id } of orders) {
    if (orderIdsToSkip.has(id)) continue;

    try {
      await syncOrderMaterials(client, id);
    } catch (error) {
      console.error(
        `resync-orders-holding-material: order ${id} failed`,
        error,
      );
    }
  }

  await recalcWarehouse(client);
};
