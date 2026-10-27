import { ORDER_MONEY_QUESTION_DIALOG_ID } from '@/claw-order-money/constants/OrderMoneyQuestionDialogId';
import { FIND_ORDER_PAYMENTS_BEFORE_CANCEL } from '@/claw-order-money/graphql/findOrderPaymentsBeforeCancel';
import { orderMoneyQuestionState } from '@/claw-order-money/states/orderMoneyQuestionState';
import {
  buildOrderMoneyQuestion,
  getPaidAmountMicrosByOrderId,
  getPaidOrderIds,
  isOrderMoneyWorkspace,
  type OrderMoneyAction,
  type OrderPaymentNode,
  type PaidMoneyOnCancel,
  sumPaidAmountMicros,
} from '@/claw-order-money/utils/orderMoney';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { isNonEmptyArray } from 'twenty-shared/utils';

export type OrderMoneyDecision = {
  proceed: boolean;
  paidRecordIds: string[];
  paidMoneyOnCancel: PaidMoneyOnCancel | null;
};

// Twenty caps a page at 200 records; a selection of orders has a few payments each.
const PAYMENTS_PAGE_SIZE = 200;

const NO_QUESTION: OrderMoneyDecision = {
  proceed: true,
  paidRecordIds: [],
  paidMoneyOnCancel: null,
};

// One dialog serves every caller, so a multi-card drag asks one order at a time.
let previousQuestion: Promise<unknown> = Promise.resolve();

export const useConfirmOrderMoneyBeforeCancel = () => {
  const apolloCoreClient = useApolloCoreClient();
  const { objectMetadataItems } = useObjectMetadataItems();
  const setOrderMoneyQuestion = useSetAtomState(orderMoneyQuestionState);
  const { openDialog } = useDialog();

  const askInTurn = (
    question: ReturnType<typeof buildOrderMoneyQuestion>,
  ): Promise<PaidMoneyOnCancel | null> => {
    const turn = previousQuestion.then(
      () =>
        new Promise<PaidMoneyOnCancel | null>((resolve) => {
          setOrderMoneyQuestion({ ...question, answer: resolve });
          openDialog(ORDER_MONEY_QUESTION_DIALOG_ID);
        }),
    );

    previousQuestion = turn;

    return turn;
  };

  const confirmOrderMoneyBeforeCancel = async ({
    objectNameSingular,
    recordIds,
    action,
  }: {
    objectNameSingular: string;
    recordIds: string[];
    action: OrderMoneyAction;
  }): Promise<OrderMoneyDecision> => {
    if (
      !isOrderMoneyWorkspace(objectMetadataItems, objectNameSingular) ||
      !isNonEmptyArray(recordIds)
    ) {
      return NO_QUESTION;
    }

    // A role that cannot read payments goes on as before; the server asks
    // about such an order on «Сегодня».
    const payments = await apolloCoreClient
      .query<{ orderPayments: { edges: { node: OrderPaymentNode }[] } }>({
        query: FIND_ORDER_PAYMENTS_BEFORE_CANCEL,
        variables: {
          filter: { orderId: { in: recordIds } },
          limit: PAYMENTS_PAGE_SIZE,
        },
        fetchPolicy: 'network-only',
      })
      .then(({ data }) =>
        (data?.orderPayments.edges ?? []).map(({ node }) => node),
      )
      .catch(() => []);

    const paidByOrderId = getPaidAmountMicrosByOrderId(payments);
    const paidRecordIds = getPaidOrderIds(recordIds, paidByOrderId);

    if (!isNonEmptyArray(paidRecordIds)) {
      return NO_QUESTION;
    }

    const paidMoneyOnCancel = await askInTurn(
      buildOrderMoneyQuestion({
        action,
        paidAmountMicros: sumPaidAmountMicros(paidRecordIds, paidByOrderId),
        paidOrderCount: paidRecordIds.length,
      }),
    );

    return {
      proceed: paidMoneyOnCancel !== null,
      paidRecordIds,
      paidMoneyOnCancel,
    };
  };

  return { confirmOrderMoneyBeforeCancel };
};
