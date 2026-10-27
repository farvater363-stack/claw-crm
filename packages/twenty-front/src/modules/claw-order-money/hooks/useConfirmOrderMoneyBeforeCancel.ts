import { ORDER_MONEY_QUESTION_DIALOG_ID } from '@/claw-order-money/constants/OrderMoneyQuestionDialogId';
import { FIND_ORDER_PAYMENTS_BEFORE_CANCEL } from '@/claw-order-money/graphql/findOrderPaymentsBeforeCancel';
import {
  type OrderMoneyQuestion,
  orderMoneyQuestionState,
} from '@/claw-order-money/states/orderMoneyQuestionState';
import {
  buildOrderCancelFields,
  buildOrderMoneyQuestion,
  getPaidAmountMicrosByOrderId,
  getPaidOrderIds,
  getRefundDefaults,
  hasOrderRefundFields,
  isOrderMoneyWorkspace,
  type OrderCancelFields,
  type OrderMoneyAction,
  type OrderMoneyAnswer,
  type OrderPaymentNode,
  sumPaidAmountMicros,
} from '@/claw-order-money/utils/orderMoney';
import { isSidePanelClosingState } from '@/side-panel/states/isSidePanelClosingState';
import { waitForSidePanelClose } from '@/ui/layout/side-panel/utils/waitForSidePanelClose';
import { useStore } from 'jotai';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { isDefined, isNonEmptyArray } from 'twenty-shared/utils';

export type OrderMoneyDecision = {
  proceed: boolean;
  paidRecordIds: string[];
  // Sent with the status when the paid orders are cancelled
  orderCancelFields: OrderCancelFields | null;
  // Deleted before the paid orders when they go together with their payments
  paymentIdsToDelete: string[];
};

// Twenty caps a page at 200 records; a selection of orders has a few payments each.
const PAYMENTS_PAGE_SIZE = 200;

const NO_QUESTION: OrderMoneyDecision = {
  proceed: true,
  paidRecordIds: [],
  orderCancelFields: null,
  paymentIdsToDelete: [],
};

// One dialog serves every caller, so a multi-card drag asks one order at a time.
let previousQuestion: Promise<unknown> = Promise.resolve();

export const useConfirmOrderMoneyBeforeCancel = () => {
  const apolloCoreClient = useApolloCoreClient();
  const { objectMetadataItems } = useObjectMetadataItems();
  const setOrderMoneyQuestion = useSetAtomState(orderMoneyQuestionState);
  const { openDialog } = useDialog();
  const store = useStore();

  const askInTurn = (
    question: Omit<OrderMoneyQuestion, 'openedAt' | 'answer'>,
  ): Promise<OrderMoneyAnswer> => {
    const turn = previousQuestion.then(async () => {
      // A command run from the side panel closes it first; a dialog opened
      // during that teardown loses its focus and clicks to it.
      if (store.get(isSidePanelClosingState.atom)) {
        await waitForSidePanelClose();
      }

      return new Promise<OrderMoneyAnswer>((resolve) => {
        setOrderMoneyQuestion({
          ...question,
          openedAt: performance.now(),
          answer: resolve,
        });
        openDialog(ORDER_MONEY_QUESTION_DIALOG_ID);
      });
    });

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
        // Kept out of the cache: this partial OrderPayment.amount would
        // overwrite the full one and make the open record page refetch.
        fetchPolicy: 'no-cache',
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

    const paidAmountMicros = sumPaidAmountMicros(paidRecordIds, paidByOrderId);
    const hasRefundFields = hasOrderRefundFields(objectMetadataItems);

    const answer = await askInTurn({
      ...buildOrderMoneyQuestion({
        action,
        paidAmountMicros,
        paidOrderCount: paidRecordIds.length,
      }),
      action,
      refundDefaults: getRefundDefaults({
        hasRefundFields,
        paidRecordIds,
        paidAmountMicros,
        payments,
      }),
    });

    if (answer === null) {
      return { ...NO_QUESTION, proceed: false, paidRecordIds };
    }

    if ('deleteWithPayments' in answer) {
      return {
        ...NO_QUESTION,
        paidRecordIds,
        paymentIdsToDelete: payments
          .filter(
            ({ orderId }) =>
              isDefined(orderId) && paidRecordIds.includes(orderId),
          )
          .map(({ id }) => id)
          .filter(isDefined),
      };
    }

    return {
      ...NO_QUESTION,
      paidRecordIds,
      orderCancelFields: buildOrderCancelFields({ answer, hasRefundFields }),
    };
  };

  return { confirmOrderMoneyBeforeCancel };
};
