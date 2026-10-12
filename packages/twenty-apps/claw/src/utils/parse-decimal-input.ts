// Typed sizes and amounts: a comma or a dot for decimals, null when empty or
// not a number.
export const parseDecimalInput = (value: string): number | null => {
  const trimmed = value.trim().replace(',', '.');

  if (trimmed === '') return null;

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
};
