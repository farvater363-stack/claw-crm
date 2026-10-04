export const formatMoney = (value: number): string =>
  `${value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} сум`;

export const formatQuantity = (value: number, unitLabel: string): string =>
  `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${unitLabel}`;

// The date is a calendar day (YYYY-MM-DD); noon UTC keeps it on that day in any zone.
export const formatDayMonth = (isoDate: string): string =>
  new Date(`${isoDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
