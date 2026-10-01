import { type CoreApiClient } from 'twenty-client-sdk/core';

import { normalizeUzbekPhone } from 'src/pricing/normalize-uzbek-phone';

export const linkClientByPhone = async (
  client: CoreApiClient,
  {
    clientName,
    clientPhone,
  }: { clientName: string | null; clientPhone: string | null },
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
          name: { firstName: clientName ?? nationalNumber, lastName: '' },
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
