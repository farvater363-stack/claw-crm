import { type CoreApiClient } from 'twenty-client-sdk/core';

import { paymentFix } from 'src/payments/payment-name';
import { todayInTashkent } from 'src/pricing/dates';
import { fromCurrency } from 'src/recalc/money';

export type PaymentEventRecord = {
  orderId: string | null;
  name: string | null;
  paidOn: string | null;
  method: string | null;
  amount: { amountMicros?: number | string | null } | null;
};

export const applyPaymentFix = async (
  client: CoreApiClient,
  paymentId: string,
  payment: PaymentEventRecord,
): Promise<void> => {
  const data = paymentFix(
    {
      name: payment.name ?? null,
      paidOn: payment.paidOn ?? null,
      method: payment.method ?? null,
      amount: fromCurrency(payment.amount),
    },
    todayInTashkent(),
  );

  if (Object.keys(data).length > 0) {
    await client.mutation({
      updateOrderPayment: { __args: { id: paymentId, data }, id: true },
    });
  }
};
