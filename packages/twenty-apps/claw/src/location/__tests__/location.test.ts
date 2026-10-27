import { describe, expect, it } from 'vitest';

import { EMPTY_LOCATION, hasPoint } from 'src/location/location';
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
