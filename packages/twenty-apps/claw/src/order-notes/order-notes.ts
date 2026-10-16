import { numberOpenings } from 'src/order-sketch/order-sketch';
import { formatDayMonth } from 'src/ui/format';

export type OrderNote = { key: string; source: string; text: string };

export type OrderNoteSources = {
  orderComment: string | null;
  // In the order the openings were entered; «Проём N» is the form's number
  items: {
    id: string;
    openingNumber?: unknown;
    widthCm: number | null;
    heightCm: number | null;
    designName: string | null;
    notes: string | null;
  }[];
  payments: { id: string; paidOn: string | null; comment: string | null }[];
  stockMovements: { id: string; name: string | null; comment: string | null }[];
};

type StoredPhoto = { url?: string | null } | null | undefined;

export type OrderPhoto = { url: string; caption: string };

export type OrderPhotoSources = {
  // In the same order as the notes, so «Проём 3» is the same opening
  items: {
    openingNumber?: unknown;
    widthCm: number | null;
    heightCm: number | null;
    designName: string | null;
    photos: StoredPhoto[] | null;
  }[];
  finishedPhotos: StoredPhoto[] | null;
};

const join = (parts: (string | null | undefined)[]) =>
  parts.filter((part) => part).join(' · ');

const describeOpening = (
  item: Pick<
    OrderPhotoSources['items'][number],
    'widthCm' | 'heightCm' | 'designName'
  >,
  number: number,
) =>
  join([
    `Проём ${number}`,
    item.designName ?? 'свой рисунок',
    item.widthCm !== null && item.heightCm !== null
      ? `${item.widthCm}×${item.heightCm}`
      : null,
  ]);

const withUrl = (photos: StoredPhoto[] | null, caption: string): OrderPhoto[] =>
  (photos ?? []).flatMap((photo) =>
    typeof photo?.url === 'string' && photo.url !== ''
      ? [{ url: photo.url, caption }]
      : [],
  );

// The measurer's photos live on each opening and the workshop's on the order;
// the order card shows them in one place.
export const collectOrderPhotos = ({
  items,
  finishedPhotos,
}: OrderPhotoSources): OrderPhoto[] => {
  const numbers = numberOpenings(items);

  return [
    ...items
      .map((item, index) => ({ item, number: numbers[index] }))
      .sort((left, right) => left.number - right.number)
      .flatMap(({ item, number }) =>
        withUrl(item.photos, describeOpening(item, number)),
      ),
    ...withUrl(finishedPhotos, 'Фото работы'),
  ];
};

// Every free text written about one order, each under the place it was typed.
export const collectOrderNotes = ({
  orderComment,
  items,
  payments,
  stockMovements,
}: OrderNoteSources): OrderNote[] => {
  const numbers = numberOpenings(items);

  return [
    { key: 'order', source: 'Комментарий к заказу', text: orderComment },
    ...items
      .map((item, index) => ({ item, number: numbers[index] }))
      .sort((left, right) => left.number - right.number)
      .map(({ item, number }) => ({
        key: item.id,
        source: describeOpening(item, number),
        text: item.notes,
      })),
    ...payments.map((payment) => ({
      key: payment.id,
      source: join([
        'Оплата',
        payment.paidOn === null ? null : formatDayMonth(payment.paidOn),
      ]),
      text: payment.comment,
    })),
    ...stockMovements.map((movement) => ({
      key: movement.id,
      source: join(['Склад', movement.name]),
      text: movement.comment,
    })),
  ].flatMap(({ key, source, text }) => {
    const trimmed = text?.trim() ?? '';

    return trimmed === '' ? [] : [{ key, source, text: trimmed }];
  });
};
