import { isDefined } from 'twenty-shared/utils';

import {
  convertCurrencyAmountToCurrencyMicros,
  convertCurrencyMicrosToCurrencyAmount,
} from '~/utils/convertCurrencyToCurrencyMicros';
import { formatNumber } from '~/utils/format/formatNumber';

export type PaidMoneyOnCancel = 'REFUNDED' | 'KEPT';

export type OrderMoneyAction = 'cancel' | 'delete';

// The order's refundWallet options, as the Claw CRM app defines them
export type RefundWallet = 'CASH' | 'CARD' | 'ACCOUNT';

export const REFUND_WALLET_OPTIONS: { value: RefundWallet; label: string }[] = [
  { value: 'CASH', label: 'Наличные' },
  { value: 'CARD', label: 'Карта' },
  { value: 'ACCOUNT', label: 'Счёт' },
];

export type OrderRefund = {
  amountMicros: number;
  wallet: RefundWallet;
};

export type OrderMoneyAnswer =
  | { paidMoneyOnCancel: 'REFUNDED'; refund: OrderRefund | null }
  | { paidMoneyOnCancel: 'KEPT' }
  | { deleteWithPayments: true }
  | null;

export type OrderPaymentNode = {
  id?: string;
  orderId?: string | null;
  method?: string | null;
  amount?: { amountMicros?: number | string | null } | null;
};

type ObjectMetadataItemShape = {
  nameSingular: string;
  fields: { name: string }[];
};

export const ORDER_OBJECT_NAME_SINGULAR = 'order';
export const ORDER_PAYMENT_OBJECT_NAME_SINGULAR = 'orderPayment';
export const ORDER_CANCELLED_STATUS = 'CANCELLED';

// Only the Claw CRM app defines these; any other workspace with an «order»
// object keeps Twenty's behaviour.
export const isOrderMoneyWorkspace = (
  objectMetadataItems: ObjectMetadataItemShape[],
  objectNameSingular: string,
) =>
  objectNameSingular === ORDER_OBJECT_NAME_SINGULAR &&
  objectMetadataItems.some(
    (item) =>
      item.nameSingular === ORDER_OBJECT_NAME_SINGULAR &&
      item.fields.some((field) => field.name === 'paidMoneyOnCancel'),
  ) &&
  objectMetadataItems.some(
    (item) => item.nameSingular === ORDER_PAYMENT_OBJECT_NAME_SINGULAR,
  );

// The app adds these later than paidMoneyOnCancel; until it does, the dialog
// asks only what happened to the money.
export const hasOrderRefundFields = (
  objectMetadataItems: ObjectMetadataItemShape[],
) =>
  objectMetadataItems.some(
    (item) =>
      item.nameSingular === ORDER_OBJECT_NAME_SINGULAR &&
      ['refundAmount', 'refundWallet'].every((fieldName) =>
        item.fields.some((field) => field.name === fieldName),
      ),
  );

export const isOrderCancelWithoutMoneyAnswer = (
  objectNameSingular: string,
  recordInput: Record<string, unknown>,
) =>
  objectNameSingular === ORDER_OBJECT_NAME_SINGULAR &&
  recordInput.status === ORDER_CANCELLED_STATUS &&
  !('paidMoneyOnCancel' in recordInput);

export const getPaidAmountMicrosByOrderId = (payments: OrderPaymentNode[]) =>
  payments.reduce<Record<string, number>>((paidByOrderId, payment) => {
    if (!isDefined(payment.orderId)) {
      return paidByOrderId;
    }

    return {
      ...paidByOrderId,
      [payment.orderId]:
        (paidByOrderId[payment.orderId] ?? 0) +
        Number(payment.amount?.amountMicros ?? 0),
    };
  }, {});

export type OrderPaidNode = {
  id: string;
  paid?: { amountMicros?: number | string | null } | null;
};

// The order's own «Оплачено» already nets out refunds of an earlier cancel;
// the payments alone would offer that money back a second time.
export const withOrderPaid = (
  paidByOrderId: Record<string, number>,
  orders: OrderPaidNode[],
) =>
  orders.reduce<Record<string, number>>(
    (netPaidByOrderId, order) =>
      isDefined(order.paid?.amountMicros) &&
      isDefined(netPaidByOrderId[order.id])
        ? {
            ...netPaidByOrderId,
            [order.id]: Math.min(
              netPaidByOrderId[order.id],
              Number(order.paid.amountMicros),
            ),
          }
        : netPaidByOrderId,
    paidByOrderId,
  );

export const getPaidOrderIds = (
  orderIds: string[],
  paidByOrderId: Record<string, number>,
) => orderIds.filter((orderId) => (paidByOrderId[orderId] ?? 0) > 0);

export const sumPaidAmountMicros = (
  orderIds: string[],
  paidByOrderId: Record<string, number>,
) =>
  orderIds.reduce((total, orderId) => total + (paidByOrderId[orderId] ?? 0), 0);

