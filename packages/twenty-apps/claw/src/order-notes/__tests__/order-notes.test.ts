import { describe, expect, it } from 'vitest';

import {
  collectOrderMedia,
  formatNoteTime,
  isNewToMe,
  notesCountText,
  type OrderMediaSources,
  summarizeOrderMedia,
} from 'src/order-notes/order-notes';

const EMPTY: OrderMediaSources = {
  orderComment: null,
  finishedPhotos: null,
  locationPhotos: null,
  items: [],
  orderNotes: [],
  payments: [],
  stockMovements: [],
};

const ITEMS: OrderMediaSources['items'] = [
  {
    id: 'item-3',
    openingNumber: 3,
    widthCm: 100,
    heightCm: 150,
    designName: 'Волна',
    notes: null,
    photos: [{ url: 'https://files/third.jpg' }],
  },
  {
    id: 'item-1',
    openingNumber: 1,
    widthCm: 80,
    heightCm: 120,
    designName: 'Ромб',
    notes: ' угловое ',
    photos: [{ url: 'https://files/first.jpg' }, { url: '' }, null],
  },
];

const note = (
  overrides: Partial<OrderMediaSources['orderNotes'][number]>,
): OrderMediaSources['orderNotes'][number] => ({
  id: 'note-1',
  text: 'Высоту проверил',
  createdAt: '2026-11-02T05:00:00Z',
  updatedAt: '2026-11-02T05:00:00Z',
  authorName: 'Мардон',
  authorMemberId: 'member-1',
  orderItemId: null,
  photos: null,
  ...overrides,
});

describe('collectOrderMedia', () => {
  it('shows every photo of the order, newest notes first, each under what it is about', () => {
    const media = collectOrderMedia({
      ...EMPTY,
      items: ITEMS,
      finishedPhotos: [{ url: 'https://files/done.jpg' }],
      locationPhotos: [{ url: 'https://files/door.jpg' }],
      orderNotes: [
        note({
          id: 'old',
          createdAt: '2026-11-01T05:00:00Z',
          text: null,
          photos: [{ url: 'https://files/general.jpg' }],
        }),
        note({
          id: 'new',
          orderItemId: 'item-3',
          photos: [{ url: 'https://files/welding.jpg' }],
        }),
      ],
    });

    expect(
      media.photos.map(({ url, tagKey, caption }) => [url, tagKey, caption]),
    ).toEqual([
      [
        'https://files/welding.jpg',
        'opening:item-3',
        'Проём 3 · Мардон, 2 ноября',
      ],
      ['https://files/general.jpg', 'order', 'Весь заказ · Мардон, 1 ноября'],
      ['https://files/done.jpg', 'finished', 'Цех · готовая работа'],
      ['https://files/first.jpg', 'opening:item-1', 'Проём 1 · замер'],
      ['https://files/third.jpg', 'opening:item-3', 'Проём 3 · замер'],
      ['https://files/door.jpg', 'address', 'Адрес · вход и дом'],
    ]);
    expect(media.tags.map(({ label, count }) => [label, count])).toEqual([
      ['Проём 1', 1],
      ['Проём 3', 2],
      ['Весь заказ', 1],
      ['Адрес', 1],
      ['Готовая работа', 1],
    ]);
    expect(media.openings).toEqual([
      { id: 'item-1', label: 'Проём 1' },
      { id: 'item-3', label: 'Проём 3' },
    ]);
  });

  it('lists what people wrote, then what was typed at the замер, the payments and the warehouse', () => {
    const media = collectOrderMedia({
      ...EMPTY,
      orderComment: ' Домофон не работает ',
      items: ITEMS,
      orderNotes: [note({ orderItemId: 'item-1' })],
      payments: [
        { id: 'payment-1', paidOn: '2026-10-05', comment: 'задаток' },
        { id: 'payment-2', paidOn: null, comment: '  ' },
      ],
      stockMovements: [
        { id: 'movement-1', name: 'Прут 12', comment: 'взяли с запасом' },
      ],
    });

    expect(
      media.notes.map(({ noteId, text, tagLabel, authorName }) => [
        noteId,
        text,
        tagLabel,
        authorName,
      ]),
    ).toEqual([
      ['note-1', 'Высоту проверил', 'Проём 1', 'Мардон'],
      [null, 'Домофон не работает', 'Весь заказ', 'с замера'],
      [null, 'угловое', 'Проём 1', 'с замера'],
      [null, 'задаток', 'Весь заказ', 'оплата · 5 октября'],
      [null, 'взяли с запасом', 'Весь заказ', 'склад · Прут 12'],
    ]);
  });

  it('marks a note changed after it was written, not one fixed as it was saved', () => {
    const [changed, fixed] = collectOrderMedia({
      ...EMPTY,
      orderNotes: [
        note({ id: 'a', updatedAt: '2026-11-02T06:00:00Z' }),
        note({ id: 'b', updatedAt: '2026-11-02T05:00:30Z' }),
      ],
    }).notes;

    expect(changed?.isEdited).toBe(true);
    expect(fixed?.isEdited).toBe(false);
  });

  it('keeps a note about a проём deleted since under the whole order', () => {
    const [only] = collectOrderMedia({
      ...EMPTY,
      orderNotes: [note({ orderItemId: 'gone' })],
    }).notes;

    expect(only?.tagKey).toBe('order');
  });

  it('is empty for an order nobody wrote about or photographed', () => {
    expect(collectOrderMedia(EMPTY)).toEqual({
      photos: [],
      notes: [],
      tags: [],
      openings: [],
    });
  });
});

