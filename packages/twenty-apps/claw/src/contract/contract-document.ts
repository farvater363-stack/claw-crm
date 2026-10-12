import { type ProjectionKind } from 'src/constants/select-options';
import {
  type ContractRun,
  type ContractTemplate,
  fillPlaceholders,
  orBlank,
  type PlaceholderValues,
} from 'src/contract/contract-template';
import {
  shapeKindLabel,
  type StoredShape,
} from 'src/opening-shape/opening-shape';
import {
  layoutOpeningSketch,
  layoutRailingSketch,
  type SketchLayout,
} from 'src/opening-shape/sketch-layout';
import {
  formatItemSize,
  formatRailingSize,
} from 'src/pricing/compute-item-area';
import { roundTo } from 'src/pricing/round';
import { formatWhole } from 'src/ui/format';

// One проём as the client agrees to it: the спецификация row and its схема.
export type ContractOpening = {
  title: string;
  // Grille name, or what stands in for it («Только козырёк»)
  product: string;
  widthCm: number | null;
  heightCm: number | null;
  projectionKind: ProjectionKind;
  projectionCm: number;
  quantity: number;
  areaSquareMeters: number | null;
  // Visor fitted with this проём, as «Козырёк Стандарт, 120 см»
  visorText: string | null;
  lineTotal: number | null;
  // Grille id, so a later grille change counts as a changed order
  designId: string | null;
  // Width is the railing's length, priced per п.м.
  isRailing?: boolean;
  shape?: StoredShape | null;
};

// A visor or a service line as the order stores it: running metres for a
// visor (length times pieces), the priced quantity for a service.
export type ContractExtra = {
  serviceId: string;
  quantity: number;
};

export type ContractData = {
  // Null before a new order is saved and numbered
  number: string | null;
  signedOn: string;
  clientName: string;
  clientPhone: string;
  address: string;
  subtotal: number | null;
  discount: number;
  total: number;
  prepayment: number;
  termDays: number;
  paintColor: string | null;
  openings: ContractOpening[];
  extras: ContractExtra[];
};

export type ContractTerms = Pick<ContractData, 'total' | 'openings'> &
  Partial<Pick<ContractData, 'extras' | 'paintColor'>>;

export type ContractBlock =
  | { kind: 'title'; runs: ContractRun[] }
  | { kind: 'subtitle'; runs: ContractRun[] }
  | { kind: 'dateline'; left: ContractRun[]; right: ContractRun[] }
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; runs: ContractRun[] }
  | { kind: 'bullet'; runs: ContractRun[] };

export type ContractDocument = {
  blocks: ContractBlock[];
  openings: ContractOpening[];
  specificationNotes: string[];
  total: number;
};

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const BULLET_PREFIX = /^•\s*/;

// «9 октября 2026» from a calendar day YYYY-MM-DD.
export const formatLongDate = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number);

  return `${date} ${MONTHS_GENITIVE[month - 1]} ${year}`;
};

// «9 октября 2026, 14:32» in Tashkent time, where the contract is signed.
export const formatSigningTime = (moment: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(moment);
  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';

  return `${formatLongDate(`${part('year')}-${part('month')}-${part('day')}`)}, ${part('hour')}:${part('minute')}`;
};

// «+998 90 123 45 67», as the number is said aloud; anything else as typed.
export const formatPhone = (phone: string): string => {
  const match = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone.trim());

  return match === null ? phone : `+998 ${match.slice(1).join(' ')}`;
};

export const percentOf = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

export const placeholderValues = (
  template: ContractTemplate,
  data: ContractData,
): PlaceholderValues => {
  const balance = Math.max(data.total - data.prepayment, 0);
  const prepaymentPercent = percentOf(data.prepayment, data.total);

  return {
    Номер: data.number ?? '______',
    Дата: formatLongDate(data.signedOn),
    Город: orBlank(template.city),
    Исполнитель: orBlank(template.companyName),
    'В лице': orBlank(template.representative),
    Основание: orBlank(template.basis),
    Заказчик: orBlank(data.clientName),
    Телефон: orBlank(formatPhone(data.clientPhone)),
    Адрес: orBlank(data.address),
    Итого: formatWhole(data.total),
    Предоплата: formatWhole(data.prepayment),
    'Предоплата %': String(prepaymentPercent),
    Остаток: formatWhole(balance),
    'Остаток %': String(data.total > 0 ? 100 - prepaymentPercent : 0),
    'Срок, дней': String(data.termDays),
  };
};

const textBlocks = (text: string, values: PlaceholderValues): ContractBlock[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) =>
      BULLET_PREFIX.test(line)
        ? {
            kind: 'bullet' as const,
            runs: fillPlaceholders(line.replace(BULLET_PREFIX, ''), values),
          }
        : { kind: 'paragraph' as const, runs: fillPlaceholders(line, values) },
    );

