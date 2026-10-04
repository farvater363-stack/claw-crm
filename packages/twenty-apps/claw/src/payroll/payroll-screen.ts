import {
  ACCRUAL_METHOD_OPTIONS,
  type AccrualMethod,
  MASTER_PAYMENT_KIND_OPTIONS,
  type PayMethod,
  WORKER_CATEGORY_OPTIONS,
  type WorkerCategory,
} from 'src/constants/select-options';
import { parseDecimalInput } from 'src/measurer-form/measurer-form';
import { type PayrollPayment, type PayrollRow } from 'src/payroll/compute-monthly-payroll';
import {
  isAllowedPayRulePair,
  PAY_METHOD_UNIT,
  type PayRule,
  type PayWork,
  workLabel,
} from 'src/payroll/pay-rules';
// Type only, as a whole statement: that module imports node:crypto, which must not reach a front component's bundle.
import type { AccrualLine } from 'src/payroll/plan-order-accruals';
import { parseOptionalMoney, parsePositiveNumber, PLAIN_DECIMAL } from 'src/prices/prices-screen';
import { formatDayMonth, formatQuantity, formatWhole } from 'src/ui/format';

type Result<TValue> = ({ ok: true } & TValue) | { ok: false; error: string };

export const CATEGORY_REQUIRED = 'Отметьте, кем работает';

const UNNAMED = 'Без имени';
const METHOD_ORDER: AccrualMethod[] = ACCRUAL_METHOD_OPTIONS.map((option) => option.value);
// Methods whose lines carry a rate worth showing; a fixed line, a bonus and a penalty are one sum each.
const RATED_METHODS: readonly AccrualMethod[] = ['PER_SQUARE_METER', 'PER_ORDER', 'PERCENT_OF_SALES', 'PER_MEASUREMENT'];
const WORKS: (PayWork | null)[] = [null, ...WORKER_CATEGORY_OPTIONS.map((option) => option.value)];

const methodWords = (method: AccrualMethod): string =>
  (ACCRUAL_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? '').toLowerCase();

export const payWorksOf = (method: PayMethod): (PayWork | null)[] =>
  WORKS.filter((work) => isAllowedPayRulePair(method, work));

export const payRuleLabel = ({ method, work }: Pick<PayRule, 'method' | 'work'>): string =>
  method === 'FIXED' ? 'Фикса' : `${workLabel(work)} · ${methodWords(method)}`;

export const payRuleSuffix = (method: PayMethod): string =>
  `${method === 'PERCENT_OF_SALES' ? '%' : 'сум'} ${PAY_METHOD_UNIT[method]}`;

export const payRuleValueLabel = (method: PayMethod): string =>
  method === 'PERCENT_OF_SALES' ? 'Процент' : 'Сумма';

// Plain digits, as the field takes them back: a grouped number would be typed over, not edited.
export const payRuleValue = ({ method, amount, percent }: Pick<PayRule, 'method' | 'amount' | 'percent'>): string =>
  method === 'PERCENT_OF_SALES' ? String(percent ?? '').replace('.', ',') : String(amount ?? '');

export const withCategory = (
  categories: WorkerCategory[],
  category: WorkerCategory,
  isChecked: boolean,
): WorkerCategory[] =>
  WORKER_CATEGORY_OPTIONS.map((option) => option.value).filter((value) =>
    value === category ? isChecked : categories.includes(value),
  );

export const rowTitle = ({ workerName, categories }: Pick<PayrollRow, 'workerName' | 'categories'>): string =>
  [workerName || UNNAMED, categories.map(workLabel).join(', ')].filter((part) => part !== '').join(' · ');

export const earnedHeading = (earned: number): string => `За месяц начислено ${formatWhole(earned)}`;

export const carrySentence = ({
  carriedOver,
  paidThisMonth,
}: Pick<PayrollRow, 'carriedOver' | 'paidThisMonth'>): string =>
  `С прошлого месяца ${formatWhole(carriedOver)} · выплачено ${formatWhole(paidThisMonth)}`;

export const paymentText = ({ paidOn, kind, amount }: PayrollPayment): string => {
  const kindWord = MASTER_PAYMENT_KIND_OPTIONS.find((option) => option.value === kind)?.label.toLowerCase();

  return [formatDayMonth(paidOn), kindWord, formatWhole(amount)].filter(Boolean).join(' ');
};

