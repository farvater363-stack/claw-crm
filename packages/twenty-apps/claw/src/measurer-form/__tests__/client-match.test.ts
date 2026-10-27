import { describe, expect, it } from 'vitest';

import { EMPTY_LOCATION } from 'src/location/location';

import {
  type ClientMatch,
  describeClientMatch,
  draftFromClientMatch,
} from 'src/measurer-form/client-match';
import {
  createEmptyOpening,
  type MeasurementDraft,
} from 'src/measurer-form/measurer-form';

const draft = (
  overrides: Partial<MeasurementDraft> = {},
): MeasurementDraft => ({
  location: EMPTY_LOCATION,
  clientFirstName: '',
  clientLastName: '',
  clientPhone: '99 888 77 66',
  district: '',
  addressLine: '',
  floor: '',
  source: '',
  measurementDate: '2026-10-12T14:00',
  comment: 'позвонить за час',
  openings: [createEmptyOpening('opening', 'visor')],
  services: [],
  ...overrides,
});

const match: ClientMatch = {
  phone: '+998998887766',
  name: { firstName: 'Бахтиёр', lastName: 'Юсупов' },
  latestOrder: {
    id: 'order',
    name: '1004',
    clientFullName: { firstName: 'Бахтиёр', lastName: '' },
    clientPhone: '+998998887766',
    district: 'YAKKASARAY',
    addressLine: 'ул. Шота Руставели, 30',
    floor: 2,
    measurementDate: '2026-09-01T09:00:00Z',
    comment: 'старый комментарий',
    source: 'INSTAGRAM',
  },
  ordersCount: 1,
};

describe('draftFromClientMatch', () => {
  it('takes the name and the latest address, but not the date or the comment', () => {
    const changes = draftFromClientMatch(match, draft());

    expect(changes).toEqual({
      clientFirstName: 'Бахтиёр',
      clientLastName: 'Юсупов',
      district: 'YAKKASARAY',
      addressLine: 'ул. Шота Руставели, 30',
      floor: '2',
      source: 'INSTAGRAM',
    });
  });

  it('keeps what was typed where the match has nothing', () => {
    const changes = draftFromClientMatch(
      {
        ...match,
        latestOrder: null,
        name: { firstName: 'Бахтиёр', lastName: '' },
      },
      draft({ clientLastName: 'Юсупов', addressLine: 'Чиланзар 5' }),
    );

    expect(changes.clientLastName).toBe('Юсупов');
    expect(changes.addressLine).toBe('Чиланзар 5');
  });
});

describe('describeClientMatch', () => {
  it('names the client, the address and the orders', () => {
    expect(describeClientMatch(match)).toBe(
      'Бахтиёр Юсупов, ул. Шота Руставели, 30, заказов: 1',
    );
  });
});
