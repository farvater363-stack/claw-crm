import { useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { useSelectedRecordIds } from 'twenty-sdk/front-component';

import { OpeningSketch } from 'src/measurer-form/measurer-form-ui';
import {
  type SchemeOpening,
  toSchemeOpenings,
} from 'src/order-sketch/order-sketch';
import { formatQuantity } from 'src/ui/format';
import { usePalette } from 'src/ui/kit';
import { RADIUS, SPACE, TABULAR_NUMBERS, TYPE } from 'src/ui/tokens';

const PAGE_SIZE = 200;
const CARD_MIN_WIDTH_PX = 220;
// A single column on a phone would draw each проём a full screen tall.
const SKETCH_MAX_WIDTH_PX = 280;

const loadOpenings = async (orderId: string): Promise<SchemeOpening[]> => {
  const { orderItems } = await new CoreApiClient().query({
    orderItems: {
      __args: {
        filter: { orderId: { eq: orderId } },
        first: PAGE_SIZE,
        orderBy: [{ createdAt: 'AscNullsLast' }],
      },
      edges: {
        node: {
          id: true,
          widthCm: true,
          heightCm: true,
          projectionCm: true,
          projectionKind: true,
          quantity: true,
          design: { name: true },
        },
      },
    },
  });

  return toSchemeOpenings(
    (orderItems?.edges ?? []).map(({ node }) => ({
      id: node.id,
      widthCm: node.widthCm,
      heightCm: node.heightCm,
      projectionCm: node.projectionCm,
      projectionKind: node.projectionKind ?? null,
      quantity: node.quantity,
      designName: node.design?.name ?? null,
    })),
  );
};

const OpeningCard = ({ opening }: { opening: SchemeOpening }) => {
  const colors = usePalette();
  const { sketch } = opening;

  return (
    <div
      style={{
        display: 'grid',
        gap: SPACE.sm,
        padding: SPACE.md,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: RADIUS.card,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: SPACE.sm,
          ...TYPE.label,
          fontWeight: 600,
        }}
      >
        <span>{opening.title}</span>
        {opening.quantity > 1 ? (
          <span style={TABULAR_NUMBERS}>{`× ${opening.quantity}`}</span>
        ) : null}
      </div>
      {sketch === null ? (
        <div style={{ ...TYPE.label, color: colors.muted }}>
          Размеры не указаны
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            maxWidth: SKETCH_MAX_WIDTH_PX,
            margin: '0 auto',
          }}
        >
          <OpeningSketch
            widthCm={sketch.widthCm}
            heightCm={sketch.heightCm}
            projectionKind={sketch.projectionKind}
            projectionCm={sketch.projectionCm}
          />
        </div>
      )}
      <div style={{ display: 'grid', gap: 2 }}>
        <span style={{ ...TYPE.label, fontWeight: 600 }}>
          {opening.designName ?? 'Решётка не выбрана'}
        </span>
        {sketch === null ? null : (
          <span
            style={{ ...TYPE.label, color: colors.muted, ...TABULAR_NUMBERS }}
          >
            {`${sketch.sizeText} см · ${formatQuantity(sketch.areaSquareMeters, 'м²')}`}
          </span>
        )}
      </div>
    </div>
  );
};

const OrderSketchOf = ({ orderId }: { orderId: string }) => {
  const colors = usePalette();
  const [openings, setOpenings] = useState<SchemeOpening[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadOpenings(orderId)
      .then(setOpenings)
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : String(error)),
      );
  }, [orderId]);

  const note = { ...TYPE.label, color: colors.muted, margin: 0 };

  if (loadError !== null) {
    return (
      <p role="alert" style={note}>
        Не удалось загрузить схему: {loadError}
      </p>
    );
  }

  if (openings === null) return null;

  if (openings.length === 0) {
    return <p style={note}>В заказе пока нет проёмов</p>;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_WIDTH_PX}px, 1fr))`,
        gap: SPACE.md,
        color: colors.text,
        fontFamily: 'inherit',
      }}
    >
      {openings.map((opening) => (
        <OpeningCard key={opening.id} opening={opening} />
      ))}
    </div>
  );
};

export const OrderSketch = () => {
  const selectedRecordIds = useSelectedRecordIds();

  if (selectedRecordIds.length !== 1) return null;

  return (
    <OrderSketchOf key={selectedRecordIds[0]} orderId={selectedRecordIds[0]} />
  );
};
