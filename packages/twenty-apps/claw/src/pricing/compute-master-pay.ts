export const computeMasterPay = ({
  areaSquareMeters,
  ratePerSquareMeter,
  penaltyPercentPerDay,
  daysLate,
}: {
  areaSquareMeters: number;
  ratePerSquareMeter: number;
  penaltyPercentPerDay: number;
  daysLate: number;
}): number =>
  Math.round(
    areaSquareMeters *
      ratePerSquareMeter *
      Math.max(0, 1 - (penaltyPercentPerDay / 100) * daysLate),
  );
