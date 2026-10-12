import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it, vi } from 'vitest';

import {
  deleteNormsOfMaterial,
  restoreNormsOfMaterial,
} from 'src/stock/follow-material';

const fakeClient = (deletedMaterialIds: string[] = []) => {
  const mutation = vi.fn().mockResolvedValue({});
  const query = vi.fn().mockResolvedValue({
    materials: { edges: deletedMaterialIds.map((id) => ({ node: { id } })) },
  });

  return {
    client: { mutation, query } as unknown as CoreApiClient,
    mutation,
    query,
  };
};

describe('composition rows follow their material', () => {
  it('removes a deleted material from every composition', async () => {
    const { client, mutation, query } = fakeClient(['material-1']);

    await deleteNormsOfMaterial(client, 'material-1');

    expect(query).toHaveBeenCalledWith({
      materials: {
        __args: {
          filter: {
            id: { eq: 'material-1' },
            deletedAt: { is: 'NOT_NULL' },
          },
          first: 1,
        },
        edges: { node: { id: true } },
      },
    });
    expect(mutation).toHaveBeenCalledWith({
      deleteMaterialNorms: {
        __args: { filter: { materialId: { eq: 'material-1' } } },
        id: true,
      },
    });
  });

  it('keeps the composition of a material restored before the removal ran', async () => {
    const { client, mutation } = fakeClient([]);

    await deleteNormsOfMaterial(client, 'material-1');

    expect(mutation).not.toHaveBeenCalled();
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
