import { type CoreApiClient } from 'twenty-client-sdk/core';

import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { recalcWarehouse } from 'src/warehouse/recalc-warehouse';
import { syncOrderMaterials } from 'src/warehouse/sync-order-materials';

const PAGE_SIZE = 200;

// Norms and the price list can change under an order that is waiting for approval.
export const resyncReservingOrders = async (
  client: CoreApiClient,
): Promise<void> => {
  const orders = await fetchAllPages(async (after) => {
    const { orders } = await client.query({
      orders: {
        __args: {
          filter: { status: { eq: 'PRICE_APPROVAL' } },
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
      console.error(`resync-reserving-orders: order ${id} failed`, error);
    }
  }

  await recalcWarehouse(client);
};
