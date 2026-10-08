import { describe, expect, it } from 'vitest';

import {
  buildMoneyMoves,
  type MoneyEntryRecord,
} from 'src/money/money-books';
import { buildProfit } from 'src/money/money-profit';
import { type StockMonthReport } from 'src/stock/stock-ledger';

const entry = (overrides: Partial<MoneyEntryRecord>): MoneyEntryRecord => ({
  id: 'e',
  date: '2026-10-05',
  createdAt: '2026-10-05T08:00:00Z',
  kind: 'EXPENSE',
  amount: 0,
  wallet: 'CASH',
  name: null,
  comment: null,
  category: null,
  workerId: null,
  orderId: null,
  recurringExpenseId: null,
  countedAmount: null,
  ...overrides,
});

const stock = (overrides: Partial<StockMonthReport>): StockMonthReport => ({
  opening: 0,
  received: 0,
  receiptCount: 0,
  toOrders: 0,
  overuse: 0,
  orderCount: 0,
  scrap: 0,
  waste: 0,
  recount: 0,
  workshopUse: 0,
  returned: 0,
  otherOut: 0,
  closing: 0,
  losses: 0,
  hasUnpriced: false,
  materials: [],
  ...overrides,
});

const entries = [
  entry({ id: 'rent', amount: 4_000_000, category: 'RENT' }),
  entry({ id: 'fuel', amount: 1_150_000, category: 'FUEL' }),
  entry({ id: 'ads', amount: 900_000, category: 'ADVERTISING' }),
  entry({ id: 'draw', kind: 'OWNER_DRAW', amount: 2_000_000 }),
  entry({
    id: 'supplier',
    kind: 'SUPPLIER_PAYMENT',
    amount: 9_000_000,
    wallet: 'ACCOUNT',
  }),
  entry({ id: 'september', date: '2026-09-30', amount: 777, category: 'RENT' }),
];

const books = {
  // Two orders became ready; one more paid a prepayment
  payments: [
    { id: 'p1', amount: 14_000_000, orderId: 'a' },
    { id: 'p2', amount: 10_600_000, orderId: 'b' },
    { id: 'p3', amount: 7_710_000, orderId: 'c' },
  ].map((payment) => ({
    ...payment,
    date: '2026-10-07',
    createdAt: '2026-10-07T08:00:00Z',
    method: 'CASH' as const,
    receivedById: null,
    orderTitle: null,
  })),
  payouts: [
    {
      id: 'w',
      date: '2026-10-08',
      createdAt: '2026-10-08T08:00:00Z',
      amount: 2_500_000,
      wallet: 'CASH' as const,
      kind: 'SETTLEMENT' as const,
      workerId: 'q',
    },
  ],
  entries,
  workers: [],
};

const profit = buildProfit({
  month: '2026-10',
  readyOrders: [
    { id: 'a', total: 14_000_000, costTotal: 7_000_000 },
    { id: 'b', total: 10_600_000, costTotal: 5_600_000 },
  ],
  accruals: [
    { orderId: 'a', earnedOn: '2026-10-06', amount: 2_000_000 },
    { orderId: 'b', earnedOn: '2026-10-07', amount: 1_700_000 },
    { orderId: 'c', earnedOn: '2026-10-08', amount: 300_000 },
    { orderId: null, earnedOn: '2026-10-01', amount: 1_500_000 },
    { orderId: null, earnedOn: '2026-09-01', amount: 1_500_000 },
  ],
  entries,
  moves: buildMoneyMoves(books),
  stock: stock({ losses: 200_000, overuse: 50_000, workshopUse: 30_000 }),
});

describe('buildProfit', () => {
  it('takes material and pay of the ready orders off their revenue', () => {
    expect(profit).toMatchObject({
      readyCount: 2,
      revenue: 24_600_000,
      material: 8_900_000,
      pay: 3_700_000,
      earned: 12_000_000,
    });
  });

  it('takes off the month expenses by category, fixed pay and losses on the shelf', () => {
    expect(profit.expenses).toEqual([
      { label: 'Аренда', amount: 4_000_000 },
      { label: 'Бензин', amount: 1_150_000 },
      { label: 'Реклама', amount: 900_000 },
    ]);
    expect(profit.fixedPay).toBe(1_500_000);
    expect(profit.stockLosses).toBe(250_000);
    expect(profit.workshopUse).toBe(30_000);
    expect(profit.overhead).toBe(7_830_000);
    expect(profit.profit).toBe(4_170_000);
  });

  it('explains every сум between the profit and the cash difference', () => {
    const explained =
      profit.profit +
      profit.bridge.reduce((sum, line) => sum + line.amount, 0);

    expect(explained).toBe(profit.cashNet);
    expect(profit.cashNet).toBe(32_310_000 - 2_500_000 - 6_050_000 - 2_000_000 - 9_000_000);
    expect(profit.bridge).toEqual([
      {
        label:
          'Предоплаты за заказы, которые ещё не готовы. Это пока деньги клиентов.',
        amount: 7_710_000,
      },
      {
        label: 'Материал ушёл в заказы из того, что купили раньше',
        amount: -9_000_000 + 8_900_000 + 250_000 + 30_000,
      },
      {
        label: 'ЗП начислена, но ещё не выплачена',
        amount: 3_700_000 + 1_500_000 - 2_500_000,
      },
      { label: 'Взял себе', amount: -2_000_000 },
    ]);
  });

  it('says which data is missing', () => {
    expect(
      buildProfit({
        month: '2026-10',
        readyOrders: [{ id: 'a', total: 1_000_000, costTotal: null }],
        accruals: [],
        entries: [],
        moves: [],
        stock: stock({ hasUnpriced: true }),
      }).missing,
    ).toEqual([
      '1 из 1 готовых заказов без цены материала: у решётки нет состава или у материала нет цены закупки.',
      '1 из 1 готовых заказов без начисленной ЗП: у работника нет ставки.',
      'У части материала на складе нет цены закупки, он посчитан как 0.',
    ]);
  });
});
