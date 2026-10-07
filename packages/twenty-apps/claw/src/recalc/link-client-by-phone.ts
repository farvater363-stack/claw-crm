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
