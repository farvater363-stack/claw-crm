import { describe, expect, it } from 'vitest';

import {
  type CatalogDesign,
  filterCatalog,
  kindsOf,
  priceText,
} from 'src/catalog/catalog-filter';
import { formatMoney } from 'src/ui/format';

const design = (
  id: string,
  name: string,
  product: CatalogDesign['product'],
  kindName: string | null,
): CatalogDesign => ({ id, name, product, kindName, photoUrls: [] });

const designs = [
  design('plain', 'Без вида', 'GRILLE', null),
  design('rhomb', 'Ромб', 'GRILLE', 'Профиль'),
  design('wave', 'Волна', 'GRILLE', 'Ковка'),
  design('tree', 'Ёлочка', 'GRILLE', 'Профиль'),
  design('rail', 'Прямые', 'RAILING', 'Профиль'),
];

const ids = (found: CatalogDesign[]) => found.map(({ id }) => id);

describe('filterCatalog', () => {
  it('shows one product at a time, by name', () => {
    expect(
      ids(filterCatalog(designs, { product: 'GRILLE', kind: '', query: '' })),
    ).toEqual(['plain', 'wave', 'tree', 'rhomb']);
    expect(
      ids(filterCatalog(designs, { product: 'RAILING', kind: '', query: '' })),
    ).toEqual(['rail']);
  });

  it('narrows to a kind and to what is typed', () => {
    expect(
      ids(
        filterCatalog(designs, {
          product: 'GRILLE',
          kind: 'Профиль',
          query: '',
        }),
      ),
    ).toEqual(['tree', 'rhomb']);
    expect(
      ids(
        filterCatalog(designs, { product: 'GRILLE', kind: '', query: 'елоч' }),
      ),
    ).toEqual(['tree']);
    expect(
      ids(
        filterCatalog(designs, {
          product: 'GRILLE',
          kind: 'Профиль',
          query: 'ромб',
        }),
      ),
    ).toEqual(['rhomb']);
  });

  it('finds a design without a kind by its name', () => {
    expect(
      ids(
        filterCatalog(designs, { product: 'GRILLE', kind: '', query: 'вида' }),
      ),
    ).toEqual(['plain']);
  });

  it('finds nothing for a kind only the other product has', () => {
    expect(
      filterCatalog(designs, { product: 'RAILING', kind: 'Ковка', query: '' }),
    ).toEqual([]);
  });
});

describe('kindsOf', () => {
  it('lists the kinds of one product with how many each has', () => {
    expect(kindsOf(designs, 'GRILLE')).toEqual([
      { kind: 'Ковка', count: 1 },
      { kind: 'Профиль', count: 2 },
    ]);
  });
});

describe('priceText', () => {
  it('prices a grille per square metre and a railing per running metre', () => {
    expect(priceText(120000, 'GRILLE')).toBe(`${formatMoney(120000)} за м²`);
    expect(priceText(80000, 'RAILING')).toBe(`${formatMoney(80000)} за п.м.`);
  });

  it('says when there is no price', () => {
    expect(priceText(null, 'GRILLE')).toBe('без цены');
  });
});
