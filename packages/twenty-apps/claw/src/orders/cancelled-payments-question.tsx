import { useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { AppPath, navigate } from 'twenty-sdk/front-component';

import {
  type PaidMoneyOnCancel,
  type Wallet,
  WALLET_OPTIONS,
} from 'src/constants/select-options';
import {
  answerPaidMoney,
  type CancelledWithMoney,
  loadCancelledWithMoney,
  parseRefundAmount,
} from 'src/orders/paid-money-on-cancel';
import {
  Button,
  Columns,
  ErrorNote,
  Field,
  Hint,
  Section,
  SelectInput,
  StaticRow,
  TextInput,
  Wrap,
} from 'src/ui/kit';
import { formatMoney, formatWhole } from 'src/ui/format';
import { TABULAR_NUMBERS } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';

const SAVE_ERROR =
  'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"';
const NO_RIGHTS = 'Нет прав на этот шаг';

const openOrder = (orderId: string) =>
  void navigate(AppPath.RecordShowPage, {
    objectNameSingular: 'order',
    objectRecordId: orderId,
  });

// Orders cancelled or deleted in Twenty's own screens, which cannot ask: the
// money question waits here until somebody answers it. Nothing to answer, or
// a role that may not read the sums, shows nothing.
// Reloaded quietly on each change of refreshCount; a failed reload keeps the rows shown.
export const CancelledPaymentsQuestion = ({
  refreshCount,
}: {
  refreshCount: number;
}) => {
  const [orders, setOrders] = useState<CancelledWithMoney[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    orderId: string;
    text: string;
    retry: (() => void) | null;
  } | null>(null);
  // «Вернули клиенту» opens what went back and from where under its row.
  const [refundDraft, setRefundDraft] = useState<{
    orderId: string;
    amount: string;
    wallet: string;
    error: string | null;
  } | null>(null);

  const latestRequest = useRef(0);

  useEffect(() => {
    const request = ++latestRequest.current;

    loadCancelledWithMoney(new CoreApiClient())
      .then((next) => {
        // A list loaded before an answer was saved would bring its row back
        if (request === latestRequest.current) setOrders(next);
      })
      .catch(() => undefined);
  }, [refreshCount]);

  if (orders.length === 0) return null;

  const answer = async (
    orderId: string,
    paidMoneyOnCancel: PaidMoneyOnCancel,
    refund: { amount: number; wallet: Wallet } | null = null,
  ) => {
    if (busyId !== null) return;

    setBusyId(orderId);
    setFailure(null);

    try {
      await answerPaidMoney(
        new CoreApiClient(),
        orderId,
        paidMoneyOnCancel,
        refund,
      );
      latestRequest.current += 1;
      setRefundDraft((current) =>
        current?.orderId === orderId ? null : current,
      );
      setOrders((current) => current.filter((order) => order.id !== orderId));
    } catch (error) {
      const isDenied = isAccessError(error);

      setFailure({
        orderId,
        text: isDenied ? NO_RIGHTS : SAVE_ERROR,
        // Trying again cannot help a role that may not make the change.
        retry: isDenied
          ? null
          : () => void answer(orderId, paidMoneyOnCancel, refund),
      });
    } finally {
      setBusyId(null);
    }
  };

  const openRefund = (order: CancelledWithMoney) =>
    setRefundDraft({
      orderId: order.id,
      amount: formatWhole(order.paid),
      wallet: order.wallet ?? 'CASH',
      error: null,
    });

  const saveRefund = (order: CancelledWithMoney) => {
    if (refundDraft === null) return;

    const amount = parseRefundAmount(refundDraft.amount, order.paid);
    const wallet = WALLET_OPTIONS.find(
      (option) => option.value === refundDraft.wallet,
    )?.value;

    if (!amount.ok || wallet === undefined) {
      setRefundDraft({
        ...refundDraft,
        error: amount.ok ? 'Выберите, откуда вернули' : amount.error,
      });

      return;
    }

    void answer(order.id, 'REFUNDED', { amount: amount.amount, wallet });
  };

  return (
    <Section title="Отменён с оплатой — что с деньгами?">
      {orders.map((order) => (
        <StaticRow key={order.id}>
          <Wrap>
            <Button variant="link" onClick={() => openOrder(order.id)}>
              {`Заказ ${order.name}`}
            </Button>
            <span style={TABULAR_NUMBERS}>
              {`клиент заплатил ${formatMoney(order.paid)}`}
            </span>
          </Wrap>
          <Wrap>
            <Button
              isBusy={busyId === order.id}
              onClick={() => openRefund(order)}
            >
              Вернули клиенту
            </Button>
            <Button
              isBusy={busyId === order.id}
              onClick={() => void answer(order.id, 'KEPT')}
            >
              Остаются у нас
            </Button>
          </Wrap>
          {refundDraft?.orderId === order.id ? (
            <>
              <Columns>
                <Field label="Сколько вернули">
                  <TextInput
                    label="Сколько вернули"
                    inputMode="numeric"
                    isMoney
                    suffix="сум"
                    value={refundDraft.amount}
                    onChange={(amount) =>
                      setRefundDraft({ ...refundDraft, amount, error: null })
                    }
                    onEnter={() => saveRefund(order)}
                    onCancel={() => setRefundDraft(null)}
                  />
                </Field>
                <Field label="Откуда">
                  <SelectInput
                    label="Откуда"
                    value={refundDraft.wallet}
                    options={WALLET_OPTIONS}
                    onChange={(wallet) =>
                      setRefundDraft({ ...refundDraft, wallet, error: null })
                    }
                  />
                </Field>
              </Columns>
              {refundDraft.error === null ? null : (
                <Hint text={refundDraft.error} tone="danger" />
              )}
              <Wrap>
                <Button
                  isBusy={busyId === order.id}
                  onClick={() => saveRefund(order)}
                >
                  Сохранить
                </Button>
                <Button variant="link" onClick={() => setRefundDraft(null)}>
                  Отмена
                </Button>
              </Wrap>
            </>
          ) : null}
          {failure?.orderId === order.id ? (
            <ErrorNote
              text={failure.text}
              onRetry={failure.retry ?? undefined}
            />
          ) : null}
        </StaticRow>
      ))}
    </Section>
  );
};
