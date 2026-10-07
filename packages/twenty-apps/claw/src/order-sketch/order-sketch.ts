import {
  PROJECTION_KIND_OPTIONS,
  type ProjectionKind,
} from 'src/constants/select-options';
import {
  computeItemAreaSquareMeters,
  formatItemSize,
} from 'src/pricing/compute-item-area';
import { toNumber } from 'src/recalc/load-recalc-input';

export type SchemeItemRow = {
  id: string;
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
  // Null while the opening has no sizes yet
  sketch: {
    widthCm: number;
    heightCm: number;
    projectionKind: ProjectionKind;
    projectionCm: number;
    sizeText: string;
    areaSquareMeters: number;
  } | null;
};

const toProjectionKind = (value: string | null): ProjectionKind | null =>
  PROJECTION_KIND_OPTIONS.find((option) => option.value === value)?.value ??
  null;

export const toSchemeOpenings = (rows: SchemeItemRow[]): SchemeOpening[] =>
  rows.map((row, index) => {
    const widthCm = toNumber(row.widthCm);
    const heightCm = toNumber(row.heightCm);
    const projectionCm = toNumber(row.projectionCm) ?? 0;
    // An item saved before the kind existed had its вынос both ways.
    const projectionKind =
      toProjectionKind(row.projectionKind) ??
      (projectionCm > 0 ? 'BOTTOM_AND_TOP' : 'NONE');
    const hasSizes =
      widthCm !== null && heightCm !== null && widthCm > 0 && heightCm > 0;

    return {
      id: row.id,
      title: `Проём ${index + 1}`,
      designName: row.designName,
      quantity: toNumber(row.quantity) ?? 1,
      sketch: hasSizes
        ? {
            widthCm,
            heightCm,
            projectionKind,
            projectionCm,
            sizeText: formatItemSize({
              widthCm,
              heightCm,
              projectionCm,
              projectionKind,
            }),
            areaSquareMeters: computeItemAreaSquareMeters({
              widthCm,
              heightCm,
              projectionCm,
              projectionKind,
            }),
          }
        : null,
    };
  });
