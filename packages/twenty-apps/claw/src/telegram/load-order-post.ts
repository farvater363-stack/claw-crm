import { type CoreApiClient } from 'twenty-client-sdk/core';

import { DISTRICT_OPTIONS } from 'src/constants/select-options';
import { MAX_LOCATION_PHOTOS } from 'src/location/location';
import { type OrderCardInput } from 'src/telegram/order-card';
import { joinFullName } from 'src/utils/full-name';

export type LoadedOrderPost = {
  card: OrderCardInput;
  photoUrls: { fileName: string; url: string }[];
  point: { lat: number; lng: number } | null;
};

export const loadOrderPost = async (
  client: CoreApiClient,
  orderId: string,
  workspaceUrl: string,
): Promise<LoadedOrderPost> => {
  const { orders } = await client.query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: {
        node: {
          name: true,
          installationDeadline: true,
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

  return {
    card: {
      name: order.name ?? '',
      installationDeadline: order.installationDeadline ?? null,
      clientFullName: joinFullName(order.clientFullName),
      clientPhone: order.clientPhone ?? null,
      districtLabel:
        DISTRICT_OPTIONS.find((option) => option.value === order.district)
          ?.label ?? null,
      addressLine: order.addressLine ?? null,
      floor: typeof order.floor === 'number' ? order.floor : null,
      locationNote: order.locationNote ?? null,
      installerName: order.installer?.name ?? null,
      hasPoint: point !== null,
      extraPhotoCount: Math.max(0, photos.length - MAX_LOCATION_PHOTOS),
      orderUrl: `${workspaceUrl}/object/order/${orderId}`,
    },
    photoUrls: photos.slice(0, MAX_LOCATION_PHOTOS).map((photo) => ({
      fileName: photo.label || 'photo.jpg',
      url: photo.url,
    })),
    point,
  };
};
