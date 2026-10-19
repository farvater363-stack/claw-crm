import {
  type Product,
  PROJECTION_SIDE_OPTIONS,
  type ProjectionKind,
  type ProjectionSide,
} from 'src/constants/select-options';
import { roundTo } from 'src/pricing/round';
import { formatQuantity } from 'src/ui/format';

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

// «установка снаружи», said after the size and its «см»; nothing while its
// установка was not asked yet.
export const describeProjectionSide = ({
  projectionSide,
}: {
  projectionSide?: ProjectionSide | null;
}): string | null =>
  projectionSide
    ? `установка ${PROJECTION_SIDE_OPTIONS.find((option) => option.value === projectionSide)?.label.toLowerCase()}`
    : null;

const CENTIMETERS_PER_METER = 100;

// A railing is priced, built and paid per running metre of its length.
export const computeRunningMeters = (lengthCm: number): number =>
  roundTo(lengthCm / CENTIMETERS_PER_METER, 2);

// «450×90, 4,5 п.м.»: length × height in cm, then what the price counts.
// «Перилла Классика»; a design already named «Перилла …» is not prefixed twice.
export const railingName = (
  designName: string | null | undefined,
  fallback = 'Перилла',
): string => {
  if (designName === null || designName === undefined) return fallback;

  return /^перилл/i.test(designName.trim())
    ? designName
    : `Перилла ${designName}`;
};

export const formatRailingSize = ({
  lengthCm,
  heightCm,
}: {
  lengthCm: number;
  heightCm: number;
}): string =>
  `${lengthCm}×${heightCm}, ${formatQuantity(computeRunningMeters(lengthCm), 'п.м.')}`;

// One piece of an item in the unit its price, composition and pay are per:
// m² of a grille, п.м. of a railing.
export const computeItemUnits = ({
  product,
  widthCm,
  areaSquareMeters,
}: {
  product?: Product | null;
  widthCm?: number | null;
  areaSquareMeters: number | null;
}): number | null =>
  product === 'RAILING'
    ? widthCm === null || widthCm === undefined
      ? null
      : computeRunningMeters(widthCm)
    : areaSquareMeters;
