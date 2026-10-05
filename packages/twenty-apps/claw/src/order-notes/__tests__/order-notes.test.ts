import { describe, expect, it } from 'vitest';

import {
  collectOrderNotes,
  collectOrderPhotos,
} from 'src/order-notes/order-notes';

describe('collectOrderNotes', () => {
  it('gathers every text about the order under the place it was typed', () => {
    expect(
      collectOrderNotes({
        orderComment: ' Домофон не работает ',
        items: [
          {
            id: 'item-1',
            widthCm: 140,
            heightCm: 150,
            designName: 'Решётка 1',
            notes: null,
          },
          {
            id: 'item-2',
            widthCm: 100,
            heightCm: null,
            designName: null,
            notes: 'угловое',
          },
        ],
        payments: [
          { id: 'payment-1', paidOn: '2026-10-05', comment: 'задаток' },
          { id: 'payment-2', paidOn: null, comment: '  ' },
        ],
        stockMovements: [
          { id: 'movement-1', name: 'Прут 12', comment: 'взяли с запасом' },
        ],
      }),
    ).toEqual([
      {
        key: 'order',
        source: 'Комментарий к заказу',
        text: 'Домофон не работает',
      },
      { key: 'item-2', source: 'Проём 2', text: 'угловое' },
      { key: 'payment-1', source: 'Оплата · 5 октября', text: 'задаток' },
      { key: 'movement-1', source: 'Склад · Прут 12', text: 'взяли с запасом' },
    ]);
  });

  it('is empty when nobody wrote anything', () => {
    expect(
      collectOrderNotes({
        orderComment: null,
        items: [],
        payments: [],
        stockMovements: [],
      }),
    ).toEqual([]);
  });
});

describe('collectOrderPhotos', () => {
  it('gathers the photos of every opening and of the finished work', () => {
    expect(
      collectOrderPhotos({
        items: [
          {
            widthCm: 140,
            heightCm: 150,
            designName: 'Решётка 1',
            photos: [{ url: 'https://files/a.jpg' }, { url: '' }, null],
          },
          { widthCm: 100, heightCm: 90, designName: null, photos: null },
          {
            widthCm: 80,
            heightCm: null,
            designName: null,
            photos: [{ url: 'https://files/b.jpg' }],
          },
        ],
        finishedPhotos: [{ url: 'https://files/done.jpg' }],
      }),
    ).toEqual([
      { url: 'https://files/a.jpg', caption: 'Проём 1 · Решётка 1 · 140×150' },
      { url: 'https://files/b.jpg', caption: 'Проём 3' },
      { url: 'https://files/done.jpg', caption: 'Фото работы' },
    ]);
  });

  it('is empty for an order without photos', () => {
    expect(collectOrderPhotos({ items: [], finishedPhotos: null })).toEqual([]);
  });
});
