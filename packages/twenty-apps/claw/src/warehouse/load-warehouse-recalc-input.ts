import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  type MaterialUnit,
  type OrderMaterialState,
  type StockMovementKind,
  type StockState,
} from 'src/constants/select-options';
import { toNumber } from 'src/recalc/load-recalc-input';
import { fromCurrency } from 'src/recalc/money';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { type WarehouseRecalcInput } from 'src/warehouse/plan-warehouse-recalc';

const PAGE_SIZE = 200;

const money = { amountMicros: true } as const;

const toText = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

// The planner writes null for "no note", so a cleared text read back as '' must compare equal to it.
const toNoteText = (value: unknown): string | null => {
  const text = toText(value);

  return text === '' ? null : text;
};

const toDate = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value).slice(0, 10);

// Soft-deleted records are not returned, so their movements simply stop counting.
export const loadWarehouseRecalcInput = async (
  client: CoreApiClient,
): Promise<WarehouseRecalcInput> => {
  const [materials, norms, movements, lines, orders] = await Promise.all([
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
              lastPurchasePrice: money,
              overrunPercent: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return materials;
    }),
    fetchAllPages(async (after) => {
      const { materialNorms } = await client.query({
        materialNorms: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              name: true,
              materialId: true,
              quantityPerUnit: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return materialNorms;
    }),
    fetchAllPages(async (after) => {
      const { stockMovements } = await client.query({
        stockMovements: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              name: true,
              kind: true,
              materialId: true,
              quantity: true,
              countedQuantity: true,
              unitPrice: money,
              date: true,
              createdAt: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return stockMovements;
    }),
    fetchAllPages(async (after) => {
      const { orderMaterials } = await client.query({
        orderMaterials: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              name: true,
              orderId: true,
              materialId: true,
              plannedQuantity: true,
              writtenOffQuantity: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return orderMaterials;
    }),
    // Orders outside price approval only need reading while they still carry a state to clear.
    fetchAllPages(async (after) => {
      const { orders } = await client.query({
        orders: {
          __args: {
            filter: {
              or: [
                { status: { eq: 'PRICE_APPROVAL' } },
                { materialState: { is: 'NOT_NULL' } },
              ],
            },
            first: PAGE_SIZE,
            after,
          },
          edges: {
            node: {
              id: true,
              status: true,
              materialState: true,
              materialNote: true,
              missingNorms: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return orders;
    }),
  ]);

  return {
    materials: materials.map((node) => ({
      id: node.id,
      name: toText(node.name),
      unit: (node.unit ?? null) as MaterialUnit | null,
      minimumStock: toNumber(node.minimumStock),
      onHand: toNumber(node.onHand),
      reserved: toNumber(node.reserved),
      toBuy: toNumber(node.toBuy),
      stockState: (node.stockState ?? null) as StockState | null,
      lastPurchasePrice: fromCurrency(node.lastPurchasePrice),
      overrunPercent: toNumber(node.overrunPercent),
    })),
    norms: norms.map((node) => ({
      id: node.id,
      name: toText(node.name),
      materialId: toText(node.materialId),
      quantityPerUnit: toNumber(node.quantityPerUnit),
    })),
    movements: movements.map((node) => ({
      id: node.id,
      name: toText(node.name),
      kind: (node.kind ?? null) as StockMovementKind | null,
      materialId: toText(node.materialId),
      quantity: toNumber(node.quantity),
      countedQuantity: toNumber(node.countedQuantity),
      unitPrice: fromCurrency(node.unitPrice),
      date: toDate(node.date),
      createdAt: String(node.createdAt),
    })),
    lines: lines.map((node) => ({
      id: node.id,
      name: toText(node.name),
      orderId: toText(node.orderId),
      materialId: toText(node.materialId),
      plannedQuantity: toNumber(node.plannedQuantity),
      writtenOffQuantity: toNumber(node.writtenOffQuantity),
    })),
    orders: orders.map((node) => ({
      id: node.id,
      status: toText(node.status),
      materialState: (node.materialState ?? null) as OrderMaterialState | null,
      materialNote: toNoteText(node.materialNote),
      missingNorms: toNoteText(node.missingNorms),
    })),
  };
};
