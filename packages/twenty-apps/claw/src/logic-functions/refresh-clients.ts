import { defineLogicFunction } from 'twenty-sdk/define';

import { recalcClient } from 'src/clients/recalc-client';
import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { linkClientByPhone } from 'src/recalc/link-client-by-phone';

// Each run stays well inside the app's 500 requests a minute; a backlog
// (orders from before clients were linked) is worked off over a few runs.
const BATCH_SIZE = 40;

const handler = async (): Promise<void> => {
  const client = createRecalcClient();

  const { orders } = await client.query({
    orders: {
      __args: {
        filter: {
          clientId: { is: 'NULL' },
          clientPhone: { is: 'NOT_NULL' },
        },
        first: BATCH_SIZE,
      },
      edges: { node: { id: true, clientName: true, clientPhone: true } },
    },
  });

  for (const { node } of orders?.edges ?? []) {
    try {
      const clientId = await linkClientByPhone(client, {
        clientName: node.clientName ?? null,
        clientPhone: node.clientPhone ?? null,
      });

      // The order's update trigger then recalculates that client.
      if (clientId !== null) {
        await client.mutation({
          updateOrder: {
            __args: { id: node.id, data: { clientId } },
            id: true,
          },
        });
      }
    } catch (error) {
      console.error(`refresh-clients: order ${node.id} failed`, error);
    }
  }

  // A client nobody has counted yet: created before this screen existed.
  // Those with orders go first; the rest only get a «Новый» status.
  const { orders: uncountedOrders } = await client.query({
    orders: {
      __args: {
        filter: { client: { clientStatus: { is: 'NULL' } } },
        first: BATCH_SIZE,
      },
      edges: { node: { clientId: true } },
    },
  });
  const { people } = await client.query({
    people: {
      __args: { filter: { clientStatus: { is: 'NULL' } }, first: BATCH_SIZE },
      edges: { node: { id: true } },
    },
  });
  const personIds = [
    ...new Set([
      ...(uncountedOrders?.edges ?? []).map(({ node }) => node.clientId),
      ...(people?.edges ?? []).map(({ node }) => node.id),
    ]),
  ]
    .filter((id): id is string => typeof id === 'string')
    .slice(0, BATCH_SIZE);

  for (const personId of personIds) {
    try {
      await recalcClient(client, personId);
    } catch (error) {
      console.error(`refresh-clients: client ${personId} failed`, error);
    }
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.refreshClients,
  name: 'refresh-clients',
  description:
    'Links orders without a client by phone and counts clients that were never counted',
  timeoutSeconds: 300,
  cronTriggerSettings: { pattern: '*/15 * * * *' },
  handler,
});
