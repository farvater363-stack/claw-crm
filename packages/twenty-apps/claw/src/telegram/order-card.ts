import { formatDayMonth } from 'src/ui/format';

export type OrderCardInput = {
  name: string;
  installationDeadline: string | null;
  clientFullName: string | null;
  clientPhone: string | null;
  districtLabel: string | null;
  addressLine: string | null;
  floor: number | null;
  locationNote: string | null;
  installerName: string | null;
  hasPoint: boolean;
  extraPhotoCount: number;
  orderUrl: string;
};

export const escapeTelegramHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

// Telegram's HTML mode: a stray < or & in a name makes it refuse the message.
export const buildOrderCard = (input: OrderCardInput): string =>
  [
    `<b>Заказ №${escapeTelegramHtml(input.name)}</b>` +
      (input.installationDeadline === null
        ? ''
        : ` · Срок ${formatDayMonth(input.installationDeadline)}`),
    joinPresent([input.clientFullName, input.clientPhone], ' · '),
    joinPresent(
      [
        input.districtLabel,
        input.addressLine,
        input.floor === null ? null : `${input.floor} эт.`,
      ],
      ', ',
    ),
    input.locationNote?.trim()
      ? `Как найти: ${escapeTelegramHtml(input.locationNote.trim())}`
      : null,
    input.installerName
      ? `Установщик: ${escapeTelegramHtml(input.installerName)}`
      : null,
    input.hasPoint ? null : '⚠ точка не указана',
    input.extraPhotoCount > 0
      ? `ещё ${input.extraPhotoCount} фото в CRM`
      : null,
    `<a href="${escapeTelegramHtml(input.orderUrl)}">Открыть в CRM</a>`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
