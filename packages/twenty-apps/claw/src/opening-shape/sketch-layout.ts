import { type ProjectionKind } from 'src/constants/select-options';
import {
  arcOf,
  isRectangleOutline,
  outlineHeightCm,
  pointLetter,
  type ShapeKind,
  type ShapeOutline,
  type ShapePoint,
} from 'src/opening-shape/opening-shape';
import { roundTo } from 'src/pricing/round';

// One drawing for the form, the order's «Схема», the contract and the printed
// sheet: they all lay it out here and only paint what comes back, in a
// 240 × 172 box.
export const SKETCH_WIDTH = 240;
export const SKETCH_HEIGHT = 172;

export type SketchText = {
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'middle' | 'end';
  isRotated: boolean;
  isMuted: boolean;
  isBold: boolean;
  size: number;
};

export type SketchLine = { x1: number; y1: number; x2: number; y2: number };

export type SketchLayout = {
  ariaLabel: string;
  // The opening itself, filled
  shapePath: string | null;
  // The outer box the price is counted from, dashed
  framePath: string | null;
  // Thin dashed helper lines
  guides: SketchLine[];
  // A railing's bars, drawn in the accent colour
  bars: { line: SketchLine; isThick: boolean }[];
  markers: { x: number; y: number; label: string }[];
  texts: SketchText[];
  side: {
    wallX: number;
    top: number;
    bottom: number;
    // null draws a flat grille against the wall
    profilePath: string | null;
  } | null;
  placeholder: string | null;
};

const EMPTY_LAYOUT: Omit<SketchLayout, 'ariaLabel'> = {
  shapePath: null,
  framePath: null,
  guides: [],
  bars: [],
  markers: [],
  texts: [],
  side: null,
  placeholder: null,
};

const LEFT = 30;
const TOP = 18;
const AREA_HEIGHT = 120;
const RECTANGLE_AREA_WIDTH = 140;
// Room on the right for the height labels of a shape
const SHAPE_AREA_WIDTH = 124;
const WALL_X = 200;
const MAX_PROJECTION_DEPTH = 32;

const text = (
  x: number,
  y: number,
  value: string,
  options: Partial<Omit<SketchText, 'x' | 'y' | 'text'>> = {},
): SketchText => ({
  x,
  y,
  text: value,
  anchor: 'middle',
  isRotated: false,
  isMuted: false,
  isBold: true,
  size: 12,
  ...options,
});

const round = (value: number) => roundTo(value, 2);

export const formatSketchCm = (value: number): string =>
  String(roundTo(value, 1)).replace('.', ',');

const sideOf = ({
  top,
  bottom,
  projectionKind,
  projectionCm,
  scale,
}: {
  top: number;
  bottom: number;
  projectionKind: ProjectionKind;
  projectionCm: number;
  scale: number;
}): { side: SketchLayout['side']; texts: SketchText[] } => {
  const hasProjection = projectionKind !== 'NONE' && projectionCm > 0;
  const depth = Math.min(projectionCm * scale, MAX_PROJECTION_DEPTH);
  const profilePath = !hasProjection
    ? null
    : projectionKind === 'BOTTOM'
      ? `M${round(WALL_X)} ${round(top)}L${round(WALL_X + depth)} ${round(bottom)}L${round(WALL_X)} ${round(bottom)}`
      : `M${round(WALL_X)} ${round(top)}H${round(WALL_X + depth)}V${round(bottom)}H${round(WALL_X)}`;

  // Two short lines: «вынос 100 см» on one runs off the right edge.
  return {
    side: { wallX: WALL_X, top, bottom, profilePath },
    texts: [
      text(WALL_X + 12, bottom + 16, hasProjection ? 'вынос' : 'сбоку', {
        isMuted: true,
        isBold: false,
        size: 11,
      }),
      ...(hasProjection
        ? [text(WALL_X + 12, bottom + 29, `${projectionCm} см`, { size: 11 })]
        : []),
    ],
  };
};

export type SketchInput = {
  widthCm: number | null;
  heightCm: number | null;
  projectionKind: ProjectionKind;
  projectionCm: number;
  // null for a plain rectangle, as every item saved before shapes is
  shape: { kind: ShapeKind; outline: ShapeOutline } | null;
};

