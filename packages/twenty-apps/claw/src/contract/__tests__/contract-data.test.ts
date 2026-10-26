import { describe, expect, it } from 'vitest';

import {
  contractDataFromDraft,
  contractDataFromOrder,
  type StoredOrderForContract,
  unpricedOpenings,
} from 'src/contract/contract-data';
import { DEFAULT_CONTRACT_TEMPLATE } from 'src/contract/contract-template';
import {
  createEmptyOpening,
  type MeasurementDraft,
  type ServiceOption,
} from 'src/measurer-form/measurer-form';

const SERVICE_OPTIONS: ServiceOption[] = [
  { id: 'delivery', name: 'Доставка', unit: 'PER_PIECE', price: 50_000 },
  { id: 'paint', name: 'Покраска', unit: 'PER_SQUARE_METER', price: 20_000 },
  { id: 'removal', name: 'Демонтаж', unit: 'FIXED', price: 100_000 },
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
      ...createEmptyOpening('opening', 'opening-visor'),
      widthCm: '100',
      heightCm: '150',
    },
  ],
  services: [
    { key: 'line-1', serviceId: 'delivery', quantity: '3' },
    { key: 'line-2', serviceId: 'paint', quantity: '' },
    { key: 'line-3', serviceId: 'removal', quantity: '' },
  ],
};

describe('services in the contract', () => {
  it('print the quantity the line total is counted from', () => {
    const data = contractDataFromDraft({
      draft: DRAFT,
      grilles: [],
      visorOptions: [],
      serviceOptions: SERVICE_OPTIONS,
      subtotal: null,
      discount: 0,
      total: 0,
      prepayment: 0,
      number: null,
      signedOn: '2026-10-12',
      template: DEFAULT_CONTRACT_TEMPLATE,
    });

    expect(
      data.openings.slice(1).map(({ title, quantity, lineTotal }) => ({
        title,
        quantity,
        lineTotal,
      })),
    ).toEqual([
      { title: 'Доставка', quantity: 3, lineTotal: 150_000 },
      { title: 'Покраска', quantity: 1.5, lineTotal: 30_000 },
      { title: 'Демонтаж', quantity: 1, lineTotal: 100_000 },
    ]);
  });

  it('print the saved quantity of an order', () => {
    const order: StoredOrderForContract = {
      name: '№1012',
      clientFullName: { firstName: 'Азиз', lastName: 'Рахимов' },
      clientPhone: '+998901234567',
      district: null,
      addressLine: null,
      floor: null,
      subtotal: 150_000,
      discount: 0,
      total: 150_000,
      prepaid: 0,
      installationDeadline: null,
      paintColor: null,
      items: [],
      extraServices: [
        {
          extraServiceId: 'delivery',
          name: null,
          serviceName: 'Доставка',
          quantity: 3,
          orderItemId: null,
          lineTotal: 150_000,
        },
        {
          extraServiceId: 'removal',
          name: null,
          serviceName: 'Демонтаж',
          quantity: null,
          orderItemId: null,
          lineTotal: 100_000,
        },
      ],
    };

    expect(
      contractDataFromOrder(
        order,
        DEFAULT_CONTRACT_TEMPLATE,
        '2026-10-12',
      ).openings.map(({ quantity }) => quantity),
    ).toEqual([3, 1]);
  });
});

describe('a «Другая» рисунок in the contract', () => {
  const item = (
    overrides: Partial<StoredOrderForContract['items'][number]>,
  ): StoredOrderForContract['items'][number] => ({
    id: 'item-1',
    openingNumber: 1,
    widthCm: 100,
    heightCm: 150,
    projectionCm: null,
    projectionKind: 'NONE',
    quantity: 1,
    designId: 'grille-1',
    designName: 'Волна',
    lineTotal: 600_000,
    ...overrides,
  });

  it('cannot be signed while a проём waits for its price', () => {
    const order: StoredOrderForContract = {
      name: '№1013',
      clientFullName: { firstName: 'Азиз', lastName: 'Рахимов' },
      clientPhone: '+998901234567',
      district: null,
      addressLine: 'ул. Тестовая, 1',
      floor: null,
      subtotal: 600_000,
      discount: 0,
      total: 600_000,
      prepaid: 0,
      installationDeadline: null,
      paintColor: null,
      items: [
        item({}),
        item({
          id: 'item-2',
          openingNumber: 2,
          designId: null,
          designName: null,
          lineTotal: null,
        }),
      ],
      extraServices: [],
    };
    const data = contractDataFromOrder(
      order,
      DEFAULT_CONTRACT_TEMPLATE,
      '2026-10-15',
    );

    expect(unpricedOpenings(data)).toEqual(['цену: Проём 2']);
    expect(
      unpricedOpenings(
        contractDataFromOrder(
          { ...order, items: [item({})] },
          DEFAULT_CONTRACT_TEMPLATE,
          '2026-10-15',
        ),
      ),
    ).toEqual([]);
  });
});
