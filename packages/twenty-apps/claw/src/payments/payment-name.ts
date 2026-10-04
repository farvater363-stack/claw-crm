import {
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
} from 'src/constants/select-options';
import { formatDayMonth, formatMoney } from 'src/ui/format';

const isPaymentMethod = (value: string | null): value is PaymentMethod =>
  PAYMENT_METHOD_OPTIONS.some((option) => option.value === value);

const methodLabel = (method: PaymentMethod): string =>
  PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? '';

export const paymentName = ({
  paidOn,
  method,
  amount,
}: {
  paidOn: string;
  method: PaymentMethod;
  amount: number;
}): string =>
  `${formatDayMonth(paidOn)} ${methodLabel(method)} ${formatMoney(amount)}`;

// What a stored payment still lacks: its date, when it was typed without one,
// and the name built from date, method and amount.
export const paymentFix = (
  payment: {
    name: string | null;
    paidOn: string | null;
    method: string | null;
    amount: number | null;
  },
  today: string,
): { paidOn?: string; name?: string } => {
  const paidOn = payment.paidOn ?? today;
  const name = isPaymentMethod(payment.method)
    ? paymentName({
        paidOn,
        method: payment.method,
        amount: payment.amount ?? 0,
      })
    : null;

  return {
    ...(payment.paidOn === null && { paidOn }),
    ...(name !== null && name !== payment.name && { name }),
  };
};
