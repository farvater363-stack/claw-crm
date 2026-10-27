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
import { parseOptionalMoney } from 'src/prices/prices-screen';
import { todayInTashkent } from 'src/pricing/dates';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import { formatMoney } from 'src/ui/format';

// Twenty caps a page at 200 records; an order has a few payments, and the
// unanswered cancelled orders are a handful.
const PAGE_SIZE = 200;
const MONEY = { amountMicros: true } as const;
// A cleared sum keeps its currency, as an empty money field does.
const NO_MONEY = { amountMicros: null, currencyCode: 'UZS' } as const;

export type PaidPayment = { amount: number; method: PaymentMethod | null };

export type OrderRefund = { id: string; amount: number };

export type RefundAnswer = { amount: number | null; wallet: Wallet | null };

export type CancelledWithMoney = {
  id: string;
  name: string;
  paid: number;
  wallet: Wallet | null;
};

// The refund of the order's current cancel. A reopened order is given a new
// id, so a refund of an earlier cancel is never overwritten; before the
// first reopen it is the order's own id.
export const refundEntryIdOf = (order: {
  id: string;
  refundEntryId: string | null;
}): string => order.refundEntryId || order.id;

// What the client paid and has not had back. The refunds of earlier cancels
// count off; the one of the current cancel does not, since it is what the
// answer is about. Never below nothing: a refund left after its payments
// were removed does not make the client owe more than the price.
export const netPaid = (
  paymentsTotal: number,
  refunds: readonly OrderRefund[],
  currentRefundId: string,
): number =>
  Math.max(
    0,
    refunds
      .filter((refund) => refund.id !== currentRefundId)
      .reduce((left, refund) => left - refund.amount, paymentsTotal),
  );

// The wallet most of the money came into; one that left from another wallet
// is corrected in «Деньги».
export const largestWallet = (
  payments: readonly PaidPayment[],
): Wallet | null => {
  const byWallet = new Map<Wallet, number>();

  for (const payment of payments) {
    const wallet = PAYMENT_WALLET[payment.method ?? 'CASH'];

    byWallet.set(wallet, (byWallet.get(wallet) ?? 0) + payment.amount);
  }

  return (
    [...byWallet]
      .filter(([, amount]) => amount > 0)
      .sort((left, right) => right[1] - left[1])[0]?.[0] ?? null
  );
};

// What was answered, or else the whole sum still paid, from the wallet most
// of it came into. Never more than the client has paid.
export const refundOf = (
  payments: readonly PaidPayment[],
  refundedBefore: number,
  answer: RefundAnswer,
): { amount: number; wallet: Wallet } | null => {
  const paid =
    payments.reduce((sum, payment) => sum + payment.amount, 0) - refundedBefore;
  const amount = Math.min(answer.amount ?? paid, paid);
  const wallet = answer.wallet ?? largestWallet(payments);

  return amount > 0 && wallet !== null ? { amount, wallet } : null;
};

// The sum typed in a cancel form: more than nothing, no more than was paid.
export const parseRefundAmount = (
  typed: string,
  paid: number,
): { ok: true; amount: number } | { ok: false; error: string } => {
  const parsed = parseOptionalMoney(typed);

  if (!parsed.ok || parsed.value === null || parsed.value <= 0) {
    return { ok: false, error: 'Введите сумму больше нуля' };
  }

  return parsed.value > paid
    ? {
        ok: false,
        error: `Не больше, чем заплатил клиент: ${formatMoney(paid)}`,
      }
    : { ok: true, amount: parsed.value };
};

const toPaidPayments = (
  edges: readonly {
    node: {
      amount?: { amountMicros?: number | string | null } | null;
      method?: string | null;
    };
  }[],
): PaidPayment[] =>
  edges.map(({ node }) => ({
    amount: fromCurrency(node.amount ?? null) ?? 0,
    method: (node.method ?? null) as PaymentMethod | null,
  }));

const toRefunds = (
  edges: readonly {
    node: {
      id: string;
      amount?: { amountMicros?: number | string | null } | null;
    };
  }[],
): OrderRefund[] =>
  edges.map(({ node }) => ({
    id: node.id,
    amount: fromCurrency(node.amount ?? null) ?? 0,
  }));

// Deleted payments and refunds are left out by the API.
export const loadOrderMoney = async (
  client: CoreApiClient,
  orderId: string,
): Promise<{ payments: PaidPayment[]; refunds: OrderRefund[] }> => {
  const { orderPayments, moneyEntries } = await client.query({
    orderPayments: {
      __args: { filter: { orderId: { eq: orderId } }, first: PAGE_SIZE },
      edges: { node: { amount: MONEY, method: true } },
    },
    moneyEntries: {
      __args: {
        filter: { orderId: { eq: orderId }, kind: { eq: 'REFUND' } },
        first: PAGE_SIZE,
      },
      edges: { node: { id: true, amount: MONEY } },
    },
  });

  return {
    payments: toPaidPayments(orderPayments?.edges ?? []),
    refunds: toRefunds(moneyEntries?.edges ?? []),
  };
};

