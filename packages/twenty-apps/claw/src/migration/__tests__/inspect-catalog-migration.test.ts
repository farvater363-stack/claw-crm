import { describe, expect, it } from 'vitest';

import {
  diffSnapshots,
  filledFromGrille,
  grilleData,
  positionsFilledAtRecalc,
  priceRowsNotCarriedOver,
  priceWriteBacks,
  withoutAppliedWrites,
} from 'src/migration/inspect-catalog-migration';
import { type MigrationPriceRow } from 'src/migration/plan-catalog-migration';

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

describe('priceRowsNotCarriedOver', () => {
  it('returns nothing when every row is the only one of its grille or metal', () => {
    expect(
      priceRowsNotCarriedOver([
        row({ id: 'a', designId: 'wave' }),
        row({ id: 'b' }),
        row({ id: 'c', metal: 'REBAR' }),
      ]),
    ).toEqual([]);
  });

  it('reports sized rows, repeated rows and rows that name nothing', () => {
    const rows = [
      row({ id: 'a', designId: 'wave' }),
      row({ id: 'b', designId: 'wave', metal: 'REBAR' }),
      row({ id: 'c' }),
      row({ id: 'd' }),
      row({ id: 'e', metal: 'ROD', metalSize: 'SIZE_8' }),
      row({ id: 'f', metal: null }),
    ];

    expect(
      priceRowsNotCarriedOver(rows).map(({ row: { id }, reasons }) => ({
        id,
        reasons,
      })),
    ).toEqual([
      { id: 'b', reasons: ['another row of the same grille'] },
      { id: 'd', reasons: ['another generic row of the same metal'] },
      { id: 'e', reasons: ['has a size'] },
      { id: 'f', reasons: ['no grille and no metal'] },
    ]);
  });

  it('gives a sized repeat both reasons', () => {
    expect(
      priceRowsNotCarriedOver([
        row({ id: 'a' }),
        row({ id: 'b', metalSize: 'SIZE_10' }),
      ])[0].reasons,
    ).toEqual(['has a size', 'another generic row of the same metal']);
  });
});

describe('positionsFilledAtRecalc', () => {
  const item = (
    id: string,
    designId: string | null,
    pricePerSquareMeter: number | null,
    costPerSquareMeter: number | null = 40,
  ) => ({ id, designId, pricePerSquareMeter, costPerSquareMeter });

  it('keeps positions with an empty price or cost that have a grille after the plan', () => {
    expect(
      positionsFilledAtRecalc(
        [
          item('priced', 'wave', 500),
          item('own-grille', 'wave', null),
          item('gains-grille', null, null, null),
          item('repointed', 'wave', null),
          item('no-grille', null, null),
          item('zero-price', 'wave', 0),
          item('cost-only', 'wave', 500, null),
          item('cost-only-no-grille', null, 500, null),
          item('zero-cost', 'wave', 500, 0),
        ],
        [
          { itemId: 'gains-grille', designId: 'generic' },
          { itemId: 'repointed', designId: 'variant' },
        ],
      ),
    ).toEqual({
      withEmptyPrice: [
        { ...item('own-grille', 'wave', null), grilleId: 'wave' },
        { ...item('gains-grille', null, null, null), grilleId: 'generic' },
        { ...item('repointed', 'wave', null), grilleId: 'variant' },
      ],
      withEmptyCostOnly: [
        { ...item('cost-only', 'wave', 500, null), grilleId: 'wave' },
      ],
    });
  });
});

describe('diffSnapshots', () => {
  it('reports each field that changed and nothing else', () => {
    expect(
      diffSnapshots(
        [
          { id: 'same', price: 100, cost: null },
          { id: 'moved', price: 100, cost: 40 },
        ],
        [
          { id: 'moved', price: 120, cost: 40 },
          { id: 'same', price: 100, cost: null },
          { id: 'new', price: 1, cost: 1 },
        ],
        ['price', 'cost'],
      ),
    ).toEqual([{ id: 'moved', field: 'price', before: 100, after: 120 }]);
  });

  it('treats empty and zero as different values', () => {
    expect(
      diffSnapshots(
        [
          { id: 'filled', price: null },
          { id: 'emptied', price: 0 },
        ],
        [
          { id: 'filled', price: 0 },
          { id: 'emptied', price: null },
        ],
        ['price'],
      ),
    ).toEqual([
      { id: 'filled', field: 'price', before: null, after: 0 },
      { id: 'emptied', field: 'price', before: 0, after: null },
    ]);
  });

  it('reads a record that is gone as empty', () => {
    expect(
      diffSnapshots(
        [{ id: 'gone', price: 100, cost: null }],
        [],
        ['price', 'cost'],
      ),
    ).toEqual([{ id: 'gone', field: 'price', before: 100, after: null }]);
  });
});

