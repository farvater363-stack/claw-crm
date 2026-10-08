import { CoreApiClient } from 'twenty-client-sdk/core';
import { uploadFile } from 'twenty-sdk/front-component';

import {
  attachReceiptPhotos,
  createMoneyEntry,
  fetchReceiptPhotosFieldId,
} from 'src/money/load-money-books';
import { type NewMoneyEntry } from 'src/money/money-forms';

// The entry, then its receipt photos; a retry with the same id overwrites.
export const recordMoneyEntry = async (
  entryId: string,
  entry: NewMoneyEntry,
  photos: readonly File[],
): Promise<void> => {
  const client = new CoreApiClient();
  const images = photos.filter((file) => file.type.startsWith('image/'));

  await createMoneyEntry(client, entryId, entry);

  if (images.length === 0) return;

  const fieldMetadataId = await fetchReceiptPhotosFieldId();
  const uploaded: { fileId: string; label: string }[] = [];

  for (const image of images) {
    const result = await uploadFile(image, {
      fieldMetadataId,
      fileName: image.name,
    });

    if (result.status !== 'uploaded') throw new Error(result.reason);

    uploaded.push({ fileId: result.file.fileId, label: image.name });
  }

  await attachReceiptPhotos(client, entryId, uploaded);
};
