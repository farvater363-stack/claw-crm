import { type CoreApiClient } from 'twenty-client-sdk/core';
import { type MetadataApiClient } from 'twenty-client-sdk/metadata';

import { type CallInput } from 'src/clients/call-draft';
import { type HistoryOrder } from 'src/clients/client-history';
import { IDS } from 'src/constants/universal-identifiers';
import { formatUzbekNationalPhone } from 'src/measurer-form/measurer-form';
import { todayInTashkent } from 'src/pricing/dates';
import { fromCurrency } from 'src/recalc/money';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';

// Twenty caps a page at 200 records.
const PAGE_SIZE = 200;
const money = { amountMicros: true, currencyCode: true } as const;

const toDay = (value: unknown): string | null =>
  value === null || value === undefined || value === ''
    ? null
    : String(value).slice(0, 10);

// Created and measured are moments; the screens count calendar days in Tashkent.
const toTashkentDay = (value: unknown): string | null =>
  value === null || value === undefined || value === ''
    ? null
    : todayInTashkent(new Date(String(value)));

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';

  return trimmed === '' ? null : trimmed;
};

type Name = { firstName?: string | null; lastName?: string | null } | null;
type Phones = {
  primaryPhoneNumber?: string | null;
  primaryPhoneCallingCode?: string | null;
} | null;

export const personName = (name: Name | undefined): string =>
  [name?.firstName, name?.lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part !== '')
    .join(' ') || 'Без имени';

export const personPhone = (phones: Phones | undefined): string | null => {
  const number = textOrNull(phones?.primaryPhoneNumber);

  if (number === null) return null;

  const code = textOrNull(phones?.primaryPhoneCallingCode);

  const readable = formatUzbekNationalPhone(number);

  return code === null ? readable : `${code} ${readable}`;
};

export type ClientCard = {
  id: string;
  name: string;
  phone: string | null;
  clientStatus: string | null;
  ordersCount: number;
  totalSpent: number;
  owes: number;
  quoted: number | null;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  refusalReason: string | null;
  source: string | null;
  callBackAt: string | null;
  callBackReason: string | null;
  lastCallAt: string | null;
  lastCallNote: string | null;
};

const CLIENT_CARD_FIELDS = {
  id: true,
  name: { firstName: true, lastName: true },
  phones: { primaryPhoneNumber: true, primaryPhoneCallingCode: true },
  clientStatus: true,
  ordersCount: true,
  totalSpent: money,
  owes: money,
  quoted: money,
  firstOrderAt: true,
  lastOrderAt: true,
  refusalReason: true,
  source: true,
  callBackAt: true,
  callBackReason: true,
  lastCallAt: true,
  lastCallNote: true,
} as const;

type ClientCardNode = {
  id: string;
  name?: Name;
  phones?: Phones;
  clientStatus?: string | null;
  ordersCount?: number | null;
  totalSpent?: { amountMicros?: number | string | null } | null;
  owes?: { amountMicros?: number | string | null } | null;
  quoted?: { amountMicros?: number | string | null } | null;
  firstOrderAt?: string | null;
  lastOrderAt?: string | null;
  refusalReason?: string | null;
  source?: string | null;
  callBackAt?: string | null;
  callBackReason?: string | null;
  lastCallAt?: string | null;
  lastCallNote?: string | null;
};

const toClientCard = (node: ClientCardNode): ClientCard => ({
  id: node.id,
  name: personName(node.name),
  phone: personPhone(node.phones),
  clientStatus: node.clientStatus ?? null,
  ordersCount: Number(node.ordersCount ?? 0),
  totalSpent: fromCurrency(node.totalSpent) ?? 0,
  owes: fromCurrency(node.owes) ?? 0,
  quoted: fromCurrency(node.quoted),
  firstOrderAt: toDay(node.firstOrderAt),
  lastOrderAt: toDay(node.lastOrderAt),
  refusalReason: node.refusalReason ?? null,
  source: node.source ?? null,
  callBackAt: toDay(node.callBackAt),
  callBackReason: node.callBackReason ?? null,
  lastCallAt: toDay(node.lastCallAt),
  lastCallNote: textOrNull(node.lastCallNote),
});

export type ClientHistoryData = {
  client: ClientCard;
  orders: HistoryOrder[];
  referrals: { count: number; totalSpent: number };
};