export const layoutOpeningSketch = (input: SketchInput): SketchLayout => {
  const { widthCm, heightCm, shape } = input;

  if (shape !== null && !isRectangleOutline(shape.outline)) {
    return layoutShape(input, shape.kind, shape.outline);
  }

  if (widthCm === null || heightCm === null || widthCm <= 0 || heightCm <= 0) {
    return {
      ...EMPTY_LAYOUT,
      ariaLabel: 'Эскиз',
      placeholder: 'Введите размеры',
    };
  }

  const scale = Math.min(
    RECTANGLE_AREA_WIDTH / widthCm,
    AREA_HEIGHT / heightCm,
  );
  const frontWidth = widthCm * scale;
  const frontHeight = heightCm * scale;
  const left = LEFT + (RECTANGLE_AREA_WIDTH - frontWidth) / 2;
  const top = TOP + (AREA_HEIGHT - frontHeight) / 2;
  const bottom = top + frontHeight;
  const side = sideOf({ ...input, top, bottom, scale });

  return {
    ...EMPTY_LAYOUT,
    ariaLabel: `Эскиз: ${widthCm} на ${heightCm} см`,
    shapePath: `M${round(left)} ${round(top)}H${round(left + frontWidth)}V${round(bottom)}H${round(left)}Z`,
    texts: [
      text(left + frontWidth / 2, bottom + 18, `${widthCm} см`),
      text(left - 8, top + frontHeight / 2, `${heightCm} см`, {
        isRotated: true,
      }),
      ...side.texts,
    ],
    side: side.side,
  };
};

const layoutShape = (
  input: SketchInput,
  kind: ShapeKind,
  outline: ShapeOutline,
): SketchLayout => {
  const widthCm = outline.widthCm;
  const heightCm = outlineHeightCm(outline);
  const scale = Math.min(SHAPE_AREA_WIDTH / widthCm, AREA_HEIGHT / heightCm);
  const frontWidth = widthCm * scale;
  const frontHeight = heightCm * scale;
  const left = LEFT + (SHAPE_AREA_WIDTH - frontWidth) / 2;
  const top = TOP + (AREA_HEIGHT - frontHeight) / 2;
  const bottom = top + frontHeight;
  const right = left + frontWidth;
  const at = (point: ShapePoint) => ({
    x: left + point.xCm * scale,
    y: bottom - point.heightCm * scale,
  });

  const path = [`M${round(left)} ${round(bottom)}`];

  outline.points.forEach((point, index) => {
    const position = at(point);
    const rise = index === 0 ? null : (outline.arcRisesCm[index - 1] ?? null);

    if (rise === null) {
      path.push(`L${round(position.x)} ${round(position.y)}`);

      return;
    }

    const arc = arcOf(outline.points[index - 1], point, rise);
    const radius = arc.radius * scale;

    path.push(
      `A${round(radius)} ${round(radius)} 0 ${arc.isLarge ? 1 : 0} 1 ${round(position.x)} ${round(position.y)}`,
    );
  });
  path.push(`L${round(right)} ${round(bottom)}Z`);

  const texts: SketchText[] = [
    text(left + frontWidth / 2, bottom + 18, `${formatSketchCm(widthCm)} см`),
  ];
  const guides: SketchLine[] = [];
  const markers: SketchLayout['markers'] = [];
  const first = outline.points[0];
  const last = outline.points[outline.points.length - 1];
  const heightAt = (
    point: ShapePoint,
    x: number,
    anchor: SketchText['anchor'],
  ) =>
    text(
      x,
      bottom - (point.heightCm * scale) / 2 + 4,
      formatSketchCm(point.heightCm),
      {
        anchor,
        size: 11,
      },
    );

  if (kind === 'ARCH') {
    const rise = outline.arcRisesCm[0] ?? 0;
    const sideY = at(first).y;
    const middleX = left + frontWidth / 2;

    if (first.heightCm > 0) {
      texts.push(
        text(left - 8, (sideY + bottom) / 2, formatSketchCm(first.heightCm), {
          isRotated: true,
          size: 11,
        }),
      );
    }

    guides.push({
      x1: middleX,
      y1: sideY,
      x2: middleX,
      y2: sideY - rise * scale,
    });
    // Beside the box: inside a flat arch the label would cross the arc.
    const riseLabelY = sideY - (rise * scale) / 2;

    texts.push(
      text(right + 5, riseLabelY - 2, 'стрела', {
        anchor: 'start',
        isMuted: true,
        isBold: false,
        size: 10,
      }),
      text(right + 5, riseLabelY + 11, formatSketchCm(rise), {
        anchor: 'start',
        size: 11,
      }),
    );
  } else if (kind === 'STEP') {
    const levels: { fromX: number; toX: number; heightCm: number }[] = [];

    outline.points.forEach((point, index) => {
      const next = outline.points[index + 1];

      if (
        next !== undefined &&
        next.heightCm === point.heightCm &&
        next.xCm > point.xCm
      ) {
        levels.push({
          fromX: point.xCm,
          toX: next.xCm,
          heightCm: point.heightCm,
        });
      }
    });

    levels.forEach((level, index) => {
      const fromX = left + level.fromX * scale;
      const toX = left + level.toX * scale;
      const y = bottom - level.heightCm * scale;

      texts.push(
        text(
          (fromX + toX) / 2,
          y - 4,
          formatSketchCm(level.toX - level.fromX),
          {
            isMuted: true,
            isBold: false,
            size: 10,
          },
        ),
      );

      if (index === 0) {
        texts.push(
          text(left - 8, (y + bottom) / 2, formatSketchCm(level.heightCm), {
            isRotated: true,
            size: 11,
          }),
        );
      } else if (index === levels.length - 1) {
        texts.push(
          heightAt(
            { xCm: level.toX, heightCm: level.heightCm },
            right + 4,
            'start',
          ),
        );
      } else {
        texts.push(
          text((fromX + toX) / 2, y + 14, formatSketchCm(level.heightCm), {
            size: 11,
          }),
        );
      }
    });
  } else {
    texts.push(
      text(
        left - 8,
        bottom - (first.heightCm * scale) / 2,
        formatSketchCm(first.heightCm),
        {
          isRotated: true,
          size: 11,
        },
      ),
    );
    texts.push(heightAt(last, right + 4, 'start'));

    outline.points.slice(1, -1).forEach((point) => {
      const position = at(point);

      guides.push({
        x1: position.x,
        y1: position.y,
        x2: position.x,
        y2: bottom,
      });
      texts.push(heightAt(point, position.x + 3, 'start'));
    });

    if (kind === 'CUSTOM') {
      outline.points.forEach((point, index) => {
        markers.push({ ...at(point), label: pointLetter(index) });
      });
    }
  }

  const side = sideOf({ ...input, top, bottom, scale });

  return {
    ...EMPTY_LAYOUT,
    ariaLabel: `Эскиз: ${formatSketchCm(widthCm)} на ${formatSketchCm(heightCm)} см`,
    shapePath: path.join(''),
    framePath: `M${round(left)} ${round(top)}H${round(right)}V${round(bottom)}H${round(left)}Z`,
    guides,
    markers,
    texts: [...texts, ...side.texts],
    side: side.side,
  };
};

