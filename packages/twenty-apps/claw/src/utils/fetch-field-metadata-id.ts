import { MetadataApiClient } from 'twenty-client-sdk/metadata';

// uploadFile needs this workspace's id of the files field, which differs from
// the universalIdentifier the app declares.
export const fetchFieldMetadataId = async (
  objectUniversalIdentifier: string,
  fieldUniversalIdentifier: string,
): Promise<string | null> => {
  const { objects } = await new MetadataApiClient().query({
    objects: {
      __args: {
        paging: { first: 1 },
        filter: { universalIdentifier: { eq: objectUniversalIdentifier } },
      },
      edges: { node: { fieldsList: { id: true, universalIdentifier: true } } },
    },
  });

  return (
    objects.edges[0]?.node.fieldsList?.find(
      (field) => field.universalIdentifier === fieldUniversalIdentifier,
    )?.id ?? null
  );
};
