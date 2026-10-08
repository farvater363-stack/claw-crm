import { type CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';

import {
  type ExpenseCategory,
  type MasterPaymentKind,
  type MoneyEntryKind,
  type PaymentMethod,
  type Wallet,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import {
  type ClientPaymentRecord,
  type MoneyEntryRecord,
  type PayoutRecord,
  type RecurringRecord,
  type WorkerRecord,
} from 'src/money/money-books';
import { type NewMoneyEntry, type RecurringEntry } from 'src/money/money-forms';
import {
  type AccrualRecord,
  type ReadyOrderRecord,
} from 'src/money/money-profit';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import { shiftMonth } from 'src/stock/stock-views';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { joinFullName } from 'src/utils/full-name';

export type MoneyBooks = {
  payments: ClientPaymentRecord[];
  payouts: PayoutRecord[];
  entries: MoneyEntryRecord[];
  workers: WorkerRecord[];
  recurring: RecurringRecord[];
  accruals: AccrualRecord[];
};

const PAGE_SIZE = 200;
const MONEY = { amountMicros: true } as const;

const toDate = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value).slice(0, 10);

const orderTitle = (order: {
  number?: number | null;
  name?: string | null;
  clientFullName?: { firstName?: string | null; lastName?: string | null } | null;
} | null): string | null => {
  if (!order) return null;

  const client = joinFullName(order.clientFullName);

  return order.number === null || order.number === undefined
    ? (order.name ?? client)
    : `№${order.number}${client === null ? '' : `, ${client}`}`;
};

export const loadMoneyBooks = async (
  client: CoreApiClient,
): Promise<MoneyBooks> => {
  const [
    paymentNodes,
    payoutNodes,
    entryNodes,
    workerNodes,
    recurringNodes,
    accrualNodes,
  ] = await Promise.all([
    fetchAllPages(async (after) => {
      const { orderPayments } = await client.query({
        orderPayments: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              paidOn: true,
              createdAt: true,
              amount: MONEY,
              method: true,
              receivedById: true,
              orderId: true,
              order: {
                number: true,
                name: true,
                clientFullName: { firstName: true, lastName: true },
              },
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return orderPayments;
    }),
    fetchAllPages(async (after) => {
      const { masterPayments } = await client.query({
        masterPayments: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              paidOn: true,
              createdAt: true,
              amount: MONEY,
              wallet: true,
              kind: true,
              masterId: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return masterPayments;
    }),
    fetchAllPages(async (after) => {
      const { moneyEntries } = await client.query({
        moneyEntries: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              date: true,
              createdAt: true,
              kind: true,
              amount: MONEY,
              wallet: true,
              name: true,
              comment: true,
              category: true,
              workerId: true,
              orderId: true,
              recurringExpenseId: true,
              countedAmount: MONEY,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return moneyEntries;
    }),
    fetchAllPages(async (after) => {
      const { masters } = await client.query({
        masters: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              name: true,
              fullName: { firstName: true, lastName: true },
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return masters;
    }),
    fetchAllPages(async (after) => {
      const { recurringExpenses } = await client.query({
        recurringExpenses: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              name: true,
              amount: MONEY,
              dayOfMonth: true,
              wallet: true,
              category: true,
              isActive: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return recurringExpenses;
    }),
    fetchAllPages(async (after) => {
      const { payAccruals } = await client.query({
        payAccruals: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: { orderId: true, earnedOn: true, amount: MONEY },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return payAccruals;
    }),
  ]);

  return {
    payments: paymentNodes.map((node) => ({
      id: node.id,
      date: toDate(node.paidOn),
      createdAt: String(node.createdAt),
      amount: fromCurrency(node.amount) ?? 0,
      method: (node.method ?? null) as PaymentMethod | null,
      receivedById: node.receivedById ?? null,
      orderId: node.orderId ?? null,
      orderTitle: orderTitle(node.order ?? null),
    })),
    payouts: payoutNodes.map((node) => ({
      id: node.id,
      date: toDate(node.paidOn),
      createdAt: String(node.createdAt),
      amount: fromCurrency(node.amount) ?? 0,
      wallet: (node.wallet ?? null) as Wallet | null,
      kind: (node.kind ?? null) as MasterPaymentKind | null,
      workerId: node.masterId ?? null,
    })),
    entries: entryNodes.map((node) => ({
      id: node.id,
      date: toDate(node.date),
      createdAt: String(node.createdAt),
      kind: (node.kind ?? null) as MoneyEntryKind | null,
      amount: fromCurrency(node.amount) ?? 0,
      wallet: (node.wallet ?? null) as Wallet | null,
      name: node.name || null,
      comment: node.comment || null,
      category: (node.category ?? null) as ExpenseCategory | null,
      workerId: node.workerId ?? null,
      orderId: node.orderId ?? null,
      recurringExpenseId: node.recurringExpenseId ?? null,
      countedAmount: fromCurrency(node.countedAmount),
    })),
    workers: workerNodes.map((node) => ({
      id: node.id,
      name: joinFullName(node.fullName) ?? (node.name || 'Без имени'),
    })),
    recurring: recurringNodes.map((node) => ({
      id: node.id,
      name: node.name || 'Без названия',
      amount: fromCurrency(node.amount),
      dayOfMonth: node.dayOfMonth ?? null,
      wallet: (node.wallet ?? null) as Wallet | null,
      category: (node.category ?? null) as ExpenseCategory | null,
      isActive: node.isActive !== false,
    })),
    accruals: accrualNodes.map((node) => ({
      orderId: node.orderId ?? null,
      earnedOn: toDate(node.earnedOn),
      amount: fromCurrency(node.amount) ?? 0,
    })),
  };
};

// The orders that reached «Готов» in the month: the revenue of its profit.
export const loadReadyOrders = async (
  client: CoreApiClient,
  month: string,
): Promise<ReadyOrderRecord[]> => {
  const nodes = await fetchAllPages(async (after) => {
    const { orders } = await client.query({
      orders: {
        __args: {
          first: PAGE_SIZE,
          after,
          filter: {
            and: [
              { readyAt: { gte: `${month}-01` } },
              { readyAt: { lt: `${shiftMonth(month, 1)}-01` } },
              { status: { neq: 'CANCELLED' } },
            ],
          },
        },
        edges: { node: { id: true, total: MONEY, costTotal: MONEY } },
        pageInfo: PAGE_INFO,
      },
    });

    return orders;
  });

  return nodes.map((node) => ({
    id: node.id,
    total: fromCurrency(node.total),
    costTotal: fromCurrency(node.costTotal),
  }));
};

export const createMoneyEntry = async (
  client: CoreApiClient,
  id: string,
  entry: NewMoneyEntry,
): Promise<void> => {
  const optional = {
    category: entry.category,
    comment: entry.comment,
    orderId: entry.orderId,
    workerId: entry.workerId,
    recurringExpenseId: entry.recurringExpenseId,
  };

  await client.mutation({
    createMoneyEntry: {
      __args: {
        data: {
          id,
          kind: entry.kind,
          name: entry.name,
          amount: toCurrency(entry.amount),
          wallet: entry.wallet,
          date: entry.date,
          ...Object.fromEntries(
            Object.entries(optional).filter(([, value]) => value !== null),
          ),
          ...(entry.countedAmount === null
            ? {}
            : { countedAmount: toCurrency(entry.countedAmount) }),
        },
        upsert: true,
      },
      id: true,
    },
  });
};

export const saveRecurringExpense = async (
  client: CoreApiClient,
  id: string,
  entry: RecurringEntry,
  isNew: boolean,
): Promise<void> => {
  const data = {
    name: entry.name,
    amount: toCurrency(entry.amount),
    dayOfMonth: entry.dayOfMonth,
    wallet: entry.wallet,
    category: entry.category,
  };

  if (isNew) {
    await client.mutation({
      createRecurringExpense: {
        __args: { data: { id, ...data, isActive: true }, upsert: true },
        id: true,
      },
    });

    return;
  }

  await client.mutation({
    updateRecurringExpense: { __args: { id, data }, id: true },
  });
};

export const stopRecurringExpense = async (
  client: CoreApiClient,
  id: string,
): Promise<void> => {
  await client.mutation({
    updateRecurringExpense: { __args: { id, data: { isActive: false } }, id: true },
  });
};

// uploadFile needs this workspace's id for moneyEntry.receiptPhotos, which
// differs from the universalIdentifier the app declares.
export const fetchReceiptPhotosFieldId = async (): Promise<string> => {
  const { objects } = await new MetadataApiClient().query({
    objects: {
      __args: {
        paging: { first: 1 },
        filter: { universalIdentifier: { eq: IDS.moneyEntry.object } },
      },
      edges: { node: { fieldsList: { id: true, universalIdentifier: true } } },
    },
  });
  const fieldMetadataId = objects.edges[0]?.node.fieldsList?.find(
    (field) => field.universalIdentifier === IDS.moneyEntry.receiptPhotos,
  )?.id;

  if (!fieldMetadataId) throw new Error('moneyEntry.receiptPhotos not found');

  return fieldMetadataId;
};

export const attachReceiptPhotos = async (
  client: CoreApiClient,
  entryId: string,
  photos: { fileId: string; label: string }[],
): Promise<void> => {
  await client.mutation({
    updateMoneyEntry: {
      __args: { id: entryId, data: { receiptPhotos: photos } },
      id: true,
    },
  });
};
