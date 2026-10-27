import {
  type OrderMoneyAction,
  type OrderMoneyAnswer,
  type RefundWallet,
} from '@/claw-order-money/utils/orderMoney';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type OrderMoneyQuestion = {
  action: OrderMoneyAction;
  title: string;
  subtitle: string;
  abortButtonText: string;
  // Set when «Вернули клиенту» goes on to ask how much and from which wallet
  refundDefaults: {
    paidAmountMicros: number;
    wallet: RefundWallet;
  } | null;
  openedAt: number;
  answer: (answer: OrderMoneyAnswer) => void;
};

export const orderMoneyQuestionState =
  createAtomState<OrderMoneyQuestion | null>({
    key: 'orderMoneyQuestionState',
    defaultValue: null,
  });
