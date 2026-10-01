import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { recalcOrder } from 'src/recalc/recalc-order';

const PAGE_SIZE = 500;
const FINISHED_STATUSES = ['READY', 'INSTALLED', 'CLOSED', 'CANCELLED'];

// The state depends on today's date, so it goes stale overnight without any edit.
// ponytail: one full recalc per open order; fine for tens of orders, batch the update if it grows to thousands.
const handler = async (): Promise<void> => {
  const client = createRecalcClient();
  const { orders } = await client.query({
    orders: {
      __args: {
        filter: { installationDeadline: { is: 'NOT_NULL' } },
        first: PAGE_SIZE,
      },
      edges: { node: { id: true, status: true } },
    },
  });

  for (const { node } of orders?.edges ?? []) {
    if (FINISHED_STATUSES.includes(node.status ?? '')) continue;

    await recalcOrder(client, node.id);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.refreshDeadlineStates,
  name: 'refresh-deadline-states',
  description: 'Recomputes the deadline state of open orders every night',
  timeoutSeconds: 300,
  // 19:05 UTC is 00:05 in Tashkent.
  cronTriggerSettings: { pattern: '5 19 * * *' },
  handler,
});
