import {
  type PayMethod,
  type WorkerCategory,
  WORKER_CATEGORY_OPTIONS,
} from 'src/constants/select-options';
import { formatMoney, formatQuantity } from 'src/ui/format';

export type PayWork = WorkerCategory;

export type PayRule = {
  id: string;
  workerId: string;
  method: PayMethod;
  work: PayWork | null;
  amount: number | null;
  percent: number | null;
};

export type KeptRate = {
  method: 'PER_SQUARE_METER' | 'PER_ORDER';
  rate: number;
};

const ALLOWED_WORKS: Record<PayMethod, readonly (PayWork | null)[]> = {
  FIXED: [null],
  PER_SQUARE_METER: ['MASTER', 'INSTALLER', 'MEASURER'],
  PER_ORDER: ['MASTER', 'INSTALLER', 'MEASURER'],
  PERCENT_OF_SALES: ['SALES'],
  PER_MEASUREMENT: ['MEASURER'],
};

export const isAllowedPayRulePair = (
  method: PayMethod,
  work: PayWork | null,
): boolean => ALLOWED_WORKS[method].includes(work);

export const PAY_METHOD_UNIT: Record<PayMethod, string> = {
  FIXED: 'в месяц',
  PER_SQUARE_METER: 'за м²',
  PER_ORDER: 'за заказ',
  PERCENT_OF_SALES: 'от продаж',
  PER_MEASUREMENT: 'за замер',
};

export const workLabel = (work: PayWork | null): string =>
  WORKER_CATEGORY_OPTIONS.find((option) => option.value === work)?.label ?? '';

export const describePayRule = ({
  method,
  work,
  amount,
  percent,
}: Pick<PayRule, 'method' | 'work' | 'amount' | 'percent'>): string => {
  const unit = PAY_METHOD_UNIT[method];

  if (method === 'FIXED') return `Фикса ${formatMoney(amount ?? 0)} ${unit}`;

  const value =
    method === 'PERCENT_OF_SALES'
      ? formatQuantity(percent ?? 0, '%')
      : formatMoney(amount ?? 0);

  return `${workLabel(work)}: ${value} ${unit}`;
};

const ORDER_RATE_METHODS: readonly KeptRate['method'][] = [
  'PER_SQUARE_METER',
  'PER_ORDER',
];

// An order has one accrual line per worker, method and work, so of two rules
// of one method only the first pays; adding both would not match the lines.
const masterRatesOf = (rules: PayRule[]): KeptRate[] =>
  ORDER_RATE_METHODS.flatMap((method) => {
    const first = rules.find(
      (rule) => rule.work === 'MASTER' && rule.method === method,
    );

    return first ? [{ method, rate: first.amount ?? 0 }] : [];
  });

// Pay per m² cannot be counted without the area. The pay on the order and the
// accrual lines both ask this, so an order never shows no pay while lines exist.
export const isAreaMissingForRates = (
  areaSquareMeters: number | null,
  rates: { method: string }[],
): boolean =>
  areaSquareMeters === null &&
  rates.some((rate) => rate.method === 'PER_SQUARE_METER');

// Each part is rounded by itself, as each accrual line is, so the master's
// lines for an order add up to the pay shown on the order.
export const computeMasterBasePay = ({
  rules,
  keptRates,
  areaSquareMeters,
}: {
  rules: PayRule[];
  keptRates: KeptRate[];
  areaSquareMeters: number | null;
}): number | null => {
  const rates = keptRates.length > 0 ? keptRates : masterRatesOf(rules);

  if (isAreaMissingForRates(areaSquareMeters, rates)) return null;

  return rates.reduce((sum, { method, rate }) => {
    const part = Math.round(
      method === 'PER_SQUARE_METER' ? (areaSquareMeters ?? 0) * rate : rate,
    );

    // A NaN never equals itself, so the recalc would rewrite the pay on every run.
    return sum + (Number.isFinite(part) ? part : 0);
  }, 0);
};

export const applyLatePenalty = ({
  basePay,
  penaltyPercentPerDay,
  daysLate,
}: {
  basePay: number;
  penaltyPercentPerDay: number;
  daysLate: number;
}): number =>
  Math.round(
    basePay * Math.max(0, 1 - (penaltyPercentPerDay / 100) * daysLate),
  );
