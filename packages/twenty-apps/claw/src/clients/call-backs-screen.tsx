import { useCallback, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';

import { callBackReasonLabel } from 'src/clients/call-draft';
import { CallForm } from 'src/clients/call-form';
import {
  buildCallBackLists,
  callBackWhen,
  type CallBackTab,
  daysBetween,
  refusalsByReason,
} from 'src/clients/call-backs';
import { type ClientCard, loadCallBackClients } from 'src/clients/load-clients';
import {
  CANCEL_REASON_OPTIONS,
  SOURCE_OPTIONS,
} from 'src/constants/select-options';
import { todayInTashkent } from 'src/pricing/dates';
import { formatDayMonth, formatMoney } from 'src/ui/format';
import {
  AmountLine,
  ErrorNote,
  Hint,
  LevelBar,
  Link,
  Row,
  Screen,
  Section,
  SkeletonRows,
  StatePill,
  StaticRow,
  Tabs,
} from 'src/ui/kit';
import { SPACE, TYPE } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';

const LOAD_FAILED =
  'Не удалось загрузить список. Проверьте интернет и нажмите "Повторить"';
const NO_ACCESS = 'Доступно владельцу и менеджеру';
// The trigger writes the call's outcome on the client a moment after it is saved.
const SETTLE_MILLISECONDS = 3_000;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; clients: ClientCard[] };

const labelOf = (
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null,
): string | null =>
  options.find((option) => option.value === value)?.label ?? null;

// Why this client is on the list, in the words of the tab they are in.
const reasonText = (client: ClientCard, tab: CallBackTab, today: string) => {
  if (tab === 'thinking' && client.lastOrderAt !== null) {
    return `Думает ${daysBetween(client.lastOrderAt, today)} дн. после заказа`;
  }

  if (tab === 'refused') {
    return `Отказ: ${labelOf(CANCEL_REASON_OPTIONS, client.refusalReason) ?? 'причина не указана'}`;
  }

  return callBackReasonLabel(client.callBackReason) ?? 'Перезвонить';
};

const ClientRow = ({
  client,
  tab,
  today,
  isOpen,
  onToggle,
  onSaved,
}: {
  client: ClientCard;
  tab: CallBackTab;
  today: string;
  isOpen: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) => {
  const isLate = client.callBackAt !== null && client.callBackAt < today;
  const pill =
    client.callBackAt !== null ? (
      <StatePill
        tone={
          isLate
            ? 'danger'
            : client.callBackAt === today
              ? 'warning'
              : 'neutral'
        }
        text={callBackWhen(client.callBackAt, today)}
      />
    ) : null;

  return (
    <Row
      title={client.name}
      value={client.quoted !== null ? formatMoney(client.quoted) : undefined}
      pill={pill}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <Hint text={reasonText(client, tab, today)} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.md }}>
        {client.phone !== null ? (
          <Link href={`tel:${client.phone.replace(/\s/g, '')}`}>
            {client.phone}
          </Link>
        ) : null}
        <Link href={`/object/person/${client.id}`}>Карточка клиента</Link>
      </div>
      {client.source !== null ? (
        <Hint text={`Источник: ${labelOf(SOURCE_OPTIONS, client.source)}`} />
      ) : null}
      {client.lastCallAt !== null && client.lastCallNote !== null ? (
        <Hint
          text={`Последний звонок ${formatDayMonth(client.lastCallAt)}: ${client.lastCallNote}`}
        />
      ) : null}
      <CallForm
        personId={client.id}
        orderId={null}
        onSaved={onSaved}
        onCancel={onToggle}
      />
    </Row>
  );
};

