import { type WorkerCategory } from 'src/constants/select-options';
import { monthOf } from 'src/payroll/payroll-month';
// Type only, as a whole statement: that module imports node:crypto, which must not reach a front component's bundle.
import type { AccrualLine } from 'src/payroll/plan-order-accruals';

export type PayrollWorker = {
  id: string;
  name: string | null;
  isActive: boolean;
  categories: WorkerCategory[];
};

export type PayrollPayment = {
  id: string;
  masterId: string;
  paidOn: string;
  amount: number;
  kind: string | null;
  comment: string | null;
};

export type PayrollRow = {
  workerId: string;
  workerName: string;
  categories: WorkerCategory[];
  isActive: boolean;
  earned: number;
  carriedOver: number;
  paidThisMonth: number;
  owed: number;
  lines: AccrualLine[];
  payments: PayrollPayment[];
};

// One amount that is not a number would turn a worker's whole balance into NaN.
const total = (amounts: { amount: number }[]): number =>
  amounts.reduce((sum, { amount }) => (Number.isFinite(amount) ? sum + amount : sum), 0);

// Computed live from the lines and the payments, so a correction to an old
// order shows in this month's carried balance instead of a stale stored total.
export const computeMonthlyPayroll = ({
  month,
  workers,
  accruals,
  payments,
}: {
  month: string;
  workers: PayrollWorker[];
  accruals: AccrualLine[];
  payments: PayrollPayment[];
}): PayrollRow[] =>
  workers
    .map((worker): PayrollRow => {
      const lines = accruals.filter((line) => line.workerId === worker.id);
      const paid = payments.filter((payment) => payment.masterId === worker.id);
      const monthLines = lines.filter((line) => monthOf(line.earnedOn) === month);
      const monthPayments = paid.filter((payment) => monthOf(payment.paidOn) === month);
      const earned = total(monthLines);
      const paidThisMonth = total(monthPayments);
      const carriedOver =
        total(lines.filter((line) => monthOf(line.earnedOn) < month)) -
        total(paid.filter((payment) => monthOf(payment.paidOn) < month));

      return {
        workerId: worker.id,
        workerName: worker.name ?? '',
        categories: worker.categories,
        isActive: worker.isActive,
        earned,
        carriedOver,
        paidThisMonth,
        owed: carriedOver + earned - paidThisMonth,
        lines: monthLines,
        payments: monthPayments,
      };
    })
    .filter((row) => row.isActive || row.owed !== 0 || row.paidThisMonth !== 0)
    .sort((left, right) => left.workerName.localeCompare(right.workerName, 'ru'));
