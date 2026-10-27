import { type PointerEvent, useRef } from 'react';

import {
  type MapView,
  panByPixels,
  tilesForViewport,
  TILE_SIZE_PX,
  zoomBy,
} from 'src/location/map-tiles';
import { Button, usePalette } from 'src/ui/kit';
import { RADIUS, SPACE, TYPE } from 'src/ui/tokens';

// Tiles are laid out for a box this wide around the centre, so the map needs
// no measuring: any narrower box simply clips them.
const LAID_OUT_WIDTH_PX = 1024;

// Leaflet needs a real DOM, which a front component does not have; this is a
// few positioned <img> tiles with the pin fixed in the middle.
export const LocationMap = ({
  view,
  heightPx,
  onViewChange,
}: {
  view: MapView;
  heightPx: number;
  // Left out for a preview that cannot be moved
  onViewChange?: (view: MapView) => void;
}) => {
  const colors = usePalette();
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    view: MapView;
  } | null>(null);
  const tiles = tilesForViewport(view, LAID_OUT_WIDTH_PX, heightPx);
  const isMovable = onViewChange !== undefined;

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (!isMovable || drag.current !== null) return;

    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      view,
    };
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;

    if (current?.pointerId !== event.pointerId) return;

    onViewChange?.(
      panByPixels(
        current.view,
        event.clientX - current.x,
        event.clientY - current.y,
      ),
    );
  };

  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };

  return (
    <div
      role="img"
      aria-label="Карта, точка в центре"
      style={{
        position: 'relative',
        height: `${heightPx}px`,
        overflow: 'hidden',
        borderRadius: RADIUS.card,
        background: colors.panel,
        cursor: isMovable ? 'grab' : 'default',
        // Without it a finger dragging the map scrolls the page instead.
        touchAction: isMovable ? 'none' : 'auto',
        userSelect: 'none',
      }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
    >
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.url}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: `calc(50% + ${tile.leftPx - LAID_OUT_WIDTH_PX / 2}px)`,
            top: `${tile.topPx}px`,
            width: `${TILE_SIZE_PX}px`,
            height: `${TILE_SIZE_PX}px`,
            pointerEvents: 'none',
          }}
        />
      ))}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -100%)',
          fontSize: '32px',
          lineHeight: 1,
          pointerEvents: 'none',
        }}
      >
        📍
      </span>
      {isMovable ? (
        <div
          style={{
            position: 'absolute',
            top: SPACE.sm,
            right: SPACE.sm,
            display: 'grid',
            gap: SPACE.xs,
            background: colors.surface,
            borderRadius: RADIUS.control,
          }}
        >
          <Button
            label="Приблизить"
            onClick={() => onViewChange(zoomBy(view, 1))}
          >
            +
          </Button>
          <Button
            label="Отдалить"
            onClick={() => onViewChange(zoomBy(view, -1))}
          >
            −
          </Button>
        </div>
      ) : null}
      <span
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          padding: `0 ${SPACE.xs}px`,
          background: 'rgba(255, 255, 255, 0.8)',
          color: '#333333',
          ...TYPE.label,
          pointerEvents: 'none',
        }}
      >
        © OpenStreetMap
      </span>
    </div>
  );
};
