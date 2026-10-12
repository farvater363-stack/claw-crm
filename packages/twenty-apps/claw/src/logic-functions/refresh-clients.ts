import { defineLogicFunction } from 'twenty-sdk/define';

import { recalcClient } from 'src/clients/recalc-client';
import { IDS } from 'src/constants/universal-identifiers';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { normalizeUzbekPhone } from 'src/pricing/normalize-uzbek-phone';
import { linkClientByPhone } from 'src/recalc/link-client-by-phone';
import { PAGE_INFO } from 'src/utils/fetch-all-pages';
import { type StoredFullName } from 'src/utils/full-name';

// Each run stays well inside the app's 500 requests a minute; a backlog
// (orders from before clients were linked) is worked off over a few runs.
const BATCH_SIZE = 40;
const PAGE_SIZE = 200;

type OrderToLink = {
  id: string;
  clientFullName: StoredFullName;
  clientPhone?: string | null;
};

const handler = async (): Promise<void> => {
  const client = createRecalcClient();

  const linkable: OrderToLink[] = [];
  let after: string | undefined;

  // A phone no client can be found by stays unlinked for good, so it is
  // stepped over instead of filling every batch.
  while (linkable.length < BATCH_SIZE) {
    const { orders } = await client.query({
      orders: {
        __args: {
          filter: {
            clientId: { is: 'NULL' },
            clientPhone: { is: 'NOT_NULL' },
          },
          orderBy: [{ createdAt: 'DescNullsLast' }],
          first: PAGE_SIZE,
          after,
        },
        edges: {
          node: {
            id: true,
            clientFullName: { firstName: true, lastName: true },
            clientPhone: true,
          },
        },
        pageInfo: PAGE_INFO,
      },
    });

    for (const { node } of orders?.edges ?? []) {
      if (
        linkable.length < BATCH_SIZE &&
        normalizeUzbekPhone(node.clientPhone ?? '') !== null
      ) {
        linkable.push(node);
      }
    }

    const endCursor = orders?.pageInfo?.endCursor;

    if (!orders?.pageInfo?.hasNextPage || !endCursor) break;

    after = endCursor;
  }

  for (const node of linkable) {
    try {
      const clientId = await linkClientByPhone(client, {
        clientFullName: node.clientFullName,
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
