import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type OrderStatus } from 'src/constants/select-options';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';
import { syncOrderMaterials } from 'src/warehouse/sync-order-materials';

const PAGE_SIZE = 200;

// Orders that hold reserved or freshly written-off material; READY and later are settled.
const STATUSES_HOLDING_MATERIAL: OrderStatus[] = [
  'PRICE_APPROVAL',
  'PRODUCTION',
  'QUALITY_CHECK',
];

// Norms and the price list can change under an order that is waiting for approval,
// and a reserve or write-off left behind by a failed sync heals only on the next sync.
export const resyncOrdersHoldingMaterial = async (
  client: CoreApiClient,
): Promise<void> => {
  const orders = await fetchAllPages(async (after) => {
    const { orders } = await client.query({
      orders: {
        __args: {
          filter: { status: { in: STATUSES_HOLDING_MATERIAL } },
          first: PAGE_SIZE,
          after,
        },
        edges: { node: { id: true } },
        pageInfo: PAGE_INFO,
      },
    });

    return orders;
  });

  for (const { id } of orders) {
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
