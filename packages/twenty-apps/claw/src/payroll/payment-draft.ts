import {
  MASTER_PAYMENT_KIND_OPTIONS,
  type MasterPaymentKind,
} from 'src/constants/select-options';
import { toCurrency } from 'src/recalc/money';

export const buildPaymentInput = ({
  kind,
  masterId,
  masterName,
  amount,
  paidOn,
  comment,
}: {
  kind: MasterPaymentKind;
  masterId: string;
  masterName: string;
  amount: string;
  paidOn: string;
  comment: string;
}) => {
  // Spaces are how people group thousands («100 000»); anything else must be digits.
  const digits = amount.replace(/\s/g, '');
  const parsed = /^\d+$/.test(digits) ? Number(digits) : 0;

  if (parsed <= 0) {
    return {
      isValid: false as const,
      error: 'Сумма должна быть целым числом больше 0',
    };
  }

  if (paidOn === '') {
    return { isValid: false as const, error: 'Укажите дату' };
  }

  const kindLabel =
    MASTER_PAYMENT_KIND_OPTIONS.find((option) => option.value === kind)
      ?.label ?? kind;

  return {
    isValid: true as const,
    data: {
      name: `${kindLabel} · ${masterName}`,
      masterId,
      paidOn,
      amount: toCurrency(parsed),
      kind,
      comment: comment.trim() === '' ? null : comment.trim(),
    },
  };
};
