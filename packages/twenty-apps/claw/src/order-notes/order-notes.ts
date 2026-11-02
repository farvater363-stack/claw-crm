import { numberOpenings } from 'src/order-sketch/order-sketch';
import { todayInTashkent } from 'src/pricing/dates';
import { formatClockTime, formatDayMonth } from 'src/ui/format';

type StoredPhoto = { url?: string | null } | null | undefined;

// What a photo or a note is about. «Проём» carries the line's id.
export type MediaTagKey =
  | 'order'
  | 'address'
  | 'finished'
  | `opening:${string}`;

export type MediaTag = { key: MediaTagKey; label: string; count: number };

export type MediaPhoto = {
  key: string;
  url: string;
  tagKey: MediaTagKey;
  // «Проём 1 · замер», «Цех · готово», «Весь заказ · Мардон, 2 ноября»
  caption: string;
  createdAt: string | null;
  authorMemberId: string | null;
};

export type MediaNote = {
  key: string;
  // The orderNote's id; null for text typed elsewhere (замер, оплата, склад),
  // which is changed where it was typed
  noteId: string | null;
  text: string;
  tagKey: MediaTagKey;
  tagLabel: string;
  authorName: string | null;
  authorMemberId: string | null;
  createdAt: string | null;
  isEdited: boolean;
  photoUrls: string[];
};

export type MediaOpening = { id: string; label: string };

export type OrderMedia = {
  photos: MediaPhoto[];
  notes: MediaNote[];
  tags: MediaTag[];
  openings: MediaOpening[];
};

export type OrderMediaSources = {
  orderComment: string | null;
  finishedPhotos: StoredPhoto[] | null;
  locationPhotos: StoredPhoto[] | null;
  // In the order the openings were entered; «Проём N» is the form's number
  items: {
    id: string;
    openingNumber?: unknown;
    widthCm: number | null;
    heightCm: number | null;
    designName: string | null;
    notes: string | null;
    photos: StoredPhoto[] | null;
  }[];
  orderNotes: {
    id: string;
    text: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    authorName: string | null;
    authorMemberId: string | null;
    orderItemId: string | null;
    photos: StoredPhoto[] | null;
  }[];
  payments: { id: string; paidOn: string | null; comment: string | null }[];
  stockMovements: { id: string; name: string | null; comment: string | null }[];
};

// An edit within a minute of writing is the author fixing a typo as he saves
const EDITED_AFTER_MILLISECONDS = 60_000;
// Without a record of what this device has seen, the last two days count as new
const NEW_WITHOUT_SEEN_MILLISECONDS = 2 * 86_400_000;

const urlsOf = (photos: StoredPhoto[] | null): string[] =>
  (photos ?? []).flatMap((photo) =>
    typeof photo?.url === 'string' && photo.url !== '' ? [photo.url] : [],
  );

const trimmed = (text: string | null | undefined): string => text?.trim() ?? '';

const join = (parts: (string | null | undefined)[]) =>
  parts.filter((part) => part).join(' · ');

// «сегодня 10:42», «вчера 17:05», «31 октября, 14:20» on Tashkent's clock
export const formatNoteTime = (
  createdAt: string,
  now: Date = new Date(),
): string => {
  const moment = new Date(createdAt);
  const day = todayInTashkent(moment);
  const today = todayInTashkent(now);
  const yesterday = todayInTashkent(new Date(now.getTime() - 86_400_000));
  const clock = formatClockTime(moment.getTime());

  if (day === today) return `сегодня ${clock}`;
  if (day === yesterday) return `вчера ${clock}`;

  return `${formatDayMonth(day)}, ${clock}`;
};

const openingTag = (id: string): MediaTagKey => `opening:${id}`;

export const TAG_LABELS = {
  order: 'Весь заказ',
  address: 'Адрес',
  finished: 'Готовая работа',
} as const;

