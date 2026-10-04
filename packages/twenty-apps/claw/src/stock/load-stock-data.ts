import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  materialUnitLabel,
  type MaterialUnit,
} from 'src/constants/select-options';
import { todayInTashkent } from 'src/pricing/dates';
import { toCurrency } from 'src/recalc/money';
import {
  type StockMaterial,
  type StockMovementLine,
  type StockNeed,
  type StockReceipt,
  type StockRecountEntry,
} from 'src/stock/stock-screen';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { isAccessError } from 'src/utils/is-access-error';

export type StockData = {
  materials: StockMaterial[];
  needs: StockNeed[];
  // Purchase prices are the owner's: other roles get no price field
  canSeePrice: boolean;
};

// Twenty caps a page at 200 records.
const PAGE_SIZE = 200;
const LATEST_MOVEMENTS = 5;
const LISTED_KINDS = ['RECEIPT', 'STOCKTAKE', 'WRITE_OFF'] as const;

const canReadPurchasePrice = async (client: CoreApiClient) => {
  try {
    await client.query({
      materials: {
        __args: { first: 1 },
        edges: {
          node: { id: true, lastPurchasePrice: { amountMicros: true } },
        },
      },
    });

    return true;
  } catch (error) {
    if (!isAccessError(error)) throw error;

    return false;
  }
};

export const loadStockData = async (
  client: CoreApiClient,
  // What an earlier load of this screen found: the role does not change
  // between two reads, so only the first one asks
  knownCanSeePrice?: boolean,
): Promise<StockData> => {
  const [materialNodes, lineNodes, canSeePrice] = await Promise.all([
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
    knownCanSeePrice ?? canReadPurchasePrice(client),
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
    // until it is written off, and only while its order awaits price approval.
    needs: lineNodes
      .flatMap((line) =>
        (line.writtenOffQuantity ?? null) === null &&
        line.order?.status === 'PRICE_APPROVAL' &&
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
    canSeePrice,
  };
};

export const loadLatestMovements = async (
  client: CoreApiClient,
  materialId: string,
): Promise<StockMovementLine[]> => {
  const { stockMovements } = await client.query({
    stockMovements: {
      __args: {
        filter: {
          materialId: { eq: materialId },
          kind: { in: [...LISTED_KINDS] },
        },
        orderBy: [{ date: 'DescNullsLast' }, { createdAt: 'DescNullsLast' }],
        first: LATEST_MOVEMENTS,
      },
      edges: {
        node: {
          id: true,
          kind: true,
          quantity: true,
          countedQuantity: true,
          date: true,
          createdAt: true,
          order: { name: true },
        },
      },
    },
  });

  return (stockMovements?.edges ?? []).flatMap(({ node }) => {
    const kind = LISTED_KINDS.find((listed) => listed === node.kind);

    if (kind === undefined) return [];

    return [
      {
        id: node.id,
        kind,
        quantity:
          (kind === 'STOCKTAKE' ? node.countedQuantity : node.quantity) ?? 0,
        date:
          node.date?.slice(0, 10) ??
          (node.createdAt ? todayInTashkent(new Date(node.createdAt)) : null),
        orderName: node.order?.name || null,
      },
    ];
  });
};

const toMovementData = (movement: StockReceipt | StockRecountEntry) => {
  if (movement.kind === 'STOCKTAKE') return movement;

  const { unitPrice, ...receipt } = movement;

  // Roles other than the owner's may not write the price field, so a purchase
  // without a price must not mention it at all.
  return unitPrice === null
    ? receipt
    : { ...receipt, unitPrice: toCurrency(unitPrice) };
};

// No name is sent: the stock recalc writes the movement's name itself.
export const createStockMovement = async (
  client: CoreApiClient,
  movement: StockReceipt | StockRecountEntry,
): Promise<void> => {
  await client.mutation({
    createStockMovement: {
      __args: { data: toMovementData(movement) },
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
  data: { name: string; unit: MaterialUnit; minimumStock: number },
): Promise<string> => {
  const { createMaterial: created } = await client.mutation({
    createMaterial: { __args: { data }, id: true },
  });

  if (!created) throw new Error('the created material was not returned');

  return created.id;
};
