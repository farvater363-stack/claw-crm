import { resolvePriceListEntry } from 'src/pricing/resolve-price-list-entry';
import { roundTo } from 'src/pricing/round';

export type DemandItem = {
  name: string | null;
  designId: string | null;
  metal: string | null;
  metalSize: string | null;
  areaSquareMeters: number | null;
  quantity: number | null;
};

export type DemandExtraServiceLine = {
  extraServiceId: string | null;
  quantity: number | null;
};

export type DemandPriceListRow = {
  id: string;
  name: string | null;
  designId: string | null;
  metal: string | null;
  metalSize: string | null;
};

export type DemandNorm = {
  priceListItemId: string | null;
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

// A norm belongs to exactly one price list row or one extra service; anything else is ignored.
const groupValidNorms = (
  norms: DemandNorm[],
  owner: 'priceListItemId' | 'extraServiceId',
) => {
  const other =
    owner === 'priceListItemId' ? 'extraServiceId' : 'priceListItemId';
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
  priceList,
  norms,
}: {
  items: DemandItem[];
  extraServiceLines: DemandExtraServiceLine[];
  priceList: DemandPriceListRow[];
  norms: DemandNorm[];
}): OrderMaterialDemand => {
  const normsByRow = groupValidNorms(norms, 'priceListItemId');
  const normsByService = groupValidNorms(norms, 'extraServiceId');
  const totals = new Map<string, number>();
  const missing = new Set<string>();

  const add = (rowNorms: ValidNorm[], units: number) => {
    for (const { materialId, quantityPerUnit } of rowNorms) {
      totals.set(
        materialId,
        (totals.get(materialId) ?? 0) + units * quantityPerUnit,
      );
    }
  };

  for (const item of items) {
    if (item.areaSquareMeters === null) continue;

    const row = resolvePriceListEntry(priceList, item);

    if (row === null) {
      missing.add(`Нет строки прайса: ${item.name ?? 'позиция'}`);
      continue;
    }

    const rowNorms = normsByRow.get(row.id) ?? [];

    if (rowNorms.length === 0) {
      missing.add(`Нет нормы: ${row.name ?? 'строка прайса'}`);
      continue;
    }

    add(rowNorms, item.areaSquareMeters * (item.quantity ?? 1));
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
    missingNorms: missing.size > 0 ? [...missing].join('; ') : null,
  };
};
