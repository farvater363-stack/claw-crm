import {
  type ExpenseCategory,
  expenseCategoryLabel,
  type MasterPaymentKind,
  type MoneyEntryKind,
  type PaymentMethod,
  WALLET_OPTIONS,
  type Wallet,
} from 'src/constants/select-options';
import { formatDayMonth } from 'src/ui/format';
import { daysWord } from 'src/workshop/workshop-board';

// The business's own wallets, or the cash a worker took from a client and has
// not handed over yet.
export type WalletKey = Wallet | `worker:${string}`;

export const workerWallet = (workerId: string): WalletKey =>
  `worker:${workerId}`;

export type ClientPaymentRecord = {
  id: string;
  date: string | null;
  createdAt: string;
  amount: number;
  method: PaymentMethod | null;
  receivedById: string | null;
  orderId: string | null;
  orderTitle: string | null;
};

export type PayoutRecord = {
  id: string;
  date: string | null;
  createdAt: string;
  amount: number;
  wallet: Wallet | null;
  kind: MasterPaymentKind | null;
  workerId: string | null;
};

export type MoneyEntryRecord = {
  id: string;
  date: string | null;
  createdAt: string;
  kind: MoneyEntryKind | null;
  amount: number;
  wallet: Wallet | null;
  name: string | null;
  comment: string | null;
  category: ExpenseCategory | null;
  workerId: string | null;
  orderId: string | null;
  recurringExpenseId: string | null;
  countedAmount: number | null;
};

export type WorkerRecord = { id: string; name: string };

export type MoneySource =
  | 'order'
  | 'payroll'
  | 'stock'
  | 'recurring'
  | 'hand'
  | 'recount';

export type MoneyMove = {
  key: string;
  date: string;
  createdAt: string;
  title: string;
  source: MoneySource;
  // Where the money is, shown under the title
  walletText: string;
  // What it changes in each wallet
  changes: { wallet: WalletKey; amount: number }[];
  // Its part in the month's «Пришло» (above zero) or «Ушло» (below); zero
  // for money moved between wallets
  flow: number;
  // For «Сдал деньги», which is neither in nor out
  amount: number;
};

const PAYMENT_WALLET: Record<PaymentMethod, Wallet> = {
  CASH: 'CASH',
  CARD: 'CARD',
  TRANSFER: 'ACCOUNT',
};

export const walletLabel = (wallet: Wallet | null): string =>
  WALLET_OPTIONS.find((option) => option.value === (wallet ?? 'CASH'))
    ?.label ?? 'Наличные';

const PAYOUT_TITLE: Record<MasterPaymentKind, string> = {
  ADVANCE: 'Аванс',
  SETTLEMENT: 'Расчёт',
};

// An entry without a date is counted on the day it was written down.
const dayOf = (date: string | null, createdAt: string) =>
  (date ?? createdAt).slice(0, 10);

const entryMove = (
  entry: MoneyEntryRecord,
  workerName: (workerId: string | null) => string,
): MoneyMove | null => {
  const wallet = entry.wallet ?? 'CASH';
  const base = {
    key: `entry:${entry.id}`,
    date: dayOf(entry.date, entry.createdAt),
    createdAt: entry.createdAt,
    walletText: walletLabel(wallet),
    amount: Math.abs(entry.amount),
  };
  const out = (title: string, source: MoneySource): MoneyMove => ({
    ...base,
    title,
    source,
    changes: [{ wallet, amount: -entry.amount }],
    flow: -entry.amount,
  });
  const into = (title: string, source: MoneySource): MoneyMove => ({
    ...base,
    title,
    source,
    changes: [{ wallet, amount: entry.amount }],
    flow: entry.amount,
  });

  switch (entry.kind) {
    case 'EXPENSE':
      return out(
        entry.name ?? expenseCategoryLabel(entry.category),
        entry.recurringExpenseId === null ? 'hand' : 'recurring',
      );
    case 'OWNER_DRAW':
      return out(entry.name ?? 'Взял себе', 'hand');
    case 'SUPPLIER_PAYMENT':
      return out(entry.name ?? 'Оплата поставщику', 'stock');
    case 'INCOME':
      return into(entry.name ?? 'Приход', 'hand');
    case 'OWNER_DEPOSIT':
      return into(entry.name ?? 'Вложил', 'hand');
    case 'COUNT_DIFFERENCE':
      return {
        ...into(entry.name ?? 'Разница при пересчёте', 'recount'),
        flow: entry.amount,
      };
    // The money was already there before the app counted it: it is no
    // part of what came in this month.
    case 'OPENING_BALANCE':
      return {
        ...into(entry.name ?? 'Начальный остаток', 'recount'),
        flow: 0,
      };
    case 'HANDOVER':
      return entry.workerId === null
        ? null
        : {
            ...base,
            title: entry.name ?? `Сдал деньги · ${workerName(entry.workerId)}`,
            source: 'hand',
            walletText: `от ${workerName(entry.workerId)} в ${walletLabel(wallet).toLowerCase()}`,
            changes: [
              { wallet: workerWallet(entry.workerId), amount: -entry.amount },
              { wallet, amount: entry.amount },
            ],
            flow: 0,
          };
    default:
      return null;
  }
};