export const summarizeEarned = (lines: AccrualLine[]): string[] => {
  const groups = new Map<string, AccrualLine[]>();

  for (const line of lines) {
    const key = RATED_METHODS.includes(line.method) ? `${line.method}:${line.work}:${line.rate}` : line.method;

    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  return [...groups.values()]
    .sort((left, right) => METHOD_ORDER.indexOf(left[0].method) - METHOD_ORDER.indexOf(right[0].method))
    .map((group) => {
      const [{ method, work, rate }] = group;
      const amount = group.reduce((total, line) => total + line.amount, 0);
      const sum = formatWhole(amount);
      const basis = group.reduce((total, line) => total + line.basis, 0);
      const head = `${workLabel(work)}, ${methodWords(method)}`;

      if (method === 'FIXED') return `Фикса ${sum}`;
      if (method === 'BONUS') return `Премия ${sum}`;
      // Penalty lines are negative; the sign is typed here so it is a real minus, not a hyphen.
      if (method === 'PENALTY') return `Штраф −${formatWhole(Math.abs(amount))}`;
      if (method === 'PER_SQUARE_METER') return `${head}: ${formatQuantity(basis, 'м²')} × ${formatWhole(rate)} = ${sum}`;
      if (method === 'PERCENT_OF_SALES') return `${head}: ${formatQuantity(rate, '%')} от ${formatWhole(basis)} = ${sum}`;

      return `${head}: ${group.length} × ${formatWhole(rate)} = ${sum}`;
    });
};

export const listMonthOrders = (lines: AccrualLine[]): { orderId: string; text: string }[] => {
  const orders = new Map<string, { name: string; area: number | null }>();

  for (const line of lines) {
    if (line.orderId === null) continue;

    const known = orders.get(line.orderId);

    orders.set(line.orderId, {
      // A line's name starts with its order's number: «№1042 · Установщик · …»
      name: known?.name ?? line.name.split(' · ')[0],
      area: line.method === 'PER_SQUARE_METER' ? line.basis : (known?.area ?? null),
    });
  }

  return [...orders]
    .map(([orderId, { name, area }]) => ({
      orderId,
      text: area === null ? name : `${name} ${formatQuantity(area, 'м²')}`,
    }))
    .sort((left, right) => left.text.localeCompare(right.text, 'ru', { numeric: true }));
};

export const buildPayRule = ({
  id,
  workerId,
  method,
  work,
  value,
  existing,
}: {
  id: string;
  workerId: string;
  method: PayMethod;
  work: PayWork | null;
  value: string;
  existing: PayRule[];
}): Result<{ rule: PayRule }> => {
  if (!isAllowedPayRulePair(method, work)) return { ok: false, error: 'Выберите, за что платим' };

  // An order's line is found by its worker, method and work, so two such rules would write one line.
  if (
    existing.some(
      (rule) => rule.id !== id && rule.workerId === workerId && rule.method === method && rule.work === work,
    )
  ) {
    return { ok: false, error: 'Такое правило уже есть' };
  }

  if (method === 'PERCENT_OF_SALES') {
    const percent = parsePositiveNumber(value);

    return percent.ok && percent.value <= 100
      ? { ok: true, rule: { id, workerId, method, work, amount: null, percent: percent.value } }
      : { ok: false, error: 'Введите процент больше 0 и не больше 100' };
  }

  const amount = parseOptionalMoney(value);

  return amount.ok && amount.value !== null && amount.value > 0
    ? { ok: true, rule: { id, workerId, method, work, amount: amount.value, percent: null } }
    : { ok: false, error: 'Введите сумму целым числом больше нуля' };
};

export const buildWorker = ({
  name,
  categories,
}: {
  name: string;
  categories: WorkerCategory[];
}): Result<{ data: { name: string; categories: WorkerCategory[] } }> => {
  if (name.trim() === '') return { ok: false, error: 'Введите имя' };
  if (categories.length === 0) return { ok: false, error: CATEGORY_REQUIRED };

  return { ok: true, data: { name: name.trim(), categories } };
};

export const parsePenaltyPercent = (raw: string): Result<{ value: number }> => {
  const trimmed = raw.trim();
  // Number() alone would also take «1e3» and a signed value.
  const value = PLAIN_DECIMAL.test(trimmed) ? parseDecimalInput(trimmed) : null;

  return value !== null && value <= 100 ? { ok: true, value } : { ok: false, error: 'Введите число от 0 до 100' };
};

// A payment is dated today, so in an earlier month it would leave the shown sum as it was and invite a second one.
export const canPayInMonth = (shownMonth: string, currentMonth: string): boolean => shownMonth >= currentMonth;

// An attempt whose record was read back went through, whatever its answer said:
// the next create under the same id would overwrite that record.
export const storedAttempts = (attempts: Record<string, string>, storedIds: Iterable<string>): string[] => {
  const stored = new Set(storedIds);

  return Object.entries(attempts)
    .filter(([, id]) => stored.has(id))
    .map(([key]) => key);
};

// A record without its worker, date or amount is in no sum, so the screen says how many there are.
export const skippedNote = ({ payments, accruals }: { payments: number; accruals: number }): string | null => {
  const parts = [
    payments > 0
      ? `Не учтено выплат без даты, суммы или работника: ${payments} — исправьте в списке «Выплаты»`
      : null,
    accruals > 0 ? `Не учтено начислений без даты, суммы или работника: ${accruals}` : null,
  ].filter((part) => part !== null);

  return parts.length > 0 ? parts.join('. ') : null;
};
