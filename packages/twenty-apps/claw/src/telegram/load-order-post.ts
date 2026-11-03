import { type CoreApiClient } from 'twenty-client-sdk/core';

import { DISTRICT_OPTIONS } from 'src/constants/select-options';
import { describeAddress } from 'src/contract/contract-data';
import { MAX_LOCATION_PHOTOS } from 'src/location/location';
import {
  type SchemeOpening,
  schemeProductName,
  toSchemeOpenings,
  withSchemeVisors,
} from 'src/order-sketch/order-sketch';
import { fromCurrency } from 'src/recalc/money';
import { toNumber } from 'src/recalc/load-recalc-input';
import { type OrderCardInput } from 'src/telegram/order-card';
import { formatQuantity } from 'src/ui/format';
import { joinFullName } from 'src/utils/full-name';

const PAGE_SIZE = 200;
const MONEY = { amountMicros: true } as const;
const CENTIMETERS_PER_METER = 100;

export type OrderScheme = {
  fileName: string;
  title: string;
  subtitle: string;
  openings: SchemeOpening[];
};

export type LoadedOrderPost = {
  card: OrderCardInput;
  photoUrls: { fileName: string; url: string }[];
  point: { lat: number; lng: number } | null;
  // Null for an order with no проёмы yet
  scheme: OrderScheme | null;
};

type ServiceLine = {
  name: string | null;
  quantity: unknown;
  orderItemId: string | null;
  extraService: { name: string | null; unit: string | null } | null;
};

const serviceName = (line: ServiceLine): string =>
  line.extraService?.name ?? line.name ?? 'Услуга';

// The quantity in the unit the service is priced by; a fixed one has none.
export const describeService = (line: ServiceLine): string => {
  const quantity = toNumber(line.quantity);
  const name = serviceName(line);

  if (quantity === null) return name;

  switch (line.extraService?.unit) {
    case 'PER_SQUARE_METER':
      return `${name} ${formatQuantity(quantity, 'м²')}`;
    case 'PER_RUNNING_METER':
      return `${name} ${formatQuantity(quantity, 'п.м.')}`;
    case 'PER_PIECE':
      return quantity === 1
        ? name
        : `${name} × ${formatQuantity(quantity, 'шт')}`;
    default:
      return name;
  }
};

// A visor stores running metres for all pieces; the measurer gave one length.
const describeVisor = (line: ServiceLine, pieces: number): string => {
  const metres = toNumber(line.quantity);

  return metres === null
    ? serviceName(line)
    : `${serviceName(line)}, ${Math.round((metres / pieces) * CENTIMETERS_PER_METER)} см`;
};

