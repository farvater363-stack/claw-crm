import { useCallback, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { AppPath, navigate } from 'twenty-sdk/front-component';

import { type ClientCard } from 'src/clients/load-clients';
import { CallForm } from 'src/clients/call-form';
import { callBackReasonLabel } from 'src/clients/call-draft';
import { callBackWhen } from 'src/clients/call-backs';
import {
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
} from 'src/constants/select-options';
import {
  AttentionChip,
  Bars,
  BarRow,
  Card,
  ChipRow,
  GroupTitle,
  KpiTile,
  ListLine,
  MiniStats,
  Pill,
  PlanRow,
  QuietLine,
  SmallButton,
  Tag,
  TextButton,
  TileGrid,
  CompactContext,
  TWO_COLUMNS_FROM_WIDTH,
  TwoColumns,
} from 'src/dashboard/dashboard-ui';
import {
  type DashboardOrder,
  findPageIds,
  loadToday,
  type PageIds,
  type TodayData,
} from 'src/dashboard/load-dashboard';
import {
  buildToday,
  countWord,
  daySummary,
  dayTitle,
  plural,
  type TodayView,
} from 'src/dashboard/today';
import { useElementWidth } from 'src/measurer-form/measurer-form-ui';
import {
  buildRecord,
  emptyRecord,
  type RecordDraft,
} from 'src/money/money-forms';
import { RecordSheet } from 'src/money/money-sheets';
import { MoneyToday } from 'src/money/money-today';
import { recordMoneyEntry } from 'src/money/record-money-entry';
import { acceptPayment } from 'src/order-header/load-order-header';
import { buildPayment } from 'src/order-header/order-steps';
import { todayInTashkent } from 'src/pricing/dates';
import { formatDayMonth, formatMoney, formatWhole } from 'src/ui/format';
import {
  Button,
  ErrorNote,
  Field,
  Hint,
  SelectInput,
  Sheet,
  SkeletonRows,
  TextInput,
  usePalette,
} from 'src/ui/kit';
import { COLUMNS_MIN_WIDTH, SPACE, TYPE } from 'src/ui/tokens';
import { isAccessError } from 'src/utils/is-access-error';
import { randomUuid } from 'src/utils/random-uuid';

const LOAD_FAILED =
  'Не удалось загрузить «Сегодня». Проверьте интернет и нажмите «Повторить»';
const NO_ACCESS = 'Этот экран видит только владелец';
const SAVE_FAILED = 'Не сохранилось. Проверьте интернет и попробуйте ещё раз';
// Triggers write the payment into the order a moment after it is saved.
const SETTLE_MILLISECONDS = 3_000;
const SHORT_LIST = 4;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; text: string }
  | { status: 'ready'; data: TodayData };

type PlanFilter = 'all' | 'late' | 'owing' | 'calls';

type PaymentDraft = {
  orderId: string;
  amount: string;
  method: PaymentMethod;
  comment: string;
};

const openOrder = (orderId: string) =>
  void navigate(AppPath.RecordShowPage, {
    objectNameSingular: 'order',
    objectRecordId: orderId,
  });

const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

const joined = (parts: (string | null | undefined)[]) =>
  parts
    .filter((part) => part !== null && part !== undefined && part !== '')
    .join(' · ') || null;

const orderTitle = (order: DashboardOrder) =>
  `${order.name} ${order.clientName}`;

const Header = ({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions: React.ReactNode;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: SPACE.md,
        marginBottom: SPACE.lg,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h2
          style={{
            margin: 0,
            ...TYPE.title,
            fontSize: '26px',
            lineHeight: '32px',
            fontWeight: 800,
          }}
        >
          {title}
        </h2>
        <div
          style={{ ...TYPE.label, color: colors.muted, marginTop: SPACE.xs }}
        >
          {subtitle}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.sm }}>
        {actions}
      </div>
    </div>
  );
};

