import { type CoreApiClient } from 'twenty-client-sdk/core';

import { toProduct } from 'src/constants/select-options';
import { fromCurrency } from 'src/recalc/money';
import {
  type WorkshopCatalog,
  type WorkshopRate,
} from 'src/payroll/workshop-pay';
import { PAGE_INFO, withRemainingPages } from 'src/utils/fetch-all-pages';

const PAGE_SIZE = 200;

export const WORKSHOP_CATALOG_QUERY = {
  workshopRates: {
    __args: { first: PAGE_SIZE },
    edges: {
      node: {
        id: true,
        grilleKindId: true,
        designId: true,
        workerId: true,
        rate: { amountMicros: true },
      },
    },
    pageInfo: PAGE_INFO,
  },
  designs: {
    __args: { first: PAGE_SIZE },
    edges: {
      node: { id: true, name: true, grilleKindId: true, product: true },
    },
    pageInfo: PAGE_INFO,
  },
  grilleKinds: {
    __args: { first: PAGE_SIZE },
    edges: { node: { id: true, name: true } },
    pageInfo: PAGE_INFO,
  },
} as const;

type CatalogPage<TNode> =
  | {
      edges: { node: TNode }[];
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    }
  | null
  | undefined;

// A recalc reads the first page of the catalog with the rest of the order; a
// rate past it must still count, or the master is paid by the wrong row.
export const readWorkshopCatalog = async (
  client: CoreApiClient,
  firstPages: {
    workshopRates: CatalogPage<WorkshopRateNode>;
    designs: CatalogPage<CatalogDesignNode>;
    grilleKinds: CatalogPage<{ id: string; name?: string | null }>;
  },
): Promise<WorkshopCatalog> => {
  const { workshopRates, designs, grilleKinds } = WORKSHOP_CATALOG_QUERY;
  const [allRates, allDesigns, allKinds] = await Promise.all([
    withRemainingPages(firstPages.workshopRates, async (after) => {
      const { workshopRates: page } = await client.query({
        workshopRates: {
          ...workshopRates,
          __args: { first: PAGE_SIZE, after },
        },
      });

      return page;
    }),
    withRemainingPages(firstPages.designs, async (after) => {
      const { designs: page } = await client.query({
        designs: { ...designs, __args: { first: PAGE_SIZE, after } },
      });

      return page;
    }),
    withRemainingPages(firstPages.grilleKinds, async (after) => {
      const { grilleKinds: page } = await client.query({
        grilleKinds: { ...grilleKinds, __args: { first: PAGE_SIZE, after } },
      });

      return page;
    }),
  ]);

  return toWorkshopCatalog({
    workshopRates: allRates,
    designs: allDesigns,
    grilleKinds: allKinds,
  });
};

type Money = { amountMicros?: number | string | null } | null;
type Page<TNode> = { edges: { node: TNode }[] } | null | undefined;

export type WorkshopRateNode = {
  id: string;
  grilleKindId?: string | null;
  designId?: string | null;
  workerId?: string | null;
  rate?: Money;
};

// A rate with no sum pays nothing, so it is left out and the next row decides.
export const toWorkshopRates = (nodes: WorkshopRateNode[]): WorkshopRate[] =>
  nodes.flatMap((node) => {
    const rate = fromCurrency(node.rate ?? null);

    return rate === null
      ? []
      : [
          {
            id: node.id,
            grilleKindId: node.grilleKindId ?? null,
            designId: node.designId ?? null,
            workerId: node.workerId ?? null,
            rate,
          },
        ];
  });

type CatalogDesignNode = {
  id: string;
  name?: string | null;
  grilleKindId?: string | null;
  product?: string | null;
};

export const toWorkshopCatalog = ({
  workshopRates,
  designs,
  grilleKinds,
}: {
  workshopRates: Page<WorkshopRateNode>;
  designs: Page<CatalogDesignNode>;
  grilleKinds: Page<{ id: string; name?: string | null }>;
}): WorkshopCatalog => ({
  rates: toWorkshopRates((workshopRates?.edges ?? []).map(({ node }) => node)),
  designs: (designs?.edges ?? []).map(({ node }) => ({
    id: node.id,
    name: node.name ?? '',
    grilleKindId: node.grilleKindId ?? null,
    product: toProduct(node.product),
  })),
  kinds: (grilleKinds?.edges ?? []).map(({ node }) => ({
    id: node.id,
    name: node.name ?? '',
  })),
});
