import { type ProjectionKind } from 'src/constants/select-options';
import { roundTo } from 'src/pricing/round';

const SQUARE_CENTIMETERS_PER_SQUARE_METER = 10_000;

// Each end of a convex grille adds a face of width × projection and two side
// triangles of height × projection / 2. An item without a kind was measured
// when the projection always went both ways.
const PROJECTING_ENDS: Record<ProjectionKind, number> = {
  NONE: 0,
  BOTTOM: 1,
  BOTTOM_AND_TOP: 2,
};

const hasProjection = ({
  projectionCm,
  projectionKind,
}: {
  projectionCm: number;
  projectionKind?: ProjectionKind | null;
}): boolean => projectionCm > 0 && projectionKind !== 'NONE';

export const computeItemAreaSquareMeters = ({
  widthCm,
  heightCm,
  projectionCm,
  projectionKind,
}: {
  widthCm: number;
  heightCm: number;
  projectionCm: number;
  projectionKind?: ProjectionKind | null;
}): number =>
  roundTo(
    (widthCm * heightCm +
      PROJECTING_ENDS[projectionKind ?? 'BOTTOM_AND_TOP'] *
        projectionCm *
        (widthCm + heightCm)) /
      SQUARE_CENTIMETERS_PER_SQUARE_METER,
    2,
  );

// «140×150×30» for a projection both ways, «140×150×30 снизу» for the bottom alone.
export const formatItemSize = ({
  widthCm,
  heightCm,
  projectionCm,
  projectionKind,
}: {
  widthCm: number;
  heightCm: number;
  projectionCm: number;
  projectionKind?: ProjectionKind | null;
}): string =>
  hasProjection({ projectionCm, projectionKind })
    ? `${widthCm}×${heightCm}×${projectionCm}${projectionKind === 'BOTTOM' ? ' снизу' : ''}`
    : `${widthCm}×${heightCm}`;