export const loadOrderPost = async (
  client: CoreApiClient,
  orderId: string,
  workspaceUrl: string,
): Promise<LoadedOrderPost> => {
  const { orders, orderItems, orderExtraServices } = await client.query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: {
        node: {
          name: true,
          installationDeadline: true,
          urgency: true,
          clientFullName: { firstName: true, lastName: true },
          clientPhone: true,
          district: true,
          addressLine: true,
          floor: true,
          locationLat: true,
          locationLng: true,
          locationNote: true,
          locationPhotos: { fileId: true, label: true, url: true },
          installer: { name: true },
          paintColor: true,
          comment: true,
          total: MONEY,
          paid: MONEY,
          balance: MONEY,
        },
      },
    },
    orderItems: {
      __args: {
        filter: { orderId: { eq: orderId } },
        first: PAGE_SIZE,
        orderBy: [{ createdAt: 'AscNullsLast' }],
      },
      edges: {
        node: {
          id: true,
          product: true,
          shape: true,
          widthCm: true,
          heightCm: true,
          projectionCm: true,
          projectionKind: true,
          projectionSide: true,
          quantity: true,
          openingNumber: true,
          notes: true,
          design: { name: true },
        },
      },
    },
    orderExtraServices: {
      __args: {
        filter: { orderId: { eq: orderId } },
        first: PAGE_SIZE,
        orderBy: [{ createdAt: 'AscNullsLast' }],
      },
      edges: {
        node: {
          id: true,
          name: true,
          quantity: true,
          orderItemId: true,
          openingNumber: true,
          extraService: { name: true, unit: true },
        },
      },
    },
  });
  const order = orders?.edges[0]?.node;

  if (order === undefined) throw new Error(`order ${orderId} not found`);

  const photos = (order.locationPhotos ?? []).filter(
    (photo): photo is { fileId: string; label: string; url: string } =>
      typeof photo?.url === 'string' && photo.url !== '',
  );
  const point =
    typeof order.locationLat === 'number' &&
    typeof order.locationLng === 'number'
      ? { lat: order.locationLat, lng: order.locationLng }
      : null;
  const items = (orderItems?.edges ?? []).map(({ node }) => node);
  const serviceLines: ServiceLine[] = (orderExtraServices?.edges ?? []).map(
    ({ node }) => ({
      name: node.name ?? null,
      quantity: node.quantity,
      orderItemId: node.orderItemId ?? null,
      extraService:
        node.extraService === null || node.extraService === undefined
          ? null
          : {
              name: node.extraService.name ?? null,
              unit: node.extraService.unit ?? null,
            },
    }),
  );
  const openings = toSchemeOpenings(
    items.map((item) => ({
      id: item.id,
      product: item.product ?? null,
      shape: item.shape ?? null,
      widthCm: item.widthCm,
      heightCm: item.heightCm,
      projectionCm: item.projectionCm,
      projectionKind: item.projectionKind ?? null,
      projectionSide: item.projectionSide ?? null,
      quantity: item.quantity,
      designName: item.design?.name ?? null,
      notes: item.notes ?? null,
      openingNumber: item.openingNumber ?? null,
    })),
  );
  const isOnOpening = (line: ServiceLine) =>
    line.orderItemId !== null &&
    items.some((item) => item.id === line.orderItemId);
  const schemeOpenings = withSchemeVisors(
    openings,
    (orderExtraServices?.edges ?? []).flatMap(({ node }) =>
      node.orderItemId || typeof node.openingNumber === 'number'
        ? [
            {
              id: node.id,
              name: node.extraService?.name ?? node.name ?? null,
              quantity: node.quantity,
              orderItemId: node.orderItemId ?? null,
              openingNumber: node.openingNumber ?? null,
            },
          ]
        : [],
    ),
  );
  const total = fromCurrency(order.total);
  const paid = fromCurrency(order.paid) ?? 0;
  const clientName = joinFullName(order.clientFullName);
  const orderName = order.name ?? '';

  return {
    card: {
      name: orderName,
      installationDeadline: order.installationDeadline ?? null,
      isUrgent: order.urgency === 'URGENT',
      clientFullName: clientName,
      clientPhone: order.clientPhone ?? null,
      districtLabel:
        DISTRICT_OPTIONS.find((option) => option.value === order.district)
          ?.label ?? null,
      addressLine: order.addressLine ?? null,
      floor: typeof order.floor === 'number' ? order.floor : null,
      locationNote: order.locationNote ?? null,
      installerName: order.installer?.name ?? null,
      paintColor: order.paintColor ?? null,
      openings: openings.map((opening) => {
        const visors = serviceLines.filter(
          (line) => line.orderItemId === opening.id,
        );

        return {
          title: opening.title,
          quantity: opening.quantity,
          product: schemeProductName(opening),
          sizeText:
            opening.sketch === null
              ? null
              : [
                  [opening.sketch.sizeText, opening.sketch.sideText]
                    .filter(Boolean)
                    .join(', '),
                  opening.sketch.unitsText,
                ].join(' · '),
          visorText:
            visors.length === 0
              ? null
              : visors
                  .map((visor) => describeVisor(visor, opening.quantity))
                  .join('; '),
          notes: opening.notes,
        };
      }),
      services: serviceLines
        .filter((line) => !isOnOpening(line))
        .map(describeService),
      comment: order.comment ?? null,
      money:
        total === null
          ? null
          : {
              total,
              paid,
              balance: fromCurrency(order.balance) ?? Math.max(0, total - paid),
            },
      hasPoint: point !== null,
      extraPhotoCount: Math.max(0, photos.length - MAX_LOCATION_PHOTOS),
      orderUrl: `${workspaceUrl}/object/order/${orderId}`,
    },
    photoUrls: photos.slice(0, MAX_LOCATION_PHOTOS).map((photo) => ({
      fileName: photo.label || 'photo.jpg',
      url: photo.url,
    })),
    point,
    scheme:
      schemeOpenings.length === 0
        ? null
        : {
            fileName: `Схема ${orderName}.pdf`.replace(/\s+/g, ' '),
            title: `Схема ${orderName}`.trim(),
            subtitle: [
              clientName,
              describeAddress({
                district: order.district ?? null,
                addressLine: order.addressLine ?? null,
                floor: typeof order.floor === 'number' ? order.floor : null,
              }),
            ]
              .filter((part) => part !== null && part !== '')
              .join(' · '),
            openings: schemeOpenings,
          },
  };
};
