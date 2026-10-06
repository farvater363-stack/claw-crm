import { describe, expect, it } from 'vitest';

import {
  buildBuyList,
  buildPurchase,
  buildReceipt,
  buildRecount,
  buildStockRows,
  movementText,
  parseMinimumStock,
  parseStockAmount,
  purchaseSummary,
  recountSummary,
  type StockMaterial,
  stockValue,
} from 'src/stock/stock-screen';

const plain = (value: string) => value.replace(/\s/g, ' ');

const material = (overrides: Partial<StockMaterial>): StockMaterial => ({
  id: 'm',
  name: 'Материал',
  unitLabel: 'м',
  onHand: 0,
  reserved: 0,
  toBuy: 0,
  minimumStock: 0,
  stockState: 'OK',
  overrunPercent: null,
  ...overrides,
});

describe('buildStockRows', () => {
  it('puts what to buy first, then low stock, then the rest, each by name', () => {
    const rows = buildStockRows(
      [
        material({ id: 'ok', name: 'Я', stockState: 'OK' }),
        material({ id: 'low', name: 'Б', stockState: 'LOW', toBuy: 5 }),
        material({ id: 'buy-2', name: 'В', stockState: 'BUY', toBuy: 7 }),
        material({ id: 'buy-1', name: 'А', stockState: 'BUY', toBuy: 3 }),
      ],
      [],
    );

    expect(rows.map((row) => row.id)).toEqual(['buy-1', 'buy-2', 'low', 'ok']);
  });

  it('words the pill with the amount and unit', () => {
    const [buy, low, ok] = buildStockRows(
      [
        material({
          id: 'a',
          name: 'А',
          stockState: 'BUY',
          toBuy: 59,
          unitLabel: 'м',
        }),
        material({
          id: 'b',
          name: 'Б',
          stockState: 'LOW',
          toBuy: 2.5,
          unitLabel: 'л',
        }),
        material({ id: 'c', name: 'В', stockState: 'OK' }),
      ],
      [],
    );

    expect([buy.pill.tone, plain(buy.pill.text)]).toEqual([
      'danger',
      'Купить 59 м',
    ]);
    expect([low.pill.tone, plain(low.pill.text)]).toEqual([
      'warning',
      'Купить 2,5 л',
    ]);
    expect([ok.pill.tone, ok.pill.text]).toEqual(['success', 'Хватает']);
  });

  it('attaches the orders that need the material', () => {
    const [row] = buildStockRows(
      [material({ id: 'a' })],
      [
        { materialId: 'a', orderId: 'o1', orderName: '№ 12', quantity: 4 },
        { materialId: 'other', orderId: 'o2', orderName: '№ 13', quantity: 9 },
      ],
    );

    expect(row.needs.map((need) => need.orderName)).toEqual(['№ 12']);
  });

  it('mentions overuse from 5 percent up', () => {
    const [quiet, loud] = buildStockRows(
      [
        material({ id: 'a', name: 'А', overrunPercent: 4.9 }),
        material({ id: 'b', name: 'Б', overrunPercent: 8 }),
      ],
      [],
    );

    expect(quiet.overuseNote).toBeNull();
    expect(loud.overuseNote).toBe(
      'С прошлого пересчёта ушло на 8 % больше, чем по составу',
    );
  });

  it('stays quiet when a recount finds more than expected', () => {
    const rows = buildStockRows(
      [
        material({ id: 'a', name: 'А', overrunPercent: -12 }),
        material({ id: 'b', name: 'Б', overrunPercent: -0 }),
      ],
      [],
    );

    expect(rows.map((row) => row.overuseNote)).toEqual([null, null]);
  });
});

