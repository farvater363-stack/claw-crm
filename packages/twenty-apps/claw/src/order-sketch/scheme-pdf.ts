import { PDFDocument, rgb } from 'pdf-lib';

import { embedPrintFonts } from 'src/contract/contract-pdf';
import { SKETCH_WIDTH } from 'src/opening-shape/sketch-layout';
import { drawSketchLayout, fitSketch } from 'src/opening-shape/sketch-pdf';
import {
  type SchemeOpening,
  schemeProductName,
  schemeSketchLayout,
} from 'src/order-sketch/order-sketch';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const COLUMNS = 2;
const ROWS = 3;
const HEADER_HEIGHT = 46;
const INK = rgb(0.11, 0.13, 0.11);
const MUTED = rgb(0.38, 0.42, 0.39);
const RULE = rgb(0.75, 0.77, 0.74);

// The order's «Схема» on A4 for the workshop and the installers: six проёмы a
// page, each with its drawing, product and sizes.
export const renderSchemePdf = async ({
  title,
  subtitle,
  openings,
  printedAt,
}: {
  title: string;
  subtitle: string;
  openings: SchemeOpening[];
  printedAt: Date;
}): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();

  pdf.setTitle(title);
  pdf.setCreator('Claw CRM');
  pdf.setCreationDate(printedAt);

  const { regular, bold, clean } = await embedPrintFonts(pdf);
  const cellWidth = (PAGE_WIDTH - 2 * MARGIN) / COLUMNS;
  const cellHeight = (PAGE_HEIGHT - 2 * MARGIN - HEADER_HEIGHT) / ROWS;
  const perPage = COLUMNS * ROWS;
  const pageCount = Math.max(1, Math.ceil(openings.length / perPage));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const write = (
      text: string,
      x: number,
      y: number,
      {
        size,
        isBold = false,
        color = INK,
      }: { size: number; isBold?: boolean; color?: typeof INK },
    ) =>
      page.drawText(clean(text), {
        x,
        y,
        size,
        font: isBold ? bold : regular,
        color,
      });

    write(title, MARGIN, PAGE_HEIGHT - MARGIN - 14, { size: 16, isBold: true });
    write(
      pageCount > 1
        ? `${subtitle} · лист ${pageIndex + 1} из ${pageCount}`
        : subtitle,
      MARGIN,
      PAGE_HEIGHT - MARGIN - 32,
      { size: 9.5, color: MUTED },
    );

    openings
      .slice(pageIndex * perPage, (pageIndex + 1) * perPage)
      .forEach((opening, index) => {
        const left = MARGIN + (index % COLUMNS) * cellWidth;
        const top =
          PAGE_HEIGHT -
          MARGIN -
          HEADER_HEIGHT -
          Math.floor(index / COLUMNS) * cellHeight;
        const inner = cellWidth - 10;

        page.drawRectangle({
          x: left + 5,
          y: top - cellHeight + 5,
          width: inner,
          height: cellHeight - 10,
          borderColor: RULE,
          borderWidth: 0.6,
        });
        write(
          opening.quantity > 1
            ? `${opening.title} × ${opening.quantity}`
            : opening.title,
          left + 14,
          top - 22,
          { size: 11, isBold: true },
        );

        const unit = fitSketch(inner - 20, cellHeight - 90);

        drawSketchLayout(
          { page, regular, bold, clean },
          schemeSketchLayout(opening),
          {
            left: left + 5 + (inner - SKETCH_WIDTH * unit) / 2,
            top: top - 30,
            unit,
          },
        );
        write(schemeProductName(opening), left + 14, top - cellHeight + 34, {
          size: 10,
          isBold: true,
        });
        write(
          opening.sketch === null
            ? 'Размеры не указаны'
            : `${opening.sketch.sizeText} см · ${opening.sketch.unitsText}`,
          left + 14,
          top - cellHeight + 20,
          { size: 9, color: MUTED },
        );
      });
  }

  return pdf.save();
};
