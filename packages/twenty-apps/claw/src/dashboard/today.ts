import { buildCallBackLists, daysBetween } from 'src/clients/call-backs';
import { type ClientCard } from 'src/clients/load-clients';
import { isStatusIn, OPEN_STATUSES } from 'src/constants/order-status-sets';
import { type OrderStatus } from 'src/constants/select-options';
import {
  type DashboardOrder,
  type DashboardPayment,
} from 'src/dashboard/load-dashboard';
import { addDays } from 'src/pricing/dates';

// The steps an order passes before it is installed, in their order.
const PIPELINE: { status: OrderStatus; label: string }[] = [
  { status: 'NEW', label: 'Новые' },
  { status: 'MEASUREMENT_SCHEDULED', label: 'Замер назначен' },
  { status: 'MEASURED', label: 'Замер выполнен' },
  { status: 'PRODUCTION', label: 'Производство' },
  { status: 'QUALITY_CHECK', label: 'На установку' },
];

export const WORKSHOP_STAGES: { stage: string | null; label: string }[] = [
  { stage: null, label: 'Ждут' },
  { stage: 'CUTTING', label: 'Резка' },
  { stage: 'WELDING', label: 'Сварка' },
  { stage: 'PAINTING', label: 'Покраска' },
];

// An order the workshop must hand over this soon is listed under «Сдать скоро».
const DUE_SOON_DAYS = 7;

export type LateOrder = { order: DashboardOrder; daysLate: number };
export type OwingOrder = {
  order: DashboardOrder;
  daysSinceInstall: number | null;
};

export type TodayView = {
  visits: DashboardOrder[];
  missedVisits: DashboardOrder[];
  awaitingInstall: DashboardOrder[];
  calls: ClientCard[];
  late: LateOrder[];
  owing: OwingOrder[];
  receivedToday: number;
  receivedThisMonth: number;
  owingTotal: number;
  inWorkshop: { count: number; area: number; urgent: number };
  pipeline: { status: OrderStatus; label: string; count: number }[];
  undecided: { count: number; total: number };
  workshopStages: { label: string; count: number }[];
  dueSoon: DashboardOrder[];
};

const sumOf = (values: readonly (number | null)[]): number =>
  values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

const byTime = (left: DashboardOrder, right: DashboardOrder) =>
  (left.measurementTime ?? '99').localeCompare(right.measurementTime ?? '99');

const byDeadline = (left: DashboardOrder, right: DashboardOrder) =>
  (left.deadline ?? '9999').localeCompare(right.deadline ?? '9999');

export const buildToday = ({
  orders,
  payments,
  callBackClients,
  today,
}: {
  orders: readonly DashboardOrder[];
  payments: readonly DashboardPayment[];
  callBackClients: readonly ClientCard[];
  today: string;
}): TodayView => {
  const month = today.slice(0, 7);
  const scheduled = orders.filter(
    (order) =>
      order.status === 'MEASUREMENT_SCHEDULED' && order.measurementDay !== null,
  );
  const inProduction = orders.filter((order) => order.status === 'PRODUCTION');
  const installedOwing = orders.filter(
    (order) => order.status === 'INSTALLED' && (order.balance ?? 0) > 0,
  );

  return {
    visits: scheduled
      .filter((order) => order.measurementDay === today)
      .sort(byTime),
    // A visit whose day has passed and that nobody marked as done
    missedVisits: scheduled
      .filter((order) => (order.measurementDay ?? today) < today)
      .sort((left, right) =>
        (left.measurementDay ?? '').localeCompare(right.measurementDay ?? ''),
      ),
    awaitingInstall: orders
      .filter((order) => order.status === 'QUALITY_CHECK')
      .sort(byDeadline),
    calls: buildCallBackLists(callBackClients, today).due,
    late: orders
      .filter(
        (order) =>
          isStatusIn(OPEN_STATUSES, order.status) &&
          order.deadline !== null &&
          order.deadline < today,
      )
      .map((order) => ({
        order,
        daysLate: daysBetween(order.deadline ?? today, today),
      }))
      .sort((left, right) => right.daysLate - left.daysLate),
    owing: installedOwing
      .map((order) => ({
        order,
        daysSinceInstall:
          order.installedAt === null
            ? null
            : daysBetween(order.installedAt, today),
      }))
      .sort(
        (left, right) =>
          (right.daysSinceInstall ?? 0) - (left.daysSinceInstall ?? 0),
      ),
    receivedToday: sumOf(
      payments
        .filter((payment) => payment.paidOn === today)
        .map((payment) => payment.amount),
    ),
    receivedThisMonth: sumOf(
      payments
        .filter(
          (payment) =>
            payment.paidOn.slice(0, 7) === month && payment.paidOn <= today,
        )
        .map((payment) => payment.amount),
    ),
    owingTotal: sumOf(installedOwing.map((order) => order.balance)),
    inWorkshop: {
      count: inProduction.length,
      area: sumOf(inProduction.map((order) => order.area)),
      urgent: inProduction.filter((order) => order.isUrgent).length,
    },
    pipeline: PIPELINE.map((step) => ({
      ...step,
      count: orders.filter((order) => order.status === step.status).length,
    })),
    undecided: {
      count: orders.filter((order) => order.status === 'MEASURED').length,
      total: sumOf(
        orders
          .filter((order) => order.status === 'MEASURED')
          .map((order) => order.total),
      ),
    },
    workshopStages: WORKSHOP_STAGES.map(({ stage, label }) => ({
      label,
      count: inProduction.filter((order) => order.productionStage === stage)
        .length,
    })),
    dueSoon: inProduction
      .filter(
        (order) =>
          order.deadline !== null &&
          order.deadline >= today &&
          order.deadline <= addDays(today, DUE_SOON_DAYS),
      )
      .sort(byDeadline),
  };
};

const WEEKDAYS = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
];

// «Четверг, 8 октября»
export const dayTitle = (today: string): string => {
  const noon = new Date(`${today}T12:00:00Z`);
  const date = noon.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  return `${WEEKDAYS[noon.getUTCDay()]}, ${date}`;
};

export const plural = (
  count: number,
  one: string,
  few: string,
  many: string,
) => {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;

  return many;
};

export const countWord = (
  count: number,
  one: string,
  few: string,
  many: string,
): string => `${count} ${plural(count, one, few, many)}`;

// «3 замера и 4 звонка на сегодня»
export const daySummary = (view: TodayView): string => {
  const parts = [
    view.visits.length > 0
      ? countWord(view.visits.length, 'замер', 'замера', 'замеров')
      : null,
    view.calls.length > 0
      ? countWord(view.calls.length, 'звонок', 'звонка', 'звонков')
      : null,
  ].filter((part): part is string => part !== null);

  return parts.length === 0
    ? 'На сегодня замеров и звонков нет'
    : `${parts.join(' и ')} на сегодня`;
};
