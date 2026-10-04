import { type CoreApiClient } from 'twenty-client-sdk/core';

import { WORKSHOP_STATUSES } from 'src/constants/order-status-sets';
import { nextStepOf, STEP_STATUS } from 'src/order-header/order-steps';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { type WorkshopOrder } from 'src/workshop/workshop-board';

// Twenty caps a page at 200 records.
const PAGE_SIZE = 200;

// The step the order card offers for an order in production, so the wall and
// the card cannot send an order to two different places.
const READY_STATUS =
  nextStepOf({
    status: STEP_STATUS.production,
    hasMaster: true,
    hasInstaller: true,
  })?.nextStatus ?? null;

// Only what the workshop role reads: no money, no phone, and the line's own
// name in place of the service it points at.
export const loadWorkshopOrders = async (
  client: CoreApiClient,
): Promise<WorkshopOrder[]> => {
  const orderNodes = await fetchAllPages(async (after) => {
    const { orders } = await client.query({
      orders: {
        __args: {
          first: PAGE_SIZE,
          after,
          filter: { status: { in: [...WORKSHOP_STATUSES] } },
        },
        edges: {
          node: {
            id: true,
            name: true,
            status: true,
            masterId: true,
            installationDeadline: true,
            master: { name: true },
            installer: { name: true },
          },
        },
        pageInfo: PAGE_INFO,
      },
    });

    return orders;
  });

  if (orderNodes.length === 0) return [];

  // One filter over every shown order: a workshop holds tens of orders, not
  // thousands. Split the ids into batches if that ever changes.
  const ofShownOrders = { orderId: { in: orderNodes.map((node) => node.id) } };
  const [itemNodes, serviceNodes] = await Promise.all([
    fetchAllPages(async (after) => {
      const { orderItems } = await client.query({
        orderItems: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: ofShownOrders,
            orderBy: [{ createdAt: 'AscNullsLast' }],
          },
          edges: {
            node: {
              id: true,
              orderId: true,
              name: true,
              quantity: true,
              design: { name: true },
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return orderItems;
    }),
    fetchAllPages(async (after) => {
      const { orderExtraServices } = await client.query({
        orderExtraServices: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: ofShownOrders,
            orderBy: [{ createdAt: 'AscNullsLast' }],
          },
          edges: { node: { id: true, orderId: true, name: true } },
          pageInfo: PAGE_INFO,
        },
      });

      return orderExtraServices;
    }),
  ]);

  const linesOf = (orderId: string): string[] =>
    [
      ...itemNodes
        .filter((item) => item.orderId === orderId)
        .map((item) => {
          const text = [item.design?.name, item.name].filter(Boolean).join(' ');

          return (item.quantity ?? 1) > 1
            ? `${text} · ${item.quantity} шт`
            : text;
        }),
      ...serviceNodes
        .filter((line) => line.orderId === orderId)
        .map((line) => line.name ?? ''),
    ].filter((text) => text !== '');

  return orderNodes.map((node) => ({
    id: node.id,
    name: node.name ?? '',
    status: node.status ?? null,
    masterId: node.masterId ?? null,
    masterName: node.master?.name ?? null,
    installerName: node.installer?.name ?? null,
    deadline: node.installationDeadline ?? null,
    lines: linesOf(node.id),
  }));
};

// The workshop role may write the status and nothing else, so nothing else is sent.
export const markReady = async (
  client: CoreApiClient,
  orderId: string,
): Promise<void> => {
  if (READY_STATUS === null) {
    throw new Error('An order in production has no next step');
  }

  await client.mutation({
    updateOrder: {
      __args: { id: orderId, data: { status: READY_STATUS } },
      id: true,
    },
  });
};
