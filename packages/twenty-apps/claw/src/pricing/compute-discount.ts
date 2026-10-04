import { type DiscountKind } from 'src/constants/select-options';

export const computeDiscount = ({
  subtotal,
  kind,
  value,
}: {
  subtotal: number;
  kind: DiscountKind | null;
  value: number | null;
}): number => {
  if (kind === null || value === null || value <= 0 || subtotal <= 0) {
    return 0;
  }

  const discount =
    kind === 'PERCENT'
      ? Math.round((subtotal * value) / 100)
      : Math.round(value);

  return Math.min(discount, subtotal);
};