export const collectOrderMedia = (sources: OrderMediaSources): OrderMedia => {
  const numbers = numberOpenings(sources.items);
  const items = sources.items
    .map((item, index) => ({ item, number: numbers[index] }))
    .sort((left, right) => left.number - right.number);
  const openings: MediaOpening[] = items.map(({ item, number }) => ({
    id: item.id,
    label: `Проём ${number}`,
  }));
  const labelOfItem = new Map(
    openings.map((opening) => [opening.id, opening.label]),
  );
  const tagOf = (orderItemId: string | null) =>
    orderItemId !== null && labelOfItem.has(orderItemId)
      ? {
          tagKey: openingTag(orderItemId),
          tagLabel: labelOfItem.get(orderItemId) ?? '',
        }
      : { tagKey: 'order' as const, tagLabel: TAG_LABELS.order };

  const orderNotes = [...sources.orderNotes].sort((left, right) =>
    (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
  );

  const photos: MediaPhoto[] = [
    ...orderNotes.flatMap((note) => {
      const { tagKey, tagLabel } = tagOf(note.orderItemId);
      const when =
        note.createdAt === null ? null : formatDayMonth(note.createdAt);

      return urlsOf(note.photos).map((url) => ({
        key: `${note.id}:${url}`,
        url,
        tagKey,
        caption: join([
          tagLabel,
          [note.authorName, when].filter(Boolean).join(', '),
        ]),
        createdAt: note.createdAt,
        authorMemberId: note.authorMemberId,
      }));
    }),
    ...urlsOf(sources.finishedPhotos).map((url) => ({
      key: `finished:${url}`,
      url,
      tagKey: 'finished' as const,
      caption: 'Цех · готовая работа',
      createdAt: null,
      authorMemberId: null,
    })),
    ...items.flatMap(({ item }) =>
      urlsOf(item.photos).map((url) => ({
        key: `${item.id}:${url}`,
        url,
        tagKey: openingTag(item.id),
        caption: `${labelOfItem.get(item.id)} · замер`,
        createdAt: null,
        authorMemberId: null,
      })),
    ),
    ...urlsOf(sources.locationPhotos).map((url) => ({
      key: `address:${url}`,
      url,
      tagKey: 'address' as const,
      caption: 'Адрес · вход и дом',
      createdAt: null,
      authorMemberId: null,
    })),
  ];

  const measurementNote = (
    key: string,
    text: string | null,
    tag: { tagKey: MediaTagKey; tagLabel: string },
    authorName: string,
  ): MediaNote[] =>
    trimmed(text) === ''
      ? []
      : [
          {
            key,
            noteId: null,
            text: trimmed(text),
            ...tag,
            authorName,
            authorMemberId: null,
            createdAt: null,
            isEdited: false,
            photoUrls: [],
          },
        ];

  const notes: MediaNote[] = [
    ...orderNotes.flatMap((note) => {
      const text = trimmed(note.text);

      // A photo without words sits in the photos only
      if (text === '') return [];

      const created =
        note.createdAt === null ? NaN : Date.parse(note.createdAt);
      const updated =
        note.updatedAt === null ? NaN : Date.parse(note.updatedAt);

      return [
        {
          key: note.id,
          noteId: note.id,
          text,
          ...tagOf(note.orderItemId),
          authorName: note.authorName,
          authorMemberId: note.authorMemberId,
          createdAt: note.createdAt,
          isEdited: updated - created > EDITED_AFTER_MILLISECONDS,
          photoUrls: urlsOf(note.photos),
        },
      ];
    }),
    ...measurementNote(
      'order-comment',
      sources.orderComment,
      tagOf(null),
      'с замера',
    ),
    ...items.flatMap(({ item }) =>
      measurementNote(
        `item:${item.id}`,
        item.notes,
        tagOf(item.id),
        'с замера',
      ),
    ),
    ...sources.payments.flatMap((payment) =>
      measurementNote(
        `payment:${payment.id}`,
        payment.comment,
        tagOf(null),
        join([
          'оплата',
          payment.paidOn === null ? null : formatDayMonth(payment.paidOn),
        ]),
      ),
    ),
    ...sources.stockMovements.flatMap((movement) =>
      measurementNote(
        `stock:${movement.id}`,
        movement.comment,
        tagOf(null),
        join(['склад', movement.name]),
      ),
    ),
  ];

  const countOf = (key: MediaTagKey) =>
    photos.filter((photo) => photo.tagKey === key).length;
  const tags: MediaTag[] = [
    ...openings.map((opening) => ({
      key: openingTag(opening.id),
      label: opening.label,
      count: countOf(openingTag(opening.id)),
    })),
    { key: 'order' as const, label: TAG_LABELS.order, count: countOf('order') },
    {
      key: 'address' as const,
      label: TAG_LABELS.address,
      count: countOf('address'),
    },
    {
      key: 'finished' as const,
      label: TAG_LABELS.finished,
      count: countOf('finished'),
    },
  ].filter((tag) => tag.count > 0);

  return { photos, notes, tags, openings };
};

// Something someone else added after this device last opened the order
export const isNewToMe = (
  entry: { createdAt: string | null; authorMemberId: string | null },
  {
    seenAt,
    myMemberId,
    now,
  }: { seenAt: number | null; myMemberId: string | null; now: number },
): boolean => {
  if (entry.createdAt === null) return false;
  if (myMemberId !== null && entry.authorMemberId === myMemberId) return false;

  const created = Date.parse(entry.createdAt);

  return seenAt === null
    ? now - created < NEW_WITHOUT_SEEN_MILLISECONDS
    : created > seenAt;
};

export type MediaSummary = {
  photoCount: number;
  noteCount: number;
  newNoteCount: number;
  // The newest note nobody here has opened yet, for the board card
  newestUnseenNote: MediaNote | null;
};

export const summarizeOrderMedia = (
  media: OrderMedia,
  seen: { seenAt: number | null; myMemberId: string | null; now: number },
): MediaSummary => {
  const unseen = media.notes.filter((note) => isNewToMe(note, seen));

  return {
    photoCount: media.photos.length,
    noteCount: media.notes.length,
    newNoteCount: unseen.length,
    newestUnseenNote: unseen[0] ?? null,
  };
};

export const notesCountText = (count: number): string => {
  const lastTwo = count % 100;
  const last = count % 10;
  const word =
    lastTwo >= 11 && lastTwo <= 14
      ? 'заметок'
      : last === 1
        ? 'заметка'
        : last >= 2 && last <= 4
          ? 'заметки'
          : 'заметок';

  return `${count} ${word}`;
};
