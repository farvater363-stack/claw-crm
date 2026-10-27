import { isDefined } from 'twenty-shared/utils';

import { convertCurrencyMicrosToCurrencyAmount } from '~/utils/convertCurrencyToCurrencyMicros';
import { formatNumber } from '~/utils/format/formatNumber';

export type PaidMoneyOnCancel = 'REFUNDED' | 'KEPT';

export type OrderMoneyAction = 'cancel' | 'delete';

export type OrderPaymentNode = {
  orderId?: string | null;
  amount?: { amountMicros?: number | string | null } | null;
};

type ObjectMetadataItemShape = {
  nameSingular: string;
  fields: { name: string }[];
};

export const ORDER_OBJECT_NAME_SINGULAR = 'order';
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
  objectMetadataItems.some((item) => item.nameSingular === 'orderPayment');

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

export const getPaidOrderIds = (
  orderIds: string[],
  paidByOrderId: Record<string, number>,
) => orderIds.filter((orderId) => (paidByOrderId[orderId] ?? 0) > 0);

export const sumPaidAmountMicros = (
  orderIds: string[],
  paidByOrderId: Record<string, number>,
) =>
  orderIds.reduce((total, orderId) => total + (paidByOrderId[orderId] ?? 0), 0);

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
        ? `У заказа есть оплата ${amount} — он будет отменён, а не удалён`
        : `У заказов есть оплата ${amount} — они будут отменены, а не удалены`,
    subtitle: 'Что с деньгами?',
    abortButtonText: 'Не удалять',
  };
};

export const buildOrderCancelInput = <TRecordInput extends object>(
  recordInput: TRecordInput,
  paidMoneyOnCancel: PaidMoneyOnCancel,
) => ({
  ...recordInput,
  status: ORDER_CANCELLED_STATUS,
  paidMoneyOnCancel,
});