const PaymentSheet = ({
  orders,
  draft,
  error,
  isBusy,
  onChange,
  onSave,
  onClose,
}: {
  orders: DashboardOrder[];
  draft: PaymentDraft;
  error: string | null;
  isBusy: boolean;
  onChange: (change: Partial<PaymentDraft>) => void;
  onSave: () => void;
  onClose: () => void;
}) => (
  <Sheet
    title="Оплата от клиента"
    isBusy={isBusy}
    onClose={onClose}
    footer={
      <>
        {error ? <Hint tone="danger" text={error} /> : null}
        <Button variant="primary" isBusy={isBusy} onClick={onSave}>
          Записать оплату
        </Button>
      </>
    }
  >
    <Field label="Заказ">
      <SelectInput
        label="Заказ"
        value={draft.orderId}
        options={[
          { value: '', label: 'Выберите заказ' },
          ...orders.map((order) => ({
            value: order.id,
            label: `${orderTitle(order)} · должен ${formatMoney(order.balance ?? 0)}`,
          })),
        ]}
        onChange={(orderId) => {
          const balance = orders.find((order) => order.id === orderId)?.balance;

          onChange({
            orderId,
            amount: balance ? formatWhole(balance) : draft.amount,
          });
        }}
      />
    </Field>
    <Field label="Сумма">
      <TextInput
        label="Сумма"
        inputMode="numeric"
        isMoney
        isLarge
        suffix="сум"
        value={draft.amount}
        onChange={(amount) => onChange({ amount })}
        onEnter={onSave}
        onCancel={onClose}
      />
    </Field>
    <Field label="Как заплатил">
      <SelectInput
        label="Как заплатил"
        value={draft.method}
        options={PAYMENT_METHOD_OPTIONS}
        onChange={(value) =>
          onChange({
            method:
              PAYMENT_METHOD_OPTIONS.find((option) => option.value === value)
                ?.value ?? draft.method,
          })
        }
      />
    </Field>
    <Field label="Комментарий">
      <TextInput
        label="Комментарий"
        value={draft.comment}
        onChange={(comment) => onChange({ comment })}
        onEnter={onSave}
        onCancel={onClose}
      />
    </Field>
  </Sheet>
);

