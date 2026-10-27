import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import { hasPoint } from 'src/location/location';
import {
  loadOrderLocation,
  ORDER_LOCATION_FIELDS,
} from 'src/location/load-order-location';
import orderObject from 'src/objects/order.object';
import workshopRole from 'src/roles/workshop.role';

const clientReturning = (order: Record<string, unknown>) =>
  ({
    query: async () => ({ orders: { edges: [{ node: order }] } }),
  }) as unknown as CoreApiClient;

describe('order location block', () => {
  // Twenty refuses the whole query when one field is hidden from the caller.
  it('asks only for fields Цех may read', () => {
    const hiddenFromWorkshop = new Set(
      (workshopRole.config.fieldPermissions ?? [])
        .filter((permission) => permission.canReadFieldValue === false)
        .map((permission) => permission.fieldUniversalIdentifier),
    );
    const fieldIdByName = new Map(
      orderObject.config.fields.map((field) => [
        field.name,
        field.universalIdentifier,
      ]),
    );

    for (const name of Object.keys(ORDER_LOCATION_FIELDS)) {
      const fieldId = fieldIdByName.get(name);

      expect(fieldId, name).toBeDefined();
      expect(hiddenFromWorkshop.has(fieldId ?? ''), name).toBe(false);
    }
  });

  it('turns the saved photos into the draft', async () => {
    const location = await loadOrderLocation(
      clientReturning({
        locationLat: 41.3111,
        locationLng: 69.2797,
        locationNote: 'Вход со двора',
        locationPhotos: [
          {
            fileId: 'file-1',
            label: 'Подъезд',
            url: 'https://crm.example.test/1',
          },
        ],
        addressLine: 'ул. Тестовая 1',
        district: 'MIRABAD',
        floor: 2,
      }),
      'order-1',
    );

    expect(location.savedPhotos).toEqual([
      { fileId: 'file-1', label: 'Подъезд', url: 'https://crm.example.test/1' },
    ]);
    expect(location.note).toBe('Вход со двора');
    expect(location.addressText).toBe('Мирабадский, ул. Тестовая 1, 2 эт.');
    expect(hasPoint(location)).toBe(true);
  });

  it('has no point while the coordinates are empty', async () => {
    const location = await loadOrderLocation(
      clientReturning({
        locationLat: null,
        locationLng: null,
        locationNote: null,
        locationPhotos: null,
        addressLine: null,
        district: null,
        floor: null,
      }),
      'order-1',
    );

    expect(hasPoint(location)).toBe(false);
    expect(location.note).toBe('');
    expect(location.addressText).toBe(null);
  });
});
