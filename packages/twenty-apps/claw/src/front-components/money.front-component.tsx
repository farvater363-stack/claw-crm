import { type ReactNode, useEffect, useRef, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';

import {
  type ExpenseCategory,
  type Wallet,
} from 'src/constants/select-options';
import { IDS } from 'src/constants/universal-identifiers';
import { useElementWidth } from 'src/measurer-form/measurer-form-ui';
import {
  createMoneyEntry,
  loadMoneyBooks,
  loadReadyOrders,
  type MoneyBooks,
  saveRecurringExpense,
  stopRecurringExpense,
} from 'src/money/load-money-books';
import {
  buildMoneyMoves,
  cashHolders,
  LEDGER_FILTERS,
  type LedgerFilter,
  ledgerDays,
  lastRecount,
  monthFlow,
  type RecurringRecord,
  recurringBadge,
  recurringState,
  walletBalances,
  weeklyFlow,
} from 'src/money/money-books';
import {
  buildHandover,
  buildRecord,
  buildRecount,
  buildRecurring,
  buildRecurringPayment,
  emptyRecord,
  emptyRecount,
  emptyRecurring,
  type HandoverDraft,
  type PayRecurringDraft,
  type RecordDraft,
  type RecountDraft,
  type RecurringDraft,
} from 'src/money/money-forms';
import { buildProfit, type ReadyOrderRecord } from 'src/money/money-profit';
import {
  HandoverSheet,
  PayRecurringSheet,
  RecordSheet,
  RecountSheet,
  RecurringSheet,
} from 'src/money/money-sheets';
import {
  Ledger,
  MutedNote,
  ShareBar,
  signed,
  Statement,
  type StatementRow,
  WarningNote,
  WeeklyChart,
} from 'src/money/money-views';
import { recordMoneyEntry } from 'src/money/record-money-entry';
import { todayInTashkent } from 'src/pricing/dates';
import { loadStockBooks, type StockBooks } from 'src/stock/load-stock-books';
import {
  buildStockMonthReport,
  valueStockMovements,
} from 'src/stock/stock-ledger';
import { monthLabel, shiftMonth } from 'src/stock/stock-views';
import { formatDayMonth, formatMoney, formatWhole } from 'src/ui/format';
import {
  Button,
  ErrorNote,
  Hint,
  Panel,
  SkeletonRows,
  StatePill,
  StatTiles,
  Screen,
  TabStrip,
  Tabs,
  usePalette,
  Wrap,
} from 'src/ui/kit';
import { SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';
import { dropKey } from 'src/utils/drop-key';
import { isAccessError } from 'src/utils/is-access-error';
import { randomUuid } from 'src/utils/random-uuid';

type LoadState =
  | { status: 'loading' }
  | { status: 'forbidden' }
  | { status: 'error' }
  | { status: 'ready'; books: MoneyBooks; stock: StockBooks | null };

type ReadyOrders =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; orders: ReadyOrderRecord[] };

type Tab = 'cash' | 'profit' | 'regular';

type Errors = Record<string, string>;

type OpenSheet =
  | { kind: 'record'; draft: RecordDraft; errors: Errors }
  | { kind: 'recount'; draft: RecountDraft; errors: Errors }
  | { kind: 'recurring'; draft: RecurringDraft; errors: Errors }
  | { kind: 'pay'; draft: PayRecurringDraft; errors: Errors }
  | { kind: 'handover'; draft: HandoverDraft; errors: Errors };

const TABS: { value: Tab; label: string }[] = [
  { value: 'cash', label: 'Касса' },
  { value: 'profit', label: 'Прибыль' },
  { value: 'regular', label: 'Постоянные' },
];

const SCREEN_MAX_WIDTH = 1080;
// As in the mockup: two columns from this width, one under another below it.
const TWO_COLUMNS_FROM = 860;
const NO_ACCESS = '«Деньги» видит только владелец';
const LOAD_FAILED =
  'Не удалось загрузить деньги. Проверьте интернет и нажмите "Повторить"';
const SAVE_FAILED =
  'Не удалось сохранить. Проверьте интернет и нажмите "Повторить"';
const WALLET_HINTS: Record<Wallet, string> = {
  CASH: 'ещё не пересчитано',
  CARD: 'Uzcard / Humo',
  ACCOUNT: 'перечисления',
};
const WALLET_TITLES: Record<Wallet, string> = {
  CASH: 'Наличные',
  CARD: 'Карта',
  ACCOUNT: 'Счёт',
};

const loadState = async (): Promise<LoadState> => {
  try {
    const client = new CoreApiClient();
    const books = await loadMoneyBooks(client);
    // Profit still shows without the shelf; the shelf's losses are then left
    // out, not guessed.
    const stock = await loadStockBooks(client, true).catch((error) => {
      console.error(error);

      return null;
    });

    return { status: 'ready', books, stock };
  } catch (error) {
    console.error(error);

    return isAccessError(error) ? { status: 'forbidden' } : { status: 'error' };
  }
};

const Columns = ({
  isWide,
  left,
  right,
}: {
  isWide: boolean;
  left: ReactNode;
  right: ReactNode;
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: isWide ? 'minmax(0, 1.25fr) minmax(0, 1fr)' : '100%',
      gap: SPACE.md + 2,
      alignItems: 'start',
    }}
  >
    <div>{left}</div>
    <div>{right}</div>
  </div>
);

