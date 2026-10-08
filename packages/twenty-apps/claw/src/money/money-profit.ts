import {
  EXPENSE_CATEGORY_OPTIONS,
  type ExpenseCategory,
} from 'src/constants/select-options';
import {
  type MoneyEntryRecord,
  type MoneyMove,
  monthFlow,
} from 'src/money/money-books';
import { type StockMonthReport } from 'src/stock/stock-ledger';

export type ReadyOrderRecord = {
  id: string;
  total: number | null;
  // Material by composition plus the pay lines of the order
  costTotal: number | null;
};

export type AccrualRecord = {
  orderId: string | null;
  earnedOn: string | null;
  amount: number;
};

export type StatementLine = { label: string; amount: number };

export type ProfitStatement = {
  readyCount: number;
  revenue: number;
  material: number;
  pay: number;
  // Revenue minus the material and pay of those orders
  earned: number;
  expenses: StatementLine[];
  // Pay with no order behind it: fixed salaries
  fixedPay: number;
  stockLosses: number;
  workshopUse: number;
  // Everything spent that is not an order's own cost
  overhead: number;
  profit: number;
  cashNet: number;
  // From the profit to the month's cash difference, line by line
  bridge: StatementLine[];
  missing: string[];
};

const dayOf = (entry: MoneyEntryRecord) =>
  (entry.date ?? entry.createdAt).slice(0, 10);

const sumOf = (entries: MoneyEntryRecord[]) =>
  entries.reduce((sum, entry) => sum + entry.amount, 0);

// Revenue counts the orders that reached «Готов» this month, the rule of the
// dashboard; the cash difference is everything that came in and went out.
export const buildProfit = ({
  month,
  readyOrders,
  accruals,
  entries,
  moves,
  stock,
}: {
  month: string;
  readyOrders: ReadyOrderRecord[];
  accruals: AccrualRecord[];
  entries: MoneyEntryRecord[];
  moves: MoneyMove[];
  stock: StockMonthReport | null;
}): ProfitStatement => {
  const payByOrder = new Map<string, number>();

  for (const accrual of accruals) {
    if (accrual.orderId === null) continue;

    payByOrder.set(
      accrual.orderId,
      (payByOrder.get(accrual.orderId) ?? 0) + accrual.amount,
    );
  }

  const orders = readyOrders.map((order) => {
    const pay = payByOrder.get(order.id) ?? 0;

    return {
      revenue: order.total ?? 0,
      pay,
      material: Math.max(0, (order.costTotal ?? 0) - pay),
    };
  });
  const revenue = orders.reduce((sum, order) => sum + order.revenue, 0);
  const material = orders.reduce((sum, order) => sum + order.material, 0);
  const pay = orders.reduce((sum, order) => sum + order.pay, 0);
  const earned = revenue - material - pay;

  const monthEntries = entries.filter((entry) =>
    dayOf(entry).startsWith(month),
  );
  const ofKind = (kind: MoneyEntryRecord['kind']) =>
    monthEntries.filter((entry) => entry.kind === kind);
  const expenseEntries = ofKind('EXPENSE');
  const expenses = EXPENSE_CATEGORY_OPTIONS.map(({ value, label }) => ({
    label,
    amount: sumOf(
      expenseEntries.filter(
        (entry) => (entry.category ?? 'OTHER') === (value as ExpenseCategory),
      ),
    ),
  }))
    .filter((line) => line.amount !== 0)
    .sort((left, right) => right.amount - left.amount);
  const fixedPay = accruals
    .filter(
      (accrual) =>
        accrual.orderId === null && (accrual.earnedOn ?? '').startsWith(month),
    )
    .reduce((sum, accrual) => sum + accrual.amount, 0);
  const stockLosses = stock === null ? 0 : stock.losses + stock.overuse;
  const workshopUse = stock?.workshopUse ?? 0;
  const overhead =
    sumOf(expenseEntries) + fixedPay + stockLosses + workshopUse;
  const profit = earned - overhead;

  const monthMoves = moves.filter((move) => move.date.startsWith(month));
  const flowOf = (source: MoneyMove['source']) =>
    monthMoves
      .filter((move) => move.source === source)
      .reduce((sum, move) => sum + move.flow, 0);
  const cashNet = monthFlow(moves, month).net;
  const clients = flowOf('order') - revenue;
  // Paid to suppliers (a negative flow) against what left the shelf
  const stockBridge = flowOf('stock') + material + stockLosses + workshopUse;
  const payBridge = pay + fixedPay + flowOf('payroll');
  const bridge: StatementLine[] = [
    {
      label:
        clients >= 0
          ? 'Предоплаты за заказы, которые ещё не готовы. Это пока деньги клиентов.'
          : 'Готовые заказы, за которые ещё не заплатили',
      amount: clients,
    },
    {
      label:
        stockBridge <= 0
          ? 'Материал куплен на склад, в заказы ещё не ушёл'
          : 'Материал ушёл в заказы из того, что купили раньше',
      amount: stockBridge,
    },
    {
      label:
        payBridge >= 0
          ? 'ЗП начислена, но ещё не выплачена'
          : 'ЗП выплачена больше, чем начислено за месяц',
      amount: payBridge,
    },
    { label: 'Взял себе', amount: -sumOf(ofKind('OWNER_DRAW')) },
    { label: 'Вложил', amount: sumOf(ofKind('OWNER_DEPOSIT')) },
    { label: 'Другие приходы', amount: sumOf(ofKind('INCOME')) },
    {
      label: 'Разница при пересчёте кассы',
      amount: sumOf(ofKind('COUNT_DIFFERENCE')),
    },
  ].filter((line) => line.amount !== 0);

  const withoutMaterial = orders.filter((order) => order.material === 0).length;
  const withoutPay = orders.filter((order) => order.pay === 0).length;
  const missing = [
    ...(withoutMaterial > 0
      ? [
          `${withoutMaterial} из ${orders.length} готовых заказов без цены материала: у решётки нет состава или у материала нет цены закупки.`,
        ]
      : []),
    ...(withoutPay > 0
      ? [
          `${withoutPay} из ${orders.length} готовых заказов без начисленной ЗП: у работника нет ставки.`,
        ]
      : []),
    ...(stock?.hasUnpriced
      ? ['У части материала на складе нет цены закупки, он посчитан как 0.']
      : []),
  ];

  return {
    readyCount: orders.length,
    revenue,
    material,
    pay,
    earned,
    expenses,
    fixedPay,
    stockLosses,
    workshopUse,
    overhead,
    profit,
    cashNet,
    bridge,
    missing,
  };
};
