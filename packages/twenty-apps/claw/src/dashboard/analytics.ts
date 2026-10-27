import { daysBetween } from 'src/clients/call-backs';
import { sourceRowsBetween, type SourceRow } from 'src/clients/marketing';
import {
  isCancelled,
  isInstalled,
  isSold,
  isStatusIn,
  LEAD_STATUSES,
  READY_AT_STATUSES,
} from 'src/constants/order-status-sets';
import { CANCEL_REASON_OPTIONS } from 'src/constants/select-options';
import {
  type DashboardItem,
  type DashboardOrder,
  type DashboardPayment,
} from 'src/dashboard/load-dashboard';
import { addDays } from 'src/pricing/dates';
import { formatDayMonth } from 'src/ui/format';

export type AnalyticsPeriod = 'month' | 'quarter' | 'year';

export const ANALYTICS_PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: '3 месяца' },
  { value: 'year', label: 'Год' },
];

const PERIOD_MONTHS: Record<AnalyticsPeriod, number> = {
  month: 1,
  quarter: 3,
  year: 12,
};

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const SHORT_MONTH_NAMES = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

// «к сентябрю»
const MONTH_NAMES_DATIVE = [
  'январю',
  'февралю',
  'марту',
  'апрелю',
  'маю',
  'июню',
  'июлю',
  'августу',
  'сентябрю',
  'октябрю',
  'ноябрю',
  'декабрю',
];

const SPARKLINE_MONTHS = 6;

// Days are «YYYY-MM-DD»; a range holds its start and stops before its end.
export type DayRange = { start: string; end: string };

const daysInMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

