import { type PaidMoneyOnCancel } from '@/claw-order-money/utils/orderMoney';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type OrderMoneyQuestion = {
  title: string;
  subtitle: string;
  abortButtonText: string;
  answer: (paidMoneyOnCancel: PaidMoneyOnCancel | null) => void;
};

export const orderMoneyQuestionState =
  createAtomState<OrderMoneyQuestion | null>({
    key: 'orderMoneyQuestionState',
    defaultValue: null,
  });
