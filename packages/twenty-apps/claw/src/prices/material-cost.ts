export type PricedMaterial = {
  id: string;
  averagePrice: number | null;
  lastPurchasePrice: number | null;
};

export type CostNorm = {
  designId: string | null;
  extraServiceId: string | null;
  orderId?: string | null;
  materialId: string | null;
  quantityPerUnit: number | null;
};

// The average of what lies on the shelf; a material bought before the average
// was kept has only its last price.
export const materialUnitPrice = (
  material: Pick<PricedMaterial, 'averagePrice' | 'lastPurchasePrice'>,
): number | null => material.averagePrice ?? material.lastPurchasePrice;

// Material cost of one unit of a grille or a service. Null until at least one
// line has a purchase price; `isComplete` is false while any line lacks one.
export const computeMaterialCost = (
  lines: { quantity: number; unitPrice: number | null }[],
): { cost: number | null; isComplete: boolean } => {
  const priced = lines.flatMap(({ quantity, unitPrice }) =>
    unitPrice === null ? [] : [quantity * unitPrice],
  );

  return {
    cost:
      priced.length === 0
        ? null
        : Math.round(priced.reduce((sum, value) => sum + value, 0)),
    isComplete: priced.length === lines.length,
  };
};

const COST_OWNERS = ['designId', 'extraServiceId', 'orderId'] as const;

// A row of one grille, service or order only: one with two owners counts for
// neither, as in the order's material demand.
export const materialCostByOwner = (
  owner: (typeof COST_OWNERS)[number],
  norms: CostNorm[],
  materials: PricedMaterial[],
): Map<string, number | null> => {
  const priceById = new Map(
    materials.map((material) => [material.id, materialUnitPrice(material)]),
  );
  const linesByOwner = new Map<
    string,
    { quantity: number; unitPrice: number | null }[]
  >();

  for (const norm of norms) {
    const ownerId = norm[owner] ?? null;

    if (
      ownerId === null ||
      COST_OWNERS.some(
        (other) => other !== owner && (norm[other] ?? null) !== null,
      ) ||
      norm.materialId === null ||
      norm.quantityPerUnit === null ||
      !priceById.has(norm.materialId)
    ) {
      continue;
    }

    linesByOwner.set(ownerId, [
      ...(linesByOwner.get(ownerId) ?? []),
      {
        quantity: norm.quantityPerUnit,
        unitPrice: priceById.get(norm.materialId) ?? null,
      },
    ]);
  }

  return new Map(
    [...linesByOwner].map(([ownerId, lines]) => [
      ownerId,
      computeMaterialCost(lines).cost,
    ]),
  );
};
