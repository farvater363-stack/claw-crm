import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  type CallBack,
  type ClientOrder,
  computeClientSummary,
} from 'src/clients/client-summary';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';

const PAGE_SIZE = 200;
const money = { amountMicros: true, currencyCode: true } as const;

type StoredClient = {
  clientStatus: string | null;
  ordersCount: number | null;
  totalSpent: number | null;
  owes: number | null;
  quoted: number | null;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  lastInstalledAt: string | null;
  refusalReason: string | null;
  source: string | null;
  district: string | null;
  addressLine: string | null;
};

type OrderContacts = {
  source: string | null;
  district: string | null;
  addressLine: string | null;
};

const toDate = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value).slice(0, 10);

const orEmpty = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

// Contacts typed on the client stay; empty ones take the newest order's.
export const contactsToFill = (
  client: OrderContacts,
  newestFirst: readonly OrderContacts[],
): Partial<OrderContacts> => {
  const fill: Partial<OrderContacts> = {};

  for (const key of ['source', 'district', 'addressLine'] as const) {
    if (client[key] !== null) continue;

    const value = newestFirst.find((order) => order[key] !== null)?.[key];

    if (value !== undefined && value !== null) fill[key] = value;
  }

  return fill;
};

export const clientChanges = (
  stored: StoredClient,
  orders: readonly (ClientOrder & OrderContacts)[],
): Record<string, unknown> => {
  const summary = computeClientSummary(orders);
  const changes: Record<string, unknown> = {};

  for (const key of [
    'clientStatus',
    'ordersCount',
    'firstOrderAt',
    'lastOrderAt',
    'lastInstalledAt',
    'refusalReason',
  ] as const) {
    if (summary[key] !== stored[key]) changes[key] = summary[key];
  }

  for (const key of ['totalSpent', 'owes', 'quoted'] as const) {
    if (summary[key] === stored[key]) continue;

    // A bare null leaves a money field as it was; only a null amount clears it.
    changes[key] = toCurrency(summary[key]) ?? {
      amountMicros: null,
      currencyCode: 'UZS',
    };
  }

  const newestFirst = [...orders].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  return { ...changes, ...contactsToFill(stored, newestFirst) };
};

export const recalcClient = async (
  client: CoreApiClient,
  personId: string,
): Promise<void> => {
  const { people } = await client.query({
    people: {
      __args: { filter: { id: { eq: personId } }, first: 1 },
      edges: {
        node: {
          id: true,
          clientStatus: true,
          ordersCount: true,
          totalSpent: money,
          owes: money,
          quoted: money,
          firstOrderAt: true,
          lastOrderAt: true,
          lastInstalledAt: true,
          refusalReason: true,
          source: true,
          district: true,
          addressLine: true,
        },
      },
    },
  });
  const person = people?.edges[0]?.node;

  if (!person) return;

  const orders = await fetchAllPages(async (after) => {
    const { orders: page } = await client.query({
      orders: {
        __args: {
          filter: { clientId: { eq: personId } },
          first: PAGE_SIZE,
          ...(after ? { after } : {}),
        },
        edges: {
          node: {
            status: true,
            total: money,
            balance: money,
            createdAt: true,
            installedAt: true,
            cancelReason: true,
            source: true,
            district: true,
            addressLine: true,
          },
        },
        pageInfo: PAGE_INFO,
      },
    });

    return page;
  });

  const changes = clientChanges(
    {
      clientStatus: person.clientStatus ?? null,
      ordersCount:
        person.ordersCount === null || person.ordersCount === undefined
          ? null
          : Number(person.ordersCount),
      totalSpent: fromCurrency(person.totalSpent),
      owes: fromCurrency(person.owes),
      quoted: fromCurrency(person.quoted),
      firstOrderAt: toDate(person.firstOrderAt),
      lastOrderAt: toDate(person.lastOrderAt),
      lastInstalledAt: toDate(person.lastInstalledAt),
      refusalReason: person.refusalReason ?? null,
      source: person.source ?? null,
      district: person.district ?? null,
      addressLine: orEmpty(person.addressLine),
    },
    orders.map((order) => ({
      status: order.status ?? null,
      total: fromCurrency(order.total),
      balance: fromCurrency(order.balance),
      createdAt: String(order.createdAt),
      installedAt: toDate(order.installedAt),
      cancelReason: order.cancelReason ?? null,
      source: order.source ?? null,
      district: order.district ?? null,
      addressLine: orEmpty(order.addressLine),
    })),
  );

  if (Object.keys(changes).length === 0) return;

  await client.mutation({
    updatePerson: { __args: { id: personId, data: changes }, id: true },
  });
};

export const loadCallBack = async (
  client: CoreApiClient,
  personId: string,
): Promise<CallBack | null> => {
  const { people } = await client.query({
    people: {
      __args: { filter: { id: { eq: personId } }, first: 1 },
      edges: { node: { callBackAt: true, callBackReason: true } },
    },
  });
  const person = people?.edges[0]?.node;

  if (!person) return null;

  return {
    at: toDate(person.callBackAt),
    reason: (person.callBackReason ?? null) as CallBack['reason'],
  };
};

export const saveCallBack = async (
  client: CoreApiClient,
  personId: string,
  callBack: CallBack,
): Promise<void> => {
  await client.mutation({
    updatePerson: {
      __args: {
        id: personId,
        data: { callBackAt: callBack.at, callBackReason: callBack.reason },
      },
      id: true,
    },
  });
};
