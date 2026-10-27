import { styled } from '@linaria/react';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Section } from 'twenty-ui/components';
import { Button } from 'twenty-ui/primitives/input';
import { Dialog } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme';

import { ORDER_MONEY_QUESTION_DIALOG_ID } from '@/claw-order-money/constants/OrderMoneyQuestionDialogId';
import { orderMoneyQuestionState } from '@/claw-order-money/states/orderMoneyQuestionState';
import {
  formatOrderMoneyAmount,
  formatRefundAmountInput,
  type OrderMoneyAnswer,
  parseRefundAmountMicros,
  REFUND_WALLET_OPTIONS,
  type RefundWallet,
} from '@/claw-order-money/utils/orderMoney';
import { Select } from '@/ui/input/components/Select';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';
import { DialogInstance } from '@/ui/layout/dialog/components/DialogInstance';
import { useDialog } from '@/ui/layout/dialog/hooks/useDialog';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';

// Long enough for the dialog's open animation and for whatever opened it
// (a closing side panel, a closing select) to finish moving focus.
const DISMISSAL_GRACE_PERIOD_MS = 500;

const StyledAnswerButton = styled(Button)`
  box-sizing: border-box;
  margin-top: ${themeCssVariables.spacing[2]};
`;

const StyledDescription = styled(Dialog.Description)`
  && {
    color: inherit;
    font-size: inherit;
    line-height: inherit;
    margin-bottom: ${themeCssVariables.spacing[6]};
  }
`;

const StyledFields = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledRefundActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  margin-top: ${themeCssVariables.spacing[6]};
`;

const StyledRefundActionSlot = styled.div`
  flex: 1;
