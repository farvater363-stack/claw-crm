import { type CoreApiClient } from 'twenty-client-sdk/core';

import { DISTRICT_OPTIONS } from 'src/constants/select-options';
import { EMPTY_LOCATION, type LocationDraft } from 'src/location/location';

// Цех reads this block too, so it asks for nothing hidden from that role.
export const ORDER_LOCATION_FIELDS = {
  locationLat: true,
  locationLng: true,
  locationNote: true,
  locationPhotos: { fileId: true, label: true, url: true },
  addressLine: true,
  district: true,
  floor: true,
} as const;

export type OrderLocation = LocationDraft & { addressText: string | null };

export const loadOrderLocation = async (
  client: CoreApiClient,
  orderId: string,
): Promise<OrderLocation> => {
  const { orders } = await client.query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: { node: ORDER_LOCATION_FIELDS },
    },
  });
  const order = orders?.edges[0]?.node;
  const addressParts = [
    DISTRICT_OPTIONS.find((option) => option.value === order?.district)?.label,
    order?.addressLine,
    typeof order?.floor === 'number' ? `${order.floor} эт.` : null,
  ].filter((part): part is string => typeof part === 'string' && part !== '');

  return {
    ...EMPTY_LOCATION,
    lat: typeof order?.locationLat === 'number' ? order.locationLat : null,
    lng: typeof order?.locationLng === 'number' ? order.locationLng : null,
    note: order?.locationNote ?? '',
    savedPhotos: (order?.locationPhotos ?? [])
      .filter(
        (photo): photo is { fileId: string; label: string; url: string } =>
          typeof photo?.fileId === 'string' && typeof photo.url === 'string',
      )
      .map(({ fileId, label, url }) => ({ fileId, label: label ?? '', url })),
    addressText: addressParts.length > 0 ? addressParts.join(', ') : null,
  };
};