export const buildMoneyMoves = ({
  payments,
  payouts,
  entries,
  workers,
}: {
  payments: ClientPaymentRecord[];
  payouts: PayoutRecord[];
  entries: MoneyEntryRecord[];
  workers: WorkerRecord[];
}): MoneyMove[] => {
  const names = new Map(workers.map((worker) => [worker.id, worker.name]));
  const workerName = (workerId: string | null) =>
    (workerId === null ? null : names.get(workerId)) ?? 'Работник';

  return [
    ...payments.map((payment): MoneyMove => {
      const wallet: WalletKey =
        payment.receivedById === null
          ? PAYMENT_WALLET[payment.method ?? 'CASH']
          : workerWallet(payment.receivedById);

      return {
        key: `payment:${payment.id}`,
        date: dayOf(payment.date, payment.createdAt),
        createdAt: payment.createdAt,
        title: `Оплата ${payment.orderTitle ?? 'заказа'}`,
        source: 'order',
        walletText:
          payment.receivedById === null
            ? walletLabel(PAYMENT_WALLET[payment.method ?? 'CASH'])
            : `у ${workerName(payment.receivedById)}`,
        changes: [{ wallet, amount: payment.amount }],
        flow: payment.amount,
        amount: payment.amount,
      };
    }),
    ...payouts.map(
      (payout): MoneyMove => ({
        key: `payout:${payout.id}`,
        date: dayOf(payout.date, payout.createdAt),
        createdAt: payout.createdAt,
        title: `${payout.kind === null ? 'Выплата' : PAYOUT_TITLE[payout.kind]} ${workerName(payout.workerId)}`,
        source: 'payroll',
        walletText: walletLabel(payout.wallet),
        changes: [{ wallet: payout.wallet ?? 'CASH', amount: -payout.amount }],
        flow: -payout.amount,
        amount: payout.amount,
      }),
    ),
    ...entries.flatMap((entry) => {
      const move = entryMove(entry, workerName);

      return move === null ? [] : [move];
    }),
  ];
};

export const walletBalances = (
  moves: MoneyMove[],
): Map<WalletKey, number> => {
  const balances = new Map<WalletKey, number>();

  for (const move of moves) {
    for (const change of move.changes) {
      balances.set(
        change.wallet,
        (balances.get(change.wallet) ?? 0) + change.amount,
      );
    }
  }

  return balances;
};

const inMonth = (moves: MoneyMove[], month: string) =>
  moves.filter((move) => move.date.startsWith(month));

export type Flow = { in: number; out: number; net: number };

const sumFlow = (moves: MoneyMove[]): Flow => {
  const total = moves.reduce(
    (sum, move) => ({
      in: sum.in + Math.max(0, move.flow),
      out: sum.out + Math.max(0, -move.flow),
    }),
    { in: 0, out: 0 },
  );

  return { ...total, net: total.in - total.out };
};

export const monthFlow = (moves: MoneyMove[], month: string): Flow =>
  sumFlow(inMonth(moves, month));

const lastDayOfMonth = (month: string): number =>
  new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();

// The month in four parts, as in the mockup: three weeks and the rest.
export const weeklyFlow = (
  moves: MoneyMove[],
  month: string,
): ({ label: string } & Flow)[] => {
  const last = lastDayOfMonth(month);
  const weeks = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, last],
  ];

  return weeks.map(([from, to]) => ({
    label: `${from}–${to}`,
    ...sumFlow(
      inMonth(moves, month).filter((move) => {
        const day = Number(move.date.slice(8, 10));

        return day >= from && day <= to;
      }),
    ),
  }));
};

export type LedgerFilter = 'all' | 'in' | 'out' | 'hand';

export const LEDGER_FILTERS: { value: LedgerFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'in', label: 'Приход' },
  { value: 'out', label: 'Расход' },
  { value: 'hand', label: 'Внесено вручную' },
];

const passes = (move: MoneyMove, filter: LedgerFilter) =>
  filter === 'all' ||
  (filter === 'in' && move.flow > 0) ||
  (filter === 'out' && move.flow < 0) ||
  (filter === 'hand' &&
    (move.source === 'hand' ||
      move.source === 'recurring' ||
      move.source === 'recount'));

// Newest day first, and within a day the latest written first.
export const ledgerDays = (
  moves: MoneyMove[],
  month: string,
  filter: LedgerFilter,
): { date: string; moves: MoneyMove[] }[] => {
  const shown = inMonth(moves, month)
    .filter((move) => passes(move, filter))
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) ||
        right.createdAt.localeCompare(left.createdAt),
    );
  const days: { date: string; moves: MoneyMove[] }[] = [];

  for (const move of shown) {
    const day = days[days.length - 1];

    if (day?.date === move.date) day.moves.push(move);
    else days.push({ date: move.date, moves: [move] });
  }

  return days;
};

export type CashHolder = {
  workerId: string;
  name: string;
  amount: number;
  // The day of the oldest payment not yet handed over
  since: string | null;
};

