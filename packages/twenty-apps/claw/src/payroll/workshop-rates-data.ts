import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type WorkerCategory } from 'src/constants/select-options';
import { type WorkshopCatalog } from 'src/payroll/workshop-pay';
import { toWorkshopCatalog } from 'src/payroll/workshop-records';
import { toCurrency } from 'src/recalc/money';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';

// Twenty caps a page at 200 records.
const PAGE_SIZE = 200;

export const loadWorkshopCatalog = async (
  client: CoreApiClient,
): Promise<WorkshopCatalog> => {
  const [workshopRates, designs, grilleKinds] = await Promise.all([
    fetchAllPages(async (after) => {
      const { workshopRates: page } = await client.query({
        workshopRates: {
          __args: { first: PAGE_SIZE, after },
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
      });

      return page;
    }),
    fetchAllPages(async (after) => {
      const { designs: page } = await client.query({
        designs: {
          __args: { first: PAGE_SIZE, after },
          edges: { node: { id: true, name: true, grilleKindId: true } },
          pageInfo: PAGE_INFO,
        },
      });

      return page;
    }),
    fetchAllPages(async (after) => {
      const { grilleKinds: page } = await client.query({
        grilleKinds: {
          __args: { first: PAGE_SIZE, after },
          edges: { node: { id: true, name: true } },
          pageInfo: PAGE_INFO,
        },
      });

      return page;
    }),
  ]);
  const page = <TNode>(nodes: TNode[]) => ({
    edges: nodes.map((node) => ({ node })),
  });

  return toWorkshopCatalog({
    workshopRates: page(workshopRates),
    designs: page(designs),
    grilleKinds: page(grilleKinds),
  });
};

export type RateWrite = {
  id: string;
  name: string;
  grilleKindId: string | null;
  designId: string | null;
  workerId: string | null;
  rate: number;
};

// The id is the attempt's: a save whose answer was lost and is sent again
// overwrites its record instead of adding a second rate to the cell.
export const saveWorkshopRate = async (
  client: CoreApiClient,
  { rate, ...write }: RateWrite,
): Promise<void> => {
  await client.mutation({
    createWorkshopRate: {
      __args: { data: { ...write, rate: toCurrency(rate) }, upsert: true },
      id: true,
    },
  });
};

// A whole column or a copied one goes in one request: a request per cell
// would run into the API's limit of requests a minute.
export const saveWorkshopRates = async (
  client: CoreApiClient,
  writes: RateWrite[],
): Promise<void> => {
  if (writes.length === 0) return;

  await client.mutation({
    createWorkshopRates: {
      __args: {
        data: writes.map(({ rate, ...write }) => ({
          ...write,
          rate: toCurrency(rate),
        })),
        upsert: true,
      },
      id: true,
    },
  });
};

export const removeWorkshopRate = async (
  client: CoreApiClient,
  id: string,
): Promise<void> => {
  await client.mutation({ deleteWorkshopRate: { __args: { id }, id: true } });
};

export const setWorkerCategories = async (
  client: CoreApiClient,
  workerId: string,
  categories: WorkerCategory[],
): Promise<void> => {
  await client.mutation({
    updateMaster: { __args: { id: workerId, data: { categories } }, id: true },
  });
};
