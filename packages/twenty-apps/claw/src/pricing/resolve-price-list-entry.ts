export type PriceListEntry = {
  designId: string | null;
  metal: string | null;
  metalSize: string | null;
  pricePerSquareMeter: number | null;
  costPerSquareMeter: number | null;
};

// An empty design or size on a price list row means "any"; the most specific match wins.
export const resolvePriceListEntry = (
  entries: PriceListEntry[],
  item: { designId: string | null; metal: string | null; metalSize: string | null },
): PriceListEntry | null => {
  let bestEntry: PriceListEntry | null = null;
  let bestScore = -1;

  for (const entry of entries) {
    if (entry.metal !== item.metal) continue;
    if (entry.designId !== null && entry.designId !== item.designId) continue;
    if (entry.metalSize !== null && entry.metalSize !== item.metalSize) continue;

    const score =
      (entry.designId !== null ? 2 : 0) + (entry.metalSize !== null ? 1 : 0);

    if (score > bestScore) {
      bestEntry = entry;
      bestScore = score;
    }
  }

  return bestEntry;
};
