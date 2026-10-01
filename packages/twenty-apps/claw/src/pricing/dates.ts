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

// Stamped only when an order enters a ready status from a non-ready one, so
// moves between READY/INSTALLED/CLOSED never pull old orders into payroll.
const READY_STATUSES = new Set(['READY', 'INSTALLED', 'CLOSED']);

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
  status !== null &&
  READY_STATUSES.has(status) &&
  !(previousStatus !== null && READY_STATUSES.has(previousStatus))
    ? today
    : null;