// The same day so many months away, or the month's last day when it is shorter.
export const addMonths = (day: string, months: number): string => {
  const year = Number(day.slice(0, 4));
  const monthIndex = Number(day.slice(5, 7)) - 1 + months;
  const target = new Date(Date.UTC(year, monthIndex, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth();
  const dayOfMonth = Math.min(
    Number(day.slice(8, 10)),
    daysInMonth(targetYear, targetMonth),
  );

  return new Date(Date.UTC(targetYear, targetMonth, dayOfMonth))
    .toISOString()
    .slice(0, 10);
};

const firstOfMonth = (day: string) => `${day.slice(0, 7)}-01`;

const minDay = (left: string, right: string) => (left < right ? left : right);

export type PeriodRanges = {
  // The whole period, and the part of it that has happened
  whole: DayRange;
  current: DayRange;
  // The period before, cut at the same day when this one is still going
  previous: DayRange;
  isOngoing: boolean;
  label: string;
  compareLabel: string;
};

const monthLabel = (day: string) =>
  `${MONTH_NAMES[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;

const shortMonth = (day: string) =>
  SHORT_MONTH_NAMES[Number(day.slice(5, 7)) - 1];

// Whole calendar months: «3 месяца» is this month and the two before it.
// `offset` steps back (−1) or forward by whole periods.
export const periodRanges = (
  period: AnalyticsPeriod,
  offset: number,
  today: string,
): PeriodRanges => {
  const length = PERIOD_MONTHS[period];
  const start = addMonths(firstOfMonth(today), -(length - 1) + offset * length);
  const end = addMonths(start, length);
  const cutoff = minDay(end, addDays(today, 1));
  const isOngoing = cutoff < end;
  const previousStart = addMonths(start, -length);
  // The same last day a period back, not the day after today shifted: that
  // would lose the 30th of a shorter month.
  const previousEnd = isOngoing ? addDays(addMonths(today, -length), 1) : start;
  const lastMonth = addMonths(end, -1);

  const label =
    period === 'month'
      ? monthLabel(start)
      : `${shortMonth(start)} ${start.slice(0, 4)} – ${shortMonth(lastMonth)} ${lastMonth.slice(0, 4)}`;
  const wholeBefore =
    period === 'month'
      ? `к ${MONTH_NAMES_DATIVE[Number(previousStart.slice(5, 7)) - 1]}`
      : period === 'quarter'
        ? 'к трём месяцам до этого'
        : 'к году до этого';

  return {
    whole: { start, end },
    current: { start, end: cutoff },
    previous: { start: previousStart, end: previousEnd },
    isOngoing,
    label,
    compareLabel: isOngoing
      ? `к ${formatDayMonth(addDays(previousEnd, -1))}`
      : wholeBefore,
  };
};

const isIn = (day: string | null, range: DayRange) =>
  day !== null && day >= range.start && day < range.end;

const sumOf = (values: readonly (number | null)[]): number =>
  values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

const percentOf = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 100);

// The day the client agreed: the order went to the workshop then. Orders
// that skipped the step carry their later dates instead. «Начало» can be typed
// ahead, but a sale is never dated after today.
export const soldOn = (order: DashboardOrder, today: string): string | null =>
  isSold(order.status)
    ? minDay(
        order.productionStart ??
          order.readyAt ??
          order.installedAt ??
          order.createdOn,
        today,
      )
    : null;

// Measured or further on: an order sold without a recorded measurement was
// measured all the same.
const wasMeasured = (order: DashboardOrder) =>
  order.measuredOn !== null ||
  isSold(order.status) ||
  (!isStatusIn(LEAD_STATUSES, order.status) && !isCancelled(order.status));

// An order sent back to the workshop from data before readyAt was cleared on
// the way still carries it.
const readyIn = (orders: readonly DashboardOrder[], range: DayRange) =>
  orders.filter(
    (order) =>
      isStatusIn(READY_AT_STATUSES, order.status) &&
      isIn(order.readyAt, range),
  );

const soldIn = (
  orders: readonly DashboardOrder[],
  range: DayRange,
  today: string,
) => orders.filter((order) => isIn(soldOn(order, today), range));

// A sale with no sum yet would pull the average down as a zero.
export const averageTotal = (
  orders: readonly DashboardOrder[],
): number | null => {
  const totals = orders.flatMap((order) =>
    order.total === null ? [] : [order.total],
  );

  return totals.length === 0
    ? null
    : Math.round(sumOf(totals) / totals.length);
};

// Of the clients measured who have decided, the share that bought.
const decidedConversion = (measured: readonly DashboardOrder[]) => {
  const decided = measured.filter(
    (order) => isSold(order.status) || isCancelled(order.status),
  );

  return percentOf(
    decided.filter((order) => isSold(order.status)).length,
    decided.length,
  );
};

export type MetricKey =
  | 'sold'
  | 'received'
  | 'average'
  | 'conversion'
  | 'area'
  | 'revenue'
  | 'margin'
  | 'onTime';

type Source = {
  orders: readonly DashboardOrder[];
  payments: readonly DashboardPayment[];
  today: string;
};

const METRICS: Record<
  MetricKey,
  (source: Source, range: DayRange) => number | null
> = {
  sold: ({ orders, today }, range) =>
    sumOf(soldIn(orders, range, today).map((order) => order.total)),
  received: ({ payments }, range) =>
    sumOf(
      payments
        .filter((payment) => isIn(payment.paidOn, range))
        .map((payment) => payment.amount),
    ),
  average: ({ orders, today }, range) =>
    averageTotal(soldIn(orders, range, today)),
  conversion: ({ orders }, range) =>
    decidedConversion(
      orders.filter((order) => isIn(order.measuredOn, range)),
    ),
  area: ({ orders }, range) =>
    Math.round(sumOf(readyIn(orders, range).map((order) => order.area)) * 10) /
    10,
  // Mardon's rule: revenue counts the orders that reached «Готов».
  revenue: ({ orders }, range) =>
    sumOf(readyIn(orders, range).map((order) => order.total)),
  // Orders with no margin worked out are left out; see marginCoverage.
  margin: ({ orders }, range) => {
    const counted = readyIn(orders, range).filter(
      (order) => order.margin !== null,
    );

    return counted.length === 0
      ? null
      : sumOf(counted.map((order) => order.margin));
  },
  onTime: ({ orders }, range) => {
    const withDeadline = readyIn(orders, range).filter(
      (order) => order.deadline !== null,
    );

    return percentOf(
      withDeadline.filter(
        (order) => (order.readyAt ?? '') <= (order.deadline ?? ''),
      ).length,
      withDeadline.length,
    );
  },
};

// How many of the period's ready orders the margin was counted over.
export const marginCoverage = (
  orders: readonly DashboardOrder[],
  range: DayRange,
): { counted: number; total: number } => {
  const ready = readyIn(orders, range);

  return {
    counted: ready.filter((order) => order.margin !== null).length,
    total: ready.length,
  };
};

const PERCENT_METRICS: readonly MetricKey[] = ['conversion', 'onTime'];

export type Change =
  | { direction: 'up' | 'down'; text: string }
  | { direction: 'flat'; text: string }
  | null;

// Growth in % for sums and counts, in points for a share. Higher is better
// for every figure here.
export const changeOf = (
  key: MetricKey,
  current: number | null,
  previous: number | null,
): Change => {
  if (current === null || previous === null) return null;

  if (PERCENT_METRICS.includes(key)) {
    const points = current - previous;

    if (points === 0) return { direction: 'flat', text: 'без изменений' };

    return {
      direction: points > 0 ? 'up' : 'down',
      text: `${points > 0 ? '▲' : '▼'} ${Math.abs(points)} п.`,
    };
  }

  if (previous === 0) return null;

  const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);

  if (percent === 0) return { direction: 'flat', text: 'как раньше' };

  return {
    direction: percent > 0 ? 'up' : 'down',
    text: `${percent > 0 ? '▲' : '▼'} ${Math.abs(percent)}%`,
  };
};

export type MetricView = {
  key: MetricKey;
  value: number | null;
  change: Change;
  // One value per month, oldest first, ending with the period's last month
  series: (number | null)[];
};

const monthRanges = (lastMonthStart: string, count: number, today: string) =>
  Array.from({ length: count }, (_, index) => {
    const start = addMonths(lastMonthStart, index - count + 1);

    return {
      start,
      end: minDay(addMonths(start, 1), addDays(today, 1)),
    };
  });

export const buildMetrics = (
  source: Source,
  ranges: PeriodRanges,
  today: string,
): Record<MetricKey, MetricView> => {
  const lastMonthStart = addMonths(ranges.whole.end, -1);
  const months = monthRanges(lastMonthStart, SPARKLINE_MONTHS, today).filter(
    (range) => range.start <= today,
  );

  return Object.fromEntries(
    (Object.keys(METRICS) as MetricKey[]).map((key) => {
      const measure = METRICS[key];
      const value = measure(source, ranges.current);

      return [
        key,
        {
          key,
          value,
          change: changeOf(key, value, measure(source, ranges.previous)),
          series: months.map((range) => measure(source, range)),
        },
      ];
    }),
  ) as Record<MetricKey, MetricView>;
};

export type MonthBar = {
  label: string;
  sold: number;
  received: number;
  isOngoing: boolean;
};

export const buildMonthBars = (
  source: Source,
  ranges: PeriodRanges,
  today: string,
  count: number,
): MonthBar[] =>
  monthRanges(addMonths(ranges.whole.end, -1), count, today)
    .filter((range) => range.start <= today)
    .map((range) => ({
      label: shortMonth(range.start),
      sold: METRICS.sold(source, range) ?? 0,
      received: METRICS.received(source, range) ?? 0,
      isOngoing: range.end < addMonths(range.start, 1),
    }));

export type Funnel = {
  leads: number;
  measured: number;
  sold: number;
  installed: number;
  notMeasured: number;
  refusedAfterMeasure: number;
  thinking: number;
};

// The orders that came in during the period, and how far each one got.
export const buildFunnel = (
  orders: readonly DashboardOrder[],
  range: DayRange,
): Funnel => {
  const leads = orders.filter((order) => isIn(order.createdOn, range));
  const measured = leads.filter(wasMeasured);

  return {
    leads: leads.length,
    measured: measured.length,
    sold: leads.filter((order) => isSold(order.status)).length,
    installed: leads.filter((order) => isInstalled(order.status)).length,
    notMeasured: leads.length - measured.length,
    refusedAfterMeasure: measured.filter((order) => isCancelled(order.status))
      .length,
    thinking: leads.filter((order) => order.status === 'MEASURED').length,
  };
};

export const buildSources = (
  orders: readonly DashboardOrder[],
  range: DayRange,
): SourceRow[] => sourceRowsBetween(orders, range.start, range.end);

export type MeasurerRow = {
  name: string;
  measured: number;
  sold: number;
  conversionPercent: number | null;
  averageOrder: number | null;
};

const NO_MEASURER = 'Не указан';

export const buildMeasurers = (
  orders: readonly DashboardOrder[],
  range: DayRange,
): MeasurerRow[] => {
  const groups = new Map<string, DashboardOrder[]>();

  for (const order of orders) {
    if (!isIn(order.measuredOn, range)) continue;

    const name = order.measurerName ?? NO_MEASURER;

    groups.set(name, [...(groups.get(name) ?? []), order]);
  }

  return [...groups]
    .map(([name, measured]) => {
      const sold = measured.filter((order) => isSold(order.status));

      return {
        name,
        measured: measured.length,
        sold: sold.length,
        // The same share as «Замер → продажа»
        conversionPercent: decidedConversion(measured),
        averageOrder: averageTotal(sold),
      };
    })
    .sort((left, right) => right.measured - left.measured);
};

export type CountRow = { label: string; count: number };

// There is no cancel date; the order's creation date stands in for it.
export const buildRefusals = (
  orders: readonly DashboardOrder[],
  range: DayRange,
): CountRow[] => {
  const counts = new Map<string, number>();

  for (const order of orders) {
    if (!isCancelled(order.status) || !isIn(order.createdOn, range)) continue;

    const label =
      CANCEL_REASON_OPTIONS.find(
        (option) => option.value === order.cancelReason,
      )?.label ?? 'Причина не указана';

    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
};

type DateKey =
  'createdOn' | 'measuredOn' | 'productionStart' | 'readyAt' | 'installedAt';

const STAGES: { label: string; from: DateKey; to: DateKey }[] = [
  { label: 'Заявка → замер', from: 'createdOn', to: 'measuredOn' },
  { label: 'Замер → решение', from: 'measuredOn', to: 'productionStart' },
  { label: 'Делается в цеху', from: 'productionStart', to: 'readyAt' },
  { label: 'Ждёт установку', from: 'readyAt', to: 'installedAt' },
];

export type StageRow = { label: string; days: number | null };

export type StageDays = {
  stages: StageRow[];
  // From the client's yes to the grille on the wall
  decisionToInstall: number | null;
};

const averageDays = (
  orders: readonly DashboardOrder[],
  from: DateKey,
  to: DateKey,
  range: DayRange,
): number | null => {
  const spans = orders.flatMap((order) => {
    const start = order[from];
    const finish = order[to];

    return start !== null && finish !== null && isIn(finish, range)
      ? [Math.max(0, daysBetween(start, finish))]
      : [];
  });

  return spans.length === 0
    ? null
    : Math.round((sumOf(spans) / spans.length) * 10) / 10;
};

// Each step is counted over the orders that finished it during the period.
export const buildStageDays = (
  orders: readonly DashboardOrder[],
  range: DayRange,
): StageDays => {
  const live = orders.filter((order) => !isCancelled(order.status));

  return {
    stages: STAGES.map((stage) => ({
      label: stage.label,
      days: averageDays(live, stage.from, stage.to, range),
    })),
    decisionToInstall: averageDays(
      live,
      'productionStart',
      'installedAt',
      range,
    ),
  };
};

export type GrilleRow = { label: string; amount: number; unit: 'м²' | 'п.м.' };

const NO_GRILLE = 'Решётка не выбрана';
const RAILINGS = 'Перилла';
const GRILLE_ROWS = 6;

const roundTenth = (value: number) => Math.round(value * 10) / 10;

// What the clients who agreed in the period chose: м² of each grille, and
// railings in п.м. on a row of their own, as metres do not add to м².
export const buildGrilles = (
  orders: readonly DashboardOrder[],
  items: readonly DashboardItem[],
  range: DayRange,
  today: string,
): GrilleRow[] => {
  const sold = new Set(soldIn(orders, range, today).map((order) => order.id));
  const areas = new Map<string, number>();
  let railingMeters = 0;

  for (const item of items) {
    if (!sold.has(item.orderId) || item.units <= 0) continue;

    if (item.isRailing) {
      railingMeters += item.units;
      continue;
    }

    const label = item.grilleName ?? NO_GRILLE;

    areas.set(label, (areas.get(label) ?? 0) + item.units);
  }

  const grilles: GrilleRow[] = [...areas]
    .map(([label, area]) => ({
      label,
      amount: roundTenth(area),
      unit: 'м²' as const,
    }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, GRILLE_ROWS);

  return railingMeters > 0
    ? [
        ...grilles,
        { label: RAILINGS, amount: roundTenth(railingMeters), unit: 'п.м.' },
      ]
    : grilles;
};
