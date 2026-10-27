import { describe, expect, it } from 'vitest';

import { hasPoint } from 'src/location/location';

describe('hasPoint', () => {
  it('is false when the point was never set', () => {
    expect(hasPoint({ lat: null, lng: null })).toBe(false);
  });

  it('is true once both coordinates are set', () => {
    expect(hasPoint({ lat: 41.3, lng: 69.2 })).toBe(true);
  });
});
