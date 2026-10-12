import {
  isInstalled,
  isMeasured,
  isStatusIn,
  READY_AT_STATUSES,
} from 'src/constants/order-status-sets';

const MILLISECONDS_PER_DAY = 86_400_000;

export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date) + days * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);

export const computeDaysLate = ({
  deadline,
  readyAt,
}: {
  deadline: string | null;
  readyAt: string | null;
}): number | null => {
  if (deadline === null || readyAt === null) {
    return null;
  }

  const days = Math.round(
    (Date.parse(readyAt) - Date.parse(deadline)) / MILLISECONDS_PER_DAY,
  );

  return Math.max(0, days);
};

export const todayInTashkent = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(now);

// Stamped only when an order enters a ready status from a non-ready one, so the
// move from «Отправлено на установку» to «Установлен» does not stamp it again.
export const readyAtOnStatusChange = ({
  status,
  previousStatus,
  readyAt,
  today,
}: {
  status: string | null;
  previousStatus: string | null;
  readyAt: string | null;
  today: string;
}): string | null =>
  readyAt === null &&
  isStatusIn(READY_AT_STATUSES, status) &&
  !isStatusIn(READY_AT_STATUSES, previousStatus)
    ? today
    : null;

// The installation pay is dated by it, so an order taken back from installed and
// installed again moves to the day it really was installed, unless that date was
// typed in the same change.
export const installedAtOnStatusChange = ({
  status,
  previousStatus,
  installedAt,
  installedAtTyped,
  today,
}: {
  status: string | null;
  previousStatus: string | null;
  installedAt: string | null;
  installedAtTyped: boolean;
  today: string;
}): string | null => {
  if (!isInstalled(status) || installedAt === today) return null;

  if (installedAt === null) return today;

  return !isInstalled(previousStatus) && !installedAtTyped ? today : null;
};

// «Начало» is the day the order went into production, unless typed by hand;
// sales are dated by it.
export const productionStartOnStatusChange = ({
  status,
  productionStartDate,
  today,
}: {
  status: string | null;
  productionStartDate: string | null;
  today: string;
}): string | null =>
  status === 'PRODUCTION' && productionStartDate === null ? today : null;

// «Срок» follows a corrected «Начало» while it is still the derived one; a
// deadline typed by hand stays. Undefined leaves it as it is.
export const deadlineOnStartChange = ({
  previousStart,
  start,
  deadline,
  deadlineTyped,
  daysAfterStart,
}: {
  previousStart: string | null;
  start: string | null;
  deadline: string | null;
  deadlineTyped: boolean;
  daysAfterStart: number;
}): string | null | undefined => {
  if (deadlineTyped || deadline === null || previousStart === start) {
    return undefined;
  }

  if (previousStart === null || deadline !== addDays(previousStart, daysAfterStart)) {
    return undefined;
  }

  return start === null ? null : addDays(start, daysAfterStart);
};

// Stamped once. The measurer's pay is dated by it, so a later correction of the
// status must not move it.
export const measuredAtOnStatusChange = ({
  status,
  measuredAt,
  now,
}: {
  status: string | null;
  measuredAt: string | null;
  now: Date;
}): string | null =>
  measuredAt === null && isMeasured(status) ? now.toISOString() : null;
