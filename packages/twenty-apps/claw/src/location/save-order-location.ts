import { CoreApiClient } from 'twenty-client-sdk/core';
import { uploadFile } from 'twenty-sdk/front-component';

import { IDS } from 'src/constants/universal-identifiers';
import { type LocationDraft } from 'src/location/location';
import { toFilesFieldValue } from 'src/location/location-photos';
import { fetchFieldMetadataId } from 'src/utils/fetch-field-metadata-id';

// Uploads the new photos first: a FILES update replaces the whole list, so
// the kept ones are sent again alongside them.
export const saveOrderLocation = async (
  orderId: string,
  draft: LocationDraft,
): Promise<void> => {
  const uploaded: { fileId: string; label: string }[] = [];

  if (draft.newPhotos.length > 0) {
    const fieldMetadataId = await fetchFieldMetadataId(
      IDS.order.object,
      IDS.order.locationPhotos,
    );

    if (fieldMetadataId === null) {
      throw new Error('поле «Фото входа / дома» не найдено');
    }

    for (const photo of draft.newPhotos) {
      const result = await uploadFile(photo.file, {
        fieldMetadataId,
        fileName: photo.file.name,
      });

      if (result.status === 'uploaded') {
        uploaded.push({ fileId: result.file.fileId, label: photo.file.name });
      }
    }
  }

  await new CoreApiClient().mutation({
    updateOrder: {
      __args: {
        id: orderId,
        data: {
          locationLat: draft.lat,
          locationLng: draft.lng,
          locationNote: draft.note.trim() === '' ? null : draft.note.trim(),
          locationPhotos: toFilesFieldValue(draft.savedPhotos, uploaded),
        },
      },
      id: true,
    },
  });
};
