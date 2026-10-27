import { MetadataApiClient } from 'twenty-client-sdk/metadata';

import { IDS } from 'src/constants/universal-identifiers';

// uploadFile needs this workspace's id for an order field, which differs
// from the universalIdentifier the app declares.
export const fetchOrderFieldMetadataId = async (
  fieldUniversalIdentifier: string,
): Promise<string> => {
  const { objects } = await new MetadataApiClient().query({
    objects: {
      __args: {
        paging: { first: 1 },
        filter: { universalIdentifier: { eq: IDS.order.object } },
      },
      edges: { node: { fieldsList: { id: true, universalIdentifier: true } } },
    },
  });
  const fieldMetadataId = objects.edges[0]?.node.fieldsList?.find(
    (field) => field.universalIdentifier === fieldUniversalIdentifier,
  )?.id;

  if (!fieldMetadataId) {
    throw new Error(`order field ${fieldUniversalIdentifier} not found`);
  }

  return fieldMetadataId;
};
