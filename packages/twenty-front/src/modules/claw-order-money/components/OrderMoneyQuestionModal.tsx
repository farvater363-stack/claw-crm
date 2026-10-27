import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { ORDER_MONEY_QUESTION_DIALOG_ID } from '@/claw-order-money/constants/OrderMoneyQuestionDialogId';
import { orderMoneyQuestionState } from '@/claw-order-money/states/orderMoneyQuestionState';
import { type PaidMoneyOnCancel } from '@/claw-order-money/utils/orderMoney';
import { ConfirmationDialog } from '@/ui/layout/dialog/components/ConfirmationDialog';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

// Long enough for the dialog's open animation and for whatever opened it
// (a closing side panel, a closing select) to finish moving focus.
const DISMISSAL_GRACE_PERIOD_MS = 500;

const StyledAnswerButton = styled(Button)`
  box-sizing: border-box;
  margin-top: ${themeCssVariables.spacing[2]};
`;

export const OrderMoneyQuestionModal = () => {
  const [orderMoneyQuestion, setOrderMoneyQuestion] = useAtomState(
    orderMoneyQuestionState,
  );
  const { closeDialog, openDialog } = useDialog();

  if (!isDefined(orderMoneyQuestion)) {
    return null;
  }

  const handleAnswer = (paidMoneyOnCancel: PaidMoneyOnCancel | null) => {
    setOrderMoneyQuestion(null);
    closeDialog(ORDER_MONEY_QUESTION_DIALOG_ID);
    orderMoneyQuestion.answer(paidMoneyOnCancel);
  };

  // Only a dismissal of a fully open dialog counts as «no»; one fired while it
  // opens comes from the UI it replaced, so the dialog comes back.
  const handleDismiss = () => {
    if (
      performance.now() - orderMoneyQuestion.openedAt <
      DISMISSAL_GRACE_PERIOD_MS
    ) {
      setTimeout(() => openDialog(ORDER_MONEY_QUESTION_DIALOG_ID));
      return;
    }

    handleAnswer(null);
  };

  // The dialog's own confirm button is «Не отменять», so Enter and closing
  // both leave the order as it was.
  return (
    <ConfirmationDialog
      dialogId={ORDER_MONEY_QUESTION_DIALOG_ID}
      title={orderMoneyQuestion.title}
      subtitle={orderMoneyQuestion.subtitle}
      hideCancelButton
      AdditionalButtons={
        <>
          <StyledAnswerButton
            onClick={() => handleAnswer('REFUNDED')}
            fullWidth
            variant="solid"
            color="accent"
          >
            Вернули клиенту
          </StyledAnswerButton>
          <StyledAnswerButton
            onClick={() => handleAnswer('KEPT')}
            fullWidth
            variant="solid"
            color="accent"
          >
            Остаются у нас
          </StyledAnswerButton>
        </>
      }
      confirmButtonText={orderMoneyQuestion.abortButtonText}
      confirmButtonColor="neutral"
      onConfirmClick={() => handleAnswer(null)}
      onClose={handleDismiss}
    />
  );
};
