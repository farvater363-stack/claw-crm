import { describe, expect, it } from 'vitest';

import { EMPTY_LOCATION, type LocationDraft } from 'src/location/location';
import {
  canAddPhotos,
  removeSavedPhoto,
  toFilesFieldValue,
} from 'src/location/location-photos';

const saved = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    fileId: `saved-${index + 1}`,
    label: `Вход ${index + 1}`,
    url: `https://example.test/${index + 1}.jpg`,
  }));

const newPhoto = (key: string) => ({
  key,
  file: new File(['x'], `${key}.jpg`),
  thumbnailUrl: null,
});

describe('location photos', () => {
  it('keeps the saved photos first and adds the new ones after them', () => {
    expect(
      toFilesFieldValue(saved(2), [{ fileId: 'new-1', label: 'Ворота' }]),
    ).toEqual([
      { fileId: 'saved-1', label: 'Вход 1' },
      { fileId: 'saved-2', label: 'Вход 2' },
      { fileId: 'new-1', label: 'Ворота' },
    ]);
  });

  it('never keeps more than ten photos', () => {
    const uploaded = ['a', 'b', 'c'].map((key) => ({
      fileId: key,
      label: key,
    }));

    expect(toFilesFieldValue(saved(9), uploaded)).toHaveLength(10);
  });

  it('removes only the photo that was taken off', () => {
    const draft: LocationDraft = { ...EMPTY_LOCATION, savedPhotos: saved(3) };

    expect(
      removeSavedPhoto(draft, 'saved-2').savedPhotos.map(
        (photo) => photo.fileId,
      ),
    ).toEqual(['saved-1', 'saved-3']);
  });

  it('counts how many more photos fit', () => {
    const draft: LocationDraft = {
      ...EMPTY_LOCATION,
      savedPhotos: saved(8),
      newPhotos: [newPhoto('one')],
    };

    expect(canAddPhotos(draft)).toBe(1);
  });
});
