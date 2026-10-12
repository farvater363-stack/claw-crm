import { roundTo } from 'src/pricing/round';
import { parseDecimalInput } from 'src/utils/parse-decimal-input';

// A проём is a straight sill of the given width under a top line drawn through
// measured points, left to right. Each piece of the top between two points is
// straight or an arc with the given rise. Every chip of «Форма» only fills
// those points in, so a new shape needs no new drawing code.
export type ShapeKind = 'RECTANGLE' | 'SLOPE' | 'ARCH' | 'STEP' | 'CUSTOM';

export const SHAPE_KIND_OPTIONS: { value: ShapeKind; label: string }[] = [
  { value: 'RECTANGLE', label: 'Прямоугольник' },
  { value: 'SLOPE', label: 'Скос' },
  { value: 'ARCH', label: 'Арка' },
  { value: 'STEP', label: 'Ступень' },
  { value: 'CUSTOM', label: 'Своя форма' },
];

export const shapeKindLabel = (kind: ShapeKind): string =>
  SHAPE_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? '';

export type ShapePoint = { xCm: number; heightCm: number };

export type ShapeOutline = {
  widthCm: number;
  points: ShapePoint[];
  // One per piece between neighbouring points: null is straight
  arcRisesCm: (number | null)[];
};

// Inputs keep raw strings so a half-typed value ("1,") survives re-render.
export type PointDraft = { key: string; xCm: string; heightCm: string };

export type CustomPointDraft = PointDraft & {
  // The piece from this point to the next one
  isArcToNext: boolean;
  arcRiseCm: string;
};

// Every chip keeps its own numbers, so tapping another chip and back loses
// nothing that was typed.
export type ShapeDraft = {
  kind: ShapeKind;
  leftCm: string;
  centerCm: string;
  rightCm: string;
  slopePoints: PointDraft[];
  sideCm: string;
  riseCm: string;
  // Where each step is and the height after it; the last one ends at rightCm
  steps: PointDraft[];
  points: CustomPointDraft[];
};

// What is saved on the order item. `draft` reopens the same chip with the same
// numbers; `outline` is what every drawing is made from.
export type StoredShape = {
  version: 1;
  kind: Exclude<ShapeKind, 'RECTANGLE'>;
  outline: ShapeOutline;
  draft: Omit<ShapeDraft, 'kind'>;
};

export type ShapeResult =
  | { isValid: true; outline: ShapeOutline; errors: [] }
  | { isValid: false; outline: null; errors: string[] };

export const POINT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const pointLetter = (index: number): string =>
  POINT_LETTERS[index] ?? `${index + 1}`;

export const createShapeDraft = (
  nextKey: () => string,
  kind: ShapeKind = 'RECTANGLE',
): ShapeDraft => ({
  kind,
  leftCm: '',
  centerCm: '',
  rightCm: '',
  slopePoints: [],
  sideCm: '0',
  riseCm: '',
  steps: [{ key: nextKey(), xCm: '', heightCm: '' }],
  points: [
    {
      key: nextKey(),
      xCm: '0',
      heightCm: '',
      isArcToNext: false,
      arcRiseCm: '',
    },
    {
      key: nextKey(),
      xCm: '',
      heightCm: '',
      isArcToNext: false,
      arcRiseCm: '',
    },
  ],
});

const ARC_TOLERANCE_CM = 2;

const formatCm = (value: number): string => String(roundTo(value, 1));

type Collected = { errors: string[] };

const requirePositive = (
  collected: Collected,
  value: string,
  what: string,
  { allowZero = false }: { allowZero?: boolean } = {},
): number | null => {
  const parsed = parseDecimalInput(value);

  if (parsed === null || parsed < 0 || (!allowZero && parsed === 0)) {
    collected.errors.push(
      `укажите ${what}${allowZero ? ', 0 или больше' : ' больше 0'}`,
    );

    return null;
  }

  return parsed;
};

const insideWidth = (
  collected: Collected,
  label: string,
  xCm: number,
  widthCm: number,
) => {
  if (xCm <= 0 || xCm >= widthCm) {
    collected.errors.push(
      xCm >= widthCm
        ? `${label}: ${formatCm(xCm)} см от края, а ширина ${formatCm(widthCm)} см. Проверьте ширину или эту точку`
        : `${label}: расстояние от левого края должно быть больше 0`,
    );

    return false;
  }

  return true;
};

