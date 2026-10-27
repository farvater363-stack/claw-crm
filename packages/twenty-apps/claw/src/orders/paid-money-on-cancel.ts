import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  type PaidMoneyOnCancel,
  type PaymentMethod,
  type Wallet,
} from 'src/constants/select-options';
import { isCancelled } from 'src/constants/order-status-sets';
import {
  createMoneyEntry,
  deleteMoneyEntries,
  restoreMoneyEntries,
} from 'src/money/load-money-books';
import { PAYMENT_WALLET } from 'src/money/money-books';
import { todayInTashkent } from 'src/pricing/dates';
import { fromCurrency } from 'src/recalc/money';

// Twenty caps a page at 200 records; an order has a few payments, and the
// unanswered cancelled orders are a handful.
const PAGE_SIZE = 200;
const MONEY = { amountMicros: true } as const;

export type PaidPayment = { amount: number; method: PaymentMethod | null };

export type CancelledWithMoney = { id: string; name: string; paid: number };

// The whole sum goes back, from the wallet most of it came into; one that
// left from another wallet is corrected in «Деньги».
export const refundOf = (
  payments: readonly PaidPayment[],
): { amount: number; wallet: Wallet } | null => {
  const byWallet = new Map<Wallet, number>();

  for (const payment of payments) {
    const wallet = PAYMENT_WALLET[payment.method ?? 'CASH'];

    byWallet.set(wallet, (byWallet.get(wallet) ?? 0) + payment.amount);
  }

  const amount = [...byWallet.values()].reduce((sum, part) => sum + part, 0);
  const largest = [...byWallet].sort((left, right) => right[1] - left[1])[0];

  return amount > 0 && largest !== undefined
    ? { amount, wallet: largest[0] }
    : null;
};

// One refund per order: its entry takes the order's id, so a retry or a
// changed answer finds that record instead of adding another. Only a cancelled
// order answered «Вернули» has one; its sum follows the payments, its day stays.
export const followRefundAnswer = async (
  client: CoreApiClient,
  order: {
    id: string;
    name: string;
    status: string | null;
    answer: string | null;
  },
): Promise<void> => {
  const { orderPayments } =
    order.answer === 'REFUNDED' && isCancelled(order.status)
      ? await client.query({
          orderPayments: {
            __args: { filter: { orderId: { eq: order.id } }, first: PAGE_SIZE },
            edges: { node: { amount: MONEY, method: true } },
          },
        })
      : { orderPayments: undefined };
  const refund =
    orderPayments === undefined
      ? null
      : refundOf(
          orderPayments.edges.map(({ node }) => ({
            amount: fromCurrency(node.amount) ?? 0,
            method: (node.method ?? null) as PaymentMethod | null,
          })),
        );

  if (refund === null) {
    await deleteMoneyEntries(client, [order.id]);

    return;
  }

  // An upsert does not reach a record in the trash: an answer changed back
  // to «Вернули» brings the old one out first.
  await restoreMoneyEntries(client, [order.id]);

  const { moneyEntries } = await client.query({
    moneyEntries: {
      __args: { filter: { id: { eq: order.id } }, first: 1 },
      edges: { node: { date: true } },
    },
  });

  await createMoneyEntry(client, order.id, {
    kind: 'REFUND',
    name: `Возврат клиенту · ${order.name}`,
    amount: refund.amount,
    wallet: refund.wallet,
    date: moneyEntries?.edges[0]?.node.date ?? todayInTashkent(),
    category: null,
    comment: null,
    orderId: order.id,
    workerId: null,
    recurringExpenseId: null,
    countedAmount: null,
    toWallet: null,
    recountId: null,
  });
};

// A payment changed on an order whose money went back moves the refund with it.
export const followPaymentsOfRefundedOrder = async (
  client: CoreApiClient,
  orderId: string,
): Promise<void> => {
  const { orders } = await client.query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: { node: { name: true, status: true, paidMoneyOnCancel: true } },
    },
  });
  const order = orders?.edges[0]?.node;

  if (order?.paidMoneyOnCancel !== 'REFUNDED') return;

  await followRefundAnswer(client, {
    id: orderId,
    name: order.name ?? '',
    status: order.status ?? null,
    answer: order.paidMoneyOnCancel,
  });
};

// An order the client paid for is cancelled, never deleted: its money stays
// counted until somebody says whether it went back.
export const cancelInsteadOfDelete = async (
  client: CoreApiClient,
  orderId: string,
  status: string | null,
): Promise<void> => {
  await client.mutation({
    restoreOrders: { __args: { filter: { id: { eq: orderId } } }, id: true },
  });

  if (status === 'CANCELLED') return;

  await client.mutation({
    updateOrder: {
      __args: { id: orderId, data: { status: 'CANCELLED' } },
      id: true,
    },
  });
};

export const loadCancelledWithMoney = async (
  client: CoreApiClient,
): Promise<CancelledWithMoney[]> => {
  const { orders } = await client.query({
    orders: {
      __args: {
        filter: {
          and: [
            { status: { eq: 'CANCELLED' } },
            { paidMoneyOnCancel: { is: 'NULL' } },
            { paid: { amountMicros: { gt: 0 } } },
          ],
        },
        orderBy: [{ updatedAt: 'DescNullsLast' }],
        first: PAGE_SIZE,
      },
      edges: { node: { id: true, name: true, paid: MONEY } },
    },
  });

  return (orders?.edges ?? []).flatMap(({ node }) => {
    const paid = fromCurrency(node.paid) ?? 0;

    return paid > 0 ? [{ id: node.id, name: node.name ?? '', paid }] : [];
  });
};

export const answerPaidMoney = async (
  client: CoreApiClient,
  orderId: string,
  answer: PaidMoneyOnCancel,
): Promise<void> => {
  await client.mutation({
    updateOrder: {
      __args: { id: orderId, data: { paidMoneyOnCancel: answer } },
      id: true,
    },
  });
};
