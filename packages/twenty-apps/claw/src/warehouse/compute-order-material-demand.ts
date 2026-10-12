import { type Product } from 'src/constants/select-options';
import { computeItemUnits } from 'src/pricing/compute-item-area';
import { roundTo } from 'src/pricing/round';

export type DemandItem = {
  designId: string | null;
  areaSquareMeters: number | null;
  quantity: number | null;
  // A railing's composition is per running metre of its length
  product?: Product | null;
  widthCm?: number | null;
};

export type DemandExtraServiceLine = {
  extraServiceId: string | null;
  quantity: number | null;
};

export type DemandNorm = {
  designId: string | null;
  extraServiceId: string | null;
  materialId: string | null;
  quantityPerUnit: number | null;
};

export type OrderMaterialDemand = {
  quantityByMaterialId: Map<string, number>;
  missingNorms: string | null;
};

type ValidNorm = {
  ownerId: string;
  materialId: string;
  quantityPerUnit: number;
};

// A norm belongs to exactly one grille or one extra service; anything else is ignored.
const groupValidNorms = (
  norms: DemandNorm[],
  owner: 'designId' | 'extraServiceId',
) => {
  const other = owner === 'designId' ? 'extraServiceId' : 'designId';
  const byOwner = new Map<string, ValidNorm[]>();

  for (const norm of norms) {
    const ownerId = norm[owner];

    if (
      ownerId === null ||
      norm[other] !== null ||
      norm.materialId === null ||
      norm.quantityPerUnit === null
    ) {
      continue;
    }

    byOwner.set(ownerId, [
      ...(byOwner.get(ownerId) ?? []),
      {
        ownerId,
        materialId: norm.materialId,
        quantityPerUnit: norm.quantityPerUnit,
      },
    ]);
  }

  return byOwner;
};

export const computeOrderMaterialDemand = ({
  items,
  extraServiceLines,
  grilles,
  norms,
}: {
  items: DemandItem[];
  extraServiceLines: DemandExtraServiceLine[];
  grilles: { id: string; name: string | null }[];
  norms: DemandNorm[];
}): OrderMaterialDemand => {
  const normsByGrille = groupValidNorms(norms, 'designId');
  const normsByService = groupValidNorms(norms, 'extraServiceId');
  const totals = new Map<string, number>();
  const missing = new Set<string>();

  const add = (ownerNorms: ValidNorm[], units: number) => {
    for (const { materialId, quantityPerUnit } of ownerNorms) {
      totals.set(
        materialId,
        (totals.get(materialId) ?? 0) + units * quantityPerUnit,
      );
    }
  };

  const grilleNameById = new Map(
    grilles.map((grille) => [grille.id, grille.name]),
  );

  for (const item of items) {
    const units = computeItemUnits(item);

    if (units === null || item.designId === null) continue;

    const grilleNorms = normsByGrille.get(item.designId) ?? [];

    if (grilleNorms.length === 0) {
      missing.add(grilleNameById.get(item.designId) ?? 'решётка');
      continue;
    }

    add(grilleNorms, units * (item.quantity ?? 1));
  }

  // Services without norms (delivery, installation) consume nothing and are not flagged.
  for (const line of extraServiceLines) {
    if (line.extraServiceId === null) continue;

    add(normsByService.get(line.extraServiceId) ?? [], line.quantity ?? 0);
  }

  return {
    quantityByMaterialId: new Map(
      [...totals]
        .map(([materialId, total]): [string, number] => [
          materialId,
          roundTo(total, 2),
        ])
        .filter(([, total]) => total > 0),
    ),
    missingNorms:
      missing.size > 0
        ? `Не указано, из чего делается: ${[...missing].join(', ')}`
        : null,
  };
};