const straight = (points: ShapePoint[]): (number | null)[] =>
  points.slice(1).map(() => null);

const slopeOutline = (
  draft: ShapeDraft,
  widthCm: number,
  collected: Collected,
): ShapeOutline | null => {
  const left = requirePositive(collected, draft.leftCm, 'высоту слева');
  const right = requirePositive(collected, draft.rightCm, 'высоту справа');
  const middle: ShapePoint[] = [];

  if (draft.centerCm.trim() !== '') {
    const center = requirePositive(
      collected,
      draft.centerCm,
      'высоту по центру',
    );

    if (center !== null) middle.push({ xCm: widthCm / 2, heightCm: center });
  }

  draft.slopePoints.forEach((point, index) => {
    const label = `Точка ${index + 1}`;
    const xCm = parseDecimalInput(point.xCm);
    const heightCm = parseDecimalInput(point.heightCm);

    if (xCm === null || heightCm === null || heightCm <= 0) {
      collected.errors.push(
        `${label}: укажите расстояние от левого края и высоту в этом месте`,
      );

      return;
    }

    if (!insideWidth(collected, label, xCm, widthCm)) return;

    if (middle.some((other) => other.xCm === xCm)) {
      collected.errors.push(
        `${label}: на ${formatCm(xCm)} см от края уже есть высота. Уберите одну из них`,
      );

      return;
    }

    middle.push({ xCm, heightCm });
  });

  if (left === null || right === null) return null;

  const points = [
    { xCm: 0, heightCm: left },
    ...middle.sort((first, second) => first.xCm - second.xCm),
    { xCm: widthCm, heightCm: right },
  ];

  return { widthCm, points, arcRisesCm: straight(points) };
};

const archOutline = (
  draft: ShapeDraft,
  widthCm: number,
  collected: Collected,
): ShapeOutline | null => {
  const side = requirePositive(collected, draft.sideCm, 'высоту боковин', {
    allowZero: true,
  });
  const rise = requirePositive(collected, draft.riseCm, 'стрелу арки');

  if (side === null || rise === null) return null;

  // A taller arc bulges past the sides of the opening; a semicircle measured
  // a centimetre or two over half the width is still a semicircle.
  if (rise > widthCm / 2 + ARC_TOLERANCE_CM) {
    collected.errors.push(
      `стрела ${formatCm(rise)} см больше половины ширины ${formatCm(widthCm)} см. У полукруга стрела равна половине ширины`,
    );

    return null;
  }

  return {
    widthCm,
    points: [
      { xCm: 0, heightCm: side },
      { xCm: widthCm, heightCm: side },
    ],
    arcRisesCm: [rise],
  };
};

const stepOutline = (
  draft: ShapeDraft,
  widthCm: number,
  collected: Collected,
): ShapeOutline | null => {
  const left = requirePositive(collected, draft.leftCm, 'высоту слева');
  const right = requirePositive(collected, draft.rightCm, 'высоту справа');
  const steps: ShapePoint[] = [];
  let previousX = 0;

  draft.steps.forEach((step, index) => {
    const label = `Ступень ${index + 1}`;
    const isLast = index === draft.steps.length - 1;
    const xCm = parseDecimalInput(step.xCm);
    const heightCm = isLast ? right : parseDecimalInput(step.heightCm);

    if (xCm === null) {
      collected.errors.push(
        `${label}: укажите, сколько сантиметров от левого края`,
      );

      return;
    }

    if (!insideWidth(collected, label, xCm, widthCm)) return;

    if (xCm <= previousX) {
      collected.errors.push(
        `${label}: должна быть правее ${index === 0 ? 'левого края' : `ступени ${index}`}`,
      );

      return;
    }

    previousX = xCm;

    if (heightCm === null || heightCm <= 0) {
      if (!isLast) {
        collected.errors.push(`${label}: укажите высоту после ступени`);
      }

      return;
    }

    steps.push({ xCm, heightCm });
  });

  if (left === null || right === null || steps.length !== draft.steps.length) {
    return null;
  }

  const points: ShapePoint[] = [{ xCm: 0, heightCm: left }];
  let level = left;

  for (const step of steps) {
    points.push({ xCm: step.xCm, heightCm: level });
    points.push({ xCm: step.xCm, heightCm: step.heightCm });
    level = step.heightCm;
  }

  points.push({ xCm: widthCm, heightCm: right });

  return { widthCm, points, arcRisesCm: straight(points) };
};

