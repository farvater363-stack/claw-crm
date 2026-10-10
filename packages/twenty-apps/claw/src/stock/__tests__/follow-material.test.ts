import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it, vi } from 'vitest';

import {
  deleteNormsOfMaterial,
  restoreNormsOfMaterial,
} from 'src/stock/follow-material';

const fakeClient = () => {
  const mutation = vi.fn().mockResolvedValue({});

  return { client: { mutation } as unknown as CoreApiClient, mutation };
};

describe('composition rows follow their material', () => {
  it('removes a deleted material from every composition', async () => {
    const { client, mutation } = fakeClient();

    await deleteNormsOfMaterial(client, 'material-1');

    expect(mutation).toHaveBeenCalledWith({
      deleteMaterialNorms: {
        __args: { filter: { materialId: { eq: 'material-1' } } },
        id: true,
      },
    });
  });

  it('brings back the rows deleted with the material, not ones removed before it', async () => {
    const { client, mutation } = fakeClient();

    await restoreNormsOfMaterial(client, 'material-1', '2026-10-10T16:00:00Z');

    expect(mutation).toHaveBeenCalledWith({
      restoreMaterialNorms: {
        __args: {
          filter: {
            materialId: { eq: 'material-1' },
            deletedAt: { gte: '2026-10-10T16:00:00Z' },
          },
        },
        id: true,
      },
    });
  });

  it('brings back nothing when the time the material was deleted is unknown', async () => {
    const { client, mutation } = fakeClient();

    await restoreNormsOfMaterial(client, 'material-1', null);

    expect(mutation).not.toHaveBeenCalled();
  });
});
