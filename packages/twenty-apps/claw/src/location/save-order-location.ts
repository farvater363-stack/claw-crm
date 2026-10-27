import { CoreApiClient } from 'twenty-client-sdk/core';
import { uploadFile } from 'twenty-sdk/front-component';

import { IDS } from 'src/constants/universal-identifiers';
import { type LocationDraft } from 'src/location/location';
import { toFilesFieldValue } from 'src/location/location-photos';
import { fetchFieldMetadataId } from 'src/utils/fetch-field-metadata-id';

type UploadedPhoto = { fileId: string; label: string };

type LocationData = {
  locationLat: number | null;
  locationLng: number | null;
  locationNote: string | null;
  locationPhotos: UploadedPhoto[];
};

type SaveDependencies = {
  fieldMetadataId: () => Promise<string | null>;
  upload: (
    file: File,
    fieldMetadataId: string,
  ) => Promise<UploadedPhoto | null>;
  writeOrder: (data: LocationData) => Promise<void>;
};

const liveDependencies = (orderId: string): SaveDependencies => ({
  fieldMetadataId: () =>
    fetchFieldMetadataId(IDS.order.object, IDS.order.locationPhotos),
  upload: async (file, fieldMetadataId) => {
    const result = await uploadFile(file, {
      fieldMetadataId,
      fileName: file.name,
    });

    return result.status === 'uploaded'
      ? { fileId: result.file.fileId, label: file.name }
      : null;
  },
  writeOrder: async (data) => {
    await new CoreApiClient().mutation({
      updateOrder: { __args: { id: orderId, data }, id: true },
    });
  },
});

// Uploads the new photos first: a FILES update replaces the whole list, so
// the kept ones are sent again alongside them. Returns how many photos did
// not upload, so the caller can say so instead of losing them quietly.
export const saveOrderLocation = async (
  orderId: string,
  draft: LocationDraft,
  dependencies: SaveDependencies = liveDependencies(orderId),
): Promise<number> => {
  const uploaded: UploadedPhoto[] = [];

  if (draft.newPhotos.length > 0) {
    const fieldMetadataId = await dependencies.fieldMetadataId();

    if (fieldMetadataId === null) {
      throw new Error('поле «Фото входа / дома» не найдено');
    }

    for (const photo of draft.newPhotos) {
      const result = await dependencies
        .upload(photo.file, fieldMetadataId)
        .catch(() => null);

      if (result !== null) uploaded.push(result);
    }
  }

  await dependencies.writeOrder({
    locationLat: draft.lat,
    locationLng: draft.lng,
    locationNote: draft.note.trim() === '' ? null : draft.note.trim(),
    locationPhotos: toFilesFieldValue(draft.savedPhotos, uploaded),
  });

  return draft.newPhotos.length - uploaded.length;
};
