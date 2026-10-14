import { type Product } from 'src/constants/select-options';
import { matchesSearch, sortByName } from 'src/measurer-form/option-search';
import { formatMoney } from 'src/ui/format';

export type CatalogDesign = {
  id: string;
  name: string;
  product: Product;
  kindName: string | null;
  photoUrls: string[];
};

export const ALL_KINDS = '';

export type CatalogFilter = {
  product: Product;
  kind: string;
  query: string;
};

export const filterCatalog = (
  designs: CatalogDesign[],
  { product, kind, query }: CatalogFilter,
): CatalogDesign[] =>
  sortByName(
    designs.filter(
      (design) =>
        design.product === product &&
        (kind === ALL_KINDS || design.kindName === kind) &&
        matchesSearch(query, [design.name, design.kindName]),
    ),
  );

export const kindsOf = (
  designs: CatalogDesign[],
  product: Product,
): { kind: string; count: number }[] => {
  const counts = new Map<string, number>();

  for (const design of designs) {
    if (design.product === product && design.kindName !== null) {
      counts.set(design.kindName, (counts.get(design.kindName) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([kind, count]) => ({ kind, count }))
    .sort((left, right) => left.kind.localeCompare(right.kind, 'ru'));
};

export const priceText = (price: number | null, product: Product): string =>
  price === null
    ? 'без цены'
    : `${formatMoney(price)} за ${product === 'RAILING' ? 'п.м.' : 'м²'}`;
