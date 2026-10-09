import { DEFAULT_CONTRACT_SECTIONS } from 'src/contract/default-contract-sections';

export type ContractSection = { title: string; body: string };

export type ContractTemplate = {
  // null until «Договор» is first saved; the built-in text is version 1
  id: string | null;
  version: number;
  title: string;
  subtitle: string;
  companyName: string;
  representative: string;
  basis: string;
  city: string;
  defaultTermDays: number;
  preamble: string;
  sections: ContractSection[];
  sealImage: string | null;
};

export const PLACEHOLDERS = [
  { key: 'Номер', hint: 'Номер заказа' },
  { key: 'Дата', hint: 'День подписания' },
  { key: 'Город', hint: 'Город с этого экрана' },
  { key: 'Исполнитель', hint: 'Название с этого экрана' },
  { key: 'В лице', hint: 'С этого экрана' },
  { key: 'Основание', hint: 'С этого экрана' },
  { key: 'Заказчик', hint: 'Имя и фамилия клиента' },
  { key: 'Телефон', hint: 'Телефон клиента' },
  { key: 'Адрес', hint: 'Район и адрес объекта' },
  { key: 'Итого', hint: 'Сумма заказа после скидки' },
  { key: 'Предоплата', hint: 'Предоплата, сум' },
  { key: 'Предоплата %', hint: 'Доля предоплаты' },
  { key: 'Остаток', hint: 'Итого минус предоплата' },
  { key: 'Остаток %', hint: 'Доля остатка' },
  { key: 'Срок, дней', hint: 'До срока заказа, иначе срок по умолчанию' },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]['key'];

export type PlaceholderValues = Record<PlaceholderKey, string>;

const PLACEHOLDER_PATTERN = /\{([^{}]*)\}/g;
const SECTION_TITLE_PREFIX = '## ';

const isPlaceholderKey = (key: string): key is PlaceholderKey =>
  PLACEHOLDERS.some((placeholder) => placeholder.key === key);

export const DEFAULT_CONTRACT_TEMPLATE: ContractTemplate = {
  id: null,
  version: 1,
  title: 'ДОГОВОР ПОДРЯДА № {Номер}',
  subtitle: 'на изготовление и монтаж металлоконструкций',
  companyName: 'PROFMET',
  representative: '',
  basis: '',
  city: 'Ташкент',
  defaultTermDays: 20,
  preamble: [
    'Исполнитель: {Исполнитель}, в лице {В лице}, действующего на основании {Основание}, с одной стороны, и',
    'Заказчик: {Заказчик}',
    'Ф.И.О.: {Заказчик}',
    'Телефон: {Телефон}',
    'Адрес объекта: {Адрес}',
    'с другой стороны, совместно именуемые «Стороны», заключили настоящий договор о нижеследующем.',
  ].join('\n'),
  sections: DEFAULT_CONTRACT_SECTIONS,
  sealImage: null,
};

export const serializeSections = (sections: ContractSection[]): string =>
  sections
    .map(({ title, body }) =>
      [`${SECTION_TITLE_PREFIX}${title.trim()}`, body.trim()].join('\n'),
    )
    .join('\n\n');

export const parseSections = (stored: string): ContractSection[] => {
  const sections: ContractSection[] = [];

  for (const line of stored.split('\n')) {
    if (line.startsWith(SECTION_TITLE_PREFIX)) {
      sections.push({
        title: line.slice(SECTION_TITLE_PREFIX.length).trim(),
        body: '',
      });
    } else if (sections.length > 0) {
      const current = sections[sections.length - 1];

      current.body = current.body === '' ? line : `${current.body}\n${line}`;
    }
  }

  return sections.map(({ title, body }) => ({ title, body: body.trim() }));
};

// Markers the contract cannot fill, so a typo never reaches a client as «{Итго}».
export const findUnknownPlaceholders = (text: string): string[] => [
  ...new Set(
    [...text.matchAll(PLACEHOLDER_PATTERN)]
      .map((match) => match[1])
      .filter((key) => !isPlaceholderKey(key)),
  ),
];

export const templateTexts = (template: ContractTemplate): string[] => [
  template.title,
  template.subtitle,
  template.preamble,
  ...template.sections.flatMap(({ title, body }) => [title, body]),
];

export type ContractRun = { text: string; isFilled: boolean };

// Values come out as runs of their own, so the screen and the PDF can set
// what was filled from the order apart from the contract's own words.
export const fillPlaceholders = (
  text: string,
  values: PlaceholderValues,
): ContractRun[] => {
  const runs: ContractRun[] = [];
  let last = 0;

  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const index = match.index ?? 0;

    if (index > last) {
      runs.push({ text: text.slice(last, index), isFilled: false });
    }

    runs.push(
      isPlaceholderKey(match[1])
        ? { text: values[match[1]], isFilled: true }
        : { text: match[0], isFilled: false },
    );
    last = index + match[0].length;
  }

  if (last < text.length) {
    runs.push({ text: text.slice(last), isFilled: false });
  }

  return runs;
};

const BLANK = '____________';

export const orBlank = (value: string): string =>
  value.trim() === '' ? BLANK : value.trim();

// What the owner still has to fill before a contract reads as finished.
export const missingCompanyDetails = (template: ContractTemplate): string[] =>
  [
    template.companyName.trim() === '' ? 'Исполнитель' : null,
    template.representative.trim() === '' ? 'В лице' : null,
    template.basis.trim() === '' ? 'На основании' : null,
    template.city.trim() === '' ? 'Город' : null,
  ].filter((label): label is string => label !== null);