export const buildContractDocument = (
  template: ContractTemplate,
  data: ContractData,
): ContractDocument => {
  const values = placeholderValues(template, data);

  return {
    blocks: [
      { kind: 'title', runs: fillPlaceholders(template.title, values) },
      ...(template.subtitle.trim() === ''
        ? []
        : [
            {
              kind: 'subtitle' as const,
              runs: fillPlaceholders(template.subtitle, values),
            },
          ]),
      {
        kind: 'dateline',
        left: [
          { text: 'г. ', isFilled: false },
          { text: values.Город, isFilled: true },
        ],
        right: [
          { text: values.Дата, isFilled: true },
          { text: ' г.', isFilled: false },
        ],
      },
      ...textBlocks(template.preamble, values),
      ...template.sections.flatMap((section) => [
        { kind: 'heading' as const, text: section.title },
        ...textBlocks(section.body, values),
      ]),
    ],
    openings: data.openings,
    specificationNotes: [
      ...(data.discount > 0
        ? [`Скидка: ${formatWhole(data.discount)} сум.`]
        : []),
      ...(data.paintColor === null || data.paintColor.trim() === ''
        ? []
        : [`Цвет покраски: ${data.paintColor.trim()}.`]),
      `Итого: ${formatWhole(data.total)} сум.`,
    ],
    total: data.total,
  };
};

export const describeOpeningSize = (opening: ContractOpening): string => {
  if (opening.widthCm === null || opening.heightCm === null) return '—';

  if (opening.isRailing === true) {
    return formatRailingSize({
      lengthCm: opening.widthCm,
      heightCm: opening.heightCm,
    });
  }

  const size = formatItemSize({
    widthCm: opening.widthCm,
    heightCm: opening.heightCm,
    projectionCm: opening.projectionCm,
    projectionKind: opening.projectionKind,
  });

  return opening.shape === null || opening.shape === undefined
    ? size
    : `${shapeKindLabel(opening.shape.kind).toLowerCase()} ${size}`;
};

export const sketchLayoutOf = (opening: ContractOpening): SketchLayout =>
  opening.isRailing === true
    ? layoutRailingSketch({
        lengthCm: opening.widthCm,
        heightCm: opening.heightCm,
      })
    : layoutOpeningSketch({
        widthCm: opening.widthCm,
        heightCm: opening.heightCm,
        projectionKind: opening.projectionKind,
        projectionCm: opening.projectionCm,
        shape: opening.shape ?? null,
      });

// Keys signed before visors, services and the paint colour counted carry no
// version; they are compared with the terms as those contracts read them.
export const CONTRACT_TERMS_VERSION = 2;

const openingEntries = (openings: ContractOpening[]): string[] =>
  openings
    .filter((opening) => opening.widthCm !== null)
    .map((opening) => {
      const hasProjection =
        opening.projectionKind !== 'NONE' && opening.projectionCm > 0;

      // Appended only when present, so contracts signed before shapes and
      // railings keep their key.
      return [
        opening.designId ?? '',
        opening.widthCm,
        opening.heightCm,
        hasProjection ? opening.projectionKind : 'NONE',
        hasProjection ? opening.projectionCm : 0,
        opening.quantity,
        ...(opening.isRailing === true ? ['RAILING'] : []),
        ...(opening.shape === null || opening.shape === undefined
          ? []
          : [opening.shape.outline]),
      ];
    })
    .map((entry) => JSON.stringify(entry))
    .sort();

// The terms as a contract signed before version 2 recorded them.
export const unversionedContractTermsKey = (data: ContractTerms): string =>
  JSON.stringify({
    total: Math.round(data.total),
    openings: openingEntries(data.openings),
  });

// What the client agreed to, in a form both the form and the saved order give
// the same way: section 14.7 asks for a new signature once any of it changes.
export const contractTermsKey = (data: ContractTerms): string => {
  const extras = (data.extras ?? [])
    .map((extra) =>
      JSON.stringify([extra.serviceId, roundTo(extra.quantity, 2)]),
    )
    .sort();

  return JSON.stringify({
    version: CONTRACT_TERMS_VERSION,
    total: Math.round(data.total),
    openings: openingEntries(data.openings),
    extras,
    paintColor: data.paintColor?.trim() ?? '',
  });
};

const isVersionedTermsKey = (termsKey: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(termsKey);

    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'version' in parsed &&
      parsed.version === CONTRACT_TERMS_VERSION
    );
  } catch {
    return false;
  }
};

// The current terms in the same form as a stored key, so the two compare.
export const currentTermsKeyLike = (
  signedTermsKey: string,
  current: ContractTerms,
): string =>
  isVersionedTermsKey(signedTermsKey)
    ? contractTermsKey(current)
    : unversionedContractTermsKey(current);

export const plainText = (runs: ContractRun[]): string =>
  runs.map((run) => run.text).join('');

// Everything the client was shown, in reading order: the check code is its hash.
export const documentText = (document: ContractDocument): string =>
  [
    ...document.blocks.map((block) => {
      switch (block.kind) {
        case 'heading':
          return block.text;
        case 'dateline':
          return `${plainText(block.left)} | ${plainText(block.right)}`;
        case 'bullet':
          return `• ${plainText(block.runs)}`;
        default:
          return plainText(block.runs);
      }
    }),
    ...document.openings.map((opening) =>
      [
        opening.title,
        opening.product,
        describeOpeningSize(opening),
        opening.quantity,
        opening.areaSquareMeters ?? '',
        opening.visorText ?? '',
        opening.lineTotal ?? '',
      ].join(' | '),
    ),
    ...document.specificationNotes,
  ].join('\n');
