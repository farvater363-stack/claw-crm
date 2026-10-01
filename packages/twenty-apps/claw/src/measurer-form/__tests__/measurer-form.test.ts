import { describe, expect, it } from 'vitest';

import {
  buildMeasurementPayload,
  buildOpeningPhotoLabel,
  computeDraftTotal,
  computeOpeningAreaSquareMeters,
  computeOpeningQuote,
  computeOpeningsTotalAreaSquareMeters,
  computeVisorTotal,
  createEmptyOpening,
  describePhotoUploadFailure,
  formatUzbekNationalPhone,
  type MeasurementDraft,
  type OpeningDraft,
  takePhotosWithinLimit,
} from 'src/measurer-form/measurer-form';

const opening = (overrides: Partial<OpeningDraft>): OpeningDraft => ({
  ...createEmptyOpening('opening'),
  ...overrides,
});

const draft = (overrides: Partial<MeasurementDraft>): MeasurementDraft => ({
  clientName: 'Азиз',
  clientPhone: '90 123 45 67',
  district: 'CHILANZAR',
  addressLine: 'ул. Катартал, 5',
  floor: '3',
  source: 'OLX',
  measurementDate: '2026-09-30T10:15',
  comment: '',
  openings: [
    opening({
      widthCm: '140',
      heightCm: '150',
      projectionCm: '30',
      quantity: '2',
    }),
  ],
  visorServiceId: '',
  visorLengthMeters: '',
  ...overrides,
});

describe('formatUzbekNationalPhone', () => {
  it.each([
    ['901234567', '90 123 45 67'],
    ['90 123 45 67', '90 123 45 67'],
    ['+998901234567', '90 123 45 67'],
    ['90123', '90123'],
    ['', ''],
  ])('formats %j as %j', (raw, expected) => {
    expect(formatUzbekNationalPhone(raw)).toBe(expected);
  });
});

describe('opening area', () => {
  it('reuses the grille formula: 140×150×30 is 3.84 m²', () => {
    expect(
      computeOpeningAreaSquareMeters(
        opening({ widthCm: '140', heightCm: '150', projectionCm: '30' }),
      ),
    ).toBe(3.84);
  });

  it('has no area until width and height are positive', () => {
    expect(
      computeOpeningAreaSquareMeters(opening({ widthCm: '140' })),
    ).toBeNull();
  });

  it('sums area × quantity over the openings', () => {
    expect(
      computeOpeningsTotalAreaSquareMeters([
        opening({
          widthCm: '140',
          heightCm: '150',
          projectionCm: '30',
          quantity: '2',
        }),
        opening({
          widthCm: '100',
          heightCm: '100',
          projectionCm: '0',
          quantity: '1',
        }),
        opening({ widthCm: '' }),
      ]),
    ).toBe(8.68);
  });
});

describe('buildMeasurementPayload', () => {
  it('builds a MEASURED order for the measurer and one item per opening', () => {
    const result = buildMeasurementPayload(
      draft({
        openings: [
          opening({
            designId: 'design-1',
            metal: 'ROD',
            metalSize: 'SIZE_10',
            widthCm: '140',
            heightCm: '150,5',
            projectionCm: '30',
            quantity: '2',
            notes: ' угловое ',
          }),
        ],
      }),
      'member-1',
    );

    expect(result).toEqual({
      isValid: true,
      order: {
        status: 'MEASURED',
        measurerId: 'member-1',
        clientName: 'Азиз',
        clientPhone: '+998901234567',
        district: 'CHILANZAR',
        addressLine: 'ул. Катартал, 5',
        floor: 3,
        source: 'OLX',
        measurementDate: new Date('2026-09-30T10:15').toISOString(),
        comment: null,
      },
      items: [
        {
          designId: 'design-1',
          metal: 'ROD',
          metalSize: 'SIZE_10',
          widthCm: 140,
          heightCm: 150.5,
          projectionCm: 30,
          quantity: 2,
          notes: 'угловое',
        },
      ],
      visor: null,
    });
  });

  it('rejects an incomplete phone', () => {
    const result = buildMeasurementPayload(
      draft({ clientPhone: '90 123' }),
      'member-1',
    );

    expect(result).toEqual({
      isValid: false,
      errors: ['Укажите телефон клиента полностью: +998 XX XXX XX XX'],
    });
  });

  it('names every opening without width and height', () => {
    const result = buildMeasurementPayload(
      draft({
        openings: [
          opening({ widthCm: '140', heightCm: '150' }),
          opening({ widthCm: '0', heightCm: '150' }),
        ],
      }),
      'member-1',
    );

    expect(result).toEqual({
      isValid: false,
      errors: ['Проём 2: укажите ширину и высоту больше 0'],
    });
  });

  it('requires at least one opening and a whole quantity', () => {
    expect(
      buildMeasurementPayload(draft({ openings: [] }), 'member-1'),
    ).toEqual({ isValid: false, errors: ['Добавьте проём или козырёк'] });

    expect(
      buildMeasurementPayload(
        draft({
          openings: [
            opening({ widthCm: '140', heightCm: '150', quantity: '1.5' }),
          ],
        }),
        'member-1',
      ),
    ).toEqual({
      isValid: false,
      errors: ['Проём 1: количество должно быть целым числом от 1'],
    });
  });
});

