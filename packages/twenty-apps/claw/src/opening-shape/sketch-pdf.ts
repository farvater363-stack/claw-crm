import { type Color, degrees, type PDFFont, type PDFPage, rgb } from 'pdf-lib';

import {
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
  type SketchLayout,
  type SketchLine,
} from 'src/opening-shape/sketch-layout';

export const SKETCH_INK = rgb(0.11, 0.13, 0.11);
export const SKETCH_MUTED = rgb(0.38, 0.42, 0.39);
export const SKETCH_ACCENT = rgb(0.18, 0.36, 0.31);
export const SKETCH_FILL = rgb(0.88, 0.92, 0.9);
const WHITE = rgb(1, 1, 1);

export type SketchPainter = {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  // Replaces what the embedded font cannot draw
  clean: (text: string) => string;
};

// The same picture SketchDrawing paints on screen, at `left`/`top` in points
// and `unit` points per sketch unit.
export const drawSketchLayout = (
  { page, regular, bold, clean }: SketchPainter,
  layout: SketchLayout,
  { left, top, unit }: { left: number; top: number; unit: number },
) => {
  const at = (x: number, y: number) => ({
    x: left + x * unit,
    y: top - y * unit,
  });
  const line = (
    { x1, y1, x2, y2 }: SketchLine,
    color: Color,
    thickness: number,
    dashArray?: number[],
  ) =>
    page.drawLine({
      start: at(x1, y1),
      end: at(x2, y2),
      thickness: thickness * unit,
      color,
      dashArray: dashArray?.map((length) => length * unit),
    });
  const path = (
    d: string,
    options: {
      fill?: Color;
      border: Color;
      width: number;
      dashArray?: number[];
    },
  ) =>
    page.drawSvgPath(d, {
      x: left,
      y: top,
      scale: unit,
      color: options.fill,
      borderColor: options.border,
      borderWidth: options.width * unit,
      borderDashArray: options.dashArray?.map((length) => length * unit),
    });
  const write = (
    text: string,
    x: number,
    y: number,
    {
      size,
      isBold,
      color,
      anchor,
      isRotated = false,
    }: {
      size: number;
      isBold: boolean;
      color: Color;
      anchor: 'start' | 'middle' | 'end';
      isRotated?: boolean;
    },
  ) => {
    const font = isBold ? bold : regular;
    const value = clean(text);
    const fontSize = size * unit;
    const width = font.widthOfTextAtSize(value, fontSize);
    const shift =
      anchor === 'start' ? 0 : anchor === 'middle' ? width / 2 : width;
    const point = at(x, y);

    page.drawText(value, {
      x: isRotated ? point.x : point.x - shift,
      y: isRotated ? point.y - shift : point.y,
      font,
      size: fontSize,
      color,
      rotate: isRotated ? degrees(90) : undefined,
    });
  };

  if (layout.placeholder !== null) {
    path('M50 20H170V140H50Z', {
      border: SKETCH_MUTED,
      width: 1.5,
      dashArray: [6, 6],
    });
    write(layout.placeholder, 110, 84, {
      size: 12,
      isBold: false,
      color: SKETCH_MUTED,
      anchor: 'middle',
    });

    return;
  }

  if (layout.framePath !== null) {
    path(layout.framePath, {
      border: SKETCH_MUTED,
      width: 1,
      dashArray: [4, 4],
    });
  }

  if (layout.shapePath !== null) {
    path(layout.shapePath, { fill: SKETCH_FILL, border: SKETCH_INK, width: 2 });
  }

  layout.guides.forEach((guide) => line(guide, SKETCH_MUTED, 1, [2, 3]));
  layout.bars.forEach(({ line: bar, isThick }) =>
    line(bar, SKETCH_ACCENT, isThick ? 3 : 1.5),
  );
  layout.markers.forEach((marker) => {
    page.drawCircle({
      ...at(marker.x, marker.y),
      size: 6 * unit,
      color: SKETCH_ACCENT,
    });
    write(marker.label, marker.x, marker.y + 3.5, {
      size: 9,
      isBold: true,
      color: WHITE,
      anchor: 'middle',
    });
  });

  const { side } = layout;

  if (side !== null) {
    line(
      {
        x1: side.wallX - 2,
        y1: side.top - 6,
        x2: side.wallX - 2,
        y2: side.bottom + 6,
      },
      SKETCH_MUTED,
      1,
      [2, 3],
    );

    if (side.profilePath === null) {
      line(
        { x1: side.wallX, y1: side.top, x2: side.wallX, y2: side.bottom },
        SKETCH_ACCENT,
        3,
      );
    } else {
      path(side.profilePath, {
        fill: SKETCH_FILL,
        border: SKETCH_ACCENT,
        width: 2.5,
      });
    }
  }

  layout.texts.forEach((label) =>
    write(label.text, label.x, label.y, {
      size: label.size,
      isBold: label.isBold,
      color: label.isMuted ? SKETCH_MUTED : SKETCH_INK,
      anchor: label.anchor,
      isRotated: label.isRotated,
    }),
  );
};

// Points per sketch unit for a box `width` × `height` points.
export const fitSketch = (width: number, height: number): number =>
  Math.min(width / SKETCH_WIDTH, height / SKETCH_HEIGHT);
