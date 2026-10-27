import { CoreApiClient } from 'twenty-client-sdk/core';

import {
  draftFromScheduledOrder,
  type MeasurementDraft,
  type ScheduledOrder,
} from 'src/measurer-form/measurer-form';
import {
  normalizeUzbekPhone,
  toStoredUzbekPhone,
} from 'src/pricing/normalize-uzbek-phone';
import { type FullName, joinFullName, trimFullName } from 'src/utils/full-name';

const MATCH_ORDERS_LIMIT = 20;

// A client already in the CRM under the phone being typed: their name and
// the address of their latest order.
export type ClientMatch = {
  phone: string;
  name: FullName;
  latestOrder: ScheduledOrder | null;
  ordersCount: number;
};

// What «Взять его данные» fills in. The phone and the date of this visit stay
// as they are, and so does anything already typed that the match lacks.
export const draftFromClientMatch = (
  match: ClientMatch,
  draft: MeasurementDraft,
): Partial<MeasurementDraft> => {
  const fromOrder =
    match.latestOrder === null
      ? {}
      : draftFromScheduledOrder({ ...match.latestOrder, comment: null });
  const keepTyped = (typed: string, found: string | undefined) =>
    found === undefined || found === '' ? typed : found;

  return {
    clientFirstName: keepTyped(draft.clientFirstName, match.name.firstName),
    clientLastName: keepTyped(draft.clientLastName, match.name.lastName),
    district:
      (fromOrder.district ?? '') === '' ? draft.district : fromOrder.district,
    addressLine: keepTyped(draft.addressLine, fromOrder.addressLine),
    floor: keepTyped(draft.floor, fromOrder.floor),
    source: (fromOrder.source ?? '') === '' ? draft.source : fromOrder.source,
  };
};

export const describeClientMatch = (match: ClientMatch): string =>
  [
    joinFullName(match.name) ?? 'без имени',
    match.latestOrder?.addressLine ?? '',
    match.ordersCount === 0 ? '' : `заказов: ${match.ordersCount}`,
  ]
    .filter((part) => part !== '')
    .join(', ');

// The person record holds the name the managers keep up to date; orders hold
// the address. Either may be missing, and a measurer who cannot read one still
// gets the other.
export const findClientByPhone = async (
  typed: string,
): Promise<ClientMatch | null> => {
  const national = normalizeUzbekPhone(typed);
  const stored = toStoredUzbekPhone(typed);

  if (national === null || stored === null) return null;

  const client = new CoreApiClient();
  const [people, orders] = await Promise.all([
    client
      .query({
        people: {
          __args: {
            filter: { phones: { primaryPhoneNumber: { eq: national } } },
            first: 1,
          },
          edges: {
            node: { id: true, name: { firstName: true, lastName: true } },
          },
        },
      })
      .then(({ people }) => people?.edges ?? [])
      .catch(() => []),
    client
      .query({
        orders: {
          __args: {
            filter: { clientPhone: { eq: stored } },
            first: MATCH_ORDERS_LIMIT,
            orderBy: [{ createdAt: 'DescNullsLast' }],
          },
          edges: {
            node: {
              id: true,
              name: true,
              clientFullName: { firstName: true, lastName: true },
              clientPhone: true,
              district: true,
              addressLine: true,
              floor: true,
              measurementDate: true,
              source: true,
            },
          },
        },
      })
      .then(({ orders }) => orders?.edges ?? [])
      .catch(() => []),
  ]);
  const person = people[0]?.node ?? null;
  const latest = orders[0]?.node ?? null;

  if (person === null && latest === null) return null;

  const latestOrder: ScheduledOrder | null =
    latest === null
      ? null
      : {
          id: latest.id,
          name: latest.name ?? '',
          clientFullName: trimFullName(latest.clientFullName),
          clientPhone: latest.clientPhone ?? null,
          district: latest.district ?? null,
          addressLine: latest.addressLine ?? null,
          floor:
            latest.floor === null || latest.floor === undefined
              ? null
              : Number(latest.floor),
          measurementDate: latest.measurementDate ?? null,
          comment: null,
          source: latest.source ?? null,
          // A returning client may live elsewhere now; the point is never copied.
          locationLat: null,
          locationLng: null,
          locationNote: null,
          locationPhotos: [],
        };
  const personName = trimFullName(person?.name ?? null);
  // A person created from a phone alone is named by that phone.
  const hasPersonName =
    personName.firstName !== '' && personName.firstName !== national;

  return {
    phone: stored,
    name: hasPersonName
      ? personName
      : (latestOrder?.clientFullName ?? personName),
    latestOrder,
    ordersCount: orders.length,
  };
};