const customOutline = (
  draft: ShapeDraft,
  widthCm: number,
  collected: Collected,
): ShapeOutline | null => {
  if (draft.points.length < 2) {
    collected.errors.push('нужно хотя бы две точки: у левого и у правого края');

    return null;
  }

  const points: ShapePoint[] = [];
  const arcRisesCm: (number | null)[] = [];
  let isComplete = true;

  draft.points.forEach((point, index) => {
    const label = `Точка ${pointLetter(index)}`;
    const xCm = parseDecimalInput(point.xCm);
    const heightCm = parseDecimalInput(point.heightCm);
    const previous = points[points.length - 1];

    if (xCm === null || heightCm === null || heightCm < 0) {
      collected.errors.push(
        `${label}: укажите расстояние от левого края и высоту в этом месте`,
      );
      isComplete = false;

      return;
    }

    if (xCm > widthCm) {
      collected.errors.push(
        `${label}: ${formatCm(xCm)} см от края, а ширина ${formatCm(widthCm)} см. Проверьте ширину или точку ${pointLetter(index)}`,
      );
      isComplete = false;

      return;
    }

    if (index === 0 && xCm !== 0) {
      collected.errors.push(
        `${label}: первая точка стоит у левого края, от края 0`,
      );
      isComplete = false;
    }

    if (index === draft.points.length - 1 && xCm !== widthCm) {
      collected.errors.push(
        `${label}: последняя точка стоит у правого края, от края ${formatCm(widthCm)} (ширина)`,
      );
      isComplete = false;
    }

    if (previous !== undefined && xCm < previous.xCm) {
      collected.errors.push(
        `${label}: должна быть не левее точки ${pointLetter(index - 1)}`,
      );
      isComplete = false;

      return;
    }

    points.push({ xCm, heightCm });
  });

  draft.points.slice(0, -1).forEach((point, index) => {
    if (!point.isArcToNext) {
      arcRisesCm.push(null);

      return;
    }

    const label = `Дуга ${pointLetter(index)} → ${pointLetter(index + 1)}`;
    const rise = parseDecimalInput(point.arcRiseCm);
    const from = points[index];
    const to = points[index + 1];

    if (rise === null || rise <= 0) {
      collected.errors.push(`${label}: укажите стрелу дуги больше 0`);
      isComplete = false;
    } else if (from !== undefined && to !== undefined && from.xCm === to.xCm) {
      collected.errors.push(
        `${label}: точки на одной вертикали, дугу между ними не построить`,
      );
      isComplete = false;
    } else if (
      from !== undefined &&
      to !== undefined &&
      rise >
        Math.hypot(to.xCm - from.xCm, to.heightCm - from.heightCm) / 2 +
          ARC_TOLERANCE_CM
    ) {
      collected.errors.push(
        `${label}: стрела ${formatCm(rise)} см больше половины расстояния между точками`,
      );
      isComplete = false;
    }

    arcRisesCm.push(rise);
  });

  if (!isComplete || points.length !== draft.points.length) return null;

  if (points.every((point) => point.heightCm === 0)) {
    collected.errors.push('все высоты равны 0, проём не построить');

    return null;
  }

  return { widthCm, points, arcRisesCm };
};

