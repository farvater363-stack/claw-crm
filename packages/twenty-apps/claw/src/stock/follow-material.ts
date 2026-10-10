import { type CoreApiClient } from 'twenty-client-sdk/core';

// A composition row left on a deleted material would keep reserving it for
// orders and counting it in the cost of the grille.
export const deleteNormsOfMaterial = async (
  client: CoreApiClient,
  materialId: string,
): Promise<void> => {
  await client.mutation({
    deleteMaterialNorms: {
      __args: { filter: { materialId: { eq: materialId } } },
      id: true,
    },
  });
};

// Only the rows that left with the material come back: one removed by hand
// before that stays removed.
export const restoreNormsOfMaterial = async (
  client: CoreApiClient,
  materialId: string,
  materialDeletedAt: string | null | undefined,
): Promise<void> => {
  if (!materialDeletedAt) return;

  await client.mutation({
    restoreMaterialNorms: {
      __args: {
        filter: {
          materialId: { eq: materialId },
          deletedAt: { gte: materialDeletedAt },
        },
      },
      id: true,
    },
  });
};
