const MICROS_PER_UNIT = 1_000_000;

export const fromCurrency = (
  value: { amountMicros?: number | string | null } | null | undefined,
): number | null => {
  if (value?.amountMicros === null || value?.amountMicros === undefined) {
    return null;
  }

  const amount = Math.round(Number(value.amountMicros) / MICROS_PER_UNIT);

  // A NaN never equals itself, so the recalc would rewrite it on every run.
  return Number.isFinite(amount) ? amount : null;
};

export const toCurrency = (amount: number | null) =>
  amount === null
    ? null
    : { amountMicros: amount * MICROS_PER_UNIT, currencyCode: 'UZS' as const };
