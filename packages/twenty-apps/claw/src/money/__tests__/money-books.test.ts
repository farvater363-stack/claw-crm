import { describe, expect, it } from 'vitest';

import {
  buildMoneyMoves,
  cashHolders,
  type ClientPaymentRecord,
  dueDateIn,
  dueSoon,
  lastRecount,
  ledgerDays,
  type MoneyEntryRecord,
  monthFlow,
  type PayoutRecord,
  type RecurringRecord,
  recurringBadge,
  recurringState,
  walletBalances,
  weeklyFlow,
} from 'src/money/money-books';

const workers = [
  { id: 'avazbek', name: 'AVAZBEK' },
  { id: 'qosimbek', name: 'QOSIMBEK' },
];

const payment = (
  overrides: Partial<ClientPaymentRecord> = {},
): ClientPaymentRecord => ({
  id: 'p1',
  date: '2026-10-08',
  createdAt: '2026-10-08T09:00:00Z',
  amount: 2_400_000,
  method: 'CASH',
  receivedById: null,
  orderId: 'o1',
  orderTitle: '№1012, Алишер Каримов',
  ...overrides,
});

const payout = (overrides: Partial<PayoutRecord> = {}): PayoutRecord => ({
  id: 'w1',
  date: '2026-10-08',
  createdAt: '2026-10-08T10:00:00Z',
  amount: 1_000_000,
  wallet: null,
  kind: 'ADVANCE',
  workerId: 'qosimbek',
  ...overrides,
});

const entry = (overrides: Partial<MoneyEntryRecord> = {}): MoneyEntryRecord => ({
  id: 'e1',
  date: '2026-10-08',
  createdAt: '2026-10-08T11:00:00Z',
  kind: 'EXPENSE',
  amount: 180_000,
  wallet: 'CASH',
  name: 'Бензин, Дамас',
  comment: 'Дамас',
  category: 'FUEL',
  workerId: null,
  orderId: null,
  recurringExpenseId: null,
  countedAmount: null,
  ...overrides,
});

const moves = (books: {
  payments?: ClientPaymentRecord[];
  payouts?: PayoutRecord[];
  entries?: MoneyEntryRecord[];
}) =>
  buildMoneyMoves({
    payments: books.payments ?? [],
    payouts: books.payouts ?? [],
    entries: books.entries ?? [],
    workers,
  });

describe('wallet balances', () => {
  it('puts client payments in the wallet of their method', () => {
    const balances = walletBalances(
      moves({
        payments: [
          payment(),
          payment({ id: 'p2', method: 'CARD', amount: 1_500_000 }),
          payment({ id: 'p3', method: 'TRANSFER', amount: 3_180_000 }),
        ],
      }),
    );

    expect(balances.get('CASH')).toBe(2_400_000);
    expect(balances.get('CARD')).toBe(1_500_000);
    expect(balances.get('ACCOUNT')).toBe(3_180_000);
  });

  it('takes payouts, expenses, draws and supplier payments out of their wallet', () => {
    const balances = walletBalances(
      moves({
        payments: [payment({ amount: 10_000_000 })],
        payouts: [payout()],
        entries: [
          entry(),
          entry({ id: 'e2', kind: 'OWNER_DRAW', amount: 2_000_000 }),
          entry({
            id: 'e3',
            kind: 'SUPPLIER_PAYMENT',
            amount: 3_240_000,
            wallet: 'ACCOUNT',
          }),
        ],
      }),
    );

    expect(balances.get('CASH')).toBe(10_000_000 - 1_000_000 - 180_000 - 2_000_000);
    expect(balances.get('ACCOUNT')).toBe(-3_240_000);
  });

  it('keeps cash a worker took with that worker until he hands it over', () => {
    const books = {
      payments: [payment({ receivedById: 'avazbek' })],
      entries: [
        entry({
          kind: 'HANDOVER',
          amount: 1_400_000,
          workerId: 'avazbek',
          category: null,
          name: null,
        }),
      ],
    };
    const balances = walletBalances(moves(books));

    expect(balances.get('worker:avazbek')).toBe(1_000_000);
    expect(balances.get('CASH')).toBe(1_400_000);
  });

  it('adds a recount difference, below zero too', () => {
    const balances = walletBalances(
      moves({
        payments: [payment({ amount: 8_600_000 })],
        entries: [
          entry({
            kind: 'COUNT_DIFFERENCE',
            amount: -180_000,
            countedAmount: 8_420_000,
            category: null,
          }),
        ],
      }),
    );

    expect(balances.get('CASH')).toBe(8_420_000);
  });
});