const DayPlan = ({
  view,
  today,
  filter,
  onFilter,
  onCall,
  onPay,
}: {
  view: TodayView;
  today: string;
  filter: PlanFilter;
  onFilter: (filter: PlanFilter) => void;
  onCall: (client: ClientCard) => void;
  onPay: (order: DashboardOrder) => void;
}) => {
  const shows = (group: PlanFilter) => filter === 'all' || filter === group;
  const hasVisits = view.visits.length + view.missedVisits.length > 0;
  const isEmpty =
    !hasVisits &&
    view.awaitingInstall.length === 0 &&
    view.calls.length === 0 &&
    view.late.length === 0 &&
    view.owing.length === 0;

  return (
    <Card
      title="План на день"
      subtitle={
        filter === 'all' ? 'Всё, что ждёт сегодня' : 'Показана одна группа'
      }
      action={
        filter === 'all' ? undefined : (
          <TextButton onClick={() => onFilter('all')}>Показать всё</TextButton>
        )
      }
    >
      <div>
        {isEmpty ? (
          <QuietLine text="Сегодня всё спокойно: замеров, звонков и долгов нет." />
        ) : null}

        {shows('all') && hasVisits ? (
          <>
            <GroupTitle>Замеры</GroupTitle>
            {view.visits.map((order) => (
              <PlanRow
                key={order.id}
                when={order.measurementTime ?? 'днём'}
                tag={<Tag accent="accent" text="замер" />}
                title={order.clientName}
                details={joined([order.place, order.phone, order.measurerName])}
                action={
                  <SmallButton onClick={() => openOrder(order.id)}>
                    Открыть
                  </SmallButton>
                }
              />
            ))}
            {view.missedVisits.map((order) => (
              <PlanRow
                key={order.id}
                when={
                  order.measurementDay ? shortDay(order.measurementDay) : '—'
                }
                whenTone="bad"
                tag={<Tag accent="danger" text="не отмечен" />}
                title={order.clientName}
                details={joined([
                  'Замер прошёл, а статус не сменили',
                  order.place,
                  order.phone,
                ])}
                action={
                  <SmallButton onClick={() => openOrder(order.id)}>
                    Открыть
                  </SmallButton>
                }
              />
            ))}
          </>
        ) : null}

        {shows('all') && view.awaitingInstall.length > 0 ? (
          <>
            <GroupTitle>Ждут установки</GroupTitle>
            {view.awaitingInstall.map((order) => (
              <PlanRow
                key={order.id}
                when={order.deadline ? `до ${shortDay(order.deadline)}` : '—'}
                tag={<Tag accent="success" text="установка" />}
                title={orderTitle(order)}
                details={joined([
                  order.place,
                  order.area
                    ? `${order.area.toLocaleString('ru-RU')} м²`
                    : null,
                  order.installerName
                    ? `установщик ${order.installerName}`
                    : null,
                ])}
                action={
                  <SmallButton onClick={() => openOrder(order.id)}>
                    Открыть
                  </SmallButton>
                }
              />
            ))}
          </>
        ) : null}

        {shows('calls') && view.calls.length > 0 ? (
          <>
            <GroupTitle>Перезвонить</GroupTitle>
            {view.calls.map((client) => (
              <PlanRow
                key={client.id}
                when={
                  client.callBackAt === null
                    ? '—'
                    : callBackWhen(client.callBackAt, today)
                }
                tag={<Tag accent="urgent" text="звонок" />}
                title={client.name}
                details={joined([
                  callBackReasonLabel(client.callBackReason),
                  client.phone,
                  client.quoted ? `цена ${formatMoney(client.quoted)}` : null,
                ])}
                action={
                  <SmallButton variant="primary" onClick={() => onCall(client)}>
                    Позвонил
                  </SmallButton>
                }
              />
            ))}
          </>
        ) : null}

        {shows('late') && view.late.length > 0 ? (
          <>
            <GroupTitle>Просрочены</GroupTitle>
            {view.late.map(({ order, daysLate }) => (
              <PlanRow
                key={order.id}
                when={`+${daysLate} дн`}
                whenTone="bad"
                tag={
                  <Tag
                    accent="danger"
                    text={`срок ${formatDayMonth(order.deadline ?? '')}`}
                  />
                }
                title={orderTitle(order)}
                details={joined([
                  order.masterName ? `мастер ${order.masterName}` : null,
                  order.phone,
                ])}
                action={
                  <SmallButton onClick={() => openOrder(order.id)}>
                    Открыть
                  </SmallButton>
                }
              />
            ))}
          </>
        ) : null}

        {shows('owing') && view.owing.length > 0 ? (
          <>
            <GroupTitle>Должны после установки</GroupTitle>
            {view.owing.map(({ order, daysSinceInstall }) => (
              <PlanRow
                key={order.id}
                when={
                  daysSinceInstall === null ? '—' : `${daysSinceInstall} дн`
                }
                whenTone={(daysSinceInstall ?? 0) > 7 ? 'bad' : 'muted'}
                tag={<Tag accent="warning" text="долг" />}
                title={orderTitle(order)}
                details={joined([
                  order.installedAt
                    ? `установлен ${formatDayMonth(order.installedAt)}`
                    : null,
                  order.phone,
                ])}
                action={
                  <SmallButton variant="primary" onClick={() => onPay(order)}>
                    {formatWhole(order.balance ?? 0)}
                  </SmallButton>
                }
              />
            ))}
          </>
        ) : null}
      </div>
    </Card>
  );
};

