import { describe, expect, it } from 'vitest';

import {
  MAX_ZOOM,
  MIN_ZOOM,
  panByPixels,
  projectToWorldPx,
  tilesForViewport,
  worldPxToLatLng,
  zoomBy,
} from 'src/location/map-tiles';

const CENTER = { lat: 41.3111, lng: 69.2797, zoom: 17 };

describe('map tiles', () => {
  it('puts the equator and the meridian in the middle of the world', () => {
    expect(projectToWorldPx(0, 0, 0)).toEqual({ x: 128, y: 128 });
  });

  it('turns a pixel back into the point it came from', () => {
    const { x, y } = projectToWorldPx(CENTER.lat, CENTER.lng, 17);
    const back = worldPxToLatLng(x, y, 17);

    expect(back.lat).toBeCloseTo(CENTER.lat, 6);
    expect(back.lng).toBeCloseTo(CENTER.lng, 6);
  });

  it('moves the centre west when the map is dragged right', () => {
    expect(panByPixels(CENTER, 256, 0).lng).toBeLessThan(CENTER.lng);
    expect(panByPixels(CENTER, 0, 256).lat).toBeGreaterThan(CENTER.lat);
  });

  it('keeps the zoom within the tiles OpenStreetMap serves', () => {
    expect(zoomBy({ ...CENTER, zoom: MAX_ZOOM }, 1).zoom).toBe(MAX_ZOOM);
    expect(zoomBy({ ...CENTER, zoom: MIN_ZOOM }, -1).zoom).toBe(MIN_ZOOM);
    expect(zoomBy(CENTER, 1).zoom).toBe(18);
  });

  it('covers the viewport with OpenStreetMap tiles', () => {
    const tiles = tilesForViewport(CENTER, 512, 512);

    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(tiles.length).toBeLessThanOrEqual(9);

    for (const tile of tiles) {
      expect(tile.url).toMatch(
        /^https:\/\/tile\.openstreetmap\.org\/17\/\d+\/\d+\.png$/,
      );
    }

    const middle = tiles.filter(
      (tile) =>
        tile.leftPx <= 256 &&
        tile.leftPx + 256 > 256 &&
        tile.topPx <= 256 &&
        tile.topPx + 256 > 256,
    );

    expect(middle).toHaveLength(1);

    const { x, y } = projectToWorldPx(CENTER.lat, CENTER.lng, 17);

    expect(middle[0].url).toBe(
      `https://tile.openstreetmap.org/17/${Math.floor(x / 256)}/${Math.floor(y / 256)}.png`,
    );
  });
});
