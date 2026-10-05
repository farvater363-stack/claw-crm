import { type CoreApiClient } from 'twenty-client-sdk/core';

import { WORKSHOP_STATUSES } from 'src/constants/order-status-sets';
import {
  DISTRICT_OPTIONS,
  materialUnitLabel,
  METAL_OPTIONS,
  type OrderStatus,
  PRODUCTION_STAGE_OPTIONS,
  type ProductionStage,
} from 'src/constants/select-options';
import { nextStepOf, STEP_STATUS } from 'src/order-header/order-steps';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import {
  type WorkshopItem,
  type WorkshopMaterial,
  type WorkshopOrder,
  type WorkshopService,
} from 'src/workshop/workshop-board';

// Twenty caps a page at 200 records.
const PAGE_SIZE = 200;

// The step the order card offers for an order in production, so the wall and
// the card cannot send an order to two different places.
const READY_STATUS =
  nextStepOf({
    status: STEP_STATUS.production,
    hasMaster: true,
    hasInstaller: true,
  })?.nextStatus ?? null;

const PHOTO = { url: true } as const;

type Photo = { url?: string | null } | null | undefined;

const urlsOf = (photos: Photo[] | null | undefined): string[] =>
  (photos ?? []).flatMap((photo) =>
    typeof photo?.url === 'string' && photo.url !== '' ? [photo.url] : [],
  );

const labelOf = (
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
): string | null =>
  options.find((option) => option.value === value)?.label ?? null;

const stageOf = (value: string | null | undefined): ProductionStage | null =>
  PRODUCTION_STAGE_OPTIONS.find((option) => option.value === value)?.value ??
  null;

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';

  return trimmed === '' ? null : trimmed;
};

