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
  describePayRule,
  isAllowedPayRulePair,
  PAY_METHOD_UNIT,
  type PayRule,
  type PayWork,
  workLabel,
} from 'src/payroll/pay-rules';
// Type only, as a whole statement: that module imports node:crypto, which must not reach a front component's bundle.
import type { AccrualLine } from 'src/payroll/plan-order-accruals';
import { parseOptionalMoney, parsePositiveNumber, PLAIN_DECIMAL } from 'src/prices/prices-screen';
import {
  designPart,
  kindPart,
  NO_KIND_LABEL,
  isOwnRate,
  NO_KIND_PART,
  RULE_PART,
  type WorkshopCatalog,
} from 'src/payroll/workshop-pay';
import { roundTo } from 'src/pricing/round';
import { formatDayMonth, formatMoney, formatQuantity, formatWhole } from 'src/ui/format';
import { type FullName, trimFullName } from 'src/utils/full-name';

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

export const payRuleValue = ({ method, amount, percent }: Pick<PayRule, 'method' | 'amount' | 'percent'>): string =>
  method === 'PERCENT_OF_SALES' ? String(percent ?? '').replace('.', ',') : amount === null ? '' : formatWhole(amount);

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
  firstName,
  lastName,
  categories,
}: FullName & {
  categories: WorkerCategory[];
}): Result<{ data: { fullName: FullName; categories: WorkerCategory[] } }> => {
  const fullName = trimFullName({ firstName, lastName });

  if (fullName.firstName === '') return { ok: false, error: 'Введите имя' };
  if (categories.length === 0) return { ok: false, error: CATEGORY_REQUIRED };

  return { ok: true, data: { fullName, categories } };
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

export type StatementLine = {
  key: string;
  text: string;
  // Signed: what was earned adds, what was paid takes away
  amount: number;
  orderId: string | null;
};

const accrualText = (line: AccrualLine): string => {
  // A line's name starts with its order's number: «№1042 · Установщик · …»
  const order = line.orderId === null ? null : line.name.split(' · ')[0];
  const lead = (words: string) => [order, words].filter(Boolean).join(' · ');

  if (line.method === 'FIXED') return 'Фикса';
  if (line.method === 'BONUS') return lead('премия');
  if (line.method === 'PENALTY') return lead('штраф');
  if (line.method === 'PER_SQUARE_METER') {
    // A workshop line by «Ставки цеха» names its row: «№1042 · Мастер · Кованая 2,1 м² × 50,000»
    const byRow = line.part === null ? '' : line.name.split(' · ').slice(2).join(' · ');

    return lead(byRow || `${formatQuantity(line.basis, 'м²')} × ${formatWhole(line.rate)}`);
  }
  if (line.method === 'PERCENT_OF_SALES') {
    return lead(`${formatQuantity(line.rate, '%')} от ${formatWhole(line.basis)}`);
  }

  return lead(methodWords(line.method));
};

// A worker's month as a page of a ledger: what came over, each thing earned,
// each payment. The lines add up to what is owed.
export const buildStatement = ({
  carriedOver,
  lines,
  payments,
}: Pick<PayrollRow, 'carriedOver' | 'lines' | 'payments'>): StatementLine[] => [
  ...(carriedOver === 0
    ? []
    : [{ key: 'carried', text: 'С прошлого месяца', amount: carriedOver, orderId: null }]),
  ...[...lines]
    .sort((left, right) => left.earnedOn.localeCompare(right.earnedOn) || left.name.localeCompare(right.name, 'ru', { numeric: true }))
    .map((line) => ({ key: line.id, text: accrualText(line), amount: line.amount, orderId: line.orderId })),
  ...[...payments]
    .sort((left, right) => left.paidOn.localeCompare(right.paidOn))
    .map((payment) => ({
      key: payment.id,
      text: [
        formatDayMonth(payment.paidOn),
        MASTER_PAYMENT_KIND_OPTIONS.find((option) => option.value === payment.kind)?.label.toLowerCase(),
      ]
        .filter(Boolean)
        .join(' · '),
      amount: -payment.amount,
      orderId: null,
    })),
];

// A sum with its sign, as in a ledger: «+248,000», «−500,000».
export const signedWhole = (amount: number): string =>
  `${amount < 0 ? '−' : '+'}${formatWhole(Math.abs(amount))}`;

export type PayrollTotals = { owed: number; paid: number; earned: number; carriedOver: number; paidShare: number };

export const payrollTotals = (rows: PayrollRow[]): PayrollTotals => {
  const sum = (pick: (row: PayrollRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  // A worker paid ahead is owed nothing; the advance does not shrink what the others are owed.
  const owed = sum((row) => Math.max(row.owed, 0));
  const paid = sum((row) => row.paidThisMonth);

  return {
    owed,
    paid,
    earned: sum((row) => row.earned),
    carriedOver: sum((row) => row.carriedOver),
    paidShare: paid + owed > 0 ? Math.min(1, Math.max(0, paid / (paid + owed))) : 0,
  };
};

export const totalsSentence = ({ paid, owed, earned, carriedOver }: PayrollTotals): string =>
  [
    `Выплачено ${formatWhole(paid)} из ${formatWhole(paid + owed)}`,
    `начислено за месяц ${formatWhole(earned)}`,
    ...(carriedOver === 0 ? [] : [`с прошлого ${formatWhole(carriedOver)}`]),
  ].join(' · ');

// What is left of a worker's month: a debt to the worker, or what was paid ahead.
export const owedLine = (owed: number): { label: string; amount: string } =>
  owed < 0
    ? { label: 'Выплачено вперёд', amount: formatMoney(-owed) }
    : { label: 'К выплате', amount: formatMoney(owed) };

export type SquareMeterSummaryRow = {
  key: string;
  label: string;
  isOwn: boolean;
  basis: number;
  rate: number;
  amount: number;
};

// A workshop master's month per row of «Ставки цеха»: how many m² of which kind, at what rate.
export const squareMeterSummary = (
  lines: AccrualLine[],
  catalog: WorkshopCatalog,
  workerId: string,
): SquareMeterSummaryRow[] => {
  const groups = new Map<string, SquareMeterSummaryRow>();

  for (const line of lines) {
    if (line.work !== 'MASTER' || line.method !== 'PER_SQUARE_METER') continue;

    const key = `${line.part ?? ''}:${line.rate}`;
    const known = groups.get(key);

    groups.set(key, {
      key,
      label: partLabel(line.part, catalog),
      isOwn: isOwnRate(catalog, workerId, line.part, line.rate),
      basis: roundTo((known?.basis ?? 0) + line.basis, 2),
      rate: line.rate,
      amount: (known?.amount ?? 0) + line.amount,
    });
  }

  return [...groups.values()].sort((left, right) => right.rate - left.rate);
};

export const partLabel = (part: string | null, catalog: WorkshopCatalog): string => {
  if (part === NO_KIND_PART) return NO_KIND_LABEL;
  if (part === RULE_PART) return 'Старая ставка мастера';
  if (part?.startsWith('kind:')) {
    return catalog.kinds.find((kind) => kindPart(kind.id) === part)?.name || 'Удалённый вид';
  }
  if (part?.startsWith('design:')) {
    const design = catalog.designs.find((entry) => designPart(entry.id) === part);

    return design === undefined ? 'Удалённая решётка' : `«${design.name}»`;
  }

  return 'За м²';
};

// «Команда» groups people by what they do; one with two kinds of work is in both.
export const TEAM_GROUPS: { key: string; title: string; roles: WorkerCategory[] }[] = [
  { key: 'workshop', title: 'Цех', roles: ['MASTER'] },
  { key: 'field', title: 'Установка и замер', roles: ['INSTALLER', 'MEASURER'] },
  { key: 'office', title: 'Офис', roles: ['SALES'] },
];

export const groupTeam = <TWorker extends { name: string | null; categories: WorkerCategory[] }>(
  workers: TWorker[],
): { key: string; title: string; workers: TWorker[] }[] => {
  const byName = (left: TWorker, right: TWorker) => (left.name ?? '').localeCompare(right.name ?? '', 'ru');

  return [
    ...TEAM_GROUPS.map(({ key, title, roles }) => ({
      key,
      title,
      workers: workers.filter((worker) => worker.categories.some((category) => roles.includes(category))).sort(byName),
    })),
    {
      key: 'none',
      title: 'Работа не указана',
      workers: workers.filter((worker) => worker.categories.length === 0).sort(byName),
    },
  ].filter((group) => group.workers.length > 0);
};

// A master's rate per m² is set in «Ставки цеха» and nowhere else: his card neither shows nor offers such a rule.
export const isWorkshopRateRule = ({ method, work }: Pick<PayRule, 'method' | 'work'>): boolean =>
  method === 'PER_SQUARE_METER' && work === 'MASTER';

export const cardPayWorksOf = (method: PayMethod): (PayWork | null)[] =>
  payWorksOf(method).filter((work) => !isWorkshopRateRule({ method, work }));

// How many grilles pay this master something, by his own rate or the usual one.
export const masterRatesText = (cells: { rate: number | null }[]): string =>
  `по ставкам цеха · ${cells.filter((cell) => cell.rate !== null).length} из ${cells.length} решёток со ставкой`;

// What a card says on its right: how this person is paid, in words.
export const payLine = ({
  categories,
  rules,
  masterCells,
}: {
  categories: WorkerCategory[];
  rules: PayRule[];
  masterCells: { rate: number | null }[];
}): string =>
  [
    ...(categories.includes('MASTER') ? [masterRatesText(masterCells)] : []),
    ...rules.filter((rule) => !isWorkshopRateRule(rule)).map(describePayRule),
  ].join(' · ');

// What still has to be set up before this person can be paid right.
export const teamGaps = ({
  categories,
  rules,
  masterCells,
  hasLogin,
}: {
  categories: WorkerCategory[];
  rules: PayRule[];
  masterCells: { rate: number | null }[];
  hasLogin: boolean;
}): string[] => {
  const unpaid = masterCells.filter((cell) => cell.rate === null).length;
  const others = categories.filter((category) => category !== 'MASTER');
  const hasRule = rules.some((rule) => !isWorkshopRateRule(rule));

  return [
    ...(categories.includes('MASTER') && unpaid > 0 ? [`решёток без ставки: ${unpaid}`] : []),
    ...(others.length > 0 && !hasRule ? ['не указано, как платим'] : []),
    // A measurer's замеры are counted by the login they were made under.
    ...(categories.includes('MEASURER') && !hasLogin ? ['нет логина'] : []),
  ];
};

// «начислено X · выплачено Y · к выплате Z», or that nothing is owed.
export const monthLine = ({ earned, paidThisMonth, owed }: Pick<PayrollRow, 'earned' | 'paidThisMonth' | 'owed'>): string =>
  owed === 0 && earned === 0 && paidThisMonth === 0
    ? 'в этом месяце ничего'
    : [
        `начислено ${formatWhole(earned)}`,
        `выплачено ${formatWhole(paidThisMonth)}`,
        owed === 0 ? 'расчёт полный' : `${owedLine(owed).label.toLowerCase()} ${owedLine(owed).amount}`,
      ].join(' · ');
