import { describe, expect, it } from 'vitest';

import {
  buildMeasurementPayload,
  buildOpeningPhotoLabel,
  computeDraftTotal,
  computeOpeningAreaSquareMeters,
  computeOpeningQuote,
  computeOpeningsTotalAreaSquareMeters,
  computePaymentPreview,
  computeOpeningVisorTotal,
  createEmptyOpening,
  describePhotoUploadFailure,
  draftFromScheduledOrder,
  EMPTY_PAYMENT_DRAFT,
  formatUzbekNationalPhone,
  type MeasurementContext,
  type MeasurementDraft,
  NEW_CLIENT_TARGET,
  type OpeningDraft,
  type PaymentDraft,
  resolveTargetOrderId,
  type ScheduledOrder,
  scheduledOrderLabel,
  sortScheduledOrders,
  takePhotosWithinLimit,
  toDateTimeLocalInputValue,
  toOrderUpdateData,
} from 'src/measurer-form/measurer-form';

const opening = (overrides: Partial<OpeningDraft>): OpeningDraft => ({
  ...createEmptyOpening('opening', 'opening-visor'),
  ...overrides,
});

const context = (
  overrides: Partial<MeasurementContext> = {},
): MeasurementContext => ({
  orderId: null,
  payment: EMPTY_PAYMENT_DRAFT,
  subtotal: null,
  today: '2026-10-05',
  ...overrides,
});

const payment = (overrides: Partial<PaymentDraft> = {}): PaymentDraft => ({
  ...EMPTY_PAYMENT_DRAFT,
  ...overrides,
});

const scheduled = (
  overrides: Partial<ScheduledOrder> = {},
): ScheduledOrder => ({
  id: 'order-1',
  name: '№1042',
  clientName: 'Клиент 2',
  clientPhone: '+998901234567',
  district: 'CHILANZAR',
  addressLine: 'ул. Катартал, 5',
  floor: 3,
  measurementDate: '2026-10-05T09:00:00.000Z',
  comment: 'Домофон не работает, звонить',
  source: 'INSTAGRAM',
  ...overrides,
});

