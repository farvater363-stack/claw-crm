export const formatMoney = (value: number): string =>
  `${formatWhole(value)} сум`;

export const formatQuantity = (value: number, unitLabel: string): string =>
  `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${unitLabel}`;

// The date is a calendar day (YYYY-MM-DD); noon UTC keeps it on that day in any zone.
export const formatDayMonth = (isoDate: string): string =>
  new Date(`${isoDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

// A sum has no fraction, so its comma can only group thousands; a quantity
// keeps the Russian decimal comma («3,6 м»).
export const formatWhole = (value: number): string =>
  value.toLocaleString('en-US', { maximumFractionDigits: 0 });

// Regroups a typed sum. Anything that is not plain digits is left as typed,
// for the field's own check to refuse.
export const groupThousands = (typed: string): string => {
  const digits = typed.replace(/[\s,]/g, '');

  return /^[1-9]\d{0,14}$/.test(digits) ? formatWhole(Number(digits)) : typed;
};