// What each worker holds: the client cash they took minus what they handed
// over, the oldest payments counted as handed over first.
export const cashHolders = ({
  payments,
  entries,
  workers,
}: {
  payments: ClientPaymentRecord[];
  entries: MoneyEntryRecord[];
  workers: WorkerRecord[];
}): CashHolder[] =>
  workers.flatMap((worker) => {
    const taken = payments
      .filter((payment) => payment.receivedById === worker.id)
      .map((payment) => ({
        date: dayOf(payment.date, payment.createdAt),
        amount: payment.amount,
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
    const handed = entries
      .filter(
        (entry) => entry.kind === 'HANDOVER' && entry.workerId === worker.id,
      )
      .reduce((sum, entry) => sum + entry.amount, 0);
    const amount =
      taken.reduce((sum, payment) => sum + payment.amount, 0) - handed;

    if (amount <= 0) return [];

    let covered = handed;
    const since =
      taken.find((payment) => {
        covered -= payment.amount;

        return covered < 0;
      })?.date ?? null;

    return [{ workerId: worker.id, name: worker.name, amount, since }];
  });

export type Recount = {
  date: string;
  wallet: Wallet;
  counted: number;
  expected: number;
  difference: number;
  isOpening: boolean;
};

const isRecount = (entry: MoneyEntryRecord) =>
  (entry.kind === 'COUNT_DIFFERENCE' || entry.kind === 'OPENING_BALANCE') &&
  entry.countedAmount !== null;

export const lastRecount = (
  entries: MoneyEntryRecord[],
  wallet?: Wallet,
): Recount | null => {
  const latest = entries
    .filter(
      (entry) =>
        isRecount(entry) &&
        (wallet === undefined || (entry.wallet ?? 'CASH') === wallet),
    )
    .sort(
      (left, right) =>
        dayOf(right.date, right.createdAt).localeCompare(
          dayOf(left.date, left.createdAt),
        ) || right.createdAt.localeCompare(left.createdAt),
    )[0];

  if (latest === undefined || latest.countedAmount === null) return null;

  return {
    date: dayOf(latest.date, latest.createdAt),
    wallet: latest.wallet ?? 'CASH',
    counted: latest.countedAmount,
    expected: latest.countedAmount - latest.amount,
    difference: latest.amount,
    isOpening: latest.kind === 'OPENING_BALANCE',
  };
};

export type RecurringRecord = {
  id: string;
  name: string;
  amount: number | null;
  dayOfMonth: number | null;
  wallet: Wallet | null;
  category: ExpenseCategory | null;
  isActive: boolean;
};

export type RecurringState =
  | { status: 'paid'; paidOn: string; amount: number }
  | { status: 'due'; dueDate: string; daysLeft: number };

// A day past the month's end falls on its last day: «31 числа» in February.
export const dueDateIn = (month: string, dayOfMonth: number | null): string =>
  `${month}-${String(Math.min(Math.max(dayOfMonth ?? 1, 1), lastDayOfMonth(month))).padStart(2, '0')}`;

const daysFrom = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export const recurringState = (
  recurring: RecurringRecord,
  entries: MoneyEntryRecord[],
  today: string,
): RecurringState => {
  const month = today.slice(0, 7);
  const paid = entries
    .filter(
      (entry) =>
        entry.recurringExpenseId === recurring.id &&
        dayOf(entry.date, entry.createdAt).startsWith(month),
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const first = paid[0];

  if (first !== undefined) {
    return {
      status: 'paid',
      paidOn: dayOf(first.date, first.createdAt),
      amount: paid.reduce((sum, entry) => sum + entry.amount, 0),
    };
  }

  const dueDate = dueDateIn(month, recurring.dayOfMonth);

  return { status: 'due', dueDate, daysLeft: daysFrom(today, dueDate) };
};

// The ones «Сегодня» lists: due within these days or already late this month.
export const DUE_SOON_DAYS = 3;

export const dueSoon = (
  recurring: RecurringRecord[],
  entries: MoneyEntryRecord[],
  today: string,
) =>
  recurring
    .filter((item) => item.isActive)
    .map((item) => ({ item, state: recurringState(item, entries, today) }))
    .filter(
      (
        row,
      ): row is {
        item: RecurringRecord;
        state: Extract<RecurringState, { status: 'due' }>;
      } =>
        row.state.status === 'due' && row.state.daysLeft <= DUE_SOON_DAYS,
    )
    .sort((left, right) => left.state.daysLeft - right.state.daysLeft);

const daysText = (count: number): string => `${count} ${daysWord(count)}`;

export const recurringBadge = (
  state: RecurringState,
): { tone: 'success' | 'warning' | 'danger'; text: string } =>
  state.status === 'paid'
    ? { tone: 'success', text: `оплачено ${formatDayMonth(state.paidOn)}` }
    : state.daysLeft > 0
      ? { tone: 'warning', text: `через ${daysText(state.daysLeft)}` }
      : state.daysLeft === 0
        ? { tone: 'warning', text: 'сегодня' }
        : { tone: 'danger', text: `просрочено на ${daysText(-state.daysLeft)}` };