export type RefundedOrder = {
  id: string;
  name: string;
  status: string | null;
  answer: string | null;
  refundAmount: number | null;
  refundWallet: Wallet | null;
  refundEntryId: string | null;
};

// One refund per cancel: a retry or a changed answer finds its record
// instead of adding another. Only a cancelled order answered «Вернули» has
// one; its sum follows the payments and the answer, its day stays.
export const followRefundAnswer = async (
  client: CoreApiClient,
  order: RefundedOrder,
): Promise<void> => {
  const refundId = refundEntryIdOf(order);
  const money =
    order.answer === 'REFUNDED' && isCancelled(order.status)
      ? await loadOrderMoney(client, order.id)
      : null;
  const refund =
    money === null
      ? null
      : refundOf(
          money.payments,
          money.refunds
            .filter(({ id }) => id !== refundId)
            .reduce((sum, { amount }) => sum + amount, 0),
          { amount: order.refundAmount, wallet: order.refundWallet },
        );

  if (refund === null) {
    await deleteMoneyEntries(client, [refundId]);

    return;
  }

  // An upsert does not reach a record in the trash: an answer changed back
  // to «Вернули» brings the old one out first.
  await restoreMoneyEntries(client, [refundId]);

  const { moneyEntries } = await client.query({
    moneyEntries: {
      __args: { filter: { id: { eq: refundId } }, first: 1 },
      edges: { node: { date: true } },
    },
  });

  await createMoneyEntry(client, refundId, {
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

const REFUNDED_ORDER_FIELDS = {
  name: true,
  status: true,
  paidMoneyOnCancel: true,
  refundAmount: MONEY,
  refundWallet: true,
  refundEntryId: true,
} as const;

// A payment changed on an order whose money went back moves the refund with it.
export const followPaymentsOfRefundedOrder = async (
  client: CoreApiClient,
  orderId: string,
): Promise<void> => {
  const { orders } = await client.query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: { node: REFUNDED_ORDER_FIELDS },
    },
  });
  const order = orders?.edges[0]?.node;

  if (order?.paidMoneyOnCancel !== 'REFUNDED') return;

  await followRefundAnswer(client, {
    id: orderId,
    name: order.name ?? '',
    status: order.status ?? null,
    answer: order.paidMoneyOnCancel,
    refundAmount: fromCurrency(order.refundAmount ?? null),
    refundWallet: (order.refundWallet ?? null) as Wallet | null,
    refundEntryId: order.refundEntryId ?? null,
  });
};

// An order removed together with its payments takes its refunds along, and
// a restored one brings back those that left with it.
export const deleteRefundsOfOrder = async (
  client: CoreApiClient,
  orderId: string,
): Promise<void> => {
  await client.mutation({
    deleteMoneyEntries: {
      __args: { filter: { orderId: { eq: orderId }, kind: { eq: 'REFUND' } } },
      id: true,
    },
  });
};

export const restoreRefundsOfOrder = async (
  client: CoreApiClient,
  orderId: string,
  orderDeletedAt: string | null | undefined,
): Promise<void> => {
  if (!orderDeletedAt) return;

  await client.mutation({
    restoreMoneyEntries: {
      __args: {
        filter: {
          orderId: { eq: orderId },
          kind: { eq: 'REFUND' },
          deletedAt: { gte: orderDeletedAt },
        },
      },
      id: true,
    },
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
  const unanswered = (orders?.edges ?? []).flatMap(({ node }) => {
    const paid = fromCurrency(node.paid) ?? 0;

    return paid > 0 ? [{ id: node.id, name: node.name ?? '', paid }] : [];
  });

  if (unanswered.length === 0) return [];

  // For the wallet the refund form offers first.
  const { orderPayments } = await client.query({
    orderPayments: {
      __args: {
        filter: { orderId: { in: unanswered.map(({ id }) => id) } },
        first: PAGE_SIZE,
      },
      edges: { node: { orderId: true, amount: MONEY, method: true } },
    },
  });
  const edges = orderPayments?.edges ?? [];

  return unanswered.map((order) => ({
    ...order,
    wallet: largestWallet(
      toPaidPayments(edges.filter(({ node }) => node.orderId === order.id)),
    ),
  }));
};

// «Вернули» carries what went back and from where; «Остаются» clears them.
export const paidMoneyAnswerData = (
  answer: PaidMoneyOnCancel,
  refund: { amount: number; wallet: Wallet } | null,
) => ({
  paidMoneyOnCancel: answer,
  refundAmount:
    answer === 'REFUNDED' && refund !== null
      ? toCurrency(refund.amount)
      : NO_MONEY,
  refundWallet: answer === 'REFUNDED' && refund !== null ? refund.wallet : null,
});

export const answerPaidMoney = async (
  client: CoreApiClient,
  orderId: string,
  answer: PaidMoneyOnCancel,
  refund: { amount: number; wallet: Wallet } | null,
): Promise<void> => {
  await client.mutation({
    updateOrder: {
      __args: { id: orderId, data: paidMoneyAnswerData(answer, refund) },
      id: true,
    },
  });
};
