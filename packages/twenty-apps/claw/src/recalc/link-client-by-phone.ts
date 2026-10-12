import { type CoreApiClient } from 'twenty-client-sdk/core';

import { normalizeUzbekPhone } from 'src/pricing/normalize-uzbek-phone';
import {
  joinFullName,
  type StoredFullName,
  trimFullName,
} from 'src/utils/full-name';

export const linkClientByPhone = async (
  client: CoreApiClient,
  {
    clientFullName,
    clientPhone,
  }: { clientFullName: StoredFullName; clientPhone: string | null },
): Promise<string | null> => {
  const nationalNumber = clientPhone ? normalizeUzbekPhone(clientPhone) : null;

  if (nationalNumber === null) {
    return null;
  }

  const { people } = await client.query({
    people: {
      __args: {
        filter: { phones: { primaryPhoneNumber: { eq: nationalNumber } } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  });

  const existingPersonId = people?.edges[0]?.node?.id;

  if (existingPersonId) {
    return existingPersonId;
  }

  const { createPerson } = await client.mutation({
    createPerson: {
      __args: {
        data: {
          // A client without a name is found by the phone in lists.
          name:
            joinFullName(clientFullName) === null
              ? { firstName: nationalNumber, lastName: '' }
              : trimFullName(clientFullName),
          phones: {
            primaryPhoneNumber: nationalNumber,
            primaryPhoneCallingCode: '+998',
            primaryPhoneCountryCode: 'UZ',
          },
        },
      },
      id: true,
    },
  });

  return createPerson?.id ?? null;
};

// An order whose phone is corrected moves to the client of the new number, but
// only while it is linked by the old number: a client chosen by hand stays.
export const clientAfterPhoneChange = async (
  client: CoreApiClient,
  order: {
    clientId: string | null;
    clientFullName: StoredFullName;
    previousPhone: string | null;
    phone: string | null;
  },
): Promise<string | null> => {
  const previousNumber = order.previousPhone
    ? normalizeUzbekPhone(order.previousPhone)
    : null;
  const number = order.phone ? normalizeUzbekPhone(order.phone) : null;

  if (number === null || number === previousNumber) return null;

  if (order.clientId !== null) {
    const { people } = await client.query({
      people: {
        __args: { filter: { id: { eq: order.clientId } }, first: 1 },
        edges: { node: { phones: { primaryPhoneNumber: true } } },
      },
    });
    const linkedPhone =
      people?.edges[0]?.node?.phones?.primaryPhoneNumber ?? null;
    const linkedNumber = linkedPhone ? normalizeUzbekPhone(linkedPhone) : null;

    if (linkedNumber === null || linkedNumber !== previousNumber) return null;
  }

  const clientId = await linkClientByPhone(client, {
    clientFullName: order.clientFullName,
    clientPhone: order.phone,
  });

  return clientId !== order.clientId ? clientId : null;
};