const Inside = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: 'grid',
      gap: SPACE.md,
      padding: `0 ${SPACE.lg}px ${SPACE.lg}px`,
    }}
  >
    {children}
  </div>
);

const RecurringRow = ({
  item,
  badge,
  isDue,
  onEdit,
  onPay,
}: {
  item: RecurringRecord;
  badge: { tone: 'success' | 'warning' | 'danger'; text: string };
  isDue: boolean;
  onEdit: () => void;
  onPay: () => void;
}) => {
  const colors = usePalette();

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: SPACE.md,
        padding: `${SPACE.md}px 0`,
        borderTop: `1px solid ${colors.border}`,
      }}
    >
      <button
        type="button"
        onClick={onEdit}
        style={{
          minWidth: 0,
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: colors.text,
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        <b>{item.name}</b>
        <div style={{ ...TYPE.label, color: colors.muted }}>
          {`${item.dayOfMonth ?? 1} числа, ${WALLET_TITLES[item.wallet ?? 'CASH'].toLowerCase()}`}
        </div>
      </button>
      <div
        style={{
          display: 'grid',
          justifyItems: 'end',
          gap: SPACE.xs,
          marginLeft: 'auto',
          textAlign: 'right',
        }}
      >
        <span style={TABULAR_NUMBERS}>{formatWhole(item.amount ?? 0)}</span>
        <StatePill tone={badge.tone} text={badge.text} />
        {isDue ? (
          <Button variant="link" onClick={onPay}>
            Оплачено
          </Button>
        ) : null}
      </div>
    </div>
  );
};

