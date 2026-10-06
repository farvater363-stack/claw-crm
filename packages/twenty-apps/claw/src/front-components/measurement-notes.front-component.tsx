import { useEffect, useState } from 'react';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineFrontComponent } from 'twenty-sdk/define';
import {
  useColorScheme,
  useSelectedRecordIds,
} from 'twenty-sdk/front-component';

import { IDS } from 'src/constants/universal-identifiers';
import {
  collectOrderNotes,
  collectOrderPhotos,
  type OrderNote,
  type OrderPhoto,
} from 'src/order-notes/order-notes';
import { PALETTE } from 'src/ui/tokens';

const PAGE_SIZE = 200;
const PHOTO_SIZE_PX = 120;
const PHOTO = { url: true } as const;

type OrderCardNotes = { notes: OrderNote[]; photos: OrderPhoto[] };

// A role that cannot read one of the sources still sees the rest.
const orEmpty = <TRow,>(rows: Promise<TRow[]>): Promise<TRow[]> =>
  rows.catch(() => []);

const loadOrderNotes = async (orderId: string): Promise<OrderCardNotes> => {
  const client = new CoreApiClient();
  const ofOrder = { filter: { orderId: { eq: orderId } }, first: PAGE_SIZE };
  const [{ orders, orderItems }, payments, stockMovements] = await Promise.all([
    client.query({
      orders: {
        __args: { filter: { id: { eq: orderId } }, first: 1 },
        edges: { node: { comment: true, finishedPhotos: PHOTO } },
      },
      orderItems: {
        __args: { ...ofOrder, orderBy: [{ createdAt: 'AscNullsLast' }] },
        edges: {
          node: {
            id: true,
            widthCm: true,
            heightCm: true,
            notes: true,
            photos: PHOTO,
            design: { name: true },
          },
        },
      },
    }),
    orEmpty(
      client
        .query({
          orderPayments: {
            __args: { ...ofOrder, orderBy: [{ paidOn: 'AscNullsLast' }] },
            edges: { node: { id: true, paidOn: true, comment: true } },
          },
        })
        .then(({ orderPayments }) =>
          (orderPayments?.edges ?? []).map(({ node }) => node),
        ),
    ),
    orEmpty(
      client
        .query({
          stockMovements: {
            __args: ofOrder,
            edges: { node: { id: true, name: true, comment: true } },
          },
        })
        .then(({ stockMovements: movements }) =>
          (movements?.edges ?? []).map(({ node }) => node),
        ),
    ),
  ]);

  const items = (orderItems?.edges ?? []).map(({ node }) => ({
    id: node.id,
    widthCm: node.widthCm ?? null,
    heightCm: node.heightCm ?? null,
    designName: node.design?.name ?? null,
    notes: node.notes ?? null,
    photos: node.photos ?? null,
  }));

  return {
    photos: collectOrderPhotos({
      items,
      finishedPhotos: orders?.edges[0]?.node?.finishedPhotos ?? null,
    }),
    notes: collectOrderNotes({
      orderComment: orders?.edges[0]?.node?.comment ?? null,
      items,
      payments: payments.map((payment) => ({
        id: payment.id,
        paidOn: payment.paidOn ?? null,
        comment: payment.comment ?? null,
      })),
      stockMovements: stockMovements.map((movement) => ({
        id: movement.id,
        name: movement.name ?? null,
        comment: movement.comment ?? null,
      })),
    }),
  };
};

const MeasurementNotes = () => {
  const colors = PALETTE[useColorScheme()];
  const selectedRecordIds = useSelectedRecordIds();
  const orderId = selectedRecordIds.length === 1 ? selectedRecordIds[0] : null;
  const [loaded, setLoaded] = useState<OrderCardNotes | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (orderId === null) return;

    loadOrderNotes(orderId)
      .then(setLoaded)
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : String(error)),
      );
  }, [orderId]);

  const text = {
    color: colors.text,
    fontFamily: 'inherit',
    fontSize: '13px',
    lineHeight: 1.5,
  } as const;

  if (loadError !== null) {
    return (
      <p role="alert" style={{ ...text, color: colors.muted, margin: 0 }}>
        Не удалось загрузить фото и комментарии: {loadError}
      </p>
    );
  }

  if (loaded === null) return null;

  const { notes, photos } = loaded;

  if (notes.length === 0 && photos.length === 0) {
    return (
      <p style={{ ...text, color: colors.muted, margin: 0 }}>
        Фото, комментариев и заметок по заказу нет
      </p>
    );
  }

  return (
    <div style={{ ...text, display: 'grid', gap: '12px' }}>
      {photos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {photos.map((photo) => (
            <a
              key={photo.url}
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              style={{
                color: colors.muted,
                display: 'grid',
                gap: '4px',
                textDecoration: 'none',
                width: PHOTO_SIZE_PX,
              }}
            >
              <img
                src={photo.url}
                alt={photo.caption}
                style={{
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  height: PHOTO_SIZE_PX,
                  objectFit: 'cover',
                  width: PHOTO_SIZE_PX,
                }}
              />
              <span style={{ fontSize: '12px', lineHeight: 1.3 }}>
                {photo.caption}
              </span>
            </a>
          ))}
        </div>
      )}
      {notes.length > 0 && (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
          }}
        >
          {notes.map((note, index) => (
            <div
              key={note.key}
              style={{
                borderTop: index === 0 ? 'none' : `1px solid ${colors.border}`,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px 12px',
                padding: '8px 12px',
              }}
            >
              <span style={{ color: colors.muted, minWidth: '160px' }}>
                {note.source}
              </span>
              <span style={{ flex: '1 1 200px', whiteSpace: 'pre-line' }}>
                {note.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: IDS.measurementNotes.frontComponent,
  name: 'measurement-notes',
  description: 'Фото, комментарии и заметки со всего заказа на его карточке',
  component: MeasurementNotes,
});
