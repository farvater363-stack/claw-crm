import { describe, expect, it } from 'vitest';

import { EMPTY_LOCATION } from 'src/location/location';
import { saveOrderLocation } from 'src/location/save-order-location';

const newPhoto = (name: string) => ({
  key: name,
  file: new File(['x'], name),
  thumbnailUrl: null,
});

describe('saveOrderLocation', () => {
  it('says how many photos did not upload and keeps the ones that did', async () => {
    const written: unknown[] = [];

    const failedCount = await saveOrderLocation(
      'order-1',
      {
        ...EMPTY_LOCATION,
        lat: 41.3,
        lng: 69.2,
        savedPhotos: [
          {
            fileId: 'kept',
            label: 'Подъезд',
            url: 'https://crm.example.test/1',
          },
        ],
        newPhotos: [newPhoto('ok.jpg'), newPhoto('broken.jpg')],
      },
      {
        fieldMetadataId: async () => 'field-1',
        upload: async (file) =>
          file.name === 'ok.jpg'
            ? { fileId: 'uploaded', label: file.name }
            : null,
        writeOrder: async (data) => {
          written.push(data);
        },
      },
    );

    expect(failedCount).toBe(1);
    expect(written).toEqual([
      expect.objectContaining({
        locationPhotos: [
          { fileId: 'kept', label: 'Подъезд' },
          { fileId: 'uploaded', label: 'ok.jpg' },
        ],
      }),
    ]);
  });
});
