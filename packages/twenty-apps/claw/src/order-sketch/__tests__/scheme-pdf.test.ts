import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { toSchemeOpenings } from 'src/order-sketch/order-sketch';
import { renderSchemePdf } from 'src/order-sketch/scheme-pdf';

const row = {
  id: 'item',
  widthCm: 140,
  heightCm: 150,
  projectionCm: 0,
  projectionKind: 'NONE',
  quantity: 1,
  designName: 'Ромб',
};

describe('renderSchemePdf', () => {
  it('prints shapes, railings and openings without sizes, six to a page', async () => {
    const openings = toSchemeOpenings([
      row,
      {
        ...row,
        widthCm: 124,
        heightCm: 62,
        shape: {
          version: 1,
          kind: 'ARCH',
          outline: {
            widthCm: 124,
            points: [
              { xCm: 0, heightCm: 0 },
              { xCm: 124, heightCm: 0 },
            ],
            arcRisesCm: [62],
          },
          draft: {},
        },
      },
      { ...row, product: 'RAILING', widthCm: 450, heightCm: 90 },
      { ...row, widthCm: null },
      row,
      row,
      row,
    ]);
    const bytes = await renderSchemePdf({
      title: 'Схема №1012',
      subtitle: 'Азиз Рахимов · Чиланзар, ул. Катартал, 5',
      openings,
      printedAt: new Date('2026-10-12T10:00:00Z'),
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });
});
