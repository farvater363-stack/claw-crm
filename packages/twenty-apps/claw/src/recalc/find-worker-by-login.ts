import { type CoreApiClient } from 'twenty-client-sdk/core';

// A measurer or a salesperson is a worker whose «Логин» is that person's workspace member.
export const findWorkerIdByLogin = async (
  client: CoreApiClient,
  workspaceMemberId: string,
): Promise<string | null> => {
  const { masters } = await client.query({
    masters: {
      __args: { filter: { loginId: { eq: workspaceMemberId } }, first: 1 },
      edges: { node: { id: true } },
    },
  });

  return masters?.edges[0]?.node?.id ?? null;
};