const draft = (overrides: Partial<MeasurementDraft>): MeasurementDraft => ({
  clientName: 'Клиент 1',
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
      projectionKind: 'BOTTOM_AND_TOP',
      projectionCm: '30',
      quantity: '2',
    }),
  ],
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
        opening({
          widthCm: '140',
          heightCm: '150',
          projectionKind: 'BOTTOM_AND_TOP',
          projectionCm: '30',
        }),
      ),
    ).toBe(3.84);
  });

  it('counts half the extra for a вынос at the bottom alone, none when it is not needed', () => {
    const size = { widthCm: '140', heightCm: '150', projectionCm: '30' };

    expect(
      computeOpeningAreaSquareMeters(
        opening({ ...size, projectionKind: 'BOTTOM' }),
      ),
    ).toBe(2.97);
    expect(
      computeOpeningAreaSquareMeters(
        opening({ ...size, projectionKind: 'NONE' }),
      ),
    ).toBe(2.1);
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
          projectionKind: 'BOTTOM_AND_TOP',
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
            widthCm: '140',
            heightCm: '150,5',
            projectionKind: 'BOTTOM_AND_TOP',
            projectionCm: '30',
            quantity: '2',
            notes: ' угловое ',
          }),
        ],
      }),
      'member-1',
      context(),
    );

    expect(result).toEqual({
      isValid: true,
      orderId: null,
      order: {
        status: 'MEASURED',
        measurerId: 'member-1',
        clientName: 'Клиент 1',
        clientPhone: '+998901234567',
        district: 'CHILANZAR',
        addressLine: 'ул. Катартал, 5',
        floor: 3,
        source: 'OLX',
        measurementDate: new Date('2026-09-30T10:15').toISOString(),
        comment: null,
        discountKind: 'PERCENT',
        discountValue: null,
      },
      items: [
        {
          id: 'opening',
          designId: 'design-1',
          widthCm: 140,
          heightCm: 150.5,
          projectionKind: 'BOTTOM_AND_TOP',
          projectionCm: 30,
          quantity: 2,
          notes: 'угловое',
        },
      ],
      visors: [],
      firstPayment: null,
    });
  });

  it('rejects an incomplete phone', () => {
    const result = buildMeasurementPayload(
      draft({ clientPhone: '90 123' }),
      'member-1',
      context(),
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
      context(),
    );

    expect(result).toEqual({
      isValid: false,
      errors: ['Проём 2: укажите ширину и высоту больше 0'],
    });
  });

  it('asks for the centimetres of a вынос that was chosen, and saves none as 0', () => {
    const size = { widthCm: '140', heightCm: '150' };
    const build = (openingDraft: OpeningDraft) =>
      buildMeasurementPayload(
        draft({ openings: [openingDraft] }),
        'member-1',
        context(),
      );

    expect(build(opening({ ...size, projectionKind: 'BOTTOM' }))).toEqual({
      isValid: false,
      errors: ['Проём 1: укажите вынос в сантиметрах'],
    });

    const bottom = build(
      opening({ ...size, projectionKind: 'BOTTOM', projectionCm: '30' }),
    );
    const none = build(
      opening({ ...size, projectionKind: 'NONE', projectionCm: '30' }),
    );

    expect(bottom.isValid && bottom.items[0]).toMatchObject({
      projectionKind: 'BOTTOM',
      projectionCm: 30,
    });
    expect(none.isValid && none.items[0]).toMatchObject({
      projectionKind: 'NONE',
      projectionCm: 0,
    });
  });

  it('requires at least one opening and a whole quantity', () => {
    expect(
      buildMeasurementPayload(draft({ openings: [] }), 'member-1', context()),
    ).toEqual({ isValid: false, errors: ['Добавьте проём'] });

    expect(
      buildMeasurementPayload(
        draft({
          openings: [
            opening({ widthCm: '140', heightCm: '150', quantity: '1.5' }),
          ],
        }),
        'member-1',
        context(),
      ),
    ).toEqual({
      isValid: false,
      errors: ['Проём 1: количество должно быть целым числом от 1'],
    });
  });
});

