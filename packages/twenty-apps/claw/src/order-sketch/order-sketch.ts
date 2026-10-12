import {
  PROJECTION_KIND_OPTIONS,
  type ProjectionKind,
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
  quantity: unknown;
  designName: string | null;
};

export type SchemeOpening = {
  id: string;
  title: string;
  designName: string | null;
  quantity: number;
  isRailing: boolean;
  shape: StoredShape | null;
  // Null while the opening has no sizes yet
  sketch: {
    widthCm: number;
    heightCm: number;
    projectionKind: ProjectionKind;
    projectionCm: number;
    sizeText: string;
    // «2,97 м²» for a grille, «4,5 п.м.» for a railing
    unitsText: string;
  } | null;
};

const toProjectionKind = (value: string | null): ProjectionKind | null =>
  PROJECTION_KIND_OPTIONS.find((option) => option.value === value)?.value ??
  null;

export const toSchemeOpenings = (rows: SchemeItemRow[]): SchemeOpening[] =>
  rows.map((row, index) => {
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
    const size = { widthCm, heightCm, projectionCm, projectionKind } as {
      widthCm: number;
      heightCm: number;
      projectionCm: number;
      projectionKind: ProjectionKind;
    };

    return {
      id: row.id,
      title: `Проём ${index + 1}`,
      designName: row.designName,
      quantity: toNumber(row.quantity) ?? 1,
      isRailing,
      shape,
      sketch: hasSizes
        ? {
            ...size,
            sizeText: isRailing
              ? `${widthCm}×${heightCm}`
              : `${shape === null ? '' : `${shapeKindLabel(shape.kind).toLowerCase()} `}${formatItemSize(size)}`,
            unitsText: isRailing
              ? formatQuantity(computeRunningMeters(size.widthCm), 'п.м.')
              : formatQuantity(computeItemAreaSquareMeters(size), 'м²'),
          }
        : null,
    };
  });

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
