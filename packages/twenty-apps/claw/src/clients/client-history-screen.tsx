import { useCallback, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { useSelectedRecordIds } from 'twenty-sdk/front-component';

import { callBackReasonLabel } from 'src/clients/call-draft';
import { CallForm } from 'src/clients/call-form';
import { callBackWhen } from 'src/clients/call-backs';
import {
  describeLines,
  orderForCall,
  statusLabel,
  statusTone,
} from 'src/clients/client-history';
import { type CallBack } from 'src/clients/client-summary';
import {
  type ClientHistoryData,
  loadClientHistory,
} from 'src/clients/load-clients';
import { isSold } from 'src/constants/order-status-sets';
import { CLIENT_STATUS_OPTIONS } from 'src/constants/select-options';
import { todayInTashkent } from 'src/pricing/dates';
import { formatDayMonth, formatMoney } from 'src/ui/format';
import {
  AmountLine,
  Button,
  ErrorNote,
  Hint,
  Link,
  Screen,
  Section,
  SkeletonRows,
  StatePill,
  StaticRow,
  Wrap,
} from 'src/ui/kit';
import { SPACE, type Tone } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';

const LOAD_FAILED =
  'Не удалось загрузить клиента. Проверьте интернет и нажмите "Повторить"';
const NO_ACCESS = 'Нет прав смотреть заказы клиента';
// The trigger writes the call's outcome on the client a moment after it is saved.
const SETTLE_MILLISECONDS = 3_000;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; data: ClientHistoryData };

const clientStatusTone = (status: string | null): Tone =>
  status === 'REFUSED'
    ? 'danger'
    : status === 'THINKING'
      ? 'warning'
      : status === 'BOUGHT' || status === 'REPEAT'
        ? 'success'
        : 'neutral';

