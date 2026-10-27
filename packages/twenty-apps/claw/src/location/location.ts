import { type OpeningPhoto } from 'src/measurer-form/measurer-form';

// Telegram puts at most 10 photos in one album.
export const MAX_LOCATION_PHOTOS = 10;

export const TASHKENT_CENTER = { lat: 41.3111, lng: 69.2797 };

export type SavedLocationPhoto = { fileId: string; label: string; url: string };

export type LocationDraft = {
  lat: number | null;
  lng: number | null;
  note: string;
  savedPhotos: SavedLocationPhoto[];
  newPhotos: OpeningPhoto[];
};

export const EMPTY_LOCATION: LocationDraft = {
  lat: null,
  lng: null,
  note: '',
  savedPhotos: [],
  newPhotos: [],
};

export const hasPoint = ({
  lat,
  lng,
}: Pick<LocationDraft, 'lat' | 'lng'>): boolean => lat !== null && lng !== null;

export type MapCenter = { lat: number; lng: number };

// A saved point wins over the device: whoever fixes a point from the заказ
// page is usually in the workshop, not at the address.
export const pickMapCenter = (
  draft: Pick<LocationDraft, 'lat' | 'lng'>,
  devicePosition: MapCenter | null,
): MapCenter => {
  if (draft.lat !== null && draft.lng !== null) {
    return { lat: draft.lat, lng: draft.lng };
  }

  return devicePosition ?? TASHKENT_CENTER;
};
