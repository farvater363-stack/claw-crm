import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { OPEN_STATUSES } from 'src/pricing/compute-deadline-state';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';
import {
  resyncOrdersHoldingMaterial,
  STATUSES_HOLDING_MATERIAL,
} from 'src/warehouse/resync-orders-holding-material';

const PAGE_SIZE = 500;

// The state depends on today's date, so it goes stale overnight without any edit.
// ponytail: one full recalc per open order, capped at PAGE_SIZE open orders; batch the update and paginate if open orders grow to hundreds.
const handler = async (): Promise<void> => {
  const client = createRecalcClient();
  const { orders } = await client.query({
    orders: {
      __args: {
        filter: {
          installationDeadline: { is: 'NOT_NULL' },
          status: { in: OPEN_STATUSES },
        },
        first: PAGE_SIZE,
      },
      edges: { node: { id: true } },
    },
  });

  // A recalc syncs the order's materials, so the resync below need not repeat it.
  const syncedOrderIds = new Set<string>();

  for (const { node } of orders?.edges ?? []) {
    // One broken order must not leave the rest of the board with yesterday's states.
    try {
      await recalcOrder(client, node.id);
      syncedOrderIds.add(node.id);
    } catch (error) {
      console.error(`refresh-deadline-states: order ${node.id} failed`, error);
    }
  }

  try {
    await resyncOrdersHoldingMaterial(
      client,
      STATUSES_HOLDING_MATERIAL,
      syncedOrderIds,
    );
  } catch (error) {
    console.error('refresh-deadline-states: warehouse resync failed', error);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.refreshDeadlineStates,
  name: 'refresh-deadline-states',
  description:
    'Recomputes deadline states of open orders and stock levels every night',
  timeoutSeconds: 300,
  // 19:05 UTC is 00:05 in Tashkent.
  cronTriggerSettings: { pattern: '5 19 * * *' },
  handler,
});
