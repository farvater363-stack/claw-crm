// Web Mercator in pixels, as OpenStreetMap slices it into 256px tiles.
export const TILE_SIZE_PX = 256;
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 19;
export const DEFAULT_ZOOM = 17;

export type MapView = { lat: number; lng: number; zoom: number };

export type PlacedTile = {
  key: string;
  url: string;
  leftPx: number;
  topPx: number;
};

const worldSizePx = (zoom: number) => TILE_SIZE_PX * 2 ** zoom;

export const projectToWorldPx = (
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number } => {
  const worldSize = worldSizePx(zoom);
  const sinLat = Math.sin((lat * Math.PI) / 180);

  return {
    x: ((lng + 180) / 360) * worldSize,
    y:
      (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize,
  };
};

export const worldPxToLatLng = (
  x: number,
  y: number,
  zoom: number,
): { lat: number; lng: number } => {
  const worldSize = worldSizePx(zoom);

  return {
    lat:
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldSize))) * 180) /
      Math.PI,
    lng: (x / worldSize) * 360 - 180,
  };
};

export const panByPixels = (
  view: MapView,
  deltaXPx: number,
  deltaYPx: number,
): MapView => {
  const { x, y } = projectToWorldPx(view.lat, view.lng, view.zoom);

  return {
    ...worldPxToLatLng(x - deltaXPx, y - deltaYPx, view.zoom),
    zoom: view.zoom,
  };
};

export const zoomBy = (view: MapView, step: 1 | -1): MapView => ({
  ...view,
  zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom + step)),
});

export const tilesForViewport = (
  view: MapView,
  widthPx: number,
  heightPx: number,
): PlacedTile[] => {
  const center = projectToWorldPx(view.lat, view.lng, view.zoom);
  const originX = center.x - widthPx / 2;
  const originY = center.y - heightPx / 2;
  const tileCount = 2 ** view.zoom;
  const tiles: PlacedTile[] = [];

  for (
    let tileY = Math.floor(originY / TILE_SIZE_PX);
    tileY * TILE_SIZE_PX < originY + heightPx;
    tileY++
  ) {
    if (tileY < 0 || tileY >= tileCount) continue;

    for (
      let tileX = Math.floor(originX / TILE_SIZE_PX);
      tileX * TILE_SIZE_PX < originX + widthPx;
      tileX++
    ) {
      if (tileX < 0 || tileX >= tileCount) continue;

      tiles.push({
        key: `${view.zoom}/${tileX}/${tileY}`,
        url: `https://tile.openstreetmap.org/${view.zoom}/${tileX}/${tileY}.png`,
        leftPx: Math.round(tileX * TILE_SIZE_PX - originX),
        topPx: Math.round(tileY * TILE_SIZE_PX - originY),
      });
    }
  }

  return tiles;
};