export const TodayScreen = () => {
  const { ref, width } = useElementWidth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [pageIds, setPageIds] = useState<PageIds>({});
  const [filter, setFilter] = useState<PlanFilter>('all');
  const [callClient, setCallClient] = useState<ClientCard | null>(null);
  const [payment, setPayment] = useState<PaymentDraft | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const paymentAttemptId = useRef<string | null>(null);
  const [expense, setExpense] = useState<{
    draft: RecordDraft;
    errors: Record<string, string>;
  } | null>(null);
  const [expensePhotos, setExpensePhotos] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [expenseFailed, setExpenseFailed] = useState(false);
  const [moneyVersion, setMoneyVersion] = useState(0);
  const expenseAttemptId = useRef<string | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (isQuiet = false) => {
    try {
      setState({ status: 'ready', data: await loadToday(new CoreApiClient()) });
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
    findPageIds(new MetadataApiClient())
      .then(setPageIds)
      .catch(() => setPageIds({}));

    return () => {
      if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    };
  }, [load]);

  const loadAgainSoon = () => {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);

    settleTimer.current = setTimeout(
      () => void load(true),
      SETTLE_MILLISECONDS,
    );
  };

  const openPage = (key: keyof PageIds) => {
    const pageLayoutId = pageIds[key];

    if (pageLayoutId !== undefined) {
      void navigate(AppPath.PageLayoutPage, { pageLayoutId });
    }
  };

  const isWide = width >= TWO_COLUMNS_FROM_WIDTH;
  const isCompact = width > 0 && width < COLUMNS_MIN_WIDTH;

  if (state.status !== 'ready') {
    return (
      <div ref={ref} style={{ padding: SPACE.lg }}>
        {state.status === 'loading' ? (
          <SkeletonRows count={6} />
        ) : (
          <ErrorNote text={state.text} onRetry={() => void load()} />
        )}
      </div>
    );
  }

  const { data } = state;
  const view = buildToday({
    orders: data.orders,
    payments: data.payments,
    callBackClients: data.callBackClients,
    today: data.today,
  });
  const owingOrders = data.orders
    .filter((order) => order.status !== 'CANCELLED' && (order.balance ?? 0) > 0)
    .sort((left, right) =>
      right.name.localeCompare(left.name, 'ru', { numeric: true }),
    );
  const toggleFilter = (next: PlanFilter) =>
    setFilter((current) => (current === next ? 'all' : next));

  const openPayment = (order: DashboardOrder | null) => {
    paymentAttemptId.current = null;
    setPaymentError(null);
    setPayment({
      orderId: order?.id ?? '',
      amount: order?.balance ? formatWhole(order.balance) : '',
      method: 'CASH',
      comment: '',
    });
  };

  const savePayment = async () => {
    if (payment === null || isPaying) return;

    if (payment.orderId === '') {
      setPaymentError('Выберите заказ');

      return;
    }

    const built = buildPayment({
      amount: payment.amount,
      method: payment.method,
      comment: payment.comment,
      today: todayInTashkent(),
    });

    if (!built.ok) {
      setPaymentError(built.error);

      return;
    }

    paymentAttemptId.current ??= randomUuid();
    setIsPaying(true);
    setPaymentError(null);

    try {
      await acceptPayment(new CoreApiClient(), paymentAttemptId.current, {
        orderId: payment.orderId,
        ...built.data,
      });
      const order = data.orders.find(
        (candidate) => candidate.id === payment.orderId,
      );

      setPayment(null);
      setNotice(
        `Оплата ${formatMoney(built.data.amount)} по заказу ${order?.name ?? ''} записана.`,
      );
      loadAgainSoon();
    } catch {
      setPaymentError(SAVE_FAILED);
    } finally {
      setIsPaying(false);
    }
  };

  const openExpense = () => {
    expenseAttemptId.current = null;
    setExpensePhotos([]);
    setExpenseFailed(false);
    setExpense({ draft: emptyRecord(todayInTashkent()), errors: {} });
  };

  const saveExpense = async (draft: RecordDraft) => {
    if (isRecording) return;

    const built = buildRecord(draft);

    setExpense({ draft, errors: built.ok ? {} : built.errors });

    if (!built.ok) return;

    expenseAttemptId.current ??= randomUuid();
    setIsRecording(true);
    setExpenseFailed(false);

    try {
      await recordMoneyEntry(
        expenseAttemptId.current,
        built.data,
        expensePhotos,
      );
      setExpense(null);
      setNotice(
        `${built.data.name}: ${formatMoney(built.data.amount)} записано.`,
      );
      setMoneyVersion((version) => version + 1);
    } catch {
      setExpenseFailed(true);
    } finally {
      setIsRecording(false);
    }
  };

  const latest = view.late[0]?.daysLate;

  return (
    <CompactContext.Provider value={isCompact}>
      <div
        ref={ref}
        style={{
          padding: isCompact ? SPACE.sm : SPACE.lg,
          maxWidth: 1180,
          margin: '0 auto',
          ...TYPE.body,
        }}
      >
        <Header
          title={dayTitle(data.today)}
          subtitle={daySummary(view)}
          actions={
            <>
              {pageIds.newMeasurement !== undefined ? (
                <Button
                  variant="primary"
                  onClick={() => openPage('newMeasurement')}
                >
                  + Новый замер
                </Button>
              ) : null}
              <Button onClick={() => openPayment(null)}>+ Оплата</Button>
              <Button onClick={openExpense}>− Расход</Button>
            </>
          }
        />

        {notice ? (
          <div style={{ marginBottom: SPACE.lg }}>
            <Hint tone="success" text={notice} />
          </div>
        ) : null}

        <ChipRow>
          {view.late.length > 0 ? (
            <AttentionChip
              accent="danger"
              count={view.late.length}
              text={plural(
                view.late.length,
                'заказ просрочен',
                'заказа просрочены',
                'заказов просрочены',
              )}
              isPressed={filter === 'late'}
              onClick={() => toggleFilter('late')}
            />
          ) : null}
          {view.owing.length > 0 ? (
            <AttentionChip
              accent="warning"
              count={view.owing.length}
              text={`должны ${formatWhole(view.owingTotal)}`}
              isPressed={filter === 'owing'}
              onClick={() => toggleFilter('owing')}
            />
          ) : null}
          {data.buyLines.length > 0 ? (
            <AttentionChip
              accent="warning"
              count={data.buyLines.length}
              text="купить на склад"
              onClick={() => openPage('stock')}
            />
          ) : null}
          {view.calls.length > 0 ? (
            <AttentionChip
              accent="urgent"
              count={view.calls.length}
              text="перезвонить"
              isPressed={filter === 'calls'}
              onClick={() => toggleFilter('calls')}
            />
          ) : null}
        </ChipRow>

        <TileGrid isWide={isWide}>
          <KpiTile
            label="Получено сегодня"
            value={formatWhole(view.receivedToday)}
            tone={view.receivedToday > 0 ? 'good' : 'plain'}
            hint={`за месяц ${formatWhole(view.receivedThisMonth)}`}
          />
          <KpiTile
            label="Должны нам"
            value={formatWhole(view.owingTotal)}
            hint={
              view.owing.length === 0
                ? 'никто не должен'
                : `${countWord(view.owing.length, 'клиент', 'клиента', 'клиентов')} после установки`
            }
            onClick={
              view.owing.length > 0 ? () => toggleFilter('owing') : undefined
            }
          />
          <KpiTile
            label="В цеху"
            value={`${view.inWorkshop.count} · ${view.inWorkshop.area.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} м²`}
            hint={
              view.inWorkshop.urgent > 0
                ? countWord(
                    view.inWorkshop.urgent,
                    'срочный',
                    'срочных',
                    'срочных',
                  )
                : 'срочных нет'
            }
            onClick={
              pageIds.workshop !== undefined
                ? () => openPage('workshop')
                : undefined
            }
          />
          <KpiTile
            label="Просрочено"
            value={String(view.late.length)}
            tone={view.late.length > 0 ? 'bad' : 'plain'}
            hint={
              latest === undefined
                ? 'все в срок'
                : `самый давний на ${latest} дн`
            }
            onClick={
              view.late.length > 0 ? () => toggleFilter('late') : undefined
            }
          />
        </TileGrid>

        <TwoColumns
          isWide={isWide}
          left={
            <DayPlan
              view={view}
              today={data.today}
              filter={filter}
              onFilter={setFilter}
              onCall={setCallClient}
              onPay={openPayment}
            />
          }
          right={
            <>
              <Card
                title="Деньги сегодня"
                action={
                  pageIds.money !== undefined ? (
                    <TextButton onClick={() => openPage('money')}>
                      Деньги
                    </TextButton>
                  ) : undefined
                }
              >
                <MoneyToday key={moneyVersion} />
              </Card>
              <Card
                title="Заказы по этапам"
                action={
                  <TextButton
                    onClick={() =>
                      void navigate(AppPath.RecordIndexPage, {
                        objectNamePlural: 'orders',
                      })
                    }
                  >
                    Все заказы
                  </TextButton>
                }
              >
                <Bars>
                  {view.pipeline.map((step) => (
                    <BarRow
                      key={step.status}
                      label={step.label}
                      value={String(step.count)}
                      level={
                        step.count /
                        Math.max(
                          1,
                          ...view.pipeline.map((other) => other.count),
                        )
                      }
                      isThick
                    />
                  ))}
                </Bars>
                {view.undecided.count > 0 ? (
                  <QuietLine
                    text={`Замер сделан, клиент ещё не решил: ${countWord(view.undecided.count, 'заказ', 'заказа', 'заказов')} на ${formatMoney(view.undecided.total)}.`}
                  />
                ) : null}
              </Card>

              <Card
                title="Цех сейчас"
                action={
                  pageIds.workshop !== undefined ? (
                    <TextButton onClick={() => openPage('workshop')}>
                      В работе
                    </TextButton>
                  ) : undefined
                }
              >
                <MiniStats
                  stats={view.workshopStages.map((stage) => ({
                    label: stage.label,
                    value: String(stage.count),
                  }))}
                />
                {view.dueSoon.length > 0 ? (
                  <ListLine
                    title="Сдать на этой неделе"
                    details={view.dueSoon.map((order) => order.name).join(', ')}
                    trailing={
                      <Pill
                        accent="warning"
                        text={countWord(
                          view.dueSoon.length,
                          'заказ',
                          'заказа',
                          'заказов',
                        )}
                      />
                    }
                  />
                ) : null}
              </Card>

              <Card
                title="Купить"
                action={
                  pageIds.stock !== undefined ? (
                    <TextButton onClick={() => openPage('stock')}>
                      Склад
                    </TextButton>
                  ) : undefined
                }
              >
                <div>
                  {data.buyLines.length === 0 ? (
                    <QuietLine text="Материала хватает." />
                  ) : (
                    data.buyLines
                      .slice(0, SHORT_LIST)
                      .map((line) => (
                        <ListLine
                          key={line.id}
                          title={line.name}
                          details={`купить ${line.quantity.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${line.unitLabel}`}
                          trailing={
                            line.sum !== null ? (
                              formatWhole(line.sum)
                            ) : (
                              <Pill accent="warning" text="мало" />
                            )
                          }
                        />
                      ))
                  )}
                  {data.buyLines.length > SHORT_LIST ? (
                    <QuietLine
                      text={`и ещё ${data.buyLines.length - SHORT_LIST} на «Складе»`}
                    />
                  ) : null}
                </div>
              </Card>

              {data.supplierDebts.length > 0 ? (
                <Card
                  title="Должны поставщикам"
                  action={
                    pageIds.stock !== undefined ? (
                      <TextButton onClick={() => openPage('stock')}>
                        Склад
                      </TextButton>
                    ) : undefined
                  }
                >
                  <div>
                    {data.supplierDebts.map((supplier) => (
                      <ListLine
                        key={supplier.id}
                        title={supplier.name}
                        trailing={formatWhole(supplier.debt)}
                      />
                    ))}
                  </div>
                </Card>
              ) : null}
            </>
          }
        />

        {callClient !== null ? (
          <Sheet
            title={`Звонок: ${callClient.name}`}
            onClose={() => setCallClient(null)}
          >
            {callClient.phone ? <Hint text={callClient.phone} /> : null}
            <CallForm
              personId={callClient.id}
              orderId={null}
              onSaved={() => {
                setNotice(`Звонок клиенту ${callClient.name} сохранён.`);
                setCallClient(null);
                loadAgainSoon();
              }}
              onCancel={() => setCallClient(null)}
            />
          </Sheet>
        ) : null}

        {expense !== null ? (
          <RecordSheet
            draft={expense.draft}
            errors={expense.errors}
            orders={data.orders
              .filter((order) => order.status !== 'CANCELLED')
              .map((order) => ({ id: order.id, name: order.name }))}
            photoNames={expensePhotos.map((photo) => photo.name)}
            isSaving={isRecording}
            failure={
              expenseFailed ? (
                <ErrorNote
                  text={SAVE_FAILED}
                  onRetry={() => void saveExpense(expense.draft)}
                />
              ) : undefined
            }
            onChange={(draft) => {
              if (isRecording) return;
              // A changed form is another attempt: its retry must not overwrite the last one.
              expenseAttemptId.current = null;
              setExpense({ draft, errors: expense.errors });
            }}
            onPickPhotos={setExpensePhotos}
            onSave={() => void saveExpense(expense.draft)}
            onClose={() => setExpense(null)}
          />
        ) : null}

        {payment !== null ? (
          <PaymentSheet
            orders={owingOrders}
            draft={payment}
            error={paymentError}
            isBusy={isPaying}
            onChange={(change) => {
              // A changed form is another attempt: its retry must not overwrite the last one.
              paymentAttemptId.current = null;
              setPayment((current) =>
                current === null ? null : { ...current, ...change },
              );
            }}
            onSave={() => void savePayment()}
            onClose={() => setPayment(null)}
          />
        ) : null}
      </div>
    </CompactContext.Provider>
  );
};
