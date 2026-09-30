const MICROS_PER_UNIT = 1_000_000;

export const fromCurrency = (
  value: { amountMicros?: number | string | null } | null | undefined,
): number | null => {
  if (value?.amountMicros === null || value?.amountMicros === undefined) {
    return null;
  }

  return Math.round(Number(value.amountMicros) / MICROS_PER_UNIT);
};

export const toCurrency = (amount: number | null) =>
  amount === null
    ? null
    : { amountMicros: amount * MICROS_PER_UNIT, currencyCode: 'UZS' as const };
