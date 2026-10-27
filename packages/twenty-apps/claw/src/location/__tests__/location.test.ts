import { describe, expect, it } from 'vitest';

import {
  EMPTY_LOCATION,
  hasPoint,
  pickMapCenter,
  TASHKENT_CENTER,
} from 'src/location/location';
import { describeSavedLocation } from 'src/location/location-field';

describe('hasPoint', () => {
  it('is false when the point was never set', () => {
    expect(hasPoint({ lat: null, lng: null })).toBe(false);
  });

  it('is true once both coordinates are set', () => {
    expect(hasPoint({ lat: 41.3, lng: 69.2 })).toBe(true);
  });
});

describe('describeSavedLocation', () => {
  it('says nothing until a point is saved', () => {
    expect(describeSavedLocation(EMPTY_LOCATION)).toBe(null);
  });

  it('names what was saved with the point', () => {
    expect(
      describeSavedLocation({
        ...EMPTY_LOCATION,
        lat: 41.3,
        lng: 69.2,
        note: 'Вход со двора',
        savedPhotos: [
          {
            fileId: 'file-1',
            label: 'Подъезд',
            url: 'https://crm.example.test/1',
          },
        ],
      }),
    ).toBe('✓ Точка сохранена · Как найти · 1 фото');
  });
});

describe('pickMapCenter', () => {
  const devicePosition = { lat: 41.35, lng: 69.3 };

  it('keeps a saved point over the device position', () => {
    expect(pickMapCenter({ lat: 41.3, lng: 69.2 }, devicePosition)).toEqual({
      lat: 41.3,
      lng: 69.2,
    });
  });

  it('uses the device position when there is no point', () => {
    expect(pickMapCenter({ lat: null, lng: null }, devicePosition)).toEqual(
      devicePosition,
    );
  });

  it('falls back to the city centre', () => {
    expect(pickMapCenter({ lat: null, lng: null }, null)).toEqual(
      TASHKENT_CENTER,
    );
  });
});
