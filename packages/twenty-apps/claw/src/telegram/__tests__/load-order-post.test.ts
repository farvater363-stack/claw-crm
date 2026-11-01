import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import { loadOrderPost } from 'src/telegram/load-order-post';

const ORDER = {
  name: '1043',
  installationDeadline: null,
  clientFullName: { firstName: 'Тест', lastName: 'Тестов' },
  clientPhone: '+998 90 000 00 00',
  district: 'MIRABAD',
  addressLine: 'ул. Тестовая 1',
  floor: 3,
  locationLat: 41.3111,
  locationLng: 69.2797,
  locationNote: 'Вход со двора',
  installer: { name: 'Установщик Тест' },
  urgency: 'URGENT',
  paintColor: 'Чёрный',
  comment: null,
  total: { amountMicros: 1_250_000_000_000 },
  paid: { amountMicros: 500_000_000_000 },
  balance: { amountMicros: 750_000_000_000 },
  locationPhotos: Array.from({ length: 12 }, (_, index) => ({
    fileId: `file-${index}`,
    label: `Фото ${index}.jpg`,
    url: `https://crm.example.test/files/${index}`,
  })),
};

const ITEMS = [
  {
    id: 'item-2',
    product: 'GRILLE',
    shape: null,
    widthCm: 100,
    heightCm: 120,
    projectionCm: 0,
    projectionKind: 'NONE',
    projectionSide: null,
    quantity: 1,
    openingNumber: 2,
    notes: null,
    design: { name: 'Волна' },
  },
  {
    id: 'item-1',
    product: 'GRILLE',
    shape: null,
    widthCm: 120,
    heightCm: 150,
    projectionCm: 10,
    projectionKind: 'BOTTOM_AND_TOP',
    projectionSide: 'OUTSIDE',
    quantity: 2,
    openingNumber: 1,
    notes: ' Старая рама ',
    design: { name: 'Классика' },
  },
];

const SERVICES = [
  {
    name: 'Козырёк',
    quantity: 2.4,
    orderItemId: 'item-1',
    extraService: { name: 'Козырёк Стандарт', unit: 'PER_RUNNING_METER' },
  },
  {
    name: 'Установка',
    quantity: 1,
    orderItemId: null,
    extraService: { name: 'Установка', unit: 'FIXED' },
  },
  {
    name: 'Доставка',
    quantity: 2,
    orderItemId: null,
    extraService: { name: 'Доставка', unit: 'PER_PIECE' },
  },
];

const clientReturning = (
  order: Record<string, unknown>,
  items: unknown[] = ITEMS,
) =>
  ({
    query: async () => ({
      orders: { edges: [{ node: order }] },
      orderItems: { edges: items.map((node) => ({ node })) },
      orderExtraServices: { edges: SERVICES.map((node) => ({ node })) },
    }),
  }) as unknown as CoreApiClient;

describe('loadOrderPost', () => {
  it('keeps ten photos for the album and counts the rest', async () => {
    const post = await loadOrderPost(
      clientReturning(ORDER),
      'order-1',
      'https://crm.example.test',
    );

    expect(post.photoUrls).toHaveLength(10);
    expect(post.card.extraPhotoCount).toBe(2);
    expect(post.card.orderUrl).toBe(
      'https://crm.example.test/object/order/order-1',
    );
  });

  it('names the district in Russian and joins the client name', async () => {
    const { card } = await loadOrderPost(
      clientReturning(ORDER),
      'order-1',
      'https://crm.example.test',
    );

    expect(card.districtLabel).toBe('Мирабадский');
    expect(card.clientFullName).toBe('Тест Тестов');
    expect(card.installerName).toBe('Установщик Тест');
  });

  it('has no point while the coordinates are empty', async () => {
    const post = await loadOrderPost(
      clientReturning({ ...ORDER, locationLat: null, locationLng: null }),
      'order-1',
      'https://crm.example.test',
    );

    expect(post.point).toBe(null);
    expect(post.card.hasPoint).toBe(false);
  });

  it('lists проёмы in the form’s order with visors, and the other services', async () => {
    const { card } = await loadOrderPost(
      clientReturning(ORDER),
      'order-1',
      'https://crm.example.test',
    );

    expect(card.openings.map((opening) => opening.title)).toEqual([
      'Проём 1',
      'Проём 2',
    ]);
    expect(card.openings[0]).toMatchObject({
      quantity: 2,
      product: 'Классика',
      visorText: 'Козырёк Стандарт, 120 см',
      notes: 'Старая рама',
    });
    expect(card.openings[0].sizeText).toContain('120×150×10');
    expect(card.services).toEqual(['Установка', 'Доставка × 2 шт']);
    expect(card.isUrgent).toBe(true);
    expect(card.paintColor).toBe('Чёрный');
  });

  it('reads the money in сум', async () => {
    const { card } = await loadOrderPost(
      clientReturning(ORDER),
      'order-1',
      'https://crm.example.test',
    );

    expect(card.money).toEqual({
      total: 1_250_000,
      paid: 500_000,
      balance: 750_000,
    });
  });

  it('has a scheme for every проём, and none without проёмы', async () => {
    const post = await loadOrderPost(
      clientReturning(ORDER),
      'order-1',
      'https://crm.example.test',
    );
    const empty = await loadOrderPost(
      clientReturning(ORDER, []),
      'order-1',
      'https://crm.example.test',
    );

    expect(post.scheme?.fileName).toBe('Схема 1043.pdf');
    expect(post.scheme?.openings).toHaveLength(2);
    expect(empty.scheme).toBe(null);
  });
});