const Money = () => {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [tab, setTab] = useState<Tab>('cash');
  const [month, setMonth] = useState(() => todayInTashkent().slice(0, 7));
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [readyOrders, setReadyOrders] = useState<Record<string, ReadyOrders>>(
    {},
  );
  const [busyKeys, setBusyKeys] = useState<string[]>([]);
  const [failures, setFailures] = useState<Record<string, () => void>>({});
  const { ref: widthRef, width } = useElementWidth();
  const inFlight = useRef(new Set<string>());
  const attemptIds = useRef<Record<string, string>>({});

  useEffect(() => {
    void loadState().then(setLoad);
  }, []);

  const attemptId = (key: string) => {
    attemptIds.current[key] ??= randomUuid();

    return attemptIds.current[key];
  };

  const forgetAttempts = (prefix: string) => {
    attemptIds.current = Object.fromEntries(
      Object.entries(attemptIds.current).filter(
        ([key]) => !key.startsWith(prefix),
      ),
    );
  };

  const run = async (key: string, action: () => Promise<void>) => {
    if (inFlight.current.has(key)) return;

    inFlight.current.add(key);
    setBusyKeys([...inFlight.current]);
    setFailures((current) => dropKey(current, key));

    try {
      await action();
    } catch (error) {
      console.error(error);
      setFailures((current) => ({
        ...current,
        [key]: () => void run(key, action),
      }));
    } finally {
      inFlight.current.delete(key);
      setBusyKeys([...inFlight.current]);
    }
  };

  const failureNote = (key: string, retry = failures[key]) =>
    failures[key] ? <ErrorNote text={SAVE_FAILED} onRetry={retry} /> : null;

  const fetchReadyOrders = (forMonth: string, isForced = false) => {
    const known = readyOrders[forMonth];

    if (!isForced && known !== undefined && known.status !== 'error') return;

    setReadyOrders((current) => ({
      ...current,
      [forMonth]: { status: 'loading' },
    }));
    void loadReadyOrders(new CoreApiClient(), forMonth).then(
      (orders) =>
        setReadyOrders((current) => ({
          ...current,
          [forMonth]: { status: 'ready', orders },
        })),
      (error) => {
        console.error(error);
        setReadyOrders((current) => ({
          ...current,
          [forMonth]: { status: 'error' },
        }));
      },
    );
  };

  const changeTab = (next: Tab) => {
    setTab(next);

    if (next === 'profit') fetchReadyOrders(month);
  };

  const changeMonth = (next: string) => {
    setMonth(next);

    if (tab === 'profit') fetchReadyOrders(next);
  };

  const reload = async () => {
    const next = await loadState();

    if (next.status === 'ready') setLoad(next);
  };

  if (load.status === 'loading') {
    return (
      <Screen title="Деньги">
        <SkeletonRows count={5} />
      </Screen>
    );
  }

  if (load.status === 'forbidden') {
    return (
      <Screen title="Деньги">
        <Hint text={NO_ACCESS} />
      </Screen>
    );
  }

  if (load.status === 'error') {
    return (
      <Screen title="Деньги">
        <ErrorNote
          text={LOAD_FAILED}
          onRetry={() => {
            setLoad({ status: 'loading' });
            void loadState().then(setLoad);
          }}
        />
      </Screen>
    );
  }

  const { books, stock } = load;
  const today = todayInTashkent();
  const moves = buildMoneyMoves(books);
  const balances = walletBalances(moves);
  const holders = cashHolders(books);
  const flow = monthFlow(moves, month);
  const isWide = width >= TWO_COLUMNS_FROM;
  const cashRecount = lastRecount(books.entries, 'CASH');
  const activeRecurring = books.recurring
    .filter((item) => item.isActive)
    .sort((left, right) => (left.dayOfMonth ?? 1) - (right.dayOfMonth ?? 1));

  const closeSheet = () => {
    if (sheet === null || inFlight.current.has(sheet.kind)) return;

    setFailures((current) => dropKey(current, sheet.kind));
    forgetAttempts(`${sheet.kind}:`);
    setSheet(null);
    setPhotos([]);
  };

  const open = (next: OpenSheet) => {
    forgetAttempts(`${next.kind}:`);
    setPhotos([]);
    setSheet(next);
  };

  const openRecount = (wallet: Wallet = 'CASH') =>
    open({ kind: 'recount', draft: emptyRecount(wallet), errors: {} });

  const openPay = (item: RecurringRecord) =>
    open({
      kind: 'pay',
      errors: {},
      draft: {
        recurringId: item.id,
        amount: item.amount === null ? '' : formatWhole(item.amount),
        wallet: item.wallet ?? 'CASH',
        date: today,
      },
    });

  const finishSave = async (kind: OpenSheet['kind'], entryDate?: string) => {
    forgetAttempts(`${kind}:`);
    setSheet(null);
    setPhotos([]);

    if (entryDate !== undefined) changeMonth(entryDate.slice(0, 7));

    await reload();
  };

  const saveRecord = (draft: RecordDraft) => {
    const built = buildRecord(draft);

    setSheet({ kind: 'record', draft, errors: built.ok ? {} : built.errors });

    if (!built.ok) return;

    void run('record', async () => {
      await recordMoneyEntry(attemptId('record:entry'), built.data, photos);
      setTab('cash');
      await finishSave('record', built.data.date);
    });
  };

  const recountContext = (wallet: Wallet) => ({
    expected: balances.get(wallet) ?? 0,
    isFirst: lastRecount(books.entries, wallet) === null,
  });

  const saveRecount = (draft: RecountDraft) => {
    const built = buildRecount({
      draft,
      today,
      ...recountContext(draft.wallet),
    });

    setSheet({ kind: 'recount', draft, errors: built.ok ? {} : built.errors });

    if (!built.ok) return;

    void run('recount', async () => {
      const client = new CoreApiClient();

      for (const [index, entry] of built.data.entries()) {
        await createMoneyEntry(client, attemptId(`recount:${index}`), entry);
      }

      await finishSave('recount');
    });
  };

  const saveRecurring = (draft: RecurringDraft) => {
    const built = buildRecurring(draft);

    setSheet({
      kind: 'recurring',
      draft,
      errors: built.ok ? {} : built.errors,
    });

    if (!built.ok) return;

    void run('recurring', async () => {
      await saveRecurringExpense(
        new CoreApiClient(),
        draft.id ?? attemptId('recurring:record'),
        built.data,
        draft.id === null,
      );
      setTab('regular');
      await finishSave('recurring');
    });
  };

  const stopRecurring = (recurringId: string) =>
    void run('recurring', async () => {
      await stopRecurringExpense(new CoreApiClient(), recurringId);
      await finishSave('recurring');
    });

  const payRecurring = (draft: PayRecurringDraft) => {
    const item = books.recurring.find((one) => one.id === draft.recurringId);

    if (item === undefined) return;

    const built = buildRecurringPayment(draft, item);

    setSheet({ kind: 'pay', draft, errors: built.ok ? {} : built.errors });

    if (!built.ok) return;

    void run('pay', async () => {
      await createMoneyEntry(
        new CoreApiClient(),
        attemptId('pay:entry'),
        built.data,
      );
      await finishSave('pay');
    });
  };

  const saveHandover = (draft: HandoverDraft) => {
    const built = buildHandover(draft, holders);

    setSheet({ kind: 'handover', draft, errors: built.ok ? {} : built.errors });

    if (!built.ok) return;

    void run('handover', async () => {
      await createMoneyEntry(
        new CoreApiClient(),
        attemptId('handover:entry'),
        built.data,
      );
      await finishSave('handover', built.data.date);
    });
  };

  const monthPicker = (
    <Wrap>
      <Button
        label="Прошлый месяц"
        onClick={() => changeMonth(shiftMonth(month, -1))}
      >
        ‹
      </Button>
      <span style={{ fontWeight: 600 }}>{monthLabel(month)}</span>
      <Button
        label="Следующий месяц"
        onClick={() => changeMonth(shiftMonth(month, 1))}
      >
        ›
      </Button>
      <Button
        variant="primary"
        onClick={() =>
          open({ kind: 'record', draft: emptyRecord(today), errors: {} })
        }
      >
        + Записать
      </Button>
    </Wrap>
  );

  const renderCash = () => {
    const days = ledgerDays(moves, month, filter);

    return (
      <Columns
        isWide={isWide}
        left={
          <>
            <Panel
              title="Где деньги сейчас"
              action={
                <Button onClick={() => openRecount()}>Пересчитать кассу</Button>
              }
            >
              <Inside>
                <StatTiles
                  tiles={[
                    ...(['CASH', 'CARD', 'ACCOUNT'] as const).map((wallet) => {
                      const recount = wallet === 'CASH' ? cashRecount : null;

                      return {
                        label: WALLET_TITLES[wallet],
                        value: formatWhole(balances.get(wallet) ?? 0),
                        tone: 'neutral' as const,
                        hint:
                          recount === null
                            ? WALLET_HINTS[wallet]
                            : `пересчитано ${formatDayMonth(recount.date)}`,
                      };
                    }),
                    ...holders.map((holder) => ({
                      label: `У ${holder.name}`,
                      value: formatWhole(holder.amount),
                      tone: 'warning' as const,
                      hint:
                        holder.since === null
                          ? 'не сдал'
                          : `держит с ${formatDayMonth(holder.since)}`,
                    })),
                  ]}
                />
                {holders.length > 0 ? (
                  <Wrap>
                    <Button
                      onClick={() =>
                        open({
                          kind: 'handover',
                          errors: {},
                          draft: {
                            workerId: holders[0]?.workerId ?? '',
                            amount: formatWhole(holders[0]?.amount ?? 0),
                            wallet: 'CASH',
                            date: today,
                          },
                        })
                      }
                    >
                      Сдал деньги
                    </Button>
                  </Wrap>
                ) : null}
                <StatTiles
                  isTinted
                  // A signed month sum needs a full line on a phone.
                  minTileWidth={150}
                  tiles={[
                    {
                      label: 'Пришло за месяц',
                      value: signed(flow.in),
                      tone: 'in',
                    },
                    {
                      label: 'Ушло за месяц',
                      value: signed(-flow.out),
                      tone: 'out',
                    },
                    {
                      label: 'Разница',
                      value: signed(flow.net),
                      tone: 'neutral',
                    },
                  ]}
                />
              </Inside>
            </Panel>
            <Panel title="По неделям">
              <Inside>
                <WeeklyChart weeks={weeklyFlow(moves, month)} />
              </Inside>
            </Panel>
          </>
        }
        right={
          <Panel title="Движение денег" subtitle="все записи за месяц">
            <Inside>
              <Tabs
                value={filter}
                options={LEDGER_FILTERS}
                onChange={setFilter}
              />
              {days.length === 0 ? (
                <MutedNote text="В этом месяце записей нет" />
              ) : (
                <Ledger days={days} />
              )}
            </Inside>
          </Panel>
        }
      />
    );
  };

  const renderProfit = () => {
    const ready = readyOrders[month];

    if (ready === undefined || ready.status === 'loading') {
      return <SkeletonRows count={6} />;
    }

    if (ready.status === 'error') {
      return (
        <ErrorNote
          text={LOAD_FAILED}
          onRetry={() => fetchReadyOrders(month, true)}
        />
      );
    }

    const profit = buildProfit({
      month,
      readyOrders: ready.orders,
      accruals: books.accruals,
      entries: books.entries,
      moves,
      stock:
        stock === null
          ? null
          : buildStockMonthReport(valueStockMovements(stock.movements), month),
    });
    const minus = (amount: number) => signed(-amount);
    const rows: StatementRow[] = [
      {
        label: `Выручка: ${profit.readyCount} заказов дошли до «Готов»`,
        amount: formatWhole(profit.revenue),
      },
      {
        label: 'Материал по этим заказам',
        amount: minus(profit.material),
        kind: 'part',
      },
      { label: 'ЗП по этим заказам', amount: minus(profit.pay), kind: 'part' },
      {
        label: 'Заработали на заказах',
        amount: formatWhole(profit.earned),
        kind: 'sum',
      },
      ...profit.expenses.map((line) => ({
        label: line.label,
        amount: minus(line.amount),
        kind: 'part' as const,
      })),
      ...(profit.fixedPay > 0
        ? [
            {
              label: 'ЗП без заказа (оклады)',
              amount: minus(profit.fixedPay),
              kind: 'part' as const,
            },
          ]
        : []),
      ...(profit.stockLosses > 0
        ? [
            {
              label: 'Потери на складе: брак, отходы, сверх нормы',
              amount: minus(profit.stockLosses),
              kind: 'part' as const,
            },
          ]
        : []),
      ...(profit.workshopUse > 0
        ? [
            {
              label: 'Материал для цеха',
              amount: minus(profit.workshopUse),
              kind: 'part' as const,
            },
          ]
        : []),
      {
        label: 'Чистая прибыль',
        amount: signed(profit.profit),
        kind: 'total',
        tone: profit.profit >= 0 ? 'in' : 'out',
      },
    ];
    const share = profit.earned > 0 ? profit.overhead / profit.earned : null;

    return (
      <Columns
        isWide={isWide}
        left={
          <Panel
            title={`Прибыль за ${monthLabel(month).toLowerCase()}`}
            subtitle="по готовым заказам"
          >
            <Inside>
              <Statement rows={rows} />
              <MutedNote text="«Взял себе» сюда не входит: это не расход бизнеса, а ваша доля из прибыли." />
            </Inside>
          </Panel>
        }
        right={
          <>
            <Panel
              title={`Почему касса за месяц ${signed(profit.cashNet)}, а прибыль ${signed(profit.profit)}`}
            >
              <Inside>
                <Statement
                  isSmall
                  rows={[
                    {
                      label: 'Чистая прибыль',
                      amount: formatWhole(profit.profit),
                    },
                    ...profit.bridge.map((line) => ({
                      label: line.label,
                      amount: signed(line.amount),
                      kind: 'part' as const,
                    })),
                    {
                      label: 'Разница в кассе',
                      amount: formatWhole(profit.cashNet),
                      kind: 'sum',
                    },
                  ]}
                />
              </Inside>
            </Panel>
            <Panel title="Расходы без заказов">
              <Inside>
                <MutedNote
                  text={`${formatWhole(profit.overhead)} за месяц. Это сколько надо заработать на заказах, чтобы выйти в ноль.`}
                />
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      ...TYPE.label,
                    }}
                  >
                    <span>Заработали на заказах</span>
                    <span style={TABULAR_NUMBERS}>
                      {formatWhole(profit.earned)}
                    </span>
                  </div>
                  <ShareBar share={share ?? 1} />
                </div>
                <MutedNote
                  text={
                    share === null
                      ? 'Готовые заказы за месяц пока ничего не заработали.'
                      : share > 1
                        ? `Расходы без заказов больше заработка на ${formatMoney(profit.overhead - profit.earned)}.`
                        : `${Math.round(share * 100)}% заработка ушло на расходы без заказов.`
                  }
                />
              </Inside>
            </Panel>
            {profit.missing.length > 0 ? (
              <WarningNote
                lead="Прибыль может выйти больше настоящей."
                lines={profit.missing}
              />
            ) : null}
          </>
        }
      />
    );
  };

  const renderRegular = () => (
    <Columns
      isWide={isWide}
      left={
        <Panel
          title="Постоянные расходы"
          action={
            <Button
              variant="primary"
              onClick={() =>
                open({
                  kind: 'recurring',
                  draft: emptyRecurring(),
                  errors: {},
                })
              }
            >
              + Добавить
            </Button>
          }
        >
          <Inside>
            <MutedNote text="Каждый месяц в нужный день появляются на «Сегодня» с кнопкой «Оплачено»." />
            {activeRecurring.length === 0 ? (
              <MutedNote text="Пока ничего нет. Добавьте аренду, оклады, связь." />
            ) : (
              <div>
                {activeRecurring.map((item) => {
                  const state = recurringState(item, books.entries, today);

                  return (
                    <RecurringRow
                      key={item.id}
                      item={item}
                      badge={recurringBadge(state)}
                      isDue={state.status === 'due'}
                      onEdit={() =>
                        open({
                          kind: 'recurring',
                          errors: {},
                          draft: {
                            id: item.id,
                            name: item.name,
                            amount:
                              item.amount === null
                                ? ''
                                : formatWhole(item.amount),
                            dayOfMonth: String(item.dayOfMonth ?? ''),
                            wallet: item.wallet ?? 'CASH',
                            category: (item.category ?? '') as
                              ExpenseCategory | '',
                          },
                        })
                      }
                      onPay={() => openPay(item)}
                    />
                  );
                })}
              </div>
            )}
          </Inside>
        </Panel>
      }
      right={
        <Panel
          title="Последний пересчёт кассы"
          action={<Button onClick={() => openRecount()}>Пересчитать</Button>}
        >
          <Inside>
            <MutedNote text="Раз в неделю считаете наличные. Если не сходится, разница записывается отдельной строкой, и видно, сколько денег «потерялось»." />
            {cashRecount === null ? (
              <MutedNote text="Ещё не пересчитывали." />
            ) : cashRecount.isOpening ? (
              <>
                <Statement
                  rows={[
                    {
                      label: `Насчитали ${formatDayMonth(cashRecount.date)}, в первый раз`,
                      amount: formatWhole(cashRecount.counted),
                      kind: 'sum',
                    },
                  ]}
                />
                <MutedNote text="С этой суммы касса начала считаться. Следующий пересчёт сравнит наличные с записями." />
              </>
            ) : (
              <>
                <Statement
                  rows={[
                    {
                      label: `По записям должно было быть на ${formatDayMonth(cashRecount.date)}`,
                      amount: formatWhole(cashRecount.expected),
                    },
                    {
                      label: 'Насчитали',
                      amount: formatWhole(cashRecount.counted),
                    },
                    {
                      label: 'Разница',
                      amount: signed(cashRecount.difference),
                      kind: 'sum',
                      tone:
                        cashRecount.difference < 0
                          ? 'out'
                          : cashRecount.difference > 0
                            ? 'in'
                            : undefined,
                    },
                  ]}
                />
                <MutedNote text="Обычно это забытый расход. Его можно внести при пересчёте или списать как «Не нашли»." />
              </>
            )}
          </Inside>
        </Panel>
      }
    />
  );

  const renderSheet = () => {
    if (sheet === null) return null;

    const isSaving = busyKeys.includes(sheet.kind);
    // What is being saved was read at the press.
    const isLocked = inFlight.current.has(sheet.kind);

    if (sheet.kind === 'record') {
      return (
        <RecordSheet
          draft={sheet.draft}
          errors={sheet.errors}
          orders={stock?.orders ?? []}
          photoNames={photos.map((photo) => photo.name)}
          isSaving={isSaving}
          failure={failureNote('record', () => saveRecord(sheet.draft))}
          onChange={(draft) => {
            if (!isLocked) setSheet({ ...sheet, draft });
          }}
          onPickPhotos={setPhotos}
          onSave={() => saveRecord(sheet.draft)}
          onClose={closeSheet}
        />
      );
    }

    if (sheet.kind === 'recount') {
      const context = recountContext(sheet.draft.wallet);

      return (
        <RecountSheet
          draft={sheet.draft}
          errors={sheet.errors}
          expected={context.expected}
          isFirst={context.isFirst}
          isSaving={isSaving}
          failure={failureNote('recount', () => saveRecount(sheet.draft))}
          onChange={(draft) => {
            if (!isLocked) setSheet({ ...sheet, draft });
          }}
          onSave={() => saveRecount(sheet.draft)}
          onClose={closeSheet}
        />
      );
    }

    if (sheet.kind === 'recurring') {
      const recurringId = sheet.draft.id;

      return (
        <RecurringSheet
          draft={sheet.draft}
          errors={sheet.errors}
          isSaving={isSaving}
          failure={failureNote('recurring', () => saveRecurring(sheet.draft))}
          onChange={(draft) => {
            if (!isLocked) setSheet({ ...sheet, draft });
          }}
          onSave={() => saveRecurring(sheet.draft)}
          onStop={
            recurringId === null ? undefined : () => stopRecurring(recurringId)
          }
          onClose={closeSheet}
        />
      );
    }

    if (sheet.kind === 'pay') {
      const item = books.recurring.find(
        (one) => one.id === sheet.draft.recurringId,
      );

      return (
        <PayRecurringSheet
          title={item?.name ?? 'Оплачено'}
          draft={sheet.draft}
          errors={sheet.errors}
          isSaving={isSaving}
          failure={failureNote('pay', () => payRecurring(sheet.draft))}
          onChange={(draft) => {
            if (!isLocked) setSheet({ ...sheet, draft });
          }}
          onSave={() => payRecurring(sheet.draft)}
          onClose={closeSheet}
        />
      );
    }

    return (
      <HandoverSheet
        draft={sheet.draft}
        errors={sheet.errors}
        holders={holders}
        isSaving={isSaving}
        failure={failureNote('handover', () => saveHandover(sheet.draft))}
        onChange={(draft) => {
          if (isLocked) return;

          const holder = holders.find((one) => one.workerId === draft.workerId);

          setSheet({
            ...sheet,
            // Picking another worker offers all the cash that worker holds.
            draft:
              draft.workerId !== sheet.draft.workerId && holder !== undefined
                ? { ...draft, amount: formatWhole(holder.amount) }
                : draft,
          });
        }}
        onSave={() => saveHandover(sheet.draft)}
        onClose={closeSheet}
      />
    );
  };

  return (
    <Screen
      title="Деньги"
      subtitle="Всё, что уже вносится в заказах, ЗП и на складе, попадает сюда само."
      maxWidth={SCREEN_MAX_WIDTH}
      action={monthPicker}
    >
      <div ref={widthRef}>
        <TabStrip value={tab} options={TABS} onChange={changeTab} />
        <div style={{ height: SPACE.lg + 2 }} />
        {tab === 'cash' ? renderCash() : null}
        {tab === 'profit' ? renderProfit() : null}
        {tab === 'regular' ? renderRegular() : null}
      </div>
      {renderSheet()}
    </Screen>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.money.frontComponent,
  name: 'money',
  description: 'Деньги: касса, прибыль и постоянные расходы',
  component: Money,
});
