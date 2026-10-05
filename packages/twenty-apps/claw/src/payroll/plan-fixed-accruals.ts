import { type PayRule } from 'src/payroll/pay-rules';
import { formatMonthLabel } from 'src/payroll/payroll-month';
import { type AccrualLine } from 'src/payroll/plan-order-accruals';
import { deterministicUuid } from 'src/utils/deterministic-uuid';

// One line per worker and month whatever his rules are, so a fixed rule
// replaced in the middle of a month cannot add a second line for that month.
export const fixedAccrualId = ({
  workerId,
  month,
}: {
  workerId: string;
  month: string;
}): string => deterministicUuid(`fixed-accrual:${workerId}:${month}`);

// A line that exists is never planned again, so a rule changed in the middle of a month does not change that month.
export const planFixedAccruals = ({
  month,
  workers,
  rules,
  existingIds,
}: {
  month: string;
  workers: { id: string; isActive: boolean }[];
  rules: PayRule[];
  existingIds: string[];
}): AccrualLine[] => {
  const existing = new Set(existingIds);

  return workers.flatMap((worker): AccrualLine[] => {
    const id = fixedAccrualId({ workerId: worker.id, month });

    if (!worker.isActive || existing.has(id)) return [];

    const sum = Math.round(
      rules
        .filter(
          (rule) => rule.method === 'FIXED' && rule.workerId === worker.id,
        )
        .reduce(
          (total, { amount }) =>
            total + (amount !== null && Number.isFinite(amount) ? amount : 0),
          0,
        ),
    );

    // A line of nothing would still close the month for this worker, and a
    // rule saved before its amount was typed would then pay nothing till the next month.
    if (!(sum > 0)) return [];

    return [
      {
        id,
        workerId: worker.id,
        orderId: null,
        earnedOn: `${month}-01`,
        method: 'FIXED',
        work: null,
        basis: 1,
        rate: sum,
        amount: sum,
        name: `Фикса · ${formatMonthLabel(month)}`,
      },
    ];
  });
};
