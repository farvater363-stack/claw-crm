import { useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { AppPath, navigate } from 'twenty-sdk/front-component';

import { type PaidMoneyOnCancel } from 'src/constants/select-options';
import {
  answerPaidMoney,
  type CancelledWithMoney,
  loadCancelledWithMoney,
} from 'src/orders/paid-money-on-cancel';
import { Button, ErrorNote, Section, StaticRow, Wrap } from 'src/ui/kit';
import { formatMoney } from 'src/ui/format';
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
  ) => {
    if (busyId !== null) return;

    setBusyId(orderId);
    setFailure(null);

    try {
      await answerPaidMoney(new CoreApiClient(), orderId, paidMoneyOnCancel);
      latestRequest.current += 1;
      setOrders((current) => current.filter((order) => order.id !== orderId));
    } catch (error) {
      const isDenied = isAccessError(error);

      setFailure({
        orderId,
        text: isDenied ? NO_RIGHTS : SAVE_ERROR,
        // Trying again cannot help a role that may not make the change.
        retry: isDenied ? null : () => void answer(orderId, paidMoneyOnCancel),
      });
    } finally {
      setBusyId(null);
    }
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
              onClick={() => void answer(order.id, 'REFUNDED')}
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