const OneClientHistory = ({ personId }: { personId: string }) => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [isCallOpen, setIsCallOpen] = useState(false);
  const [savedCallBack, setSavedCallBack] = useState<CallBack | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = todayInTashkent();

  const load = useCallback(
    async (isQuiet = false) => {
      try {
        const data = await loadClientHistory(new CoreApiClient(), personId);

        setState(
          data === null
            ? { status: 'error', text: 'Клиент не найден.' }
            : { status: 'ready', data },
        );
        setSavedCallBack(null);
      } catch (caught) {
        if (!isQuiet) {
          setState({
            status: 'error',
            text: isAccessError(caught) ? NO_ACCESS : LOAD_FAILED,
          });
        }
      }
    },
    [personId],
  );

  useEffect(() => {
    void load();

    return () => {
      if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    };
  }, [load]);

  if (state.status === 'loading') {
    return (
      <Screen title="Заказы клиента">
        <SkeletonRows count={3} />
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen title="Заказы клиента">
        <ErrorNote text={state.text} onRetry={() => void load()} />
      </Screen>
    );
  }

  const { client, orders, referrals } = state.data;
  const callBack: CallBack = savedCallBack ?? {
    at: client.callBackAt,
    reason: client.callBackReason as CallBack['reason'],
  };
  const statusText =
    CLIENT_STATUS_OPTIONS.find((option) => option.value === client.clientStatus)
      ?.label ?? 'Новый';

  const onCallSaved = (next: CallBack) => {
    setIsCallOpen(false);
    setSavedCallBack(next);

    if (settleTimer.current !== null) clearTimeout(settleTimer.current);

    settleTimer.current = setTimeout(
      () => void load(true),
      SETTLE_MILLISECONDS,
    );
  };

  return (
    <Screen
      title={client.name}
      action={
        <StatePill
          tone={clientStatusTone(client.clientStatus)}
          text={statusText}
        />
      }
    >
      <Section title="Итого">
        <StaticRow>
          <AmountLine amount={formatMoney(client.totalSpent)}>
            Купил на
          </AmountLine>
          <AmountLine amount={formatMoney(client.owes)}>Должен</AmountLine>
          {client.quoted !== null ? (
            <AmountLine amount={formatMoney(client.quoted)}>
              Предложили
            </AmountLine>
          ) : null}
          <AmountLine amount={String(orders.length)}>Заказов</AmountLine>
          {client.firstOrderAt !== null ? (
            <AmountLine amount={formatDayMonth(client.firstOrderAt)}>
              Клиент с
            </AmountLine>
          ) : null}
          {referrals.count > 0 ? (
            <AmountLine
              amount={`${referrals.count}, ${formatMoney(referrals.totalSpent)}`}
            >
              Привёл клиентов
            </AmountLine>
          ) : null}
        </StaticRow>
      </Section>

      <Section title="Звонок">
        <StaticRow>
          {callBack.at !== null ? (
            <Hint
              tone={callBack.at <= today ? 'warning' : 'neutral'}
              text={`Перезвонить ${callBackWhen(callBack.at, today)} (${formatDayMonth(callBack.at)})${
                callBackReasonLabel(callBack.reason) !== null
                  ? `: ${callBackReasonLabel(callBack.reason)}`
                  : ''
              }`}
            />
          ) : (
            <Hint text="Звонок не запланирован." />
          )}
          {client.lastCallNote !== null && client.lastCallAt !== null ? (
            <Hint
              text={`Последний звонок ${formatDayMonth(client.lastCallAt)}: ${client.lastCallNote}`}
            />
          ) : null}
          {isCallOpen ? (
            <CallForm
              personId={client.id}
              orderId={orderForCall(orders)}
              onSaved={onCallSaved}
              onCancel={() => setIsCallOpen(false)}
            />
          ) : (
            <Wrap>
              <Button variant="primary" onClick={() => setIsCallOpen(true)}>
                Записать звонок
              </Button>
              {client.phone !== null ? (
                <Link href={`tel:${client.phone.replace(/\s/g, '')}`}>
                  {client.phone}
                </Link>
              ) : null}
            </Wrap>
          )}
        </StaticRow>
      </Section>

      <Section title="Заказы">
        {orders.length === 0 ? (
          <StaticRow>
            <Hint text="У клиента ещё нет заказов." />
          </StaticRow>
        ) : (
          orders.map((order) => {
            const made = describeLines(order.lines);
            const dates = [
              `создан ${formatDayMonth(order.createdOn)}`,
              order.measuredOn !== null
                ? `замер ${formatDayMonth(order.measuredOn)}`
                : null,
              order.installedOn !== null
                ? `установка ${formatDayMonth(order.installedOn)}`
                : null,
            ].filter((part): part is string => part !== null);

            return (
              <StaticRow key={order.id}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: SPACE.sm,
                  }}
                >
                  <Link href={`/object/order/${order.id}`}>{order.name}</Link>
                  <StatePill
                    tone={statusTone(order.status)}
                    text={statusLabel(order)}
                  />
                </div>
                {made !== null ? <span>{made}</span> : null}
                {order.total !== null && order.total > 0 ? (
                  <AmountLine amount={formatMoney(order.total)}>
                    Сумма
                  </AmountLine>
                ) : null}
                {order.paid !== null && order.paid > 0 ? (
                  <AmountLine amount={formatMoney(order.paid)}>
                    Оплачено
                  </AmountLine>
                ) : null}
                {isSold(order.status) &&
                order.balance !== null &&
                order.balance > 0 ? (
                  <AmountLine amount={formatMoney(order.balance)}>
                    Долг
                  </AmountLine>
                ) : null}
                <Hint text={dates.join(' · ')} />
              </StaticRow>
            );
          })
        )}
      </Section>
    </Screen>
  );
};

export const ClientHistory = () => {
  const selectedRecordIds = useSelectedRecordIds();

  if (selectedRecordIds.length !== 1) return null;

  const personId = selectedRecordIds[0];

  return <OneClientHistory key={personId} personId={personId} />;
};
