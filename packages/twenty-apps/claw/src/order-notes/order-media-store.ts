import { CoreApiClient } from 'twenty-client-sdk/core';
import { MetadataApiClient } from 'twenty-client-sdk/metadata';
import { uploadFile } from 'twenty-sdk/front-component';

import { IDS } from 'src/constants/universal-identifiers';
import { MAX_LOCATION_PHOTOS } from 'src/location/location';
import { MAX_ORDER_NOTE_PHOTOS } from 'src/objects/order-note.object';
import {
  collectOrderMedia,
  type OrderMedia,
  type OrderMediaSources,
} from 'src/order-notes/order-notes';
import { fetchFieldMetadataId } from 'src/utils/fetch-field-metadata-id';
import { randomUuid } from 'src/utils/random-uuid';

const PAGE_SIZE = 200;
const PHOTO = { url: true } as const;
const FILE = { fileId: true, label: true } as const;

export const MAX_FINISHED_PHOTOS = 10;

// Where a new photo goes. Проём and «Весь заказ» photos are notes without
// words; the finished work and the entrance keep their own order fields,
// which Telegram and the address block read.
export type PhotoTarget =
  | { kind: 'order' }
  | { kind: 'opening'; orderItemId: string }
  | { kind: 'address' }
  | { kind: 'finished' };

export type LoadedOrderMedia = { orderName: string; media: OrderMedia };

export type Viewer = { memberId: string | null; isOwner: boolean };

type StoredFile = { fileId: string; label: string };

// A role that cannot read one of the sources still sees the rest.
const orEmpty = <TRow>(rows: Promise<TRow[]>): Promise<TRow[]> =>
  rows.catch(() => []);