// The outline the measured numbers describe; with any of them missing or
// contradicting the others, the reasons instead, each naming what to check.
export const buildShapeOutline = (
  draft: ShapeDraft,
  widthText: string,
  heightText: string,
): ShapeResult => {
  const collected: Collected = { errors: [] };
  const widthCm = requirePositive(collected, widthText, 'ширину');

  if (draft.kind === 'RECTANGLE') {
    const heightCm = requirePositive(collected, heightText, 'высоту');

    if (widthCm === null || heightCm === null) {
      return { isValid: false, outline: null, errors: collected.errors };
    }

    const points = [
      { xCm: 0, heightCm },
      { xCm: widthCm, heightCm },
    ];

    return {
      isValid: true,
      outline: { widthCm, points, arcRisesCm: [null] },
      errors: [],
    };
  }

  if (widthCm === null) {
    return { isValid: false, outline: null, errors: collected.errors };
  }

  const build = {
    SLOPE: slopeOutline,
    ARCH: archOutline,
    STEP: stepOutline,
    CUSTOM: customOutline,
  }[draft.kind];
  const outline = build(draft, widthCm, collected);

  return outline === null || collected.errors.length > 0
    ? { isValid: false, outline: null, errors: collected.errors }
    : { isValid: true, outline, errors: [] };
};

export type Arc = {
  centerX: number;
  centerY: number;
  radius: number;
  isLarge: boolean;
};

// The circle through both ends of a piece and the top of its rise, the rise
// standing square to the piece at its middle.
export const arcOf = (
  from: ShapePoint,
  to: ShapePoint,
  riseCm: number,
): Arc => {
  const dx = to.xCm - from.xCm;
  const dy = to.heightCm - from.heightCm;
  const chord = Math.hypot(dx, dy);
  const radius = (chord * chord) / 4 / (2 * riseCm) + riseCm / 2;
  // The unit normal that points up and away from the sill
  const normalX = -dy / chord;
  const normalY = dx / chord;
  const middleX = (from.xCm + to.xCm) / 2;
  const middleY = (from.heightCm + to.heightCm) / 2;
  const offset = radius - riseCm;

  return {
    centerX: middleX - normalX * offset,
    centerY: middleY - normalY * offset,
    radius,
    isLarge: riseCm > chord / 2,
  };
};

const ARC_SAMPLES = 24;

// Points along an arc piece, both ends included, for the highest point and for
// drawings that cannot draw an arc.
export const sampleArc = (
  from: ShapePoint,
  to: ShapePoint,
  riseCm: number,
): ShapePoint[] => {
  const { centerX, centerY, radius } = arcOf(from, to, riseCm);
  const start = Math.atan2(from.heightCm - centerY, from.xCm - centerX);
  let end = Math.atan2(to.heightCm - centerY, to.xCm - centerX);

  // Left to right over the top is clockwise, so the angle falls.
  while (end > start) end -= 2 * Math.PI;

  return Array.from({ length: ARC_SAMPLES + 1 }, (_, index) => {
    const angle = start + ((end - start) * index) / ARC_SAMPLES;

    return {
      xCm: centerX + radius * Math.cos(angle),
      heightCm: centerY + radius * Math.sin(angle),
    };
  });
};

// The top line with every arc broken into short straight pieces.
export const traceTop = (outline: ShapeOutline): ShapePoint[] =>
  outline.points.flatMap((point, index) => {
    const next = outline.points[index + 1];
    const rise = outline.arcRisesCm[index] ?? null;

    if (next === undefined) return [point];
    if (rise === null) return [point];

    return sampleArc(point, next, rise).slice(0, -1);
  });

// The outer box the price is counted from: the width and the highest point.
export const outlineHeightCm = (outline: ShapeOutline): number =>
  roundTo(Math.max(...traceTop(outline).map((point) => point.heightCm)), 1);

export const isRectangleOutline = (outline: ShapeOutline): boolean =>
  outline.points.length === 2 &&
  outline.arcRisesCm[0] === null &&
  outline.points[0].heightCm === outline.points[1].heightCm;

