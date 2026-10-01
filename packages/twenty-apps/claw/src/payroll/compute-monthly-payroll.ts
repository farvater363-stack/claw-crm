import { roundTo } from 'src/pricing/round';
import { monthOf } from 'src/payroll/payroll-month';

export type PayrollOrder = {
  id: string;
  name: string;
  masterId: string;
  readyAt: string;
  status: string;
  areaSquareMeters: number | null;
  masterPayCalculated: number | null;
  masterPenalty: number | null;
  masterBonus: number | null;
  masterPayTotal: number | null;
};

export type PayrollPayment = {
  id: string;
  masterId: string;
  paidOn: string;
  amount: number;
  kind: string | null;
  comment: string | null;
};

type PayrollAmounts = {
  squareMeters: number;
  basePay: number;
  penalty: number;
  bonus: number;
  earned: number;
  paidThisMonth: number;
  carriedOver: number;
  owed: number;
};

export type PayrollRow = PayrollAmounts & {
  masterId: string;
  masterName: string;
  orders: PayrollOrder[];
  payments: PayrollPayment[];
};

const sum = <TItem>(items: TItem[], pick: (item: TItem) => number | null) =>
  items.reduce((total, item) => total + (pick(item) ?? 0), 0);

const EMPTY_AMOUNTS: PayrollAmounts = {
  squareMeters: 0,
  basePay: 0,
  penalty: 0,
  bonus: 0,
  earned: 0,
  paidThisMonth: 0,
  carriedOver: 0,
  owed: 0,
};

// Computed live from orders and payments, so a late correction to an old order
// shows up in this month's carried balance instead of a stale stored total.
export const computeMonthlyPayroll = ({
  month,
  masters,
  orders,
  payments,
}: {
  month: string;
  masters: { id: string; name: string }[];
  orders: PayrollOrder[];
  payments: PayrollPayment[];
}): { rows: PayrollRow[]; totals: PayrollAmounts } => {
  const countedOrders = orders.filter((order) => order.status !== 'CANCELLED');

  const rows = masters
    .map((master): PayrollRow => {
      const masterOrders = countedOrders.filter(
        (order) => order.masterId === master.id,
      );
      const masterPayments = payments.filter(
        (payment) => payment.masterId === master.id,
      );
      const ordersThisMonth = masterOrders.filter(
        (order) => monthOf(order.readyAt) === month,
      );
      const paymentsThisMonth = masterPayments.filter(
        (payment) => monthOf(payment.paidOn) === month,
      );
      const carriedOver =
        sum(
          masterOrders.filter((order) => monthOf(order.readyAt) < month),
          (order) => order.masterPayTotal,
        ) -
        sum(
          masterPayments.filter((payment) => monthOf(payment.paidOn) < month),
          (payment) => payment.amount,
        );
      const earned = sum(ordersThisMonth, (order) => order.masterPayTotal);
      const paidThisMonth = sum(paymentsThisMonth, (payment) => payment.amount);

      return {
        masterId: master.id,
        masterName: master.name,
        squareMeters: roundTo(
          sum(ordersThisMonth, (order) => order.areaSquareMeters),
          2,
        ),
        basePay: sum(
          ordersThisMonth,
          (order) =>
            (order.masterPayCalculated ?? 0) + (order.masterPenalty ?? 0),
        ),
        penalty: sum(ordersThisMonth, (order) => order.masterPenalty),
        bonus: sum(ordersThisMonth, (order) => order.masterBonus),
        earned,
        paidThisMonth,
        carriedOver,
        owed: carriedOver + earned - paidThisMonth,
        orders: ordersThisMonth,
        payments: paymentsThisMonth,
      };
    })
    .filter(
      (row) =>
        row.orders.length > 0 ||
        row.payments.length > 0 ||
        row.carriedOver !== 0,
    )
    .sort((left, right) =>
      left.masterName.localeCompare(right.masterName, 'ru'),
    );

  const totals = rows.reduce<PayrollAmounts>(
    (accumulator, row) => ({
      squareMeters: roundTo(accumulator.squareMeters + row.squareMeters, 2),
      basePay: accumulator.basePay + row.basePay,
      penalty: accumulator.penalty + row.penalty,
      bonus: accumulator.bonus + row.bonus,
      earned: accumulator.earned + row.earned,
      paidThisMonth: accumulator.paidThisMonth + row.paidThisMonth,
      carriedOver: accumulator.carriedOver + row.carriedOver,
      owed: accumulator.owed + row.owed,
    }),
    EMPTY_AMOUNTS,
  );

  return { rows, totals };
};