export const CallBacksScreen = () => {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [tab, setTab] = useState<CallBackTab>('due');
  const [openId, setOpenId] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const today = todayInTashkent();

  const load = useCallback(async (isQuiet = false) => {
    try {
      setState({
        status: 'ready',
        clients: await loadCallBackClients(new CoreApiClient()),
      });
    } catch (caught) {
      if (!isQuiet) {
        setState({
          status: 'error',
          text: isAccessError(caught) ? NO_ACCESS : LOAD_FAILED,
        });
      }
    }
  }, []);

  useEffect(() => {
    void load();

    return () => {
      if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    };
  }, [load]);

  if (state.status === 'loading') {
    return (
      <Screen title="Перезвоны">
        <SkeletonRows count={5} />
      </Screen>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen title="Перезвоны">
        <ErrorNote text={state.text} onRetry={() => void load()} />
      </Screen>
    );
  }

  const lists = buildCallBackLists(state.clients, today);
  const lateCount = lists.due.filter(
    (client) => client.callBackAt !== null && client.callBackAt < today,
  ).length;
  const reasons = refusalsByReason(state.clients, today);
  const mostReasons = Math.max(1, ...reasons.map((reason) => reason.count));

  const onSaved = (client: ClientCard) => {
    setOpenId(null);
    setSavedName(client.name);

    if (settleTimer.current !== null) clearTimeout(settleTimer.current);

    settleTimer.current = setTimeout(
      () => void load(true),
      SETTLE_MILLISECONDS,
    );
  };

  const rowsOf = (clients: ClientCard[], rowTab: CallBackTab) =>
    clients.map((client) => (
      <ClientRow
        key={client.id}
        client={client}
        tab={rowTab}
        today={today}
        isOpen={openId === client.id}
        onToggle={() =>
          setOpenId((current) => (current === client.id ? null : client.id))
        }
        onSaved={() => onSaved(client)}
      />
    ));

  return (
    <Screen title="Перезвоны">
      <div style={{ display: 'grid', gap: SPACE.lg, marginBottom: SPACE.xl }}>
        <Tabs<CallBackTab>
          value={tab}
          options={[
            { value: 'due', label: `Перезвонить (${lists.due.length})` },
            { value: 'thinking', label: `Думают (${lists.thinking.length})` },
            { value: 'refused', label: `Отказы (${lists.refused.length})` },
          ]}
          onChange={(next) => {
            setTab(next);
            setOpenId(null);
          }}
        />
        {savedName !== null ? (
          <Hint tone="success" text={`Звонок клиенту ${savedName} сохранён.`} />
        ) : null}
        {tab === 'due' && lateCount > 0 ? (
          <Hint
            tone="danger"
            text={`Пропущено со вчера и раньше: ${lateCount}. Они вверху списка.`}
          />
        ) : null}
      </div>

      {tab === 'due' ? (
        <>
          <Section title="Сегодня и пропущенные">
            {lists.due.length === 0 ? (
              <StaticRow>
                <Hint text="На сегодня звонков нет." />
              </StaticRow>
            ) : (
              rowsOf(lists.due, 'due')
            )}
          </Section>
          {lists.soon.length > 0 ? (
            <Section title="Скоро, на этой неделе">
              {rowsOf(lists.soon, 'due')}
            </Section>
          ) : null}
        </>
      ) : null}

      {tab === 'thinking' ? (
        <Section title="Замер сделан, решения нет">
          {lists.thinking.length === 0 ? (
            <StaticRow>
              <Hint text="Все, кому сделали замер, уже решили." />
            </StaticRow>
          ) : (
            rowsOf(lists.thinking, 'thinking')
          )}
        </Section>
      ) : null}

      {tab === 'refused' ? (
        <>
          <Section title="Отказы этого месяца по причине">
            {reasons.length === 0 ? (
              <StaticRow>
                <Hint text="В этом месяце отказов нет." />
              </StaticRow>
            ) : (
              reasons.map((reason) => (
                <StaticRow key={reason.reason}>
                  <AmountLine amount={String(reason.count)}>
                    {reason.label}
                  </AmountLine>
                  <LevelBar level={reason.count / mostReasons} tone="danger" />
                </StaticRow>
              ))
            )}
          </Section>
          <Section title="Все отказы, новые сверху">
            {lists.refused.length === 0 ? (
              <StaticRow>
                <Hint text="Отказов нет." />
              </StaticRow>
            ) : (
              rowsOf(lists.refused, 'refused')
            )}
          </Section>
        </>
      ) : null}

      <div style={{ ...TYPE.label }}>
        <Hint text="Звонок ставится сам: через 3 дня после замера без решения, через 7 дней после установки, на следующий день, если не дозвонились." />
      </div>
    </Screen>
  );
};
