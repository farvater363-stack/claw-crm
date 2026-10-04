import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import { findWorkerIdByLogin } from 'src/recalc/find-worker-by-login';

const fakeClient = (workers: { id: string }[]) => {
  const queries: Record<string, { __args?: unknown }>[] = [];
  const client = {
    query: async (request: Record<string, { __args?: unknown }>) => {
      queries.push(request);

      return { masters: { edges: workers.map((node) => ({ node })) } };
    },
  } as unknown as CoreApiClient;

  return { client, queries };
};

describe('findWorkerIdByLogin', () => {
  it('finds the worker whose login is the workspace member', async () => {
    const { client, queries } = fakeClient([{ id: 'sardor' }]);

    expect(await findWorkerIdByLogin(client, 'member-sardor')).toBe('sardor');
    expect(queries[0].masters.__args).toEqual({
      filter: { loginId: { eq: 'member-sardor' } },
      first: 1,
    });
  });

  it('is null when no worker is linked to that login', async () => {
    expect(
      await findWorkerIdByLogin(fakeClient([]).client, 'member-site'),
    ).toBeNull();
  });
});