describe('buildReceipt', () => {
  it('accepts a positive amount and an optional price', () => {
    expect(
      buildReceipt({
        materialId: 'a',
        quantity: '60,5',
        unitPrice: '',
        today: '2026-10-04',
      }),
    ).toEqual({
      ok: true,
      data: {
        kind: 'RECEIPT',
        materialId: 'a',
        quantity: 60.5,
        unitPrice: null,
        date: '2026-10-04',
      },
    });
  });

  it('rejects zero and text', () => {
    expect(
      buildReceipt({
        materialId: 'a',
        quantity: '0',
        unitPrice: '',
        today: '2026-10-04',
      }),
    ).toEqual({
      ok: false,
      error: 'Введите, сколько купили: число больше нуля',
    });
    expect(
      buildReceipt({
        materialId: 'a',
        quantity: 'много',
        unitPrice: '',
        today: '2026-10-04',
      }),
    ).toEqual({
      ok: false,
      error: 'Введите, сколько купили: число больше нуля',
    });
  });

  // «0,001» is a plain number, but nothing is left of it at two decimals.
  it.each(['-2', '+5', '1e3', '0x10', '0,001'])(
    'rejects the quantity %j',
    (quantity) => {
      expect(
        buildReceipt({
          materialId: 'a',
          quantity,
          unitPrice: '',
          today: '2026-10-04',
        }),
      ).toEqual({
        ok: false,
        error: 'Введите, сколько купили: число больше нуля',
      });
    },
  );

  it('keeps the entered price and two decimals of the amount', () => {
    expect(
      buildReceipt({
        materialId: 'a',
        quantity: '2,756',
        unitPrice: '12 000',
        today: '2026-10-04',
      }),
    ).toEqual({
      ok: true,
      data: {
        kind: 'RECEIPT',
        materialId: 'a',
        quantity: 2.76,
        unitPrice: 12_000,
        date: '2026-10-04',
      },
    });
  });

  it('passes on the reason a price is refused', () => {
    expect(
      buildReceipt({
        materialId: 'a',
        quantity: '3',
        unitPrice: '-5',
        today: '2026-10-04',
      }),
    ).toEqual({
      ok: false,
      error: 'Введите цену целым числом, без минуса',
    });
  });
});

describe('buildRecount', () => {
  it('creates a recount only for rows where something was typed', () => {
    expect(buildRecount({ a: '12', b: '', c: '0' }, '2026-10-04')).toEqual({
      ok: true,
      data: [
        {
          kind: 'STOCKTAKE',
          materialId: 'a',
          countedQuantity: 12,
          date: '2026-10-04',
        },
        {
          kind: 'STOCKTAKE',
          materialId: 'c',
          countedQuantity: 0,
          date: '2026-10-04',
        },
      ],
    });
  });

  it('points at the row with a bad number', () => {
    expect(buildRecount({ a: '-1', b: 'x' }, '2026-10-04')).toEqual({
      ok: false,
      errors: {
        a: 'Введите число, ноль или больше',
        b: 'Введите число, ноль или больше',
      },
    });
  });

  it.each(['+5', '1e3', '0x10'])('rejects the count %j', (raw) => {
    expect(buildRecount({ a: raw }, '2026-10-04')).toEqual({
      ok: false,
      errors: { a: 'Введите число, ноль или больше' },
    });
  });

  it('skips a row with only spaces and keeps two decimals of a count', () => {
    expect(buildRecount({ a: '   ', b: ' 12,345 ' }, '2026-10-04')).toEqual({
      ok: true,
      data: [
        {
          kind: 'STOCKTAKE',
          materialId: 'b',
          countedQuantity: 12.35,
          date: '2026-10-04',
        },
      ],
    });
  });
});

describe('recountSummary', () => {
  it('says nothing until an amount is typed', () => {
    expect(recountSummary({})).toBeNull();
    expect(recountSummary({ a: '', b: '  ' })).toBeNull();
  });

  it.each([
    [1, 'Изменится 1 материал'],
    [3, 'Изменится 3 материала'],
    [5, 'Изменится 5 материалов'],
    [21, 'Изменится 21 материал'],
  ])('counts %i filled rows', (count, text) => {
    const typed = Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`m${index}`, '1']),
    );

    expect(recountSummary({ ...typed, empty: ' ' })).toBe(text);
  });
});

describe('parseStockAmount', () => {
  it('takes zero or more, with a comma or a dot, to two decimals', () => {
    expect(parseStockAmount('0')).toEqual({ ok: true, value: 0 });
    expect(parseStockAmount(' 12,345 ')).toEqual({ ok: true, value: 12.35 });
    expect(parseStockAmount('0.5')).toEqual({ ok: true, value: 0.5 });
  });

  it.each(['', '-1', '+5', 'x', '1e3', '0x10', '1 200'])(
    'refuses %j and names the fix',
    (raw) => {
      expect(parseStockAmount(raw)).toEqual({
        ok: false,
        error: 'Введите число, ноль или больше',
      });
    },
  );
});

describe('parseMinimumStock', () => {
  it('reads an empty field as no minimum', () => {
    expect(parseMinimumStock('  ')).toEqual({ ok: true, value: 0 });
  });

  it('takes a comma or a dot and keeps two decimals', () => {
    expect(parseMinimumStock('20')).toEqual({ ok: true, value: 20 });
    expect(parseMinimumStock(' 2,345 ')).toEqual({ ok: true, value: 2.35 });
    expect(parseMinimumStock('0.5')).toEqual({ ok: true, value: 0.5 });
  });

  it.each(['-1', 'x', '1e3'])('rejects %j', (raw) => {
    expect(parseMinimumStock(raw)).toEqual({
      ok: false,
      error: 'Введите число, ноль или больше',
    });
  });
});

