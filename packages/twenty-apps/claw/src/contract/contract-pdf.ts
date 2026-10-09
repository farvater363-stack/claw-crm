import fontkit from '@pdf-lib/fontkit';
import {
  degrees,
  LineCapStyle,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  PDFDocument,
  rgb,
} from 'pdf-lib';

import {
  type ContractBlock,
  type ContractDocument,
  type ContractOpening,
  describeOpeningSize,
} from 'src/contract/contract-document';
import {
  PT_SERIF_BOLD_BASE64,
  PT_SERIF_REGULAR_BASE64,
} from 'src/contract/contract-fonts';
import { type ContractRun } from 'src/contract/contract-template';
import { sha256 } from 'src/contract/sha256';
import { formatWhole } from 'src/ui/format';

export type SignaturePoint = { x: number; y: number };
export type SignatureStroke = SignaturePoint[];

export type SigningRecord = {
  orderName: string;
  clientName: string;
  clientPhone: string;
  signedAtText: string;
  signedBy: string;
  device: string;
  templateVersion: number;
  checkCode: string;
};

export type ContractPdfInput = {
  document: ContractDocument;
  companyName: string;
  representative: string;
  // A PNG or JPEG data URL
  sealImage: string | null;
  signature: SignatureStroke[];
  // Stamped as the file's own dates, so the same signing gives the same file
  signedAt: Date;
  record: SigningRecord;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 64;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN_X;
const BODY_SIZE = 10.5;
const BODY_LEADING = 14.5;
const SMALL_SIZE = 8.5;
const BULLET_INDENT = 14;
const SCHEME_COLUMNS = 3;
const SCHEME_CELL_HEIGHT = 168;
const SIGNATURE_BOX = { width: 200, height: 80 };
const SEAL_BOX = { width: 150, height: 80 };

const INK = rgb(0.11, 0.13, 0.11);
const MUTED = rgb(0.38, 0.42, 0.39);
const RULE = rgb(0.75, 0.77, 0.74);
const ACCENT = rgb(0.18, 0.36, 0.31);
const FILL = rgb(0.88, 0.92, 0.9);

// Characters the cut-down font lacks, swapped for the nearest it has.
const SUBSTITUTES: Record<string, string> = {
  ʻ: '‘',
  ʼ: '’',
  '‑': '-',
  '\t': ' ',
};

type Fonts = { regular: PDFFont; bold: PDFFont };

type Cursor = { page: PDFPage; y: number };

const fromBase64 = (base64: string): Uint8Array =>
  Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

const makeSanitizer = (font: PDFFont) => {
  const supported = new Set(font.getCharacterSet());

  return (text: string): string =>
    [...text]
      .map((character) => SUBSTITUTES[character] ?? character)
      .map((character) =>
        supported.has(character.codePointAt(0) ?? 0) ? character : '?',
      )
      .join('');
};

export const sha256Hex = async (
  bytes: Uint8Array | string,
): Promise<string> => {
  const data =
    typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;

  return [...sha256(data)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

// «7f3a 91c2 … 4be0»: short enough for a footer, long enough to compare.
export const shortCheckCode = (checkCode: string): string =>
  `${checkCode.slice(0, 4)} ${checkCode.slice(4, 8)} … ${checkCode.slice(-4)}`;

const embedDataUrlImage = async (
  pdf: PDFDocument,
  dataUrl: string,
): Promise<PDFImage | null> => {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl);

  if (match === null) return null;

  const bytes = fromBase64(match[2]);

  try {
    return match[1] === 'png'
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
};

export const renderContractPdf = async (
  input: ContractPdfInput,
): Promise<Uint8Array> => {
  const pdf = await PDFDocument.create();

  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Договор ${input.record.orderName}`);
  pdf.setCreator('Claw CRM');
  pdf.setCreationDate(input.signedAt);
  pdf.setModificationDate(input.signedAt);

  const fonts: Fonts = {
    regular: await pdf.embedFont(fromBase64(PT_SERIF_REGULAR_BASE64)),
    bold: await pdf.embedFont(fromBase64(PT_SERIF_BOLD_BASE64)),
  };
  const clean = makeSanitizer(fonts.regular);
  const seal =
    input.sealImage === null
      ? null
      : await embedDataUrlImage(pdf, input.sealImage);

  const newPage = (): Cursor => ({
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN_TOP,
  });

  let cursor = newPage();

  const ensureSpace = (height: number) => {
    if (cursor.y - height < MARGIN_BOTTOM) cursor = newPage();
  };

  const drawText = (
    text: string,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
    color = INK,
  ) => cursor.page.drawText(clean(text), { x, y, font, size, color });

  const widthOf = (text: string, font: PDFFont, size: number) =>
    font.widthOfTextAtSize(clean(text), size);

  // Words carry their run's weight; a filled value is set in bold.
  const wrapRuns = (
    runs: ContractRun[],
    width: number,
    size: number,
  ): { text: string; font: PDFFont }[][] => {
    const words = runs.flatMap((run) =>
      run.text
        .split(/(\s+)/)
        .filter((part) => part !== '')
        .map((part) => ({
          text: part,
          font: run.isFilled ? fonts.bold : fonts.regular,
        })),
    );
    const lines: { text: string; font: PDFFont }[][] = [[]];
    let lineWidth = 0;

    for (const word of words) {
      const isSpace = /^\s+$/.test(word.text);
      const wordWidth = widthOf(isSpace ? ' ' : word.text, word.font, size);
      const line = lines[lines.length - 1];

      if (isSpace) {
        if (line.length > 0) {
          line.push({ text: ' ', font: word.font });
          lineWidth += wordWidth;
        }
        continue;
      }

      if (lineWidth + wordWidth > width && line.length > 0) {
        while (line.length > 0 && line[line.length - 1].text === ' ') {
          line.pop();
        }
        lines.push([word]);
        lineWidth = wordWidth;
      } else {
        line.push(word);
        lineWidth += wordWidth;
      }
    }

    return lines.filter((line) => line.length > 0);
  };

  const drawRunLine = (
    line: { text: string; font: PDFFont }[],
    x: number,
    y: number,
    size: number,
  ) => {
    let offset = x;

    for (const piece of line) {
      drawText(piece.text, offset, y, piece.font, size);
      offset += widthOf(piece.text, piece.font, size);
    }
  };

  const lineWidthOf = (line: { text: string; font: PDFFont }[], size: number) =>
    line.reduce((sum, piece) => sum + widthOf(piece.text, piece.font, size), 0);

  const paragraph = (
    runs: ContractRun[],
    {
      indent = 0,
      size = BODY_SIZE,
      leading = BODY_LEADING,
      align = 'left',
      bullet = false,
    }: {
      indent?: number;
      size?: number;
      leading?: number;
      align?: 'left' | 'center';
      bullet?: boolean;
    } = {},
  ) => {
    const lines = wrapRuns(runs, CONTENT_WIDTH - indent, size);

    lines.forEach((line, index) => {
      ensureSpace(leading);
      cursor.y -= leading;

      const x =
        align === 'center'
          ? MARGIN_X + (CONTENT_WIDTH - lineWidthOf(line, size)) / 2
          : MARGIN_X + indent;

      if (bullet && index === 0) {
        drawText('•', MARGIN_X + indent - 10, cursor.y, fonts.regular, size);
      }

      drawRunLine(line, x, cursor.y, size);
    });
  };

  const heading = (text: string, spaceBefore = 10) => {
    ensureSpace(spaceBefore + 3 * BODY_LEADING);
    cursor.y -= spaceBefore;
    paragraph([{ text, isFilled: true }], { align: 'center', size: 11 });
    cursor.y -= 3;
  };

  const drawBlock = (block: ContractBlock) => {
    switch (block.kind) {
      case 'title':
        paragraph(
          block.runs.map((run) => ({ ...run, isFilled: true })),
          {
            align: 'center',
            size: 14,
            leading: 19,
          },
        );
        return;
      case 'subtitle':
        paragraph(
          block.runs.map((run) => ({ ...run, isFilled: true })),
          {
            align: 'center',
            size: 11,
          },
        );
        cursor.y -= 6;
        return;
      case 'dateline': {
        ensureSpace(BODY_LEADING + 8);
        cursor.y -= BODY_LEADING;
        const right = wrapRuns(block.right, CONTENT_WIDTH / 2, BODY_SIZE)[0];

        drawRunLine(
          wrapRuns(block.left, CONTENT_WIDTH / 2, BODY_SIZE)[0] ?? [],
          MARGIN_X,
          cursor.y,
          BODY_SIZE,
        );
        drawRunLine(
          right ?? [],
          MARGIN_X + CONTENT_WIDTH - lineWidthOf(right ?? [], BODY_SIZE),
          cursor.y,
          BODY_SIZE,
        );
        cursor.y -= 8;
        return;
      }
      case 'heading':
        heading(block.text);
        return;
      case 'bullet':
        paragraph(block.runs, { indent: BULLET_INDENT + 10, bullet: true });
        return;
      case 'paragraph':
        paragraph(block.runs);
        cursor.y -= 2;
    }
  };

  input.document.blocks.forEach(drawBlock);

  drawSpecification(input.document);
  drawScheme(input.document.openings);
  drawSignatures();

  function drawSpecification(document: ContractDocument) {
    heading('ПРИЛОЖЕНИЕ 1. СПЕЦИФИКАЦИЯ', 18);

    const columns = [
      { title: '№', width: 22 },
      { title: 'Изделие', width: 0 },
      { title: 'Размер, см', width: 92 },
      { title: 'Кол-во', width: 42 },
      { title: 'м²', width: 40 },
      { title: 'Сумма, сум', width: 76 },
    ];
    const fixed = columns.reduce((sum, column) => sum + column.width, 0);

    columns[1].width = CONTENT_WIDTH - fixed;

    const size = 9;
    const leading = 12;
    const padding = 4;

    const row = (cells: string[], isHeader: boolean) => {
      const font = isHeader ? fonts.bold : fonts.regular;
      const wrapped = cells.map((cell, index) =>
        wrapRuns(
          [{ text: cell, isFilled: isHeader }],
          columns[index].width - 2 * padding,
          size,
        ),
      );
      const height =
        Math.max(...wrapped.map((lines) => Math.max(lines.length, 1))) *
          leading +
        2 * padding;

      ensureSpace(height);

      const top = cursor.y;

      if (isHeader) {
        cursor.page.drawRectangle({
          x: MARGIN_X,
          y: top - height,
          width: CONTENT_WIDTH,
          height,
          color: FILL,
        });
      }

      let x = MARGIN_X;

      wrapped.forEach((lines, index) => {
        const isNumber = index >= 3 && !isHeader;

        lines.forEach((line, lineIndex) => {
          const lineY = top - padding - (lineIndex + 1) * leading + 3;
          const lineX = isNumber
            ? x + columns[index].width - padding - lineWidthOf(line, size)
            : x + padding;

          drawRunLine(
            line.map((piece) => ({ ...piece, font })),
            lineX,
            lineY,
            size,
          );
        });
        x += columns[index].width;
      });

      cursor.page.drawLine({
        start: { x: MARGIN_X, y: top - height },
        end: { x: MARGIN_X + CONTENT_WIDTH, y: top - height },
        thickness: 0.6,
        color: RULE,
      });
      cursor.y = top - height;
    };

    cursor.y -= 4;
    cursor.page.drawLine({
      start: { x: MARGIN_X, y: cursor.y },
      end: { x: MARGIN_X + CONTENT_WIDTH, y: cursor.y },
      thickness: 0.6,
      color: RULE,
    });
    row(
      columns.map((column) => column.title),
      true,
    );
    document.openings.forEach((opening, index) =>
      row(
        [
          String(index + 1),
          [opening.product, opening.visorText].filter(Boolean).join(', '),
          describeOpeningSize(opening),
          String(opening.quantity),
          opening.areaSquareMeters === null
            ? '—'
            : opening.areaSquareMeters.toFixed(2),
          opening.lineTotal === null ? '—' : formatWhole(opening.lineTotal),
        ],
        false,
      ),
    );
    cursor.y -= 6;
    document.specificationNotes.forEach((note) =>
      paragraph([{ text: note, isFilled: note.startsWith('Итого') }]),
    );
  }

  function drawScheme(openings: ContractOpening[]) {
    const drawn = openings.filter(
      (opening) => opening.widthCm !== null && opening.heightCm !== null,
    );

    if (drawn.length === 0) return;

    // The title stays on the page of the first row of drawings.
    ensureSpace(18 + 3 * BODY_LEADING + SCHEME_CELL_HEIGHT);
    heading('ПРИЛОЖЕНИЕ 2. СХЕМА', 18);
    paragraph(
      [
        {
          text: 'Схема проёмов по замеру: вид спереди и сбоку. Размеры в сантиметрах.',
          isFilled: false,
        },
      ],
      { size: 9.5 },
    );
    cursor.y -= 6;

    const cellWidth = CONTENT_WIDTH / SCHEME_COLUMNS;

    for (let start = 0; start < drawn.length; start += SCHEME_COLUMNS) {
      ensureSpace(SCHEME_CELL_HEIGHT);

      const top = cursor.y;

      drawn.slice(start, start + SCHEME_COLUMNS).forEach((opening, index) => {
        drawSketchCell(opening, MARGIN_X + index * cellWidth, top, cellWidth);
      });
      cursor.y = top - SCHEME_CELL_HEIGHT;
    }
  }

  // The same drawing as the order page's «Схема» (OpeningSketch), in points.
  function drawSketchCell(
    opening: ContractOpening,
    left: number,
    top: number,
    width: number,
  ) {
    const inner = width - 8;
    const page = cursor.page;

    page.drawRectangle({
      x: left + 4,
      y: top - SCHEME_CELL_HEIGHT + 6,
      width: inner,
      height: SCHEME_CELL_HEIGHT - 6,
      borderColor: RULE,
      borderWidth: 0.6,
    });

    const title =
      opening.quantity > 1
        ? `${opening.title} × ${opening.quantity}`
        : opening.title;

    drawText(title, left + 10, top - 16, fonts.bold, 9);

    const widthCm = opening.widthCm ?? 0;
    const heightCm = opening.heightCm ?? 0;
    // A 240 × 172 drawing, as on screen, fitted to the cell.
    const unit = Math.min(inner / 240, 110 / 172);
    const originX = left + 4 + (inner - 240 * unit) / 2;
    const originTop = top - 22;
    const at = (x: number, y: number) => ({
      x: originX + x * unit,
      y: originTop - y * unit,
    });
    const scale = Math.min(140 / widthCm, 120 / heightCm);
    const frontWidth = widthCm * scale;
    const frontHeight = heightCm * scale;
    const frontLeft = 30 + (140 - frontWidth) / 2;
    const frontTop = 18 + (120 - frontHeight) / 2;
    const bottom = frontTop + frontHeight;
    const wall = 200;
    const depth = Math.min(opening.projectionCm * scale, 32);
    const hasProjection =
      opening.projectionKind !== 'NONE' && opening.projectionCm > 0;

    page.drawRectangle({
      ...at(frontLeft, bottom),
      width: frontWidth * unit,
      height: frontHeight * unit,
      color: FILL,
      borderColor: INK,
      borderWidth: 1,
    });

    const widthLabel = `${widthCm}`;
    const labelSize = 8;
    const widthLabelAt = at(frontLeft + frontWidth / 2, bottom + 14);

    drawText(
      widthLabel,
      widthLabelAt.x - widthOf(widthLabel, fonts.bold, labelSize) / 2,
      widthLabelAt.y,
      fonts.bold,
      labelSize,
    );

    const heightLabel = `${heightCm}`;
    const heightLabelAt = at(frontLeft - 6, frontTop + frontHeight / 2);

    page.drawText(clean(heightLabel), {
      x: heightLabelAt.x,
      y: heightLabelAt.y - widthOf(heightLabel, fonts.bold, labelSize) / 2,
      font: fonts.bold,
      size: labelSize,
      color: INK,
      rotate: degrees(90),
    });

    for (let y = frontTop - 6; y < bottom + 6; y += 5) {
      page.drawLine({
        start: at(wall - 2, y),
        end: at(wall - 2, Math.min(y + 2, bottom + 6)),
        thickness: 0.5,
        color: MUTED,
      });
    }

    if (hasProjection) {
      const points =
        opening.projectionKind === 'BOTTOM'
          ? [
              [wall, frontTop],
              [wall + depth, bottom],
              [wall, bottom],
            ]
          : [
              [wall, frontTop],
              [wall + depth, frontTop],
              [wall + depth, bottom],
              [wall, bottom],
            ];

      points.slice(1).forEach(([x, y], index) => {
        const [fromX, fromY] = points[index];

        page.drawLine({
          start: at(fromX, fromY),
          end: at(x, y),
          thickness: 1.6,
          color: ACCENT,
        });
      });
    } else {
      page.drawLine({
        start: at(wall, frontTop),
        end: at(wall, bottom),
        thickness: 2,
        color: ACCENT,
      });
    }

    const sideLabel = hasProjection ? `вынос ${opening.projectionCm}` : 'сбоку';
    const sideLabelAt = at(wall + 12, bottom + 14);

    drawText(
      sideLabel,
      sideLabelAt.x - widthOf(sideLabel, fonts.regular, 7.5) / 2,
      sideLabelAt.y,
      fonts.regular,
      7.5,
      MUTED,
    );

    const captionTop = originTop - 172 * unit - 4;
    const caption = wrapRuns(
      [{ text: opening.product, isFilled: true }],
      inner - 12,
      8.5,
    ).slice(0, 2);

    caption.forEach((line, index) =>
      drawRunLine(line, left + 10, captionTop - (index + 1) * 11, 8.5),
    );

    const detail = [
      describeOpeningSize(opening),
      opening.areaSquareMeters === null
        ? null
        : `${opening.areaSquareMeters.toFixed(2)} м²`,
    ]
      .filter(Boolean)
      .join(' · ');

    drawText(
      detail,
      left + 10,
      captionTop - (caption.length + 1) * 11,
      fonts.regular,
      8,
      MUTED,
    );
  }

  function drawSignatures() {
    const blockHeight = 240;

    ensureSpace(blockHeight);
    heading('ПОДПИСИ СТОРОН', 18);
    cursor.y -= 6;

    const top = cursor.y;
    const columnWidth = CONTENT_WIDTH / 2 - 10;
    const rightX = MARGIN_X + CONTENT_WIDTH / 2 + 10;
    const page = cursor.page;

    drawText('Исполнитель', MARGIN_X, top - 12, fonts.bold, 10);
    drawText(input.companyName, MARGIN_X, top - 26, fonts.regular, 10);

    if (input.representative.trim() !== '') {
      drawText(
        input.representative,
        MARGIN_X,
        top - 40,
        fonts.regular,
        9,
        MUTED,
      );
    }

    if (seal !== null) {
      const fit = Math.min(
        SEAL_BOX.width / seal.width,
        SEAL_BOX.height / seal.height,
      );

      page.drawImage(seal, {
        x: MARGIN_X,
        y: top - 50 - seal.height * fit,
        width: seal.width * fit,
        height: seal.height * fit,
      });
    }

    drawText('Заказчик', rightX, top - 12, fonts.bold, 10);
    drawText(input.record.clientName, rightX, top - 26, fonts.regular, 10);
    drawSignature(rightX, top - 40);

    const lineY = top - 40 - SIGNATURE_BOX.height - 6;

    [MARGIN_X, rightX].forEach((x) =>
      page.drawLine({
        start: { x, y: lineY },
        end: { x: x + columnWidth, y: lineY },
        thickness: 0.6,
        color: INK,
      }),
    );
    drawText(
      `Подписано на экране ${input.record.signedAtText}`,
      rightX,
      lineY - 12,
      fonts.regular,
      8.5,
      MUTED,
    );

    cursor.y = lineY - 30;

    const details: [string, string][] = [
      ['Заказ', input.record.orderName],
      ['Клиент', input.record.clientName],
      ['Телефон', input.record.clientPhone],
      ['Время подписания', `${input.record.signedAtText} (Ташкент)`],
      ['Чей планшет', input.record.signedBy],
      ['Устройство', input.record.device],
      ['Версия договора', String(input.record.templateVersion)],
      ['Код проверки', input.record.checkCode],
    ];

    ensureSpace(details.length * 12 + 20);
    drawText(
      'Сведения об электронном подписании (раздел 14 договора)',
      MARGIN_X,
      cursor.y,
      fonts.bold,
      9,
    );
    cursor.y -= 4;

    for (const [label, value] of details) {
      const lines = wrapRuns(
        [{ text: value, isFilled: false }],
        CONTENT_WIDTH - 110,
        SMALL_SIZE,
      );

      lines.forEach((line, index) => {
        ensureSpace(11);
        cursor.y -= 11;

        if (index === 0) {
          drawText(label, MARGIN_X, cursor.y, fonts.regular, SMALL_SIZE, MUTED);
        }

        drawRunLine(line, MARGIN_X + 110, cursor.y, SMALL_SIZE);
      });
    }
  }

  // The strokes as drawn on the pad, fitted to the signature box.
  function drawSignature(left: number, top: number) {
    const points = input.signature.flat();

    if (points.length === 0) return;

    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const spanX = Math.max(...points.map((point) => point.x)) - minX || 1;
    const spanY = Math.max(...points.map((point) => point.y)) - minY || 1;
    const fit = Math.min(
      SIGNATURE_BOX.width / spanX,
      SIGNATURE_BOX.height / spanY,
      1,
    );
    const at = (point: SignaturePoint) => ({
      x: left + (point.x - minX) * fit,
      y: top - (point.y - minY) * fit,
    });

    for (const stroke of input.signature) {
      // A lone point is doubled so a tap shows as a dot.
      const path = stroke.length === 1 ? [stroke[0], stroke[0]] : stroke;

      path.slice(1).forEach((point, index) => {
        const start = at(path[index]);
        const end = at(point);

        cursor.page.drawLine({
          start,
          end:
            start.x === end.x && start.y === end.y
              ? { x: end.x + 0.4, y: end.y }
              : end,
          thickness: 1.4,
          color: INK,
          lineCap: LineCapStyle.Round,
        });
      });
    }
  }

  const pages = pdf.getPages();
  const footerCode = shortCheckCode(input.record.checkCode);

  pages.forEach((page, index) => {
    const footer = `Договор ${input.record.orderName} · Код проверки ${footerCode} · стр. ${index + 1} из ${pages.length}`;

    page.drawText(clean(footer), {
      x: MARGIN_X,
      y: 32,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
  });

  return pdf.save();
};
