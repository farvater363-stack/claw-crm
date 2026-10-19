import { describe, expect, it } from 'vitest';

import {
  contractDataFromDraft,
  contractDataFromOrder,
  type StoredOrderForContract,
  termDaysUntil,
} from 'src/contract/contract-data';
import {
  describeContractChange,
  isContractChanged,
} from 'src/contract/contract-change';
import { contractTermsKey } from 'src/contract/contract-document';
import { DEFAULT_CONTRACT_TEMPLATE } from 'src/contract/contract-template';
import { nextContractState } from 'src/contract/sync-contract-state';
import {
  buildMeasurementPayload,
  createEmptyOpening,
  EMPTY_PAYMENT_DRAFT,
  type MeasurementDraft,
  type ServiceOption,
  type VisorOption,
} from 'src/measurer-form/measurer-form';

const SERVICE_OPTIONS: ServiceOption[] = [
  { id: 'delivery', name: 'Доставка', unit: 'PER_PIECE', price: 50_000 },
  { id: 'paint', name: 'Покраска', unit: 'PER_SQUARE_METER', price: 20_000 },
  { id: 'removal', name: 'Демонтаж', unit: 'FIXED', price: 100_000 },
];

const VISOR_OPTIONS: VisorOption[] = [
  { id: 'visor-standard', name: 'Козырёк Стандарт', price: 300_000 },
];

const DRAFT: MeasurementDraft = {
  clientFirstName: 'Азиз',
  clientLastName: 'Рахимов',
  clientPhone: '90 123 45 67',
  district: 'CHILANZAR',
  addressLine: 'ул. Катартал, 5',
  floor: '3',
  source: 'OLX',
  measurementDate: '2026-09-30T10:15',
  comment: '',
  openings: [
    {
      ...createEmptyOpening('opening-1', 'visor-1'),
      designId: 'design-m03',
      widthCm: '100',
      heightCm: '150',
      projectionSide: 'OUTSIDE',
      quantity: '2',
      isVisorWanted: true,
      visorServiceId: 'visor-standard',
      visorLengthCm: '120',
    },
    {
      ...createEmptyOpening('opening-2', 'visor-2'),
      isVisorWanted: true,
      visorServiceId: 'visor-standard',
      visorLengthCm: '95,5',
    },
  ],
  services: [
    { key: 'line-1', serviceId: 'delivery', quantity: '3' },
    { key: 'line-2', serviceId: 'paint', quantity: '' },
    { key: 'line-3', serviceId: 'removal', quantity: '' },
  ],
};

const TOTAL = 2_500_000;

const draftData = (draft: MeasurementDraft) =>
  contractDataFromDraft({
    draft,
    grilles: [],
    visorOptions: VISOR_OPTIONS,
    serviceOptions: SERVICE_OPTIONS,
    subtotal: TOTAL,
    discount: 0,
    total: TOTAL,
    prepayment: 0,
    number: null,
    signedOn: '2026-10-12',
    template: DEFAULT_CONTRACT_TEMPLATE,
  });

// The order exactly as «Новый замер» saves the draft.
const savedOrder = (draft: MeasurementDraft): StoredOrderForContract => {
  const payload = buildMeasurementPayload(draft, 'measurer', {
    orderId: null,
    payment: EMPTY_PAYMENT_DRAFT,
    subtotal: TOTAL,
    today: '2026-10-12',
    serviceOptions: SERVICE_OPTIONS,
  });

  if (!payload.isValid) throw new Error(payload.errors.join('; '));

  return {
    name: '№1012',
    clientFullName: { firstName: 'Азиз', lastName: 'Рахимов' },
    clientPhone: '+998901234567',
    district: 'CHILANZAR',
    addressLine: 'ул. Катартал, 5',
    floor: 3,
    subtotal: TOTAL,
    discount: 0,
    total: TOTAL,
    paid: 0,
    installationDeadline: null,
    paintColor: null,
    items: payload.items.map((item) => ({
      id: item.id,
      product: item.product,
      shape: item.shape,
      widthCm: item.widthCm,
      heightCm: item.heightCm,
      projectionCm: item.projectionCm,
      projectionKind: item.projectionKind,
      projectionSide: item.projectionSide,
      quantity: item.quantity,
      designId: item.designId,
      designName: null,
      lineTotal: null,
    })),
    extraServices: [
      ...payload.visors.map((visor) => ({
        extraServiceId: visor.extraServiceId,
        name: null,
        serviceName: null,
        quantity: visor.quantity,
        orderItemId: visor.orderItemId,
        lineTotal: null,
      })),
      ...payload.services.map((service) => ({
        extraServiceId: service.extraServiceId,
        name: null,
        serviceName: null,
        quantity: service.quantity,
        orderItemId: null,
        lineTotal: null,
      })),
    ],
  };
};

const orderKey = (order: StoredOrderForContract) =>
  contractTermsKey(
    contractDataFromOrder(order, DEFAULT_CONTRACT_TEMPLATE, '2026-10-12'),
  );