const BALUSTER_SPACING_PX = 14;

// A railing seen from the front: top rail, bottom rail and the uprights.
export const layoutRailingSketch = ({
  lengthCm,
  heightCm,
}: {
  lengthCm: number | null;
  heightCm: number | null;
}): SketchLayout => {
  if (
    lengthCm === null ||
    heightCm === null ||
    lengthCm <= 0 ||
    heightCm <= 0
  ) {
    return {
      ...EMPTY_LAYOUT,
      ariaLabel: 'Эскиз периллы',
      placeholder: 'Введите длину и высоту',
    };
  }

  const areaWidth = 180;
  const scale = Math.min(areaWidth / lengthCm, AREA_HEIGHT / heightCm);
  const frontWidth = lengthCm * scale;
  const frontHeight = heightCm * scale;
  const left = LEFT + (areaWidth - frontWidth) / 2;
  const top = TOP + (AREA_HEIGHT - frontHeight) / 2;
  const bottom = top + frontHeight;
  const right = left + frontWidth;
  const count = Math.max(1, Math.round(frontWidth / BALUSTER_SPACING_PX));
  const bars: SketchLayout['bars'] = [
    { line: { x1: left, y1: top, x2: right, y2: top }, isThick: true },
    { line: { x1: left, y1: bottom, x2: right, y2: bottom }, isThick: false },
  ];

  for (let index = 0; index <= count; index++) {
    const x = left + (frontWidth * index) / count;

    bars.push({
      line: { x1: x, y1: top, x2: x, y2: bottom },
      isThick: index === 0 || index === count,
    });
  }

  return {
    ...EMPTY_LAYOUT,
    ariaLabel: `Эскиз периллы: ${formatSketchCm(lengthCm)} на ${formatSketchCm(heightCm)} см`,
    bars,
    texts: [
      text(
        left + frontWidth / 2,
        bottom + 18,
        `${formatSketchCm(lengthCm)} см`,
      ),
      text(left - 8, top + frontHeight / 2, `${formatSketchCm(heightCm)} см`, {
        isRotated: true,
      }),
    ],
  };
};
