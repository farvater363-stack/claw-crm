import { formatDayMonth, formatMoney } from 'src/ui/format';

export type OrderCardOpening = {
  title: string;
  quantity: number;
  product: string;
  // «арка 120×150×10, установка снаружи · 2,97 м²»; null while it has no sizes
  sizeText: string | null;
  visorText: string | null;
  notes: string | null;
};

export type OrderCardInput = {
  name: string;
  installationDeadline: string | null;
  isUrgent: boolean;
  clientFullName: string | null;
  clientPhone: string | null;
  districtLabel: string | null;
  addressLine: string | null;
  floor: number | null;
  locationNote: string | null;
  installerName: string | null;
  paintColor: string | null;
  openings: OrderCardOpening[];
  // «Установка», «Доставка × 2»
  services: string[];
  comment: string | null;
  // Null while the order has no total yet
  money: { total: number; paid: number; balance: number } | null;
  hasPoint: boolean;
  extraPhotoCount: number;
  orderUrl: string;
};

// Telegram refuses a message longer than this; the rest stays on the scheme.
export const TELEGRAM_MESSAGE_LIMIT = 4096;

export const escapeTelegramHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const trimmed = (text: string | null | undefined): string | null =>
  text?.trim() || null;

const joinPresent = (
  parts: (string | null | undefined)[],
  separator: string,
): string | null => {
  const present = parts.filter(
    (part): part is string =>
      part !== null && part !== undefined && part.trim() !== '',
  );

  return present.length > 0
    ? escapeTelegramHtml(present.join(separator))
    : null;
};

const openingLines = (opening: OrderCardOpening): string[] => [
  `<b>${escapeTelegramHtml(opening.title)}${opening.quantity > 1 ? ` × ${opening.quantity}` : ''}</b> — ${escapeTelegramHtml(opening.product)}`,
  ...[
    opening.sizeText,
    opening.visorText === null ? null : `+ ${opening.visorText}`,
    opening.notes === null ? null : `Заметка: ${opening.notes}`,
  ]
    .filter((line): line is string => line !== null)
    .map((line) => `   ${escapeTelegramHtml(line)}`),
];

const moneyLines = (money: OrderCardInput['money']): string[] => {
  if (money === null) return [];

  return [
    `Итого: ${formatMoney(money.total)}`,
    `Оплачено: ${formatMoney(money.paid)}`,
    money.balance > 0
      ? `<b>Остаток к оплате: ${formatMoney(money.balance)}</b>`
      : '<b>Оплачено полностью</b>',
  ];
};

const compose = (input: OrderCardInput, openingCount: number): string => {
  const hiddenOpenings = input.openings.length - openingCount;
  const sections: (string | null)[][] = [
    [
      `<b>Заказ №${escapeTelegramHtml(input.name)}</b>` +
        (input.installationDeadline === null
          ? ''
          : ` · Срок ${formatDayMonth(input.installationDeadline)}`) +
        (input.isUrgent ? ' · <b>СРОЧНО</b>' : ''),
      joinPresent([input.clientFullName, input.clientPhone], ' · '),
      joinPresent(
        [
          input.districtLabel,
          input.addressLine,
          input.floor === null ? null : `${input.floor} эт.`,
        ],
        ', ',
      ),
      trimmed(input.locationNote) === null
        ? null
        : `Как найти: ${escapeTelegramHtml(trimmed(input.locationNote) ?? '')}`,
      input.installerName
        ? `Установщик: ${escapeTelegramHtml(input.installerName)}`
        : null,
      input.hasPoint ? null : '⚠ точка не указана',
    ],
    [
      trimmed(input.paintColor) === null
        ? null
        : `Цвет покраски: <b>${escapeTelegramHtml(trimmed(input.paintColor) ?? '')}</b>`,
      ...input.openings.slice(0, openingCount).flatMap(openingLines),
      hiddenOpenings > 0 ? `ещё ${hiddenOpenings} — в схеме` : null,
    ],
    [
      input.services.length === 0
        ? null
        : `Услуги: ${escapeTelegramHtml(input.services.join(', '))}`,
      trimmed(input.comment) === null
        ? null
        : `Комментарий: ${escapeTelegramHtml(trimmed(input.comment) ?? '')}`,
    ],
    moneyLines(input.money),
    [
      input.extraPhotoCount > 0
        ? `ещё ${input.extraPhotoCount} фото в CRM`
        : null,
      `<a href="${escapeTelegramHtml(input.orderUrl)}">Открыть в CRM</a>`,
    ],
  ];

  return sections
    .map((lines) =>
      lines.filter((line): line is string => line !== null).join('\n'),
    )
    .filter((section) => section !== '')
    .join('\n\n');
};

// Telegram's HTML mode: a stray < or & in a name makes it refuse the message.
// A long order drops its last проёмы from the text; the scheme has them all.
export const buildOrderCard = (input: OrderCardInput): string => {
  for (
    let openingCount = input.openings.length;
    openingCount > 0;
    openingCount -= 1
  ) {
    const card = compose(input, openingCount);

    if (card.length <= TELEGRAM_MESSAGE_LIMIT) return card;
  }

  return compose(input, 0).slice(0, TELEGRAM_MESSAGE_LIMIT);
};
