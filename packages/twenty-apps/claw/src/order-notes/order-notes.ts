import { formatDayMonth } from 'src/ui/format';

export type OrderNote = { key: string; source: string; text: string };

export type OrderNoteSources = {
  orderComment: string | null;
  // In the order the openings were entered, so «Проём 3» matches the form
  items: {
    id: string;
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
  index: number,
) =>
  join([
    `Проём ${index + 1}`,
    item.designName,
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
}: OrderPhotoSources): OrderPhoto[] => [
  ...items.flatMap((item, index) =>
    withUrl(item.photos, describeOpening(item, index)),
  ),
  ...withUrl(finishedPhotos, 'Фото работы'),
];

// Every free text written about one order, each under the place it was typed.
export const collectOrderNotes = ({
  orderComment,
  items,
  payments,
  stockMovements,
}: OrderNoteSources): OrderNote[] =>
  [
    { key: 'order', source: 'Комментарий к заказу', text: orderComment },
    ...items.map((item, index) => ({
      key: item.id,
      source: describeOpening(item, index),
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
