import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import {
  loadWorkshopOrders,
  markReady,
} from 'src/workshop/load-workshop-board';

type Request = Record<string, { __args?: unknown; edges?: { node?: unknown } }>;

const page = (nodes: Record<string, unknown>[]) => ({
  edges: nodes.map((node) => ({ node })),
  pageInfo: { hasNextPage: false, endCursor: null },
});

const ORDERS = [
  {
    id: 'order-1',
    name: '№1042',
    status: 'PRODUCTION',
    masterId: 'worker-1',
    master: { name: 'Мастер 1' },
    installer: null,
    installationDeadline: '2026-10-07',
  },
  {
    id: 'order-2',
    name: '№1035',
    status: 'QUALITY_CHECK',
    masterId: null,
    master: null,
    installer: { name: 'Работник 2' },
    installationDeadline: null,
  },
];

const ITEMS = [
  {
    id: 'item-1',
    orderId: 'order-1',
    name: '140×150×30',
    quantity: 1,
    design: { name: 'Решётка А' },
  },
  {
    id: 'item-2',
    orderId: 'order-1',
    name: '120×140',
    quantity: 2,
    design: { name: 'Решётка Б' },
  },
  {
    id: 'item-3',
    orderId: 'order-2',
    name: '100×100',
    quantity: null,
    design: null,
  },
];

const SERVICES = [
  { id: 'line-1', orderId: 'order-1', name: 'Козырёк пробный' },
];

const fakeClient = (
  orders: Record<string, unknown>[] = ORDERS,
  // What the filtered update matched: nothing when the order has moved on
  updatedOrders: { id: string }[] = [{ id: 'order-1' }],
) => {
  const queries: Request[] = [];
  const mutations: Request[] = [];
  const client = {
    query: async (request: Request) => {
      queries.push(request);

      return {
        orders: page(orders),
        orderItems: page(ITEMS),
        orderExtraServices: page(SERVICES),
      };
    },
    mutation: async (request: Request) => {
      mutations.push(request);

      return { updateOrders: updatedOrders };
    },
  } as unknown as CoreApiClient;

  return { client, queries, mutations };
};

describe('loadWorkshopOrders', () => {
  it('reads the orders of the two workshop steps with what to build, grilles first', async () => {
    const { client, queries } = fakeClient();

    expect(await loadWorkshopOrders(client)).toEqual([
      {
        id: 'order-1',
        name: '№1042',
        status: 'PRODUCTION',
        masterId: 'worker-1',
        masterName: 'Мастер 1',
        installerName: null,
        deadline: '2026-10-07',
        lines: [
          'Решётка А 140×150×30',
          'Решётка Б 120×140 · 2 шт',
          'Козырёк пробный',
        ],
      },
      {
        id: 'order-2',
        name: '№1035',
        status: 'QUALITY_CHECK',
        masterId: null,
        masterName: null,
        installerName: 'Работник 2',
        deadline: null,
        lines: ['100×100'],
      },
    ]);
    expect(
      queries.find((request) => request.orders)?.orders.__args,
    ).toMatchObject({
      filter: { status: { in: ['PRODUCTION', 'QUALITY_CHECK'] } },
    });
    expect(
      queries.find((request) => request.orderItems)?.orderItems.__args,
    ).toMatchObject({
      filter: { orderId: { in: ['order-1', 'order-2'] } },
    });
  });

  // A query that names a field the workshop role cannot read fails as a
  // whole, so the selection is pinned: no money, no cost, no client.
  it('names only what the workshop role reads', async () => {
    const { client, queries } = fakeClient();

    await loadWorkshopOrders(client);

    const selectionOf = (key: string) =>
      queries.find((request) => request[key])?.[key].edges?.node;

    expect(selectionOf('orders')).toEqual({
      id: true,
      name: true,
      status: true,
      masterId: true,
      installationDeadline: true,
      master: { name: true },
      installer: { name: true },
    });
    expect(selectionOf('orderItems')).toEqual({
      id: true,
      orderId: true,
      name: true,
      quantity: true,
      design: { name: true },
    });
    expect(selectionOf('orderExtraServices')).toEqual({
      id: true,
      orderId: true,
      name: true,
    });
  });

  it('asks for no lines when the workshop is empty', async () => {
    const { client, queries } = fakeClient([]);

    expect(await loadWorkshopOrders(client)).toEqual([]);
    expect(queries).toHaveLength(1);
  });
});

describe('markReady', () => {
  it('sends an order still in production to installation and writes nothing else', async () => {
    const { client, mutations } = fakeClient();

    expect(await markReady(client, 'order-1')).toBe('ready');
    expect(mutations).toEqual([
      {
        updateOrders: {
          __args: {
            filter: { id: { eq: 'order-1' }, status: { eq: 'PRODUCTION' } },
            data: { status: 'QUALITY_CHECK' },
          },
          id: true,
        },
      },
    ]);
  });

  // The server applies the status filter, so an order a manager has already
  // moved on or cancelled is matched by nothing and stays where it is.
  it('reports an order that has left production as moved', async () => {
    const { client, mutations } = fakeClient(ORDERS, []);

    expect(await markReady(client, 'order-1')).toBe('moved');
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.updateOrders?.__args).toMatchObject({
      filter: { status: { eq: 'PRODUCTION' } },
    });
  });
});
