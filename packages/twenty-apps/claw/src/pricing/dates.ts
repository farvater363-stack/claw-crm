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

// The first time an order counts as ready; later status moves never change it.
const READY_STATUSES = new Set(['READY', 'INSTALLED', 'CLOSED']);

export const readyAtOnStatusChange = ({
  status,
  readyAt,
  today,
}: {
  status: string | null;
  readyAt: string | null;
  today: string;
}): string | null =>
  readyAt === null && status !== null && READY_STATUSES.has(status)
    ? today
    : null;