describe('the terms signed on «Новый замер»', () => {
  it('match the order the form saves, visors and services included', () => {
    expect(contractTermsKey(draftData(DRAFT))).toBe(
      orderKey(savedOrder(DRAFT)),
    );
  });

  it('change with a visor length, a service quantity or the paint colour', () => {
    const order = savedOrder(DRAFT);
    const key = orderKey(order);
    const [withVisor, ...restOpenings] = DRAFT.openings;
    const [delivery, ...restServices] = DRAFT.services;

    expect(
      orderKey(
        savedOrder({
          ...DRAFT,
          openings: [{ ...withVisor, visorLengthCm: '130' }, ...restOpenings],
        }),
      ),
    ).not.toBe(key);
    expect(
      orderKey(
        savedOrder({
          ...DRAFT,
          services: [{ ...delivery, quantity: '4' }, ...restServices],
        }),
      ),
    ).not.toBe(key);
    expect(orderKey(savedOrder({ ...DRAFT, services: restServices }))).not.toBe(
      key,
    );
    expect(orderKey({ ...order, paintColor: 'чёрный' })).not.toBe(key);
  });

  it('do not depend on the order the lines come back in', () => {
    const order = savedOrder(DRAFT);

    expect(
      orderKey({
        ...order,
        extraServices: [...order.extraServices].reverse(),
      }),
    ).toBe(orderKey(order));
  });
});

describe('a contract signed before visors, services and paint counted', () => {
  // As signContract stored it before the key had a version.
  const unversionedKey = (order: StoredOrderForContract) =>
    JSON.stringify({
      total: Math.round(order.total ?? 0),
      openings: JSON.parse(
        contractTermsKey(
          contractDataFromOrder(order, DEFAULT_CONTRACT_TEMPLATE, '2026-10-12'),
        ),
      ).openings,
    });

  it('stays signed on an order with a visor, services and a paint colour', () => {
    const order = { ...savedOrder(DRAFT), paintColor: 'чёрный' };
    const terms = contractDataFromOrder(
      order,
      DEFAULT_CONTRACT_TEMPLATE,
      '2026-10-12',
    );

    expect(isContractChanged(unversionedKey(order), terms)).toBe(false);
    expect(
      nextContractState({
        currentState: 'SIGNED',
        signedTermsKey: unversionedKey(order),
        terms,
      }),
    ).toBeNull();
  });

  it('still notices a changed size or total', () => {
    const order = savedOrder(DRAFT);

    expect(
      isContractChanged(
        unversionedKey(order),
        contractDataFromOrder(
          { ...order, total: TOTAL + 1_000 },
          DEFAULT_CONTRACT_TEMPLATE,
          '2026-10-12',
        ),
      ),
    ).toBe(true);
  });
});

describe('a contract signed with the version 2 terms', () => {
  it('changes once a service changes', () => {
    const order = savedOrder(DRAFT);
    const signedKey = orderKey(order);
    const [delivery, ...restServices] = DRAFT.services;
    const changed = contractDataFromOrder(
      savedOrder({
        ...DRAFT,
        services: [{ ...delivery, quantity: '4' }, ...restServices],
      }),
      DEFAULT_CONTRACT_TEMPLATE,
      '2026-10-12',
    );

    expect(JSON.parse(signedKey).version).toBe(2);
    expect(
      nextContractState({
        currentState: 'SIGNED',
        signedTermsKey: signedKey,
        terms: changed,
      }),
    ).toBe('CHANGED');
    expect(describeContractChange(signedKey, changed)).toEqual([
      'изменились козырьки или услуги',
    ]);
  });
});

describe('the term in days', () => {
  it('counts the days to a deadline still ahead', () => {
    expect(termDaysUntil('2026-10-12', '2026-10-30', 20)).toBe(18);
  });

  it('falls back to the default once the deadline is today or past', () => {
    expect(termDaysUntil('2026-10-12', '2026-10-12', 20)).toBe(20);
    expect(termDaysUntil('2026-10-12', '2026-10-01', 20)).toBe(20);
  });

  it('takes the default before a deadline is set', () => {
    expect(termDaysUntil('2026-10-12', null, 20)).toBe(20);
  });
});

describe('the numbers of the проёмы', () => {
  it('follow the form, a visor alone included', () => {
    expect(
      draftData(DRAFT)
        .openings.slice(0, 2)
        .map(({ title }) => title),
    ).toEqual(['Проём 1', 'Проём 2']);
  });

  it('follow the saved numbers of an order, and old items come after', () => {
    const order = savedOrder(DRAFT);
    const [item] = order.items;
    const numbered: StoredOrderForContract = {
      ...order,
      items: [
        { ...item, id: 'a', openingNumber: 3 },
        { ...item, id: 'b' },
        { ...item, id: 'c', openingNumber: 1 },
      ],
      extraServices: [],
    };

    expect(
      contractDataFromOrder(
        numbered,
        DEFAULT_CONTRACT_TEMPLATE,
        '2026-10-12',
      ).openings.map(({ title }) => title),
    ).toEqual(['Проём 1', 'Проём 3', 'Проём 4']);
  });

  it('do not take part in the signed terms', () => {
    const order = savedOrder(DRAFT);

    expect(
      orderKey({
        ...order,
        items: order.items.map((item) => ({ ...item, openingNumber: 7 })),
      }),
    ).toBe(orderKey(order));
  });
});
