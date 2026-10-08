import { type CoreApiClient } from 'twenty-client-sdk/core';

import { isReserving } from 'src/constants/order-status-sets';
import {
  materialUnitLabel,
  type MaterialUnit,
} from 'src/constants/select-options';
import { fromCurrency } from 'src/recalc/money';
import {
  type StockMaterial,
  type StockNeed,
  type StockPrices,
  type StockRecountEntry,
} from 'src/stock/stock-screen';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { isAccessError } from 'src/utils/is-access-error';

export type StockData = {
  materials: StockMaterial[];
  needs: StockNeed[];
  // Purchase prices are the owner's: other roles get no price field
  canSeePrice: boolean;
  prices: StockPrices;
};

// Twenty caps a page at 200 records.
const PAGE_SIZE = 200;

const MONEY = { amountMicros: true } as const;

// Null for a role that may not read purchase prices.
const loadPurchasePrices = async (
  client: CoreApiClient,
): Promise<StockPrices | null> => {
  try {
    const nodes = await fetchAllPages(async (after) => {
      const { materials } = await client.query({
        materials: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: { id: true, lastPurchasePrice: MONEY, averagePrice: MONEY },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return materials;
    });

    return Object.fromEntries(
      nodes.map((node) => [
        node.id,
        {
          last: fromCurrency(node.lastPurchasePrice),
          average: fromCurrency(node.averagePrice),
        },
      ]),
    );
  } catch (error) {
    if (!isAccessError(error)) throw error;

    return null;
  }
};

export const loadStockData = async (
  client: CoreApiClient,
  // What an earlier load of this screen found: the role does not change
  // between two reads, so one that may not read prices is not asked again
  knownCanSeePrice?: boolean,
): Promise<StockData> => {
  const [materialNodes, lineNodes, prices] = await Promise.all([
    fetchAllPages(async (after) => {
      const { materials } = await client.query({
        materials: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              name: true,
              unit: true,
              minimumStock: true,
              onHand: true,
              reserved: true,
              toBuy: true,
              stockState: true,
              overrunPercent: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return materials;
    }),
    fetchAllPages(async (after) => {
      const { orderMaterials } = await client.query({
        orderMaterials: {
          __args: {
            first: PAGE_SIZE,
            after,
            filter: { writtenOffQuantity: { is: 'NULL' } },
          },
          edges: {
            node: {
              id: true,
              materialId: true,
              plannedQuantity: true,
              writtenOffQuantity: true,
              order: { id: true, name: true, status: true },
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return orderMaterials;
    }),
    knownCanSeePrice === false ? null : loadPurchasePrices(client),
  ]);

  return {
    materials: materialNodes.map((node) => ({
      id: node.id,
      name: node.name ?? null,
      unitLabel: materialUnitLabel(node.unit),
      minimumStock: node.minimumStock ?? null,
      onHand: node.onHand ?? null,
      reserved: node.reserved ?? null,
      toBuy: node.toBuy ?? null,
      stockState: node.stockState ?? null,
      overrunPercent: node.overrunPercent ?? null,
    })),
    // The rule the recalc uses for «Нужно на заказы»: a line holds material
    // until it is written off, and only while its order is at the reserving step.
    needs: lineNodes
      .flatMap((line) =>
        (line.writtenOffQuantity ?? null) === null &&
        line.order &&
        isReserving(line.order.status ?? null) &&
        line.materialId
          ? [
              {
                materialId: line.materialId,
                orderId: line.order.id,
                orderName: line.order.name || 'Заказ',
                quantity: line.plannedQuantity ?? 0,
              },
            ]
          : [],
      )
      .sort((left, right) =>
        right.orderName.localeCompare(left.orderName, 'ru', { numeric: true }),
      ),
    canSeePrice: prices !== null,
    prices: prices ?? {},
  };
};

// No name is sent: the stock recalc writes the movement's name itself.
// The id belongs to one attempt of the user: a request whose answer was lost
// may already be stored, and its retry must overwrite that record, not add one.
export const createStockMovement = async (
  client: CoreApiClient,
  id: string,
  movement: StockRecountEntry,
): Promise<void> => {
  await client.mutation({
    createStockMovement: {
      __args: { data: { id, ...movement }, upsert: true },
      id: true,
    },
  });
};

export const updateMinimumStock = async (
  client: CoreApiClient,
  materialId: string,
  minimumStock: number,
): Promise<void> => {
  await client.mutation({
    updateMaterial: {
      __args: { id: materialId, data: { minimumStock } },
      id: true,
    },
  });
};

export const createMaterial = async (
  client: CoreApiClient,
  id: string,
  data: { name: string; unit: MaterialUnit; minimumStock: number },
): Promise<void> => {
  await client.mutation({
    createMaterial: {
      __args: { data: { id, ...data }, upsert: true },
      id: true,
    },
  });
};
