import {
  type CatalogMigrationPlan,
  type GrilleNumbers,
  type MigrationPriceRow,
} from 'src/migration/plan-catalog-migration';
import { toCurrency } from 'src/recalc/money';

export type SnapshotDifference = {
  id: string;
  field: string;
  before: number | null;
  after: number | null;
};

// The planner gives a grille or a metal the numbers of one row, so every
// further row, and every row with a size, has no exact place in the new catalog.
export const priceRowsNotCarriedOver = (
  priceRows: MigrationPriceRow[],
): { row: MigrationPriceRow; reasons: string[] }[] => {
  const seenGrilleIds = new Set<string>();
  const seenGenericMetals = new Set<string>();

  return priceRows.flatMap((row) => {
    const reasons: string[] = [];

    if (row.metalSize !== null) reasons.push('has a size');

    if (row.designId !== null) {
      if (seenGrilleIds.has(row.designId)) {
        reasons.push('another row of the same grille');
      }
      seenGrilleIds.add(row.designId);
    } else if (row.metal !== null) {
      if (seenGenericMetals.has(row.metal)) {
        reasons.push('another generic row of the same metal');
      }
      seenGenericMetals.add(row.metal);
    } else {
      reasons.push('no grille and no metal');
    }

    return reasons.length > 0 ? [{ row, reasons }] : [];
  });
};

// The recalc fills an empty price or cost from the position's grille, so these
// positions change the next time their order recalculates.
export const positionsFilledAtRecalc = <
  TItem extends {
    id: string;
    designId: string | null;
    pricePerSquareMeter: number | null;
    costPerSquareMeter: number | null;
  },
>(
  items: TItem[],
  itemRepoints: CatalogMigrationPlan['itemRepoints'],
): {
  withEmptyPrice: (TItem & { grilleId: string })[];
  withEmptyCostOnly: (TItem & { grilleId: string })[];
} => {
  const repointedGrilleIdByItemId = new Map(
    itemRepoints.map(({ itemId, designId }) => [itemId, designId]),
  );
  const onGrille = items.flatMap((item) => {
    const grilleId = repointedGrilleIdByItemId.get(item.id) ?? item.designId;

    return grilleId === null ? [] : [{ ...item, grilleId }];
  });

  return {
    withEmptyPrice: onGrille.filter(
      (item) => item.pricePerSquareMeter === null,
    ),
    withEmptyCostOnly: onGrille.filter(
      (item) =>
        item.pricePerSquareMeter !== null && item.costPerSquareMeter === null,
    ),
  };
};

export const diffSnapshots = <TField extends string>(
  before: ({ id: string } & Record<TField, number | null>)[],
  after: ({ id: string } & Record<TField, number | null>)[],
  fields: readonly TField[],
): SnapshotDifference[] => {
  const afterById = new Map(after.map((record) => [record.id, record]));

  return before.flatMap((record) =>
    fields.flatMap((field) => {
      // A record that is gone reads as empty, so money it held shows as a difference.
      const afterValue = afterById.get(record.id)?.[field] ?? null;

      return record[field] === afterValue
        ? []
        : [{ id: record.id, field, before: record[field], after: afterValue }];
    }),
  );
};

// A position whose price was empty is left out, and so is an empty value:
// the recalc fills an empty price or cost again, so writing one back does not hold.
export const priceWriteBacks = (
  items: {
    id: string;
    pricePerSquareMeter: number | null;
    costPerSquareMeter: number | null;
  }[],
  itemDifferences: SnapshotDifference[],
): {
  id: string;
  values: { pricePerSquareMeter?: number; costPerSquareMeter?: number };
}[] =>
  items.flatMap((item) => {
    if (item.pricePerSquareMeter === null) return [];

    const values = Object.fromEntries(
      (['pricePerSquareMeter', 'costPerSquareMeter'] as const).flatMap(
        (field) =>
          item[field] !== null &&
          itemDifferences.some(
            (difference) =>
              difference.id === item.id && difference.field === field,
          )
            ? [[field, item[field]]]
            : [],
      ),
    );

    return Object.keys(values).length > 0 ? [{ id: item.id, values }] : [];
  });

export const filledFromGrille = (
  items: {
    id: string;
    orderId: string | null;
    pricePerSquareMeter: number | null;
  }[],
  itemDifferences: SnapshotDifference[],
): { itemIds: Set<string>; orderIds: Set<string> } => {
  const changedItemIds = new Set(itemDifferences.map(({ id }) => id));
  const filledItems = items.filter(
    (item) => item.pricePerSquareMeter === null && changedItemIds.has(item.id),
  );

  return {
    itemIds: new Set(filledItems.map(({ id }) => id)),
    orderIds: new Set(
      filledItems.flatMap(({ orderId }) => (orderId === null ? [] : [orderId])),
    ),
  };
};

// The planner cannot see what an earlier run wrote, so it plans these again;
// writing them twice would undo what the owner changed after the first run.
export const withoutAppliedWrites = (
  plan: CatalogMigrationPlan,
  loaded: {
    designs: { id: string }[];
    items: { id: string; designId: string | null }[];
    norms: { id: string; designId: string | null }[];
    services: { id: string; kind: string | null }[];
  },
): CatalogMigrationPlan => {
  const designIds = new Set(loaded.designs.map(({ id }) => id));
  const grilleIdByItemId = new Map(
    loaded.items.map(({ id, designId }) => [id, designId]),
  );
  const normIdsOnGrille = new Set(
    loaded.norms.flatMap(({ id, designId }) => (designId === null ? [] : [id])),
  );
  const visorServiceIds = new Set(
    loaded.services.flatMap(({ id, kind }) => (kind === 'VISOR' ? [id] : [])),
  );

  return {
    designUpdates: plan.designUpdates,
    designCreates: plan.designCreates.filter(({ id }) => !designIds.has(id)),
    itemRepoints: plan.itemRepoints.filter(
      ({ itemId, designId }) => grilleIdByItemId.get(itemId) !== designId,
    ),
    normRepoints: plan.normRepoints.filter(
      ({ normId }) => !normIdsOnGrille.has(normId),
    ),
    visorServiceIds: plan.visorServiceIds.filter(
      (id) => !visorServiceIds.has(id),
    ),
  };
};

const GRILLE_MONEY_FIELDS = [
  ['pricePerSquareMeter', 'pricePerSquareMeter'],
  ['materialCost', 'materialCostPerSquareMeter'],
  ['manufacturingCost', 'manufacturingCostPerSquareMeter'],
  ['installationCost', 'installationCostPerSquareMeter'],
] as const;

// An empty number in the plan means the price list had nothing for the grille,
// so it is never written: it must not erase a value somebody typed on the grille.
export const grilleData = (
  numbers: GrilleNumbers,
): Record<string, unknown> => ({
  metal: numbers.metal,
  ...Object.fromEntries(
    GRILLE_MONEY_FIELDS.flatMap(([planField, recordField]) =>
      numbers[planField] === null
        ? []
        : [[recordField, toCurrency(numbers[planField])]],
    ),
  ),
});