`;

type RefundDraft = {
  amountText: string;
  wallet: RefundWallet;
};

export const OrderMoneyQuestionModal = () => {
  const [orderMoneyQuestion, setOrderMoneyQuestion] = useAtomState(
    orderMoneyQuestionState,
  );
  const [refundDraft, setRefundDraft] = useState<RefundDraft | null>(null);
  const { closeDialog, openDialog } = useDialog();

  if (!isDefined(orderMoneyQuestion)) {
    return null;
  }

  const { refundDefaults } = orderMoneyQuestion;

  const refundAmountMicros =
    isDefined(refundDraft) && isDefined(refundDefaults)
      ? parseRefundAmountMicros(
          refundDraft.amountText,
          refundDefaults.paidAmountMicros,
        )
      : null;

  const handleAnswer = (answer: OrderMoneyAnswer) => {
    setOrderMoneyQuestion(null);
    setRefundDraft(null);
    closeDialog(ORDER_MONEY_QUESTION_DIALOG_ID);
    orderMoneyQuestion.answer(answer);
  };

  const handleRefundedClick = () => {
    if (!isDefined(refundDefaults)) {
      handleAnswer({ paidMoneyOnCancel: 'REFUNDED', refund: null });
      return;
    }

    setRefundDraft({
      amountText: formatRefundAmountInput(refundDefaults.paidAmountMicros),
      wallet: refundDefaults.wallet,
    });
  };

  const handleRefundSave = () => {
    if (!isDefined(refundDraft) || !isDefined(refundAmountMicros)) {
      return;
    }

    handleAnswer({
      paidMoneyOnCancel: 'REFUNDED',
      refund: { amountMicros: refundAmountMicros, wallet: refundDraft.wallet },
    });
  };

  const handleRefundAmountBlur = () => {
    if (isDefined(refundDraft) && isDefined(refundAmountMicros)) {
      setRefundDraft({
        ...refundDraft,
        amountText: formatRefundAmountInput(refundAmountMicros),
      });
    }
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

  // On the first step Enter means the abort answer, so it and closing both
  // leave the order as it was.
  const handleEnter = () => {
    if (isDefined(refundDraft)) {
      handleRefundSave();
      return;
    }

    handleAnswer(null);
  };

  return (
    <DialogInstance
      dialogId={ORDER_MONEY_QUESTION_DIALOG_ID}
      dismissible
      onClose={handleDismiss}
      onEnter={handleEnter}
      renderInDocumentBody
    >
      {({ container, backdrop, viewportProps, onKeyDown }) => (
        <Dialog.Popup
          {...{ container, backdrop, viewportProps, onKeyDown }}
          data-globally-prevent-click-outside
          style={{
            padding: 'var(--t-spacing-6)',
            borderRadius: 'var(--t-spacing-1)',
            width: 'calc(400px - var(--t-spacing-32))',
          }}
        >
          <Dialog.Title>{orderMoneyQuestion.title}</Dialog.Title>
          <StyledDescription render={<div />}>
            <Section.Root align="center" color="primary">
              {isDefined(refundDraft)
                ? 'Сколько вернули и откуда?'
                : orderMoneyQuestion.subtitle}
            </Section.Root>
          </StyledDescription>

          {isDefined(refundDraft) && isDefined(refundDefaults) ? (
            <>
              <StyledFields>
                <SettingsTextInput
                  instanceId={`${ORDER_MONEY_QUESTION_DIALOG_ID}-refund-amount`}
                  label="Сумма возврата"
                  inputMode="decimal"
                  rightAdornment="сум"
                  value={refundDraft.amountText}
                  onChange={(amountText) =>
                    setRefundDraft({ ...refundDraft, amountText })
                  }
                  onBlur={handleRefundAmountBlur}
                  onInputEnter={handleRefundSave}
                  error={
                    isDefined(refundAmountMicros)
                      ? undefined
                      : `Больше нуля и не больше ${formatOrderMoneyAmount(refundDefaults.paidAmountMicros)}`
                  }
                  autoFocusOnMount
                  autoSelectOnMount
                  fullWidth
                />
                <Select
                  dropdownId={`${ORDER_MONEY_QUESTION_DIALOG_ID}-refund-wallet`}
                  label="Откуда вернули"
                  value={refundDraft.wallet}
                  options={REFUND_WALLET_OPTIONS}
                  onChange={(wallet) =>
                    setRefundDraft({ ...refundDraft, wallet })
                  }
                  fullWidth
                />
              </StyledFields>
              <StyledRefundActions>
                <StyledRefundActionSlot>
                  <Button
                    onClick={() => setRefundDraft(null)}
                    fullWidth
                    variant="outline"
                  >
                    Назад
                  </Button>
                </StyledRefundActionSlot>
                <StyledRefundActionSlot>
                  <Button
                    onClick={handleRefundSave}
                    disabled={!isDefined(refundAmountMicros)}
                    fullWidth
                    variant="solid"
                    color="accent"
                  >
                    Сохранить
                  </Button>
                </StyledRefundActionSlot>
              </StyledRefundActions>
            </>
          ) : (
            <>
              <StyledAnswerButton
                onClick={handleRefundedClick}
                fullWidth
                variant="solid"
                color="accent"
              >
                Вернули клиенту
              </StyledAnswerButton>
              <StyledAnswerButton
                onClick={() => handleAnswer({ paidMoneyOnCancel: 'KEPT' })}
                fullWidth
                variant="solid"
                color="accent"
              >
                Остаются у нас
              </StyledAnswerButton>
              {orderMoneyQuestion.action === 'delete' && (
                <StyledAnswerButton
                  onClick={() => handleAnswer({ deleteWithPayments: true })}
                  fullWidth
                  variant="solid"
                  color="danger"
                >
                  Удалить вместе с оплатами
                </StyledAnswerButton>
              )}
              <StyledAnswerButton
                onClick={() => handleAnswer(null)}
                fullWidth
                variant="outline"
                color="neutral"
              >
                {orderMoneyQuestion.abortButtonText}
              </StyledAnswerButton>
            </>
          )}
        </Dialog.Popup>
      )}
    </DialogInstance>
  );
};