describe('isNewToMe', () => {
  const now = Date.parse('2026-11-02T06:00:00Z');
  const entry = {
    createdAt: '2026-11-02T05:00:00Z',
    authorMemberId: 'someone',
  };

  it('is new when someone else added it after this device last looked', () => {
    expect(
      isNewToMe(entry, {
        seenAt: Date.parse('2026-11-02T04:00:00Z'),
        myMemberId: 'me',
        now,
      }),
    ).toBe(true);
    expect(
      isNewToMe(entry, {
        seenAt: Date.parse('2026-11-02T05:30:00Z'),
        myMemberId: 'me',
        now,
      }),
    ).toBe(false);
  });

  it('is never new to its own author, nor when it has no time', () => {
    expect(isNewToMe(entry, { seenAt: null, myMemberId: 'someone', now })).toBe(
      false,
    );
    expect(
      isNewToMe(
        { createdAt: null, authorMemberId: null },
        { seenAt: null, myMemberId: 'me', now },
      ),
    ).toBe(false);
  });

  it('counts the last two days as new on a device that never opened the order', () => {
    expect(isNewToMe(entry, { seenAt: null, myMemberId: 'me', now })).toBe(
      true,
    );
    expect(
      isNewToMe(
        { ...entry, createdAt: '2026-10-25T05:00:00Z' },
        { seenAt: null, myMemberId: 'me', now },
      ),
    ).toBe(false);
  });
});

describe('summarizeOrderMedia', () => {
  it('counts photos and notes and picks the newest unread note', () => {
    const media = collectOrderMedia({
      ...EMPTY,
      orderComment: 'Домофон',
      finishedPhotos: [{ url: 'https://files/done.jpg' }],
      orderNotes: [
        note({
          id: 'older',
          createdAt: '2026-11-02T04:00:00Z',
          text: 'Первая',
        }),
        note({ id: 'newer', text: 'Вторая' }),
      ],
    });

    expect(
      summarizeOrderMedia(media, {
        seenAt: Date.parse('2026-11-02T03:00:00Z'),
        myMemberId: 'me',
        now: Date.parse('2026-11-02T06:00:00Z'),
      }),
    ).toEqual({
      photoCount: 1,
      noteCount: 3,
      newNoteCount: 2,
      newestUnseenNote: expect.objectContaining({ text: 'Вторая' }),
    });
  });
});

describe('formatNoteTime', () => {
  const now = new Date('2026-11-02T08:00:00Z');

  it('says today and yesterday on Tashkent time, and the date before that', () => {
    expect(formatNoteTime('2026-11-02T05:42:00Z', now)).toBe('сегодня 10:42');
    expect(formatNoteTime('2026-11-01T12:05:00Z', now)).toBe('вчера 17:05');
    expect(formatNoteTime('2026-10-31T09:20:00Z', now)).toBe(
      '31 октября, 14:20',
    );
  });
});

describe('notesCountText', () => {
  it('agrees the word with the number', () => {
    expect([1, 2, 5, 11, 21, 24].map(notesCountText)).toEqual([
      '1 заметка',
      '2 заметки',
      '5 заметок',
      '11 заметок',
      '21 заметка',
      '24 заметки',
    ]);
  });
});