// Mirrors PAYMENT_WALLET in the Claw CRM app's money books.
const getPaymentWallet = (method: string | null | undefined): RefundWallet => {
  switch (method ?? 'CASH') {
    case 'CASH':
      return 'CASH';
    case 'CARD':
      return 'CARD';
    default:
      return 'ACCOUNT';
  }
};

// The wallet most of the order's money came into
export const getDefaultRefundWallet = (
  payments: OrderPaymentNode[],
): RefundWallet => {
  const paidByWallet = payments.reduce<Partial<Record<RefundWallet, number>>>(
    (total, payment) => {
      const wallet = getPaymentWallet(payment.method);

      return {
        ...total,
        [wallet]:
          (total[wallet] ?? 0) + Number(payment.amount?.amountMicros ?? 0),
      };
    },
    {},
  );

  return REFUND_WALLET_OPTIONS.reduce<RefundWallet>(
    (largest, { value }) =>
      (paidByWallet[value] ?? 0) > (paidByWallet[largest] ?? 0)
        ? value
        : largest,
    'CASH',
  );
};

// Several orders at once are each refunded in full by the server, so the
// amount and wallet are asked only about a single order.
export const getRefundDefaults = ({
  hasRefundFields,
  paidRecordIds,
  paidAmountMicros,
  payments,
}: {
  hasRefundFields: boolean;
  paidRecordIds: string[];
  paidAmountMicros: number;
  payments: OrderPaymentNode[];
}) =>
  hasRefundFields && paidRecordIds.length === 1
    ? {
        paidAmountMicros,
        wallet: getDefaultRefundWallet(
          payments.filter(({ orderId }) => orderId === paidRecordIds[0]),
        ),
      }
    : null;

export const formatRefundAmountInput = (amountMicros: number) =>
  formatNumber(convertCurrencyMicrosToCurrencyAmount(amountMicros), {
    decimals: 2,
  });

// Reads what formatRefundAmountInput wrote or the user typed; null when it is
// not a positive amount within what the client paid.
export const parseRefundAmountMicros = (
  text: string,
  paidAmountMicros: number,
) => {
  const digits = text.replace(/[^\d.]/g, '');
  const amount = Number(digits);

  if (digits === '' || !Number.isFinite(amount)) {
    return null;
  }

  const amountMicros = convertCurrencyAmountToCurrencyMicros(amount);

  return amountMicros > 0 && amountMicros <= paidAmountMicros
    ? amountMicros
    : null;
};

export const formatOrderMoneyAmount = (amountMicros: number) =>
  `${formatNumber(convertCurrencyMicrosToCurrencyAmount(amountMicros))} сум`;

// Claw CRM's own wording, shown only in its Russian-speaking workspaces, so it
// is written in Russian rather than through the Lingui catalogs.
export const buildOrderMoneyQuestion = ({
  action,
  paidAmountMicros,
  paidOrderCount,
}: {
  action: OrderMoneyAction;
  paidAmountMicros: number;
  paidOrderCount: number;
}) => {
  const amount = formatOrderMoneyAmount(paidAmountMicros);

  if (action === 'cancel') {
    return {
      title: `Клиент заплатил ${amount}`,
      subtitle: 'Что с деньгами?',
      abortButtonText: 'Не отменять',
    };
  }

  return {
    title:
      paidOrderCount === 1
        ? `У заказа есть оплата ${amount}`
        : `У заказов есть оплата ${amount}`,
    subtitle:
      paidOrderCount === 1
        ? 'Если деньги вернули или они остаются у нас, заказ будет отменён, а не удалён. Создан по ошибке — удалите его вместе с оплатами.'
        : 'Если деньги вернули или они остаются у нас, заказы будут отменены, а не удалены. Созданы по ошибке — удалите их вместе с оплатами.',
    abortButtonText: 'Не удалять',
  };
};

export type OrderCancelFields = {
  paidMoneyOnCancel: PaidMoneyOnCancel;
  refundAmount?: { amountMicros: number; currencyCode: 'UZS' } | null;
  refundWallet?: RefundWallet | null;
};

// A refund without details (several orders at once) is sent as null, so the
// server refunds each order's full sum from its own largest wallet.
export const buildOrderCancelFields = ({
  answer,
  hasRefundFields,
}: {
  answer: Exclude<OrderMoneyAnswer, null | { deleteWithPayments: true }>;
  hasRefundFields: boolean;
}): OrderCancelFields => {
  if (answer.paidMoneyOnCancel === 'KEPT' || !hasRefundFields) {
    return { paidMoneyOnCancel: answer.paidMoneyOnCancel };
  }

  return {
    paidMoneyOnCancel: 'REFUNDED',
    refundAmount: isDefined(answer.refund)
      ? { amountMicros: answer.refund.amountMicros, currencyCode: 'UZS' }
      : null,
    refundWallet: answer.refund?.wallet ?? null,
  };
};

export const buildOrderCancelInput = <TRecordInput extends object>(
  recordInput: TRecordInput,
  orderCancelFields: OrderCancelFields,
) => ({
  ...recordInput,
  status: ORDER_CANCELLED_STATUS,
  ...orderCancelFields,
});