export const toStoredShape = (
  draft: ShapeDraft,
  outline: ShapeOutline,
): StoredShape | null => {
  if (draft.kind === 'RECTANGLE') return null;

  const { kind, ...numbers } = draft;

  return { version: 1, kind, outline, draft: numbers };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toOutline = (value: unknown): ShapeOutline | null => {
  if (!isRecord(value) || !isFiniteNumber(value.widthCm)) return null;
  if (!Array.isArray(value.points) || !Array.isArray(value.arcRisesCm)) {
    return null;
  }

  const points = value.points.filter(
    (point): point is ShapePoint =>
      isRecord(point) &&
      isFiniteNumber(point.xCm) &&
      isFiniteNumber(point.heightCm),
  );
  const arcRisesCm = value.arcRisesCm.map((rise) =>
    isFiniteNumber(rise) && rise > 0 ? rise : null,
  );

  if (
    points.length < 2 ||
    points.length !== value.points.length ||
    arcRisesCm.length !== points.length - 1
  ) {
    return null;
  }

  return { widthCm: value.widthCm, points, arcRisesCm };
};

const KINDS = new Set<string>(['SLOPE', 'ARCH', 'STEP', 'CUSTOM']);

// What the API returns for the JSON field; anything unreadable counts as a
// plain rectangle, which is what every item saved before shapes is.
export const parseStoredShape = (value: unknown): StoredShape | null => {
  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return null;
          }
        })()
      : value;

  if (!isRecord(parsed) || typeof parsed.kind !== 'string') return null;
  if (!KINDS.has(parsed.kind)) return null;

  const outline = toOutline(parsed.outline);

  if (outline === null) return null;

  return {
    version: 1,
    kind: parsed.kind as StoredShape['kind'],
    outline,
    draft: isRecord(parsed.draft)
      ? (parsed.draft as StoredShape['draft'])
      : (shapeDraftFromOutline(outline) as StoredShape['draft']),
  };
};

// The saved shape only while it still matches the item's width and height:
// sizes changed elsewhere (the record table) make the item a plain
// rectangle again rather than a drawing of the old sizes.
export const parseItemShape = (
  value: unknown,
  widthCm: number | null,
  heightCm: number | null,
): StoredShape | null => {
  const shape = parseStoredShape(value);

  if (shape === null || widthCm === null || heightCm === null) return null;

  const isSameSize =
    Math.abs(shape.outline.widthCm - widthCm) < 0.05 &&
    Math.abs(outlineHeightCm(shape.outline) - heightCm) < 0.05;

  return isSameSize ? shape : null;
};

// Back from what was saved to the chip and the numbers the measurer typed.
export const shapeDraftFromStored = (
  stored: StoredShape,
  nextKey: () => string,
): ShapeDraft => {
  const draft: ShapeDraft = {
    ...createShapeDraft(nextKey),
    ...stored.draft,
    kind: stored.kind,
  };

  // Saved keys came from another session's counter and could repeat new ones.
  return {
    ...draft,
    slopePoints: draft.slopePoints.map((point) => ({
      ...point,
      key: nextKey(),
    })),
    steps: draft.steps.map((step) => ({ ...step, key: nextKey() })),
    points: draft.points.map((point) => ({ ...point, key: nextKey() })),
  };
};

// For a shape saved without its typed numbers: its points, as «Своя форма».
const shapeDraftFromOutline = (
  outline: ShapeOutline,
): Omit<ShapeDraft, 'kind'> => {
  let sequence = 0;
  const nextKey = () => `point-${sequence++}`;

  return {
    ...createShapeDraft(nextKey),
    points: outline.points.map((point, index) => ({
      key: nextKey(),
      xCm: formatCm(point.xCm),
      heightCm: formatCm(point.heightCm),
      isArcToNext: (outline.arcRisesCm[index] ?? null) !== null,
      arcRiseCm:
        outline.arcRisesCm[index] == null
          ? ''
          : formatCm(outline.arcRisesCm[index] as number),
    })),
  };
};

// «скос 164 / 154 / 113», the heights a shape is told by, for lists and the
// спецификация. The size itself stays «ширина × высота».
export const describeShape = (stored: StoredShape | null): string | null => {
  if (stored === null) return null;

  const { outline } = stored;
  const heights = outline.points.map((point) => formatCm(point.heightCm));

  switch (stored.kind) {
    case 'ARCH': {
      const side = outline.points[0].heightCm;
      const rise = formatCm(outline.arcRisesCm[0] ?? 0);

      return side > 0
        ? `арка, боковины ${formatCm(side)}, стрела ${rise}`
        : `арка, стрела ${rise}`;
    }
    case 'STEP':
      return `ступень ${[...new Set(heights)].join(' / ')}`;
    case 'SLOPE':
      return `скос ${heights.join(' / ')}`;
    default:
      return `своя форма, ${outline.points.length} точ${outline.points.length < 5 ? 'ки' : 'ек'}`;
  }
};
