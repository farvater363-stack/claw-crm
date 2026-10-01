import { roundTo } from 'src/pricing/round';

const SQUARE_CENTIMETERS_PER_SQUARE_METER = 10_000;

// A convex grille has a front plus top, bottom and two sides of depth = projection.
export const computeItemAreaSquareMeters = ({
  widthCm,
  heightCm,
  projectionCm,
}: {
  widthCm: number;
  heightCm: number;
  projectionCm: number;
}): number =>
  roundTo(
    (widthCm * heightCm + 2 * projectionCm * (widthCm + heightCm)) /
      SQUARE_CENTIMETERS_PER_SQUARE_METER,
    2,
  );