describe('movementText', () => {
  const movement = {
    id: 'movement',
    kind: 'RECEIPT' as const,
    quantity: 60,
    date: '2026-10-03',
    orderName: null,
  };

  it('words a purchase and a recount with the day and the unit', () => {
    expect(movementText(movement, 'м')).toBe('3 октября купил 60 м');
    expect(
      movementText({ ...movement, kind: 'STOCKTAKE', quantity: 55.5 }, 'м'),
    ).toBe('3 октября пересчёт 55,5 м');
  });

  it('names the order a write-off went to, without the minus', () => {
    expect(
      movementText(
        { ...movement, kind: 'WRITE_OFF', quantity: -23, orderName: '№1031' },
        'м',
      ),
    ).toBe('3 октября ушло на №1031 23 м');
    expect(
      movementText({ ...movement, kind: 'WRITE_OFF', quantity: -23 }, 'м'),
    ).toBe('3 октября ушло на заказ 23 м');
  });

  it('leaves out a missing day', () => {
    expect(movementText({ ...movement, date: null }, 'м')).toBe('купил 60 м');
  });
});

describe('the buy list', () => {
  const materials = [
    material({ id: 'ok', name: 'Труба', onHand: 180, stockState: 'OK' }),
    material({
      id: 'low',
      name: 'Краска',
      unitLabel: 'л',
      onHand: 3,
      stockState: 'LOW',
      toBuy: 4.5,
    }),
    material({
      id: 'buy',
      name: 'Прут',
      onHand: 40,
      stockState: 'BUY',
      toBuy: 106,
    }),
  ];
  const prices = {
    ok: { last: 14_000, average: 14_000 },
    low: { last: 60_000, average: null },
    buy: { last: 9_000, average: 8_875 },
  };

  it('lists what to buy with a sum by the last prices', () => {
    const list = buildBuyList(materials, prices);

    expect(list.lines.map((line) => [line.id, line.sum])).toEqual([
      ['buy', 954_000],
      ['low', 270_000],
    ]);
    expect(list.total).toBe(1_224_000);
    expect(list.copyText.split('\n').map(plain)).toEqual([
      'Прут — 106 м',
      'Краска — 4,5 л',
    ]);
  });

  it('has no sum for a role that sees no prices', () => {
    expect(buildBuyList(materials, {}).total).toBeNull();
  });

  it('values the shelf by the average price, the last one without it', () => {
    expect(stockValue(materials, prices)).toBe(
      180 * 14_000 + 3 * 60_000 + 40 * 8_875,
    );
    expect(stockValue(materials, {})).toBeNull();
  });

  it('shows how full the shelf is against the need and the reserve', () => {
    const [row] = buildStockRows(
      [material({ onHand: 40, reserved: 96, minimumStock: 50 })],
      [],
    );

    expect(row.level).toBeCloseTo(40 / 146);
    expect(plain(row.needText)).toBe('нужно 96 м + запас 50 м');
  });
});

describe('buildPurchase', () => {
  it('turns every material with an amount into a purchase', () => {
    expect(
      buildPurchase(
        {
          rod: { quantity: '106', price: '9,000' },
          paint: { quantity: '5', price: '' },
          pipe: { quantity: '', price: '14000' },
        },
        '2026-10-06',
      ),
    ).toEqual({
      ok: true,
      data: [
        {
          kind: 'RECEIPT',
          materialId: 'rod',
          quantity: 106,
          unitPrice: 9_000,
          date: '2026-10-06',
        },
        {
          kind: 'RECEIPT',
          materialId: 'paint',
          quantity: 5,
          unitPrice: null,
          date: '2026-10-06',
        },
      ],
    });
  });

  it('points at the material whose amount cannot be read', () => {
    const purchase = buildPurchase(
      { rod: { quantity: 'много', price: '' } },
      '2026-10-06',
    );

    expect(purchase.ok ? [] : Object.keys(purchase.errors)).toEqual(['rod']);
  });

  it('sums the purchase as it is typed', () => {
    expect(
      plain(
        purchaseSummary({
          rod: { quantity: '106', price: '9000' },
          paint: { quantity: '5', price: '62000' },
        }) ?? '',
      ),
    ).toBe('Всего 1,264,000 сум');
    expect(purchaseSummary({})).toBeNull();
  });
});
