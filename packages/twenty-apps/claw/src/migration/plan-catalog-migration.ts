import { METAL_OPTIONS } from 'src/constants/select-options';
import { resolvePriceListEntry } from 'src/pricing/resolve-price-list-entry';
import { deterministicUuid } from 'src/utils/deterministic-uuid';

export type MigrationPriceRow = {
  id: string;
  name: string | null;
  designId: string | null;
  metal: string | null;
  metalSize: string | null;
  pricePerSquareMeter: number | null;
  materialCost: number | null;
  manufacturingCost: number | null;
  installationCost: number | null;
};

export type GrilleNumbers = Pick<
  MigrationPriceRow,
  | 'metal'
  | 'pricePerSquareMeter'
  | 'materialCost'
  | 'manufacturingCost'
  | 'installationCost'
>;

export type CatalogMigrationInput = {
  designs: { id: string; name: string | null }[];
  priceRows: MigrationPriceRow[];
  items: {
    id: string;
    designId: string | null;
    metal: string | null;
    metalSize: string | null;
  }[];
  norms: { id: string; priceListItemId: string | null }[];
  services: { id: string; name: string | null }[];
};

export type CatalogMigrationPlan = {
  designUpdates: { id: string; numbers: GrilleNumbers }[];
  designCreates: { id: string; name: string; numbers: GrilleNumbers }[];
  itemRepoints: { itemId: string; designId: string }[];
  normRepoints: { normId: string; designId: string }[];
  visorServiceIds: string[];
};

const DEFAULT_METAL = 'PROFILE';

const metalLabel = (metal: string) =>
  METAL_OPTIONS.find((option) => option.value === metal)?.label ?? metal;

const numbersOf = (
  row: MigrationPriceRow | null,
  metal: string,
): GrilleNumbers => ({
  metal,
  pricePerSquareMeter: row?.pricePerSquareMeter ?? null,
  materialCost: row?.materialCost ?? null,
  manufacturingCost: row?.manufacturingCost ?? null,
  installationCost: row?.installationCost ?? null,
});

const mostUsed = (values: string[]): string | null => {
  const counts = new Map<string, number>();

  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
};

export const planCatalogMigration = ({
  designs,
  priceRows,
  items,
  norms,
  services,
}: CatalogMigrationInput): CatalogMigrationPlan => {
  // The rule the app used until now; the migration freezes its answers into rows.
  const resolve = (designId: string | null, metal: string) =>
    resolvePriceListEntry(priceRows, { designId, metal, metalSize: null });

  const mainMetalByDesignId = new Map(
    designs.map((design) => {
      const ownRowMetals = priceRows.flatMap((row) =>
        row.designId === design.id && row.metal !== null ? [row.metal] : [],
      );
      const itemMetals = items.flatMap((item) =>
        item.designId === design.id && item.metal !== null ? [item.metal] : [],
      );

      return [
        design.id,
        mostUsed(ownRowMetals) ?? mostUsed(itemMetals) ?? DEFAULT_METAL,
      ];
    }),
  );

  const designUpdates = designs.map((design) => {
    const metal = mainMetalByDesignId.get(design.id) ?? DEFAULT_METAL;

    return {
      id: design.id,
      numbers: numbersOf(resolve(design.id, metal), metal),
    };
  });

  const designCreates = new Map<
    string,
    { id: string; name: string; numbers: GrilleNumbers }
  >();
  const ensureGrille = (key: string, name: string, numbers: GrilleNumbers) => {
    const existing = designCreates.get(key);

    if (existing !== undefined) return existing.id;

    const id = deterministicUuid(`grille:${key}`);

    designCreates.set(key, { id, name, numbers });

    return id;
  };

  const genericRowIdToGrilleId = new Map<string, string>();

  for (const row of priceRows) {
    if (row.designId !== null || row.metal === null) continue;

    genericRowIdToGrilleId.set(
      row.id,
      ensureGrille(
        `generic:${row.metal}`,
        row.name ?? metalLabel(row.metal),
        numbersOf(row, row.metal),
      ),
    );
  }

  const designNameById = new Map(
    designs.map((design) => [design.id, design.name]),
  );
  const itemRepoints: { itemId: string; designId: string }[] = [];

  for (const item of items) {
    if (item.metal === null) continue;

    if (item.designId === null) {
      const generic = resolve(null, item.metal);

      itemRepoints.push({
        itemId: item.id,
        designId: ensureGrille(
          `generic:${item.metal}`,
          generic?.name ?? metalLabel(item.metal),
          numbersOf(generic, item.metal),
        ),
      });
      continue;
    }

    if (mainMetalByDesignId.get(item.designId) === item.metal) continue;

    itemRepoints.push({
      itemId: item.id,
      designId: ensureGrille(
        `variant:${item.designId}:${item.metal}`,
        `${designNameById.get(item.designId) ?? ''} · ${metalLabel(item.metal)}`,
        numbersOf(resolve(item.designId, item.metal), item.metal),
      ),
    });
  }

  const rowById = new Map(priceRows.map((row) => [row.id, row]));

  return {
    designUpdates,
    designCreates: [...designCreates.values()],
    itemRepoints,
    normRepoints: norms.flatMap((norm) => {
      const row =
        norm.priceListItemId === null
          ? undefined
          : rowById.get(norm.priceListItemId);
      const designId =
        row?.designId ?? genericRowIdToGrilleId.get(row?.id ?? '');

      return designId === undefined ? [] : [{ normId: norm.id, designId }];
    }),
    visorServiceIds: services
      .filter((service) => (service.name ?? '').toLowerCase().includes('козыр'))
      .map((service) => service.id),
  };
};