describe('filledFromGrille', () => {
  const items = [
    { id: 'empty-filled', orderId: 'order-a', pricePerSquareMeter: null },
    { id: 'empty-untouched', orderId: 'order-b', pricePerSquareMeter: null },
    { id: 'priced-moved', orderId: 'order-c', pricePerSquareMeter: 100 },
    { id: 'empty-no-order', orderId: null, pricePerSquareMeter: null },
  ];

  it('names only positions whose price was empty and that changed, with their orders', () => {
    const { itemIds, orderIds } = filledFromGrille(items, [
      { id: 'empty-filled', field: 'lineTotal', before: null, after: 900 },
      { id: 'priced-moved', field: 'lineTotal', before: 500, after: 900 },
      { id: 'empty-no-order', field: 'lineTotal', before: null, after: 900 },
    ]);

    expect([...itemIds]).toEqual(['empty-filled', 'empty-no-order']);
    expect([...orderIds]).toEqual(['order-a']);
  });
});

describe('priceWriteBacks', () => {
  const difference = (id: string, field: string) => ({
    id,
    field,
    before: null,
    after: 1,
  });

  it('writes back only the snapshot values that moved and are not empty', () => {
    expect(
      priceWriteBacks(
        [
          { id: 'both', pricePerSquareMeter: 100, costPerSquareMeter: 40 },
          { id: 'price', pricePerSquareMeter: 100, costPerSquareMeter: 40 },
          { id: 'zero', pricePerSquareMeter: 0, costPerSquareMeter: 40 },
          { id: 'same', pricePerSquareMeter: 100, costPerSquareMeter: 40 },
          { id: 'total', pricePerSquareMeter: 100, costPerSquareMeter: 40 },
        ],
        [
          difference('both', 'pricePerSquareMeter'),
          difference('both', 'costPerSquareMeter'),
          difference('price', 'pricePerSquareMeter'),
          difference('zero', 'pricePerSquareMeter'),
          difference('total', 'lineTotal'),
        ],
      ),
    ).toEqual([
      {
        id: 'both',
        values: { pricePerSquareMeter: 100, costPerSquareMeter: 40 },
      },
      { id: 'price', values: { pricePerSquareMeter: 100 } },
      { id: 'zero', values: { pricePerSquareMeter: 0 } },
    ]);
  });

  it('never writes to a position whose price was empty, nor an empty cost', () => {
    expect(
      priceWriteBacks(
        [
          { id: 'empty', pricePerSquareMeter: null, costPerSquareMeter: 40 },
          { id: 'no-cost', pricePerSquareMeter: 100, costPerSquareMeter: null },
        ],
        [
          difference('empty', 'pricePerSquareMeter'),
          difference('empty', 'costPerSquareMeter'),
          difference('no-cost', 'costPerSquareMeter'),
        ],
      ),
    ).toEqual([]);
  });
});

describe('withoutAppliedWrites', () => {
  const numbers = {
    metal: 'PROFILE',
    pricePerSquareMeter: 300,
    materialCost: null,
    manufacturingCost: null,
    installationCost: null,
  };
  const plan = {
    designUpdates: [{ id: 'wave', numbers }],
    designCreates: [
      { id: 'present', name: 'Present', numbers },
      { id: 'missing', name: 'Missing', numbers },
    ],
    itemRepoints: [
      { itemId: 'moved', designId: 'present' },
      { itemId: 'elsewhere', designId: 'present' },
      { itemId: 'pending', designId: 'missing' },
    ],
    normRepoints: [
      { normId: 'attached', designId: 'present' },
      { normId: 'reattached', designId: 'present' },
      { normId: 'loose', designId: 'present' },
    ],
    visorServiceIds: ['visor', 'service', 'unset'],
  };

  it('drops every write the loaded records already hold', () => {
    expect(
      withoutAppliedWrites(plan, {
        designs: [{ id: 'wave' }, { id: 'present' }],
        items: [
          { id: 'moved', designId: 'present' },
          { id: 'elsewhere', designId: 'wave' },
          { id: 'pending', designId: null },
        ],
        norms: [
          { id: 'attached', designId: 'present' },
          { id: 'reattached', designId: 'wave' },
          { id: 'loose', designId: null },
        ],
        services: [
          { id: 'visor', kind: 'VISOR' },
          { id: 'service', kind: 'SERVICE' },
          { id: 'unset', kind: null },
        ],
      }),
    ).toEqual({
      designUpdates: plan.designUpdates,
      designCreates: [plan.designCreates[1]],
      itemRepoints: [plan.itemRepoints[1], plan.itemRepoints[2]],
      normRepoints: [plan.normRepoints[2]],
      visorServiceIds: ['service', 'unset'],
    });
  });
});

describe('grilleData', () => {
  it('writes the metal and every number the plan has', () => {
    expect(
      grilleData({
        metal: 'PROFILE',
        pricePerSquareMeter: 300,
        materialCost: 10,
        manufacturingCost: null,
        installationCost: 0,
      }),
    ).toEqual({
      metal: 'PROFILE',
      pricePerSquareMeter: { amountMicros: 300_000_000, currencyCode: 'UZS' },
      materialCostPerSquareMeter: {
        amountMicros: 10_000_000,
        currencyCode: 'UZS',
      },
      installationCostPerSquareMeter: { amountMicros: 0, currencyCode: 'UZS' },
    });
  });
});