// Only what the workshop role reads: no money, no phone, no cost, and the
// line's own name in place of the service it points at.
export const loadWorkshopOrders = async (
  client: CoreApiClient,
): Promise<WorkshopOrder[]> => {
  const orderNodes = await fetchAllPages(async (after) => {
    const { orders } = await client.query({
      orders: {
        __args: {
          first: PAGE_SIZE,
          after,
          filter: { status: { in: [...WORKSHOP_STATUSES] } },
        },
        edges: {
          node: {
            id: true,
            name: true,
            status: true,
            productionStage: true,
            urgency: true,
            masterId: true,
            clientName: true,
            district: true,
            addressLine: true,
            floor: true,
            comment: true,
            paintColor: true,
            productionStartDate: true,
            installationDeadline: true,
            areaSquareMeters: true,
            finishedPhotos: PHOTO,
            master: { name: true },
            installer: { name: true },
          },
        },
        pageInfo: PAGE_INFO,
      },
    });

    return orders;
  });

  if (orderNodes.length === 0) return [];

  // One filter over every shown order: a workshop holds tens of orders, not
  // thousands. Split the ids into batches if that ever changes.
  const ofShownOrders = { orderId: { in: orderNodes.map((node) => node.id) } };
  const [itemNodes, serviceNodes, materialNodes] = await Promise.all([
    fetchAllPages(async (after) => {
      const { orderItems } = await client.query({
        orderItems: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: ofShownOrders,
            orderBy: [{ createdAt: 'AscNullsLast' }],
          },
          edges: {
            node: {
              id: true,
              orderId: true,
              name: true,
              quantity: true,
              areaSquareMeters: true,
              notes: true,
              photos: PHOTO,
              design: { name: true, metal: true, photos: PHOTO },
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return orderItems;
    }),
    fetchAllPages(async (after) => {
      const { orderExtraServices } = await client.query({
        orderExtraServices: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: ofShownOrders,
            orderBy: [{ createdAt: 'AscNullsLast' }],
          },
          edges: {
            node: { id: true, orderId: true, name: true, quantity: true },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return orderExtraServices;
    }),
    fetchAllPages(async (after) => {
      const { orderMaterials } = await client.query({
        orderMaterials: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: ofShownOrders,
            orderBy: [{ name: 'AscNullsLast' }],
          },
          edges: {
            node: {
              id: true,
              orderId: true,
              name: true,
              plannedQuantity: true,
              material: { name: true, unit: true, onHand: true },
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return orderMaterials;
    }),
  ]);

  const itemsOf = (orderId: string): WorkshopItem[] =>
    itemNodes
      .filter((item) => item.orderId === orderId)
      .map((item) => ({
        id: item.id,
        designName: textOrNull(item.design?.name),
        metalLabel: labelOf(METAL_OPTIONS, item.design?.metal),
        size: item.name ?? '',
        quantity: item.quantity ?? 1,
        areaSquareMeters: item.areaSquareMeters ?? null,
        notes: textOrNull(item.notes),
        designPhotoUrl: urlsOf(item.design?.photos)[0] ?? null,
        openingPhotoUrls: urlsOf(item.photos),
      }));

  const servicesOf = (orderId: string): WorkshopService[] =>
    serviceNodes
      .filter((line) => line.orderId === orderId)
      .flatMap((line) => {
        const name = textOrNull(line.name);

        return name === null
          ? []
          : [{ id: line.id, name, quantity: line.quantity ?? 1 }];
      });

  const materialsOf = (orderId: string): WorkshopMaterial[] =>
    materialNodes
      .filter((line) => line.orderId === orderId)
      .map((line) => ({
        id: line.id,
        name: line.material?.name ?? line.name ?? '',
        plannedQuantity: line.plannedQuantity ?? null,
        unitLabel: materialUnitLabel(line.material?.unit),
        isShort: (line.material?.onHand ?? 0) < 0,
      }));

  return orderNodes.map((node) => ({
    id: node.id,
    name: node.name ?? '',
    status: node.status ?? null,
    stage: stageOf(node.productionStage),
    isUrgent: node.urgency === 'URGENT',
    masterId: node.masterId ?? null,
    masterName: node.master?.name ?? null,
    installerName: node.installer?.name ?? null,
    clientName: textOrNull(node.clientName),
    districtLabel: labelOf(DISTRICT_OPTIONS, node.district),
    addressLine: textOrNull(node.addressLine),
    floor: node.floor ?? null,
    comment: textOrNull(node.comment),
    paintColor: textOrNull(node.paintColor),
    startDate: node.productionStartDate ?? null,
    deadline: node.installationDeadline ?? null,
    areaSquareMeters: node.areaSquareMeters ?? null,
    items: itemsOf(node.id),
    services: servicesOf(node.id),
    materials: materialsOf(node.id),
    finishedPhotoUrls: urlsOf(node.finishedPhotos),
  }));
};

// The workshop role may write the status, the stage and the finished photos,
// so nothing else is sent. The wall is up to a minute old: every update is
// filtered on the order still being in production, so one a manager has
// already moved on or cancelled is left where it is.
const updateInProduction = async (
  client: CoreApiClient,
  orderId: string,
  data:
    | { status: OrderStatus }
    | { productionStage: ProductionStage | null }
    | { finishedPhotos: FinishedPhoto[] },
): Promise<'saved' | 'moved'> => {
  const { updateOrders } = await client.mutation({
    updateOrders: {
      __args: {
        filter: {
          id: { eq: orderId },
          status: { eq: STEP_STATUS.production },
        },
        data,
      },
      id: true,
    },
  });

  return (updateOrders ?? []).length > 0 ? 'saved' : 'moved';
};

export const markReady = async (
  client: CoreApiClient,
  orderId: string,
): Promise<'saved' | 'moved'> => {
  if (READY_STATUS === null) {
    throw new Error('An order in production has no next step');
  }

  return updateInProduction(client, orderId, { status: READY_STATUS });
};

export const setStage = (
  client: CoreApiClient,
  orderId: string,
  stage: ProductionStage | null,
): Promise<'saved' | 'moved'> =>
  updateInProduction(client, orderId, { productionStage: stage });

export type FinishedPhoto = { fileId: string; label: string };

// The field is written as a whole list, so the photos already on the order
// are read just before the write: one a manager added since the last reload
// is kept.
export const addFinishedPhotos = async (
  client: CoreApiClient,
  orderId: string,
  photos: FinishedPhoto[],
): Promise<'saved' | 'moved'> => {
  const { orders } = await client.query({
    orders: {
      __args: {
        first: 1,
        filter: {
          id: { eq: orderId },
          status: { eq: STEP_STATUS.production },
        },
      },
      edges: { node: { finishedPhotos: { fileId: true, label: true } } },
    },
  });
  const order = orders?.edges[0]?.node;

  if (order === undefined) return 'moved';

  const kept = (order.finishedPhotos ?? []).flatMap((photo) =>
    typeof photo?.fileId === 'string'
      ? [{ fileId: photo.fileId, label: photo.label ?? '' }]
      : [],
  );

  return updateInProduction(client, orderId, {
    finishedPhotos: [...kept, ...photos],
  });
};

export const buildFinishedPhotoLabel = (
  orderName: string,
  photoNumber: number,
  fileName: string,
): string => {
  const extension = /\.[a-z0-9]+$/i.exec(fileName)?.[0].toLowerCase() ?? '';

  return `Готово ${orderName}, фото ${photoNumber}${extension}`;
};
