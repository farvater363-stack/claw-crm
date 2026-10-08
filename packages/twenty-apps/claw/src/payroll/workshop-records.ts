import { fromCurrency } from 'src/recalc/money';
import {
  type WorkshopCatalog,
  type WorkshopRate,
} from 'src/payroll/workshop-pay';

// ponytail: every rate, grille and kind in one page of 200 each; page when the price list outgrows it.
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
  },
  designs: {
    __args: { first: PAGE_SIZE },
    edges: { node: { id: true, name: true, grilleKindId: true } },
  },
  grilleKinds: {
    __args: { first: PAGE_SIZE },
    edges: { node: { id: true, name: true } },
  },
} as const;

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

export const toWorkshopCatalog = ({
  workshopRates,
  designs,
  grilleKinds,
}: {
  workshopRates: Page<WorkshopRateNode>;
  designs: Page<{ id: string; name?: string | null; grilleKindId?: string | null }>;
  grilleKinds: Page<{ id: string; name?: string | null }>;
}): WorkshopCatalog => ({
  rates: toWorkshopRates((workshopRates?.edges ?? []).map(({ node }) => node)),
  designs: (designs?.edges ?? []).map(({ node }) => ({
    id: node.id,
    name: node.name ?? '',
    grilleKindId: node.grilleKindId ?? null,
  })),
  kinds: (grilleKinds?.edges ?? []).map(({ node }) => ({
    id: node.id,
    name: node.name ?? '',
  })),
});
