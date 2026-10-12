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
