import { describe, expect, it } from 'vitest';

import {
  type CatalogMigrationInput,
  type MigrationPriceRow,
  planCatalogMigration,
} from 'src/migration/plan-catalog-migration';

const row = (overrides: Partial<MigrationPriceRow>): MigrationPriceRow => ({
  id: 'row',
  name: null,
  designId: null,
  metal: 'PROFILE',
  metalSize: null,
  pricePerSquareMeter: 100,
  materialCost: 10,
  manufacturingCost: 20,
  installationCost: 30,
  ...overrides,
});

const base: CatalogMigrationInput = {
  designs: [
    { id: 'wave', name: 'Волна' },
    { id: 'rail', name: 'Рельс' },
  ],
  priceRows: [
    row({
      id: 'row-wave',
      name: 'Волна',
      designId: 'wave',
      pricePerSquareMeter: 300,
    }),
    row({ id: 'row-profile', name: 'Профиль', pricePerSquareMeter: 100 }),
    row({
      id: 'row-rebar',
      name: 'Арматура',
      metal: 'REBAR',
      pricePerSquareMeter: 200,
    }),
  ],
  items: [],
  norms: [],
  services: [],
};

describe('planCatalogMigration', () => {
  it('copies a design row onto its design', () => {
    const plan = planCatalogMigration(base);

    expect(plan.designUpdates).toContainEqual({
      id: 'wave',
      numbers: {
        metal: 'PROFILE',
        pricePerSquareMeter: 300,
        materialCost: 10,
        manufacturingCost: 20,
        installationCost: 30,
      },
    });
  });

  it('turns each generic row into a grille named after it', () => {
    const plan = planCatalogMigration(base);

    expect(plan.designCreates.map((grille) => grille.name).sort()).toEqual([
      'Арматура',
      'Профиль',
    ]);
  });

  it('gives a design without its own row the generic numbers of its main metal', () => {
    const plan = planCatalogMigration({
      ...base,
      items: [{ id: 'i1', designId: 'rail', metal: 'REBAR', metalSize: null }],
    });

    expect(
      plan.designUpdates.find((update) => update.id === 'rail')?.numbers,
    ).toMatchObject({ metal: 'REBAR', pricePerSquareMeter: 200 });
  });

  it('creates a variant for a design used in another metal and repoints the item', () => {
    const plan = planCatalogMigration({
      ...base,
      items: [{ id: 'i1', designId: 'wave', metal: 'REBAR', metalSize: null }],
    });
    const variant = plan.designCreates.find(
      (grille) => grille.name === 'Волна · Арматура',
    );

    expect(variant?.numbers).toMatchObject({
      metal: 'REBAR',
      pricePerSquareMeter: 200,
    });
    expect(plan.itemRepoints).toEqual([
      { itemId: 'i1', designId: variant?.id },
    ]);
  });

  it('points an item without a design to the generic grille of its metal', () => {
    const plan = planCatalogMigration({
      ...base,
      items: [{ id: 'i1', designId: null, metal: 'PROFILE', metalSize: null }],
    });
    const generic = plan.designCreates.find(
      (grille) => grille.name === 'Профиль',
    );

    expect(plan.itemRepoints).toEqual([
      { itemId: 'i1', designId: generic?.id },
    ]);
  });

  it('leaves an item on its design when the metal is the main one, and one with neither', () => {
    const plan = planCatalogMigration({
      ...base,
      items: [
        { id: 'i1', designId: 'wave', metal: 'PROFILE', metalSize: null },
        { id: 'i2', designId: null, metal: null, metalSize: null },
      ],
    });

    expect(plan.itemRepoints).toEqual([]);
  });

  it('repoints norms from a price row to the grille that replaced it', () => {
    const plan = planCatalogMigration({
      ...base,
      norms: [
        { id: 'n1', priceListItemId: 'row-wave' },
        { id: 'n2', priceListItemId: 'row-profile' },
      ],
    });
    const generic = plan.designCreates.find(
      (grille) => grille.name === 'Профиль',
    );

    expect(plan.normRepoints).toEqual([
      { normId: 'n1', designId: 'wave' },
      { normId: 'n2', designId: generic?.id },
    ]);
  });

  it('marks services named like visors', () => {
    const plan = planCatalogMigration({
      ...base,
      services: [
        { id: 's1', name: 'Козырёк пластик 50' },
        { id: 's2', name: 'Доставка' },
      ],
    });

    expect(plan.visorServiceIds).toEqual(['s1']);
  });

  it('is stable: the same input gives the same created ids', () => {
    expect(planCatalogMigration(base).designCreates).toEqual(
      planCatalogMigration(base).designCreates,
    );
  });
});