export const loadOrderMedia = async (
  orderId: string,
): Promise<LoadedOrderMedia> => {
  const client = new CoreApiClient();
  const ofOrder = { filter: { orderId: { eq: orderId } }, first: PAGE_SIZE };
  const [{ orders, orderItems, orderNotes }, payments, stockMovements] =
    await Promise.all([
      client.query({
        orders: {
          __args: { filter: { id: { eq: orderId } }, first: 1 },
          edges: {
            node: {
              name: true,
              comment: true,
              finishedPhotos: PHOTO,
              locationPhotos: PHOTO,
            },
          },
        },
        orderItems: {
          __args: { ...ofOrder, orderBy: [{ createdAt: 'AscNullsLast' }] },
          edges: {
            node: {
              id: true,
              openingNumber: true,
              widthCm: true,
              heightCm: true,
              notes: true,
              photos: PHOTO,
              design: { name: true },
            },
          },
        },
        orderNotes: {
          __args: { ...ofOrder, orderBy: [{ createdAt: 'DescNullsLast' }] },
          edges: {
            node: {
              id: true,
              text: true,
              createdAt: true,
              updatedAt: true,
              createdBy: { name: true, workspaceMemberId: true },
              orderItemId: true,
              photos: PHOTO,
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

  const order = orders?.edges[0]?.node;
  const sources: OrderMediaSources = {
    orderComment: order?.comment ?? null,
    finishedPhotos: order?.finishedPhotos ?? null,
    locationPhotos: order?.locationPhotos ?? null,
    items: (orderItems?.edges ?? []).map(({ node }) => ({
      id: node.id,
      openingNumber: node.openingNumber ?? null,
      widthCm: node.widthCm ?? null,
      heightCm: node.heightCm ?? null,
      designName: node.design?.name ?? null,
      notes: node.notes ?? null,
      photos: node.photos ?? null,
    })),
    orderNotes: (orderNotes?.edges ?? []).map(({ node }) => ({
      id: node.id,
      text: node.text ?? null,
      createdAt: node.createdAt ?? null,
      updatedAt: node.updatedAt ?? null,
      authorName: node.createdBy?.name?.trim() || null,
      authorMemberId: node.createdBy?.workspaceMemberId ?? null,
      orderItemId: node.orderItemId ?? null,
      photos: node.photos ?? null,
    })),
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
  };

  return { orderName: order?.name ?? '', media: collectOrderMedia(sources) };
};

// Who is looking: their own notes are theirs to change, and the owner (who
// manages roles) may remove anyone's.
export const loadViewer = async (): Promise<Viewer> => {
  try {
    const { currentUser } = await new MetadataApiClient().query({
      currentUser: {
        workspaceMember: { id: true },
        currentUserWorkspace: { permissionFlags: true },
      },
    });

    return {
      memberId: currentUser?.workspaceMember?.id ?? null,
      isOwner:
        currentUser?.currentUserWorkspace?.permissionFlags?.includes('ROLES') ??
        false,
    };
  } catch {
    return { memberId: null, isOwner: false };
  }
};

const uploadAll = async (
  files: File[],
  objectUniversalIdentifier: string,
  fieldUniversalIdentifier: string,
  labelOf: (file: File, index: number) => string,
): Promise<StoredFile[]> => {
  if (files.length === 0) return [];

  const fieldMetadataId = await fetchFieldMetadataId(
    objectUniversalIdentifier,
    fieldUniversalIdentifier,
  );

  if (fieldMetadataId === null) throw new Error('поле для фото не найдено');

  const uploaded: StoredFile[] = [];

  for (const [index, file] of files.entries()) {
    const result = await uploadFile(file, {
      fieldMetadataId,
      fileName: file.name,
    }).catch(() => null);

    if (result?.status === 'uploaded') {
      uploaded.push({
        fileId: result.file.fileId,
        label: labelOf(file, index),
      });
    }
  }

  return uploaded;
};

// A tablet camera names every shot image.jpg
const extensionOf = (fileName: string) =>
  /\.[a-z0-9]+$/i.exec(fileName)?.[0].toLowerCase() ?? '.jpg';

// Returns how many photos did not upload, so the caller can say so.
export const saveNote = async ({
  orderId,
  orderItemId,
  text,
  files,
}: {
  orderId: string;
  orderItemId: string | null;
  text: string;
  files: File[];
}): Promise<number> => {
  const kept = files.slice(0, MAX_ORDER_NOTE_PHOTOS);
  const uploaded = await uploadAll(
    kept,
    IDS.orderNote.object,
    IDS.orderNote.photos,
    (file, index) => `Фото ${index + 1}${extensionOf(file.name)}`,
  );
  const trimmedText = text.trim();

  if (trimmedText === '' && uploaded.length === 0) return files.length;

  await new CoreApiClient().mutation({
    createOrderNote: {
      __args: {
        data: {
          id: randomUuid(),
          text: trimmedText === '' ? null : trimmedText,
          orderId,
          orderItemId,
          photos: uploaded,
        },
      },
      id: true,
    },
  });

  return files.length - uploaded.length;
};

export const updateNoteText = async (noteId: string, text: string) => {
  await new CoreApiClient().mutation({
    updateOrderNote: {
      __args: { id: noteId, data: { text: text.trim() } },
      id: true,
    },
  });
};

export const deleteNote = async (noteId: string) => {
  await new CoreApiClient().mutation({
    deleteOrderNote: { __args: { id: noteId }, id: true },
  });
};

export const restoreNote = async (noteId: string) => {
  await new CoreApiClient().mutation({
    restoreOrderNote: { __args: { id: noteId }, id: true },
  });
};

const ORDER_FILE_FIELDS = {
  finished: {
    fieldUniversalIdentifier: IDS.order.finishedPhotos,
    max: MAX_FINISHED_PHOTOS,
  },
  address: {
    fieldUniversalIdentifier: IDS.order.locationPhotos,
    max: MAX_LOCATION_PHOTOS,
  },
} as const;

// A FILES update replaces the whole list, so the photos already on the order
// are read just before the write: one someone added since the last reload is
// kept.
const appendOrderPhotos = async (
  orderId: string,
  orderName: string,
  kind: 'finished' | 'address',
  files: File[],
): Promise<number> => {
  const field = ORDER_FILE_FIELDS[kind];
  const client = new CoreApiClient();
  const { orders } = await client.query({
    orders: {
      __args: { first: 1, filter: { id: { eq: orderId } } },
      edges: { node: { finishedPhotos: FILE, locationPhotos: FILE } },
    },
  });
  const node = orders?.edges[0]?.node;
  const stored = (
    kind === 'finished' ? node?.finishedPhotos : node?.locationPhotos
  ) as
    | ({ fileId?: string | null; label?: string | null } | null)[]
    | null
    | undefined;
  const kept: StoredFile[] = (stored ?? []).flatMap((photo) =>
    typeof photo?.fileId === 'string'
      ? [{ fileId: photo.fileId, label: photo.label ?? '' }]
      : [],
  );
  const room = Math.max(0, field.max - kept.length);
  const uploaded = await uploadAll(
    files.slice(0, room),
    IDS.order.object,
    field.fieldUniversalIdentifier,
    (file, index) =>
      kind === 'finished'
        ? `Готово ${orderName}, фото ${kept.length + index + 1}${extensionOf(file.name)}`
        : `Вход ${orderName}, фото ${kept.length + index + 1}${extensionOf(file.name)}`,
  );

  if (uploaded.length > 0) {
    await client.mutation({
      updateOrder: {
        __args: {
          id: orderId,
          data:
            kind === 'finished'
              ? { finishedPhotos: [...kept, ...uploaded] }
              : { locationPhotos: [...kept, ...uploaded] },
        },
        id: true,
      },
    });
  }

  return files.length - uploaded.length;
};

export const roomForPhotos = (target: PhotoTarget, media: OrderMedia) =>
  target.kind === 'finished'
    ? MAX_FINISHED_PHOTOS -
      media.photos.filter((photo) => photo.tagKey === 'finished').length
    : target.kind === 'address'
      ? MAX_LOCATION_PHOTOS -
        media.photos.filter((photo) => photo.tagKey === 'address').length
      : MAX_ORDER_NOTE_PHOTOS;

// Returns how many photos did not upload or did not fit.
export const addPhotos = (
  orderId: string,
  orderName: string,
  target: PhotoTarget,
  files: File[],
): Promise<number> =>
  target.kind === 'finished' || target.kind === 'address'
    ? appendOrderPhotos(orderId, orderName, target.kind, files)
    : saveNote({
        orderId,
        orderItemId: target.kind === 'opening' ? target.orderItemId : null,
        text: '',
        files,
      });