export const loadClientHistory = async (
  client: CoreApiClient,
  personId: string,
): Promise<ClientHistoryData | null> => {
  const { people } = await client.query({
    people: {
      __args: { filter: { id: { eq: personId } }, first: 1 },
      edges: { node: CLIENT_CARD_FIELDS },
    },
  });
  const person = people?.edges[0]?.node;

  if (!person) return null;

  const [orderNodes, referralNodes] = await Promise.all([
    fetchAllPages(async (after) => {
      const { orders } = await client.query({
        orders: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: { clientId: { eq: personId } },
            orderBy: [{ createdAt: 'DescNullsLast' }],
          },
          edges: {
            node: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
              measuredAt: true,
              installedAt: true,
              total: money,
              paid: money,
              balance: money,
              cancelReason: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return orders;
    }),
    fetchAllPages(async (after) => {
      const { people: referrals } = await client.query({
        people: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: { referredById: { eq: personId } },
          },
          edges: { node: { id: true, totalSpent: money } },
          pageInfo: PAGE_INFO,
        },
      });

      return referrals;
    }),
  ]);

  const orderIds = orderNodes.map((node) => node.id);
  const [itemNodes, serviceNodes] =
    orderIds.length === 0
      ? [[], []]
      : await Promise.all([
          fetchAllPages(async (after) => {
            const { orderItems } = await client.query({
              orderItems: {
                __args: {
                  first: PAGE_SIZE,
                  after,
                  filter: { orderId: { in: orderIds } },
                },
                edges: {
                  node: {
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
                  filter: { orderId: { in: orderIds } },
                },
                edges: { node: { orderId: true, name: true, quantity: true } },
                pageInfo: PAGE_INFO,
              },
            });

            return orderExtraServices;
          }),
        ]);

  return {
    client: toClientCard(person),
    orders: orderNodes.map((node) => ({
      id: node.id,
      name: textOrNull(node.name) ?? 'Заказ',
      status: node.status ?? null,
      createdOn: toTashkentDay(node.createdAt) ?? '',
      measuredOn: toTashkentDay(node.measuredAt),
      installedOn: toDay(node.installedAt),
      total: fromCurrency(node.total),
      paid: fromCurrency(node.paid),
      balance: fromCurrency(node.balance),
      cancelReason: node.cancelReason ?? null,
      lines: [
        ...itemNodes
          .filter((item) => item.orderId === node.id)
          .map((item) => ({
            name: textOrNull(item.design?.name) ?? textOrNull(item.name) ?? '',
            quantity: Number(item.quantity ?? 1),
          })),
        ...serviceNodes
          .filter((line) => line.orderId === node.id)
          .map((line) => ({
            name: textOrNull(line.name) ?? '',
            quantity: Number(line.quantity ?? 1),
          })),
      ],
    })),
    referrals: {
      count: referralNodes.length,
      totalSpent: referralNodes.reduce(
        (sum, node) => sum + (fromCurrency(node.totalSpent) ?? 0),
        0,
      ),
    },
  };
};

// The clients the call list can hold: a call is due, or they have not decided.
export const loadCallBackClients = async (
  client: CoreApiClient,
): Promise<ClientCard[]> => {
  const nodes = await fetchAllPages(async (after) => {
    const { people } = await client.query({
      people: {
        __args: {
          first: PAGE_SIZE,
          after,
          filter: {
            or: [
              { callBackAt: { is: 'NOT_NULL' } },
              { clientStatus: { in: ['THINKING', 'REFUSED'] } },
            ],
          },
        },
        edges: { node: CLIENT_CARD_FIELDS },
        pageInfo: PAGE_INFO,
      },
    });

    return people;
  });

  return nodes.map(toClientCard);
};

export const recordCall = async (
  client: CoreApiClient,
  call: CallInput,
): Promise<void> => {
  await client.mutation({
    createClientCall: {
      __args: {
        data: {
          id: call.id,
          name: call.name,
          personId: call.personId,
          orderId: call.orderId,
          result: call.result,
          note: call.note,
          nextCallAt: call.nextCallAt,
        },
      },
      id: true,
    },
  });
};

export type MarketingOrder = {
  source: string | null;
  status: string | null;
  createdOn: string;
  measuredOn: string | null;
  total: number | null;
  cancelReason: string | null;
};

export type MarketingClient = {
  id: string;
  name: string;
  clientStatus: string | null;
  totalSpent: number;
  referredById: string | null;
};

export type MarketingData = {
  orders: MarketingOrder[];
  clients: MarketingClient[];
};

export const loadMarketing = async (
  client: CoreApiClient,
): Promise<MarketingData> => {
  const [orderNodes, clientNodes] = await Promise.all([
    fetchAllPages(async (after) => {
      const { orders } = await client.query({
        orders: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              source: true,
              status: true,
              createdAt: true,
              measuredAt: true,
              total: money,
              cancelReason: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return orders;
    }),
    fetchAllPages(async (after) => {
      const { people } = await client.query({
        people: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: { ordersCount: { gte: 1 } },
          },
          edges: {
            node: {
              id: true,
              name: { firstName: true, lastName: true },
              clientStatus: true,
              totalSpent: money,
              referredById: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return people;
    }),
  ]);

  return {
    orders: orderNodes.map((node) => ({
      source: node.source ?? null,
      status: node.status ?? null,
      createdOn: toTashkentDay(node.createdAt) ?? '',
      measuredOn: toTashkentDay(node.measuredAt),
      total: fromCurrency(node.total),
      cancelReason: node.cancelReason ?? null,
    })),
    clients: clientNodes.map((node) => ({
      id: node.id,
      name: personName(node.name),
      clientStatus: node.clientStatus ?? null,
      totalSpent: fromCurrency(node.totalSpent) ?? 0,
      referredById: node.referredById ?? null,
    })),
  };
};

export type ClientListIds = Partial<
  Record<'clients' | 'clientsOwe' | 'clientsCanMessage', string>
>;

// The lists open on Twenty's own table, where «Экспорт» makes the file.
export const findClientListIds = async (
  client: MetadataApiClient,
): Promise<ClientListIds> => {
  const { getViews } = await client.query({
    getViews: {
      __args: { viewTypes: ['TABLE'] },
      id: true,
      universalIdentifier: true,
    },
  });
  const idOf = (universalIdentifier: string) =>
    (getViews ?? []).find(
      (view) => view.universalIdentifier === universalIdentifier,
    )?.id;

  return {
    clients: idOf(IDS.view.clients),
    clientsOwe: idOf(IDS.view.clientsOwe),
    clientsCanMessage: idOf(IDS.view.clientsCanMessage),
  };
};