describe('price quote', () => {
  const priceList = [
    {
      designId: 'design-1',
      metal: 'ROD',
      metalSize: 'SIZE_10',
      pricePerSquareMeter: 260_000,
    },
    {
      designId: null,
      metal: 'PROFILE',
      metalSize: null,
      pricePerSquareMeter: 180_000,
    },
  ];

  it('prices an opening from the most specific price list row', () => {
    expect(
      computeOpeningQuote(
        opening({
          designId: 'design-1',
          metal: 'ROD',
          metalSize: 'SIZE_10',
          widthCm: '140',
          heightCm: '150',
          projectionCm: '30',
          quantity: '2',
        }),
        priceList,
      ),
    ).toEqual({ pricePerSquareMeter: 260_000, lineTotal: 1_996_800 });
  });

  it('returns null without dimensions or without a matching row', () => {
    expect(
      computeOpeningQuote(
        opening({ metal: 'ROD', metalSize: 'SIZE_10' }),
        priceList,
      ),
    ).toBeNull();
    expect(
      computeOpeningQuote(
        opening({ metal: 'REBAR', widthCm: '100', heightCm: '100' }),
        priceList,
      ),
    ).toBeNull();
  });

  it('totals only when every opening has a price', () => {
    const priced = opening({
      metal: 'PROFILE',
      widthCm: '100',
      heightCm: '100',
    });

    expect(computeDraftTotal([priced, priced], priceList)).toBe(360_000);
    expect(
      computeDraftTotal(
        [priced, opening({ metal: 'REBAR', widthCm: '100', heightCm: '100' })],
        priceList,
      ),
    ).toBeNull();
  });
});

describe('takePhotosWithinLimit', () => {
  it('appends picked photos up to five per opening', () => {
    expect(takePhotosWithinLimit(['a', 'b'], ['c', 'd'])).toEqual({
      photos: ['a', 'b', 'c', 'd'],
      skippedCount: 0,
    });
  });

  it('keeps the first picks and counts the overflow', () => {
    expect(
      takePhotosWithinLimit(['a', 'b', 'c'], ['d', 'e', 'f', 'g']),
    ).toEqual({ photos: ['a', 'b', 'c', 'd', 'e'], skippedCount: 2 });
    expect(takePhotosWithinLimit(['a', 'b', 'c', 'd', 'e'], ['f'])).toEqual({
      photos: ['a', 'b', 'c', 'd', 'e'],
      skippedCount: 1,
    });
  });
});

describe('describePhotoUploadFailure', () => {
  it('names the openings whose photos did not upload', () => {
    expect(describePhotoUploadFailure([2])).toBe(
      'Заказ сохранён, но не все фото загрузились: проём № 2. Добавьте их кнопкой «Добавить фото».',
    );
    expect(describePhotoUploadFailure([1, 3])).toBe(
      'Заказ сохранён, но не все фото загрузились: проёмы № 1, 3. Добавьте их кнопкой «Добавить фото».',
    );
  });
});

describe('opening photos in the payload', () => {
  it('leaves photos out of the order item payload', () => {
    const photo = {
      key: 'photo-1',
      file: new File(['jpg'], 'door.jpg', { type: 'image/jpeg' }),
      thumbnailUrl: null,
    };
    const result = buildMeasurementPayload(
      draft({
        openings: [
          opening({ widthCm: '100', heightCm: '200', photos: [photo] }),
        ],
      }),
      'member-1',
    );

    expect(result.isValid && result.items[0]).not.toHaveProperty('photos');
  });
});

describe('buildOpeningPhotoLabel', () => {
  it('names the photo after its opening and keeps the extension', () => {
    expect(buildOpeningPhotoLabel(2, 3, 'image.JPG')).toBe(
      'Проём 2, фото 3.jpg',
    );
    expect(buildOpeningPhotoLabel(1, 1, 'scan')).toBe('Проём 1, фото 1');
  });
});

describe('visor', () => {
  it('adds the visor as an extra service line, length in metres', () => {
    const result = buildMeasurementPayload(
      draft({ visorServiceId: 'visor-1', visorLengthMeters: '2,5' }),
      'member-1',
    );

    expect(result.isValid && result.visor).toEqual({
      extraServiceId: 'visor-1',
      quantity: 2.5,
    });
  });

  it('allows a visor-only order', () => {
    const result = buildMeasurementPayload(
      draft({
        openings: [],
        visorServiceId: 'visor-1',
        visorLengthMeters: '3',
      }),
      'member-1',
    );

    expect(result.isValid && result.items).toEqual([]);
  });

  it('requires a positive length once a visor is chosen', () => {
    expect(
      buildMeasurementPayload(
        draft({ visorServiceId: 'visor-1', visorLengthMeters: '' }),
        'member-1',
      ),
    ).toEqual({
      isValid: false,
      errors: ['Козырёк: укажите длину в метрах больше 0'],
    });
  });

  it('prices the visor per running metre', () => {
    const options = [
      { id: 'visor-1', name: 'Козырёк пластик 50', price: 180_000 },
      { id: 'visor-2', name: 'Козырёк туника 50', price: null },
    ];

    expect(
      computeVisorTotal(
        { visorServiceId: 'visor-1', visorLengthMeters: '2,5' },
        options,
      ),
    ).toBe(450_000);
    expect(
      computeVisorTotal(
        { visorServiceId: 'visor-2', visorLengthMeters: '2' },
        options,
      ),
    ).toBeNull();
  });
});