describe('month flow', () => {
  const books = {
    payments: [
      payment(),
      payment({ id: 'p0', date: '2026-09-30', amount: 999 }),
      payment({ id: 'p4', receivedById: 'avazbek', amount: 500_000 }),
    ],
    payouts: [payout()],
    entries: [
      entry(),
      entry({
        id: 'open',
        kind: 'OPENING_BALANCE',
        amount: 5_000_000,
        countedAmount: 5_000_000,
        name: null,
        category: null,
      }),
      entry({
        id: 'hand',
        kind: 'HANDOVER',
        amount: 500_000,
        workerId: 'avazbek',
        name: null,
        category: null,
      }),
    ],
  };

  it('counts money in and out of the month, not the opening balance or a handover', () => {
    expect(monthFlow(moves(books), '2026-10')).toEqual({
      in: 2_900_000,
      out: 1_180_000,
      net: 1_720_000,
    });
  });

  it('splits the month into three weeks and the rest', () => {
    const weeks = weeklyFlow(moves(books), '2026-10');

    expect(weeks.map((week) => week.label)).toEqual([
      '1–7',
      '8–14',
      '15–21',
      '22–31',
    ]);
    expect(weeks[1]).toMatchObject({ in: 2_900_000, out: 1_180_000 });
    expect(weeklyFlow([], '2027-02')[3]?.label).toBe('22–28');
  });

  it('lists the newest day first and filters what was typed by hand', () => {
    const days = ledgerDays(moves(books), '2026-10', 'all');

    expect(days.map((day) => day.date)).toEqual(['2026-10-08']);
    expect(days[0]?.moves.map((move) => move.title)).toEqual([
      'Бензин, Дамас',
      'Начальный остаток',
      'Сдал деньги · AVAZBEK',
      'Аванс QOSIMBEK',
      'Оплата №1012, Алишер Каримов',
      'Оплата №1012, Алишер Каримов',
    ]);
    expect(
      ledgerDays(moves(books), '2026-10', 'hand')[0]?.moves.map(
        (move) => move.source,
      ),
    ).toEqual(['hand', 'recount', 'hand']);
    expect(
      ledgerDays(moves(books), '2026-10', 'out')[0]?.moves.map(
        (move) => move.key,
      ),
    ).toEqual(['entry:e1', 'payout:w1']);
  });
});

describe('cashHolders', () => {
  it('says how much each worker holds and since when, the oldest handed over first', () => {
    expect(
      cashHolders({
        workers,
        payments: [
          payment({ id: 'a', date: '2026-10-02', amount: 1_000_000, receivedById: 'avazbek' }),
          payment({ id: 'b', date: '2026-10-06', amount: 2_400_000, receivedById: 'avazbek' }),
          payment({ id: 'c', amount: 700_000 }),
        ],
        entries: [
          entry({ kind: 'HANDOVER', amount: 1_000_000, workerId: 'avazbek' }),
        ],
      }),
    ).toEqual([
      { workerId: 'avazbek', name: 'AVAZBEK', amount: 2_400_000, since: '2026-10-06' },
    ]);
  });

  it('leaves out a worker who handed everything over', () => {
    expect(
      cashHolders({
        workers,
        payments: [payment({ receivedById: 'avazbek' })],
        entries: [
          entry({ kind: 'HANDOVER', amount: 2_400_000, workerId: 'avazbek' }),
        ],
      }),
    ).toEqual([]);
  });
});

describe('lastRecount', () => {
  it('reads what the records said from the count and the difference', () => {
    expect(
      lastRecount(
        [
          entry({
            id: 'old',
            date: '2026-10-01',
            kind: 'OPENING_BALANCE',
            amount: 7_000_000,
            countedAmount: 7_000_000,
          }),
          entry({
            id: 'new',
            date: '2026-10-06',
            kind: 'COUNT_DIFFERENCE',
            amount: -180_000,
            countedAmount: 8_420_000,
          }),
          entry({ id: 'card', wallet: 'CARD', kind: 'COUNT_DIFFERENCE', amount: 0, countedAmount: 1 }),
        ],
        'CASH',
      ),
    ).toEqual({
      date: '2026-10-06',
      wallet: 'CASH',
      counted: 8_420_000,
      expected: 8_600_000,
      difference: -180_000,
      isOpening: false,
    });
    expect(lastRecount([], 'CASH')).toBeNull();
  });
});

describe('recurring expenses', () => {
  const rent: RecurringRecord = {
    id: 'rent',
    name: 'Аренда цеха',
    amount: 4_000_000,
    dayOfMonth: 5,
    wallet: 'CASH',
    category: 'RENT',
    isActive: true,
  };
  const salary: RecurringRecord = {
    ...rent,
    id: 'salary',
    name: 'Оклад замерщика',
    dayOfMonth: 10,
  };

  it('is paid this month once an entry points to it', () => {
    const state = recurringState(
      rent,
      [entry({ date: '2026-10-05', recurringExpenseId: 'rent', amount: 4_000_000 })],
      '2026-10-08',
    );

    expect(state).toEqual({ status: 'paid', paidOn: '2026-10-05', amount: 4_000_000 });
    expect(recurringBadge(state)).toEqual({ tone: 'success', text: 'оплачено 5 октября' });
  });

  it('counts the days to the due date, or past it', () => {
    expect(recurringBadge(recurringState(salary, [], '2026-10-08'))).toEqual({
      tone: 'warning',
      text: 'через 2 дня',
    });
    expect(recurringBadge(recurringState(salary, [], '2026-10-10'))).toEqual({
      tone: 'warning',
      text: 'сегодня',
    });
    expect(recurringBadge(recurringState(rent, [], '2026-10-08'))).toEqual({
      tone: 'danger',
      text: 'просрочено на 3 дня',
    });
  });

  it('moves a day past the end of a short month to its last day', () => {
    expect(dueDateIn('2027-02', 31)).toBe('2027-02-28');
  });

  it('lists for «Сегодня» the unpaid ones due within three days, the latest overdue first', () => {
    const internet = { ...rent, id: 'net', dayOfMonth: 15 };
    const stopped = { ...rent, id: 'old', isActive: false };

    expect(
      dueSoon([internet, salary, rent, stopped], [], '2026-10-08').map(
        (row) => row.item.id,
      ),
    ).toEqual(['rent', 'salary']);
  });
});
