import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  buildContractDocument,
  contractTermsKey,
  documentText,
  formatSigningTime,
} from 'src/contract/contract-document';
import {
  renderContractPdf,
  sha256Hex,
  shortCheckCode,
} from 'src/contract/contract-pdf';
import { DEFAULT_CONTRACT_TEMPLATE } from 'src/contract/contract-template';
import { SAMPLE_CONTRACT_DATA } from 'src/contract/__tests__/contract-fixtures';

const SIGNATURE = [
  [
    { x: 10, y: 40 },
    { x: 60, y: 10 },
    { x: 120, y: 50 },
  ],
  [{ x: 150, y: 30 }],
];

const render = async () => {
  const document = buildContractDocument(
    DEFAULT_CONTRACT_TEMPLATE,
    SAMPLE_CONTRACT_DATA,
  );
  const checkCode = await sha256Hex(documentText(document));

  return renderContractPdf({
    document,
    companyName: 'PROFMET',
    representative: '',
    sealImage: null,
    signature: SIGNATURE,
    signedAt: new Date('2026-10-09T09:32:00Z'),
    record: {
      orderName: '№1012',
      clientName: SAMPLE_CONTRACT_DATA.clientName,
      clientPhone: SAMPLE_CONTRACT_DATA.clientPhone,
      signedAtText: '9 октября 2026, 14:32',
      signedBy: 'Qosimbek',
      device: 'iPad, Safari',
      templateVersion: 1,
      checkCode,
    },
  });
};

describe('the signed contract PDF', () => {
  it('is a PDF of several A4 pages', async () => {
    const bytes = await render();
    const pdf = await PDFDocument.load(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(pdf.getPage(0).getSize().width).toBeCloseTo(595.28);
    expect(pdf.getTitle()).toBe('Договор №1012');
  });

  it('comes out the same for the same signing', async () => {
    const [first, second] = await Promise.all([render(), render()]);

    expect(first.length).toBe(second.length);
  });
});

describe('the check code', () => {
  it('changes with any word the client was shown', async () => {
    const document = buildContractDocument(
      DEFAULT_CONTRACT_TEMPLATE,
      SAMPLE_CONTRACT_DATA,
    );
    const changed = buildContractDocument(DEFAULT_CONTRACT_TEMPLATE, {
      ...SAMPLE_CONTRACT_DATA,
      total: SAMPLE_CONTRACT_DATA.total + 1000,
    });

    expect(await sha256Hex(documentText(document))).not.toBe(
      await sha256Hex(documentText(changed)),
    );
  });

  it('shortens to its first eight and last four characters', () => {
    expect(shortCheckCode('7f3a91c2' + '0'.repeat(52) + '4be0')).toBe(
      '7f3a 91c2 … 4be0',
    );
  });
});

describe('the terms the client agreed to', () => {
  it('do not depend on the order the проёмы come back in', () => {
    expect(
      contractTermsKey({
        total: SAMPLE_CONTRACT_DATA.total,
        openings: [...SAMPLE_CONTRACT_DATA.openings].reverse(),
      }),
    ).toBe(contractTermsKey(SAMPLE_CONTRACT_DATA));
  });

  it('change with a size, a grille or the total', () => {
    const key = contractTermsKey(SAMPLE_CONTRACT_DATA);
    const [first, ...rest] = SAMPLE_CONTRACT_DATA.openings;

    expect(
      contractTermsKey({
        total: SAMPLE_CONTRACT_DATA.total,
        openings: [{ ...first, widthCm: 151 }, ...rest],
      }),
    ).not.toBe(key);
    expect(
      contractTermsKey({
        total: SAMPLE_CONTRACT_DATA.total,
        openings: [{ ...first, designId: 'other' }, ...rest],
      }),
    ).not.toBe(key);
    expect(
      contractTermsKey({ ...SAMPLE_CONTRACT_DATA, total: 4_900_000 }),
    ).not.toBe(key);
  });

  it('ignore a вынос typed for a проём marked «Вынос не нужен»', () => {
    const [first, ...rest] = SAMPLE_CONTRACT_DATA.openings;

    expect(
      contractTermsKey({
        total: SAMPLE_CONTRACT_DATA.total,
        openings: [
          { ...first, projectionKind: 'NONE', projectionCm: 30 },
          ...rest,
        ],
      }),
    ).toBe(
      contractTermsKey({
        total: SAMPLE_CONTRACT_DATA.total,
        openings: [
          { ...first, projectionKind: 'NONE', projectionCm: 0 },
          ...rest,
        ],
      }),
    );
  });
});

describe('the signing time', () => {
  it('is read in Tashkent', () => {
    expect(formatSigningTime(new Date('2026-10-09T09:32:00Z'))).toBe(
      '9 октября 2026, 14:32',
    );
  });
});
