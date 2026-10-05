import {
  MASTER_PAYMENT_KIND_OPTIONS,
  type MasterPaymentKind,
} from 'src/constants/select-options';
import { parseOptionalMoney } from 'src/prices/prices-screen';
import { toCurrency } from 'src/recalc/money';

const MAX_AMOUNT = 1_000_000_000;

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
  const typed = parseOptionalMoney(amount);
  const parsed = typed.ok ? (typed.value ?? 0) : 0;

  if (parsed <= 0 || parsed > MAX_AMOUNT) {
    return {
      isValid: false as const,
      error:
        'Сумма должна быть целым числом больше 0 и не больше 1,000,000,000',
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
