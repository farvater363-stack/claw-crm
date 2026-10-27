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
  locationPhotos: Array.from({ length: 12 }, (_, index) => ({
    fileId: `file-${index}`,
    label: `Фото ${index}.jpg`,
    url: `https://crm.example.test/files/${index}`,
  })),
};

const clientReturning = (order: Record<string, unknown>) =>
  ({
    query: async () => ({ orders: { edges: [{ node: order }] } }),
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
});