describe('quote by grille', () => {
  const grilles = [
    { id: 'grille-1', pricePerSquareMeter: 100_000 },
    { id: 'grille-2', pricePerSquareMeter: null },
  ];

  it('prices an opening from its grille', () => {
    expect(
      computeOpeningQuote(
        opening({
          designId: 'grille-1',
          widthCm: '100',
          heightCm: '200',
          projectionCm: '0',
          quantity: '2',
        }),
        grilles,
      ),
    ).toEqual({ pricePerSquareMeter: 100_000, lineTotal: 400_000 });
  });

  it('gives no quote without a grille or without a price', () => {
    expect(
      computeOpeningQuote(
        opening({ designId: '', widthCm: '100', heightCm: '200' }),
        grilles,
      ),
    ).toBeNull();
    expect(
      computeOpeningQuote(
        opening({ designId: 'grille-2', widthCm: '100', heightCm: '200' }),
        grilles,
      ),
    ).toBeNull();
  });

  it('gives no quote without dimensions', () => {
    expect(
      computeOpeningQuote(opening({ designId: 'grille-1' }), grilles),
    ).toBeNull();
  });

  it('totals only when every opening has a price', () => {
    const priced = opening({
      designId: 'grille-1',
      widthCm: '100',
      heightCm: '100',
    });

    expect(computeDraftTotal([priced, priced], grilles, [])).toBe(200_000);
    expect(
      computeDraftTotal(
        [
          priced,
          opening({ designId: 'grille-2', widthCm: '100', heightCm: '100' }),
        ],
        grilles,
        [],
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
      context(),
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
  const options = [
    { id: 'visor-1', name: 'Козырёк пластик 50', price: 180_000 },
    { id: 'visor-2', name: 'Козырёк туника 50', price: null },
  ];
  const sized = { widthCm: '100', heightCm: '100' };

  it('saves the visor of an opening as a line in running metres, tied to its item', () => {
    const result = buildMeasurementPayload(
      draft({
        openings: [
          opening({
            ...sized,
            visorServiceId: 'visor-1',
            visorLengthCm: '250',
          }),
        ],
      }),
      'member-1',
      context(),
    );

    expect(result.isValid && result.visors).toEqual([
      {
        id: 'opening-visor',
        extraServiceId: 'visor-1',
        quantity: 2.5,
        orderItemId: 'opening',
      },
    ]);
  });

  it('counts one visor per piece', () => {
    const result = buildMeasurementPayload(
      draft({
        openings: [
          opening({
            ...sized,
            quantity: '3',
            visorServiceId: 'visor-1',
            visorLengthCm: '120,5',
          }),
        ],
      }),
      'member-1',
      context(),
    );

    expect(result.isValid && result.visors[0].quantity).toBe(3.62);
  });

  it('allows a visor without a grille: no sizes, no order item', () => {
    const result = buildMeasurementPayload(
      draft({
        openings: [
          opening({ visorServiceId: 'visor-1', visorLengthCm: '300' }),
        ],
      }),
      'member-1',
      context(),
    );

    expect(result).toMatchObject({
      isValid: true,
      items: [],
      visors: [{ quantity: 3, orderItemId: null }],
    });
  });

  it('does not drop the notes or photos of a visor without sizes', () => {
    const result = buildMeasurementPayload(
      draft({
        openings: [
          opening({
            visorServiceId: 'visor-1',
            visorLengthCm: '300',
            notes: 'над дверью',
          }),
        ],
      }),
      'member-1',
      context(),
    );

    expect(result).toEqual({
      isValid: false,
      errors: [
        'Проём 1: заметки и фото сохраняются только с размерами проёма. Укажите ширину и высоту.',
      ],
    });
  });

  it('requires a length in centimetres once a visor is chosen', () => {
    expect(
      buildMeasurementPayload(
        draft({
          openings: [
            opening({
              ...sized,
              visorServiceId: 'visor-1',
              visorLengthCm: '2,5',
            }),
          ],
        }),
        'member-1',
        context(),
      ),
    ).toEqual({
      isValid: false,
      errors: ['Проём 1: укажите длину козырька в сантиметрах, от 10'],
    });
  });

  it('prices the visor per running metre from centimetres', () => {
    expect(
      computeOpeningVisorTotal(
        opening({ visorServiceId: 'visor-1', visorLengthCm: '250' }),
        options,
      ),
    ).toBe(450_000);
    expect(
      computeOpeningVisorTotal(
        opening({ visorServiceId: 'visor-2', visorLengthCm: '200' }),
        options,
      ),
    ).toBeNull();
    expect(computeOpeningVisorTotal(opening({}), options)).toBe(0);
  });

  it('adds the visors to the total and waits for a missing length', () => {
    const grilles = [{ id: 'grille-1', pricePerSquareMeter: 100_000 }];
    const priced = opening({ ...sized, designId: 'grille-1' });

    expect(
      computeDraftTotal(
        [
          { ...priced, visorServiceId: 'visor-1', visorLengthCm: '100' },
          opening({ visorServiceId: 'visor-1', visorLengthCm: '200' }),
        ],
        grilles,
        options,
      ),
    ).toBe(100_000 + 180_000 + 360_000);
    expect(
      computeDraftTotal(
        [{ ...priced, visorServiceId: 'visor-1' }],
        grilles,
        options,
      ),
    ).toBeNull();
  });
});

describe('computePaymentPreview', () => {
  const SUBTOTAL = 1_410_000;

  it('shows the sum as the total when nothing is typed', () => {
    expect(computePaymentPreview(SUBTOTAL, EMPTY_PAYMENT_DRAFT)).toEqual({
      subtotal: 1_410_000,
      discount: 0,
      total: 1_410_000,
      prepayment: 0,
      balance: 1_410_000,
      errors: {},
    });
  });

  it('takes a percent discount and a prepayment', () => {
    expect(
      computePaymentPreview(
        SUBTOTAL,
        payment({ discountValue: '5', prepayment: '500 000' }),
      ),
    ).toEqual({
      subtotal: 1_410_000,
      discount: 70_500,
      total: 1_339_500,
      prepayment: 500_000,
      balance: 839_500,
      errors: {},
    });
  });

  it('takes a percent with a comma', () => {
    expect(
      computePaymentPreview(SUBTOTAL, payment({ discountValue: '2,5' })),
    ).toMatchObject({ discount: 35_250, total: 1_374_750, errors: {} });
  });

  it('takes a discount in сум, with or without thousands groups', () => {
    for (const discountValue of ['70500', '70 500', '70.500']) {
      expect(
        computePaymentPreview(
          SUBTOTAL,
          payment({ discountKind: 'AMOUNT', discountValue }),
        ),
      ).toMatchObject({ discount: 70_500, total: 1_339_500, errors: {} });
    }
  });

  it('counts a typed zero as no discount and no prepayment', () => {
    expect(
      computePaymentPreview(
        SUBTOTAL,
        payment({ discountValue: '0', prepayment: '0' }),
      ),
    ).toMatchObject({
      discount: 0,
      prepayment: 0,
      balance: 1_410_000,
      errors: {},
    });
  });

  it.each([
    ['PERCENT', '101'],
    ['AMOUNT', '1 410 001'],
  ] as const)(
    'refuses a discount above the sum (%s %s)',
    (discountKind, discountValue) => {
      expect(
        computePaymentPreview(
          SUBTOTAL,
          payment({ discountKind, discountValue }),
        ),
      ).toMatchObject({
        discount: 0,
        total: 1_410_000,
        errors: { discountValue: 'Скидка больше суммы' },
      });
    },
  );

  it('allows a discount of the whole sum', () => {
    expect(
      computePaymentPreview(SUBTOTAL, payment({ discountValue: '100' })),
    ).toMatchObject({ discount: 1_410_000, total: 0, balance: 0, errors: {} });
  });

  it.each([
    ['PERCENT', 'abc'],
    ['PERCENT', '-5'],
    ['PERCENT', '1e1'],
    // Too many digits to fit a number
    ['PERCENT', '9'.repeat(400)],
    ['AMOUNT', '70,5'],
    ['AMOUNT', '-100'],
  ] as const)(
    'asks for a number when the discount is not one (%s %j)',
    (discountKind, discountValue) => {
      expect(
        computePaymentPreview(
          SUBTOTAL,
          payment({ discountKind, discountValue }),
        ),
      ).toMatchObject({
        discount: 0,
        errors: { discountValue: 'Введите число, ноль или больше' },
      });
    },
  );

  it('refuses a prepayment above the total after the discount', () => {
    expect(
      computePaymentPreview(
        SUBTOTAL,
        payment({ discountValue: '5', prepayment: '1 339 501' }),
      ),
    ).toMatchObject({
      total: 1_339_500,
      prepayment: 0,
      balance: 1_339_500,
      errors: { prepayment: 'Предоплата больше итога' },
    });
  });

  it('allows a prepayment of the whole total', () => {
    expect(
      computePaymentPreview(SUBTOTAL, payment({ prepayment: '1410000' })),
    ).toMatchObject({ prepayment: 1_410_000, balance: 0, errors: {} });
  });

  it.each(['abc', '-1', '500,5'])(
    'asks for a number when the prepayment is %j',
    (prepayment) => {
      expect(
        computePaymentPreview(SUBTOTAL, payment({ prepayment })),
      ).toMatchObject({
        prepayment: 0,
        balance: 1_410_000,
        errors: { prepayment: 'Введите число, ноль или больше' },
      });
    },
  );

  it('takes no discount and no prepayment while the price is unknown', () => {
    expect(
      computePaymentPreview(
        null,
        payment({ discountValue: 'abc', prepayment: '500 000' }),
      ),
    ).toEqual({
      subtotal: null,
      discount: 0,
      total: null,
      prepayment: 0,
      balance: null,
      errors: {},
    });
  });
});

describe('scheduled orders', () => {
  it('sorts the soonest first, an order without a date last, then by number', () => {
    const orders = [
      scheduled({ id: 'c', name: '№1044', measurementDate: null }),
      scheduled({
        id: 'b',
        name: '№1043',
        measurementDate: '2026-10-06T05:00:00.000Z',
      }),
      scheduled({
        id: 'd',
        name: '№1041',
        measurementDate: '2026-10-06T05:00:00.000Z',
      }),
      scheduled({
        id: 'a',
        name: '№1042',
        measurementDate: '2026-10-05T09:00:00.000Z',
      }),
    ];

    expect(sortScheduledOrders(orders).map((order) => order.id)).toEqual([
      'a',
      'd',
      'b',
      'c',
    ]);
    expect(orders[0].id).toBe('c');
  });

  it('labels an order by its time in Tashkent, the client and the district', () => {
    expect(scheduledOrderLabel(scheduled(), '2026-10-05')).toBe(
      'Сегодня 14:00 · Клиент 2 · Чиланзарский',
    );
    expect(
      scheduledOrderLabel(
        scheduled({
          clientName: 'Клиент 3',
          district: null,
          measurementDate: '2026-10-06T11:30:00.000Z',
        }),
        '2026-10-05',
      ),
    ).toBe('6 октября 16:30 · Клиент 3');
  });

  it('counts the day in Tashkent, not in UTC', () => {
    expect(
      scheduledOrderLabel(
        scheduled({ measurementDate: '2026-10-05T20:30:00.000Z' }),
        '2026-10-06',
      ),
    ).toBe('Сегодня 01:30 · Клиент 2 · Чиланзарский');
  });

  it('falls back to the order number when there is no client name or date', () => {
    expect(
      scheduledOrderLabel(
        scheduled({ clientName: ' ', district: null, measurementDate: null }),
        '2026-10-05',
      ),
    ).toBe('№1042');
  });

  it('fills the client block from the order', () => {
    expect(draftFromScheduledOrder(scheduled())).toEqual({
      clientName: 'Клиент 2',
      clientPhone: '90 123 45 67',
      district: 'CHILANZAR',
      addressLine: 'ул. Катартал, 5',
      floor: '3',
      measurementDate: toDateTimeLocalInputValue(
        new Date('2026-10-05T09:00:00.000Z'),
      ),
      comment: 'Домофон не работает, звонить',
      source: 'INSTAGRAM',
    });
  });

  it('leaves empty what the order does not have, and keeps the form date', () => {
    expect(
      draftFromScheduledOrder(
        scheduled({
          clientName: null,
          clientPhone: null,
          district: 'NOT_A_DISTRICT',
          addressLine: null,
          floor: null,
          measurementDate: null,
          comment: null,
          source: 'NOT_A_SOURCE',
        }),
      ),
    ).toEqual({
      clientName: '',
      clientPhone: '',
      district: '',
      addressLine: '',
      floor: '',
      comment: '',
      source: '',
    });
  });
});

describe('resolveTargetOrderId', () => {
  const orders = [scheduled({ id: 'order-1' })];

  it('creates a new order when nothing is scheduled', () => {
    expect(resolveTargetOrderId('', [])).toEqual({ ok: true, orderId: null });
  });

  it('creates a new order for «Новый клиент»', () => {
    expect(resolveTargetOrderId(NEW_CLIENT_TARGET, orders)).toEqual({
      ok: true,
      orderId: null,
    });
  });

  it('saves into the scheduled order that was picked', () => {
    expect(resolveTargetOrderId('order-1', orders)).toEqual({
      ok: true,
      orderId: 'order-1',
    });
  });

  it('asks whose measurement it is while scheduled orders wait and none is picked', () => {
    expect(resolveTargetOrderId('', orders)).toEqual({
      ok: false,
      error: 'Выберите, чей это замер',
    });
    expect(resolveTargetOrderId('order-9', orders)).toMatchObject({
      ok: false,
    });
  });
});

describe('payment in the payload', () => {
  it('sends the discount with the order and the prepayment as the first payment', () => {
    const result = buildMeasurementPayload(
      draft({}),
      'member-1',
      context({
        subtotal: 1_410_000,
        payment: payment({
          discountValue: '5',
          prepayment: '500 000',
          method: 'CARD',
          comment: ' задаток ',
        }),
      }),
    );

    expect(result).toMatchObject({
      isValid: true,
      orderId: null,
      order: { discountKind: 'PERCENT', discountValue: 5 },
      firstPayment: {
        amount: 500_000,
        method: 'CARD',
        comment: 'задаток',
        paidOn: '2026-10-05',
      },
    });
  });

  it('sends no payment without a prepayment', () => {
    const result = buildMeasurementPayload(
      draft({}),
      'member-1',
      context({
        subtotal: 1_410_000,
        payment: payment({ discountKind: 'AMOUNT', discountValue: '70 500' }),
      }),
    );

    expect(result).toMatchObject({
      order: { discountKind: 'AMOUNT', discountValue: 70_500 },
      firstPayment: null,
    });
  });

  it('names the scheduled order to save into', () => {
    expect(
      buildMeasurementPayload(
        draft({}),
        'member-1',
        context({ orderId: 'order-1' }),
      ),
    ).toMatchObject({ isValid: true, orderId: 'order-1' });
  });

  it('takes no discount and no payment while the price is unknown («Другая»)', () => {
    const result = buildMeasurementPayload(
      draft({}),
      'member-1',
      context({
        subtotal: null,
        payment: payment({ discountValue: '5', prepayment: '500 000' }),
      }),
    );

    expect(result).toMatchObject({
      isValid: true,
      order: { discountValue: null },
      firstPayment: null,
    });
  });

  it('does not save while the discount or the prepayment is wrong', () => {
    const result = buildMeasurementPayload(
      draft({}),
      'member-1',
      context({
        subtotal: 1_410_000,
        payment: payment({ prepayment: '2 000 000' }),
      }),
    );

    expect(result).toEqual({
      isValid: false,
      errors: ['Проверьте скидку и предоплату'],
    });
  });
});

describe('toOrderUpdateData', () => {
  it('keeps what the manager entered and the order measurer', () => {
    const result = buildMeasurementPayload(
      draft({ source: '', comment: '' }),
      'member-1',
      context({ orderId: 'order-1' }),
    );

    if (!result.isValid) throw new Error('expected a valid payload');

    const data = toOrderUpdateData(result.order);

    expect(data).toMatchObject({
      status: 'MEASURED',
      clientName: 'Клиент 1',
      clientPhone: '+998901234567',
      discountKind: 'PERCENT',
      discountValue: null,
    });
    expect(Object.keys(data)).not.toContain('measurerId');
    expect(Object.keys(data)).not.toContain('source');
    expect(Object.keys(data)).not.toContain('comment');
  });

  it('writes the typed discount kind and value together', () => {
    const result = buildMeasurementPayload(
      draft({}),
      'member-1',
      context({
        orderId: 'order-1',
        subtotal: 1_410_000,
        payment: payment({ discountKind: 'AMOUNT', discountValue: '70 500' }),
      }),
    );

    if (!result.isValid) throw new Error('expected a valid payload');

    expect(toOrderUpdateData(result.order)).toMatchObject({
      discountKind: 'AMOUNT',
      discountValue: 70_500,
    });
  });

  it('clears an earlier discount while the price is unknown («Другая»)', () => {
    const result = buildMeasurementPayload(
      draft({}),
      'member-1',
      context({
        orderId: 'order-1',
        subtotal: null,
        payment: payment({ discountKind: 'AMOUNT', discountValue: '5' }),
      }),
    );

    if (!result.isValid) throw new Error('expected a valid payload');

    expect(toOrderUpdateData(result.order)).toMatchObject({
      discountKind: 'AMOUNT',
      discountValue: null,
    });
  });
});
