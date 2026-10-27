import {
  isCancelled,
  isInstalled,
  isMeasured,
  isSold,
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
// An order sent back to the workshop loses it, to be stamped when it is ready
// again. Undefined leaves it as it is.
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
}): string | null | undefined => {
  const isReady = isStatusIn(READY_AT_STATUSES, status);
  const wasReady = isStatusIn(READY_AT_STATUSES, previousStatus);

  if (isReady && !wasReady && readyAt === null) return today;

  if (wasReady && !isReady && !isCancelled(status) && readyAt !== null) {
    return null;
  }

  return undefined;
};

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
// sales are dated by it. An order taken back before production loses it, so
// its derived «Срок» goes too and it is not late for work nobody is doing.
// Undefined leaves it as it is.
export const productionStartOnStatusChange = ({
  status,
  previousStatus,
  productionStartDate,
  productionStartTyped,
  today,
}: {
  status: string | null;
  previousStatus: string | null;
  productionStartDate: string | null;
  productionStartTyped: boolean;
  today: string;
}): string | null | undefined => {
  if (status === 'PRODUCTION' && productionStartDate === null) return today;

  const isTakenBack =
    isSold(previousStatus) && !isSold(status) && !isCancelled(status);

  return isTakenBack && productionStartDate !== null && !productionStartTyped
    ? null
    : undefined;
};

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

  if (
    previousStart === null ||
    deadline !== addDays(previousStart, daysAfterStart)
  ) {
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
