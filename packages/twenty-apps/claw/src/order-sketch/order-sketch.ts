import {
  PROJECTION_KIND_OPTIONS,
  type ProjectionKind,
  type ProjectionSide,
  toProjectionSide,
} from 'src/constants/select-options';
import {
  parseItemShape,
  shapeKindLabel,
  type StoredShape,
} from 'src/opening-shape/opening-shape';
import {
  layoutOpeningSketch,
  layoutRailingSketch,
  type SketchLayout,
} from 'src/opening-shape/sketch-layout';
import {
  computeItemAreaSquareMeters,
  computeRunningMeters,
  describeProjectionSide,
  formatItemSize,
  railingName,
} from 'src/pricing/compute-item-area';
import { toNumber } from 'src/recalc/load-recalc-input';
import { formatQuantity } from 'src/ui/format';

export type SchemeItemRow = {
  id: string;
  product?: string | null;
  shape?: unknown;
  widthCm: unknown;
  heightCm: unknown;
  projectionCm: unknown;
  projectionKind: string | null;
  projectionSide?: string | null;
  quantity: unknown;
  designName: string | null;
  notes?: string | null;
  // The number the measurer's form gave it; absent on items saved before it
  // was kept, or added later in the order
  openingNumber?: unknown;
};

export type SchemeOpening = {
  id: string;
  title: string;
  designName: string | null;
  // The measurer's note on the opening, for the workshop and the installers
  notes: string | null;
  quantity: number;
  isRailing: boolean;
  shape: StoredShape | null;
  // Null while the opening has no sizes yet
  sketch: {
    widthCm: number;
    heightCm: number;
    projectionKind: ProjectionKind;
    projectionCm: number;
    projectionSide: ProjectionSide | null;
    sizeText: string;
    // «установка снаружи»; null without a вынос or a known установка
    sideText: string | null;
    // «2,97 м²» for a grille, «4,5 п.м.» for a railing
    unitsText: string;
  } | null;
};

const toProjectionKind = (value: string | null): ProjectionKind | null =>
  PROJECTION_KIND_OPTIONS.find((option) => option.value === value)?.value ??
  null;

const isOpeningNumber = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value > 0;

// A visor alone takes a number in the form but saves no item, so counting the
// items would shift every later opening away from its photos' «Проём N».
// An item without a stored number follows the highest one.
export const numberOpenings = (
  rows: { openingNumber?: unknown }[],
): number[] => {
  const stored = rows.map((row) => toNumber(row.openingNumber ?? null));
  let next = Math.max(0, ...stored.filter(isOpeningNumber));

  return stored.map((number) => (isOpeningNumber(number) ? number : ++next));
};

export const toSchemeOpenings = (rows: SchemeItemRow[]): SchemeOpening[] => {
  const numbers = numberOpenings(rows);

  return rows
    .map((row, index) => ({ row, number: numbers[index] }))
    .sort((left, right) => left.number - right.number)
    .map(({ row, number }) => {
      const isRailing = row.product === 'RAILING';
      const widthCm = toNumber(row.widthCm);
      const heightCm = toNumber(row.heightCm);
      const shape = isRailing
        ? null
        : parseItemShape(row.shape, widthCm, heightCm);
      const projectionCm = isRailing ? 0 : (toNumber(row.projectionCm) ?? 0);
      // An item saved before the kind existed had its вынос both ways.
      const projectionKind = isRailing
        ? 'NONE'
        : (toProjectionKind(row.projectionKind) ??
          (projectionCm > 0 ? 'BOTTOM_AND_TOP' : 'NONE'));
      const hasSizes =
        widthCm !== null && heightCm !== null && widthCm > 0 && heightCm > 0;
      const size = {
        widthCm,
        heightCm,
        projectionCm,
        projectionKind,
        projectionSide: isRailing ? null : toProjectionSide(row.projectionSide),
      } as {
        widthCm: number;
        heightCm: number;
        projectionCm: number;
        projectionKind: ProjectionKind;
        projectionSide: ProjectionSide | null;
      };

      return {
        id: row.id,
        title: `Проём ${number}`,
        designName: row.designName,
        notes: row.notes?.trim() || null,
        quantity: toNumber(row.quantity) ?? 1,
        isRailing,
        shape,
        sketch: hasSizes
          ? {
              ...size,
              sizeText: isRailing
                ? `${widthCm}×${heightCm}`
                : `${shape === null ? '' : `${shapeKindLabel(shape.kind).toLowerCase()} `}${formatItemSize(size)}`,
              sideText: describeProjectionSide(size),
              unitsText: isRailing
                ? formatQuantity(computeRunningMeters(size.widthCm), 'п.м.')
                : formatQuantity(computeItemAreaSquareMeters(size), 'м²'),
            }
          : null,
      };
    });
};

export const schemeSketchLayout = (opening: SchemeOpening): SketchLayout =>
  opening.isRailing
    ? layoutRailingSketch({
        lengthCm: opening.sketch?.widthCm ?? null,
        heightCm: opening.sketch?.heightCm ?? null,
      })
    : layoutOpeningSketch({
        widthCm: opening.sketch?.widthCm ?? null,
        heightCm: opening.sketch?.heightCm ?? null,
        projectionKind: opening.sketch?.projectionKind ?? 'NONE',
        projectionCm: opening.sketch?.projectionCm ?? 0,
        shape: opening.shape,
      });

export const schemeProductName = (opening: SchemeOpening): string =>
  opening.isRailing
    ? railingName(opening.designName)
    : (opening.designName ?? 'Решётка не выбрана');
