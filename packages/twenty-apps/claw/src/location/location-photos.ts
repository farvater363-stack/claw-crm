import {
  type LocationDraft,
  MAX_LOCATION_PHOTOS,
  type SavedLocationPhoto,
} from 'src/location/location';

type FilesFieldValue = { fileId: string; label: string };

// A FILES update replaces the whole list, so the kept photos are sent again.
export const toFilesFieldValue = (
  saved: SavedLocationPhoto[],
  uploaded: FilesFieldValue[],
): FilesFieldValue[] =>
  [...saved.map(({ fileId, label }) => ({ fileId, label })), ...uploaded].slice(
    0,
    MAX_LOCATION_PHOTOS,
  );

export const removeSavedPhoto = (
  draft: LocationDraft,
  fileId: string,
): LocationDraft => ({
  ...draft,
  savedPhotos: draft.savedPhotos.filter((photo) => photo.fileId !== fileId),
});

export const canAddPhotos = (draft: LocationDraft): number =>
  Math.max(
    0,
    MAX_LOCATION_PHOTOS - draft.savedPhotos.length - draft.newPhotos.length,
  );
