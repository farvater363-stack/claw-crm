import { type CoreApiClient } from 'twenty-client-sdk/core';

import { todayInTashkent } from 'src/pricing/dates';
import { toNumber } from 'src/recalc/load-recalc-input';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import {
  computeOrderMaterialDemand,
  type DemandExtraServiceLine,
  type DemandItem,
  type OrderMaterialDemand,
} from 'src/warehouse/compute-order-material-demand';
import {
  isEmptyOrderMaterialsPlan,
  keepsOrderDemand,
  planOrderMaterials,
} from 'src/warehouse/plan-order-materials';

const PAGE_SIZE = 200;

const toText = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

const loadDemand = async (
  client: CoreApiClient,
  items: DemandItem[],
  extraServiceLines: DemandExtraServiceLine[],
): Promise<OrderMaterialDemand> => {
  const [priceList, norms] = await Promise.all([
    fetchAllPages(async (after) => {
      const { priceListItems } = await client.query({
        priceListItems: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              id: true,
              name: true,
              designId: true,
              metal: true,
              metalSize: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return priceListItems;
    }),
    fetchAllPages(async (after) => {
      const { materialNorms } = await client.query({
        materialNorms: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: {
              priceListItemId: true,
              extraServiceId: true,
              materialId: true,
              quantityPerUnit: true,
            },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return materialNorms;
    }),
  ]);

  return computeOrderMaterialDemand({
    items,
    extraServiceLines,
    priceList: priceList.map((node) => ({
      id: node.id,
      name: toText(node.name),
      designId: toText(node.designId),
      metal: toText(node.metal),
      metalSize: toText(node.metalSize),
    })),
    norms: norms.map((node) => ({
      priceListItemId: toText(node.priceListItemId),
      extraServiceId: toText(node.extraServiceId),
      materialId: toText(node.materialId),
      quantityPerUnit: toNumber(node.quantityPerUnit),
    })),
  });
};

export const syncOrderMaterials = async (
  client: CoreApiClient,
  orderId: string,
  { isEnteringWrittenOff = false }: { isEnteringWrittenOff?: boolean } = {},
): Promise<boolean> => {
  const byOrder = { orderId: { eq: orderId } };
  const {
    orders,
    orderItems,
    orderExtraServices,
    orderMaterials,
    stockMovements,
  } = await client.query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: { node: { id: true, status: true, missingNorms: true } },
    },
    orderItems: {
      __args: { filter: byOrder, first: PAGE_SIZE },
      edges: {
        node: {
          name: true,
          designId: true,
          metal: true,
          metalSize: true,
          areaSquareMeters: true,
          quantity: true,
        },
      },
    },
    orderExtraServices: {
      __args: { filter: byOrder, first: PAGE_SIZE },
      edges: { node: { extraServiceId: true, quantity: true } },
    },
    orderMaterials: {
      __args: { filter: byOrder, first: PAGE_SIZE },
      edges: {
        node: {
          id: true,
          materialId: true,
          plannedQuantity: true,
          writtenOffQuantity: true,
          actualQuantity: true,
        },
      },
    },
    stockMovements: {
      __args: {
        filter: {
          ...byOrder,
          kind: { in: ['WRITE_OFF', 'FACT_ADJUSTMENT'] },
        },
        first: PAGE_SIZE,
      },
      edges: { node: { id: true, quantity: true } },
    },
  });
  const order = orders?.edges[0]?.node;

  if (!order) return false;

  const status = toText(order.status);
  // Material state only matters from price approval on; skipping the price list and norms
  // before that keeps new orders from paging them and triggering a warehouse recalc.
  const demand = keepsOrderDemand(status)
    ? await loadDemand(
        client,
        (orderItems?.edges ?? []).map(({ node }) => ({
          name: toText(node.name),
          designId: toText(node.designId),
          metal: toText(node.metal),
          metalSize: toText(node.metalSize),
          areaSquareMeters: toNumber(node.areaSquareMeters),
          quantity: toNumber(node.quantity),
        })),
        (orderExtraServices?.edges ?? []).map(({ node }) => ({
          extraServiceId: toText(node.extraServiceId),
          quantity: toNumber(node.quantity),
        })),
      )
    : { quantityByMaterialId: new Map<string, number>(), missingNorms: null };

  const plan = planOrderMaterials({
    orderId,
    status,
    demand: demand.quantityByMaterialId,
    lines: (orderMaterials?.edges ?? []).map(({ node }) => ({
      id: node.id,
      materialId: toText(node.materialId),
      plannedQuantity: toNumber(node.plannedQuantity),
      writtenOffQuantity: toNumber(node.writtenOffQuantity),
      actualQuantity: toNumber(node.actualQuantity),
    })),
    systemMovements: (stockMovements?.edges ?? []).map(({ node }) => ({
      id: node.id,
      quantity: toNumber(node.quantity),
    })),
    today: todayInTashkent(),
    isEnteringWrittenOff,
  });

  const missingNormsChanged =
    toText(order.missingNorms) !== demand.missingNorms;

  // Lines first: a movement upsert references its line.
  for (const { id, ...data } of plan.lineUpserts) {
    await client.mutation({
      createOrderMaterial: {
        __args: { data: { id, ...data }, upsert: true },
        id: true,
      },
    });
  }

  for (const { id, ...data } of plan.movementUpserts) {
    await client.mutation({
      createStockMovement: {
        __args: { data: { id, ...data }, upsert: true },
        id: true,
      },
    });
  }

  for (const id of plan.movementDeletes) {
    await client.mutation({
      deleteStockMovement: { __args: { id }, id: true },
    });
  }

  for (const id of plan.lineDeletes) {
    await client.mutation({
      deleteOrderMaterial: { __args: { id }, id: true },
    });
  }

  if (missingNormsChanged) {
    await client.mutation({
      updateOrder: {
        __args: { id: orderId, data: { missingNorms: demand.missingNorms } },
        id: true,
      },
    });
  }

  return missingNormsChanged || !isEmptyOrderMaterialsPlan(plan);
};
