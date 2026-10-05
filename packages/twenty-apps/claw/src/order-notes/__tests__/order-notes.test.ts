import { describe, expect, it } from 'vitest';

import { collectOrderNotes } from 'src/order-notes/order-notes';

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
