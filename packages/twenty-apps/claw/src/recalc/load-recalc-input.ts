import { type CoreApiClient } from 'twenty-client-sdk/core';

import { isInstalled } from 'src/constants/order-status-sets';
import {
  type DeadlineState,
  type DiscountKind,
  type ExtraServiceUnit,
  type ProjectionKind,
  toProduct,
} from 'src/constants/select-options';
import {
  ALL_PAY_RULES_QUERY,
  keptMasterRates,
  readAllPayRules,
} from 'src/payroll/pay-records';
import { keptSquareMeterRates } from 'src/payroll/workshop-pay';
import {
  toWorkshopCatalog,
  WORKSHOP_CATALOG_QUERY,
} from 'src/payroll/workshop-records';
import { materialCostByOwner } from 'src/prices/material-cost';
import { todayInTashkent } from 'src/pricing/dates';
import { type RecalcInput } from 'src/pricing/plan-order-recalc';
import { fromCurrency } from 'src/recalc/money';
import { PAGE_INFO, withRemainingPages } from 'src/utils/fetch-all-pages';

const PAGE_SIZE = 200;

const money = { amountMicros: true, currencyCode: true } as const;

const DESIGN_SELECTION = {
  id: true,
  name: true,
  grilleKindId: true,
  product: true,
  pricePerSquareMeter: money,
} as const;

const EXTRA_SERVICE_SELECTION = {
  id: true,
  name: true,
  unit: true,
  price: money,
} as const;

const MATERIAL_NORM_SELECTION = {
  designId: true,
  extraServiceId: true,
  materialId: true,
  quantityPerUnit: true,
} as const;

const MATERIAL_SELECTION = {
  id: true,
  averagePrice: money,
  lastPurchasePrice: money,
} as const;

// planOrderRecalc compares with `!==`, so every value must have the exact type the planner produces.
export const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const toDate = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value).slice(0, 10);

export const loadRecalcInput = async (
  client: CoreApiClient,
  orderId: string,
  refresh: Pick<
    RecalcInput,
    'refreshPriceItemIds' | 'refreshPriceExtraServiceLineIds' | 'linesRemoved'
  >,
): Promise<RecalcInput | null> => {
  const {
    orders,
    orderItems,
    orderExtraServices,
    designs: firstDesigns,
    extraServices: firstExtraServices,
    orderPayments,
    payRules: firstPayRules,
    payAccruals,
    materialNorms: firstMaterialNorms,
    materials: firstMaterials,
    workshopRates: firstWorkshopRates,
    grilleKinds: firstGrilleKinds,
  } = await client.query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: {
        node: {
          id: true,
          areaSquareMeters: true,
          subtotal: money,
          discountKind: true,
          discountValue: true,
          discount: money,
          total: money,
          paid: money,
          balance: money,
          costTotal: money,
          margin: money,
          marginPercent: true,
          productionStartDate: true,
          installationDeadline: true,
          installedAt: true,
          readyAt: true,
          daysLate: true,
          masterBonus: money,
          masterPayCalculated: money,
          masterPenalty: money,
          masterPayTotal: money,
          status: true,
          deadlineState: true,
          masterId: true,
          master: { penaltyPercentPerDay: true },
        },
      },
    },
    orderItems: {
      __args: { filter: { orderId: { eq: orderId } }, first: PAGE_SIZE },
      edges: {
        node: {
          id: true,
          name: true,
          product: true,
          shape: true,
          designId: true,
          widthCm: true,
          heightCm: true,
          projectionCm: true,
          projectionKind: true,
          quantity: true,
          areaSquareMeters: true,
          pricePerSquareMeter: money,
          costPerSquareMeter: money,
          lineTotal: money,
          lineCost: money,
        },
      },
    },
    orderExtraServices: {
      __args: { filter: { orderId: { eq: orderId } }, first: PAGE_SIZE },
      edges: {
        node: {
          id: true,
          name: true,
          extraServiceId: true,
          quantity: true,
          price: money,
          cost: money,
          lineTotal: money,
          lineCost: money,
        },
      },
    },
    designs: {
      __args: { first: PAGE_SIZE },
      edges: { node: DESIGN_SELECTION },
      pageInfo: PAGE_INFO,
    },
    workshopRates: WORKSHOP_CATALOG_QUERY.workshopRates,
    grilleKinds: WORKSHOP_CATALOG_QUERY.grilleKinds,
    extraServices: {
      __args: { first: PAGE_SIZE },
      edges: { node: EXTRA_SERVICE_SELECTION },
      pageInfo: PAGE_INFO,
    },
    materialNorms: {
      __args: { first: PAGE_SIZE },
      edges: { node: MATERIAL_NORM_SELECTION },
      pageInfo: PAGE_INFO,
    },
    materials: {
      __args: { first: PAGE_SIZE },
      edges: { node: MATERIAL_SELECTION },
      pageInfo: PAGE_INFO,
    },
    payRules: ALL_PAY_RULES_QUERY,
    payAccruals: {
      __args: { filter: { orderId: { eq: orderId } }, first: PAGE_SIZE },
      edges: {
        node: {
          workerId: true,
          method: true,
          work: true,
          rate: true,
          amount: money,
          part: true,
        },
      },
    },
    // Deleted payments are left out by the API, so this is what was really paid.
    orderPayments: {
      __args: { filter: { orderId: { eq: orderId } }, first: PAGE_SIZE },
      edges: { node: { amount: money } },
    },
  });

  const order = orders?.edges[0]?.node;

  if (!order) {
    return null;
  }

  // A price list longer than a page must still price and cost every line.
  const [
    designs,
    extraServices,
    materialNorms,
    materials,
    workshopRates,
    grilleKinds,
    payRules,
  ] = await Promise.all([
    withRemainingPages(firstDesigns, async (after) => {
      const { designs: page } = await client.query({
        designs: {
          __args: { first: PAGE_SIZE, after },
          edges: { node: DESIGN_SELECTION },
          pageInfo: PAGE_INFO,
        },
      });

      return page;
    }),
    withRemainingPages(firstExtraServices, async (after) => {
      const { extraServices: page } = await client.query({
        extraServices: {
          __args: { first: PAGE_SIZE, after },
          edges: { node: EXTRA_SERVICE_SELECTION },
          pageInfo: PAGE_INFO,
        },
      });

      return page;
    }),
    withRemainingPages(firstMaterialNorms, async (after) => {
      const { materialNorms: page } = await client.query({
        materialNorms: {
          __args: { first: PAGE_SIZE, after },
          edges: { node: MATERIAL_NORM_SELECTION },
          pageInfo: PAGE_INFO,
        },
      });

      return page;
    }),
    withRemainingPages(firstMaterials, async (after) => {
      const { materials: page } = await client.query({
        materials: {
          __args: { first: PAGE_SIZE, after },
          edges: { node: MATERIAL_SELECTION },
          pageInfo: PAGE_INFO,
        },
      });

      return page;
    }),
    withRemainingPages(firstWorkshopRates, async (after) => {
      const { workshopRates: page } = await client.query({
        workshopRates: {
          ...WORKSHOP_CATALOG_QUERY.workshopRates,
          __args: { first: PAGE_SIZE, after },
        },
      });

      return page;
    }),
    withRemainingPages(firstGrilleKinds, async (after) => {
      const { grilleKinds: page } = await client.query({
        grilleKinds: {
          ...WORKSHOP_CATALOG_QUERY.grilleKinds,
          __args: { first: PAGE_SIZE, after },
        },
      });

      return page;
    }),
    readAllPayRules(client, firstPayRules),
  ]);

  const masterId = order.masterId ?? null;
  const isOrderInstalled = isInstalled(order.status ?? null);
  const accrualNodes = (payAccruals?.edges ?? []).map(({ node }) => node);
  const norms = (materialNorms?.edges ?? []).map(({ node }) => ({
    designId: node.designId ?? null,
    extraServiceId: node.extraServiceId ?? null,
    materialId: node.materialId ?? null,
    quantityPerUnit: toNumber(node.quantityPerUnit),
  }));
  const pricedMaterials = (materials?.edges ?? []).map(({ node }) => ({
    id: node.id,
    averagePrice: fromCurrency(node.averagePrice),
    lastPurchasePrice: fromCurrency(node.lastPurchasePrice),
  }));
  const grilleCosts = materialCostByOwner('designId', norms, pricedMaterials);
  const serviceCosts = materialCostByOwner(
    'extraServiceId',
    norms,
    pricedMaterials,
  );

  return {
    order: {
      areaSquareMeters: toNumber(order.areaSquareMeters),
      subtotal: fromCurrency(order.subtotal),
      discountKind: (order.discountKind ?? null) as DiscountKind | null,
      discountValue: toNumber(order.discountValue),
      discount: fromCurrency(order.discount),
      total: fromCurrency(order.total),
      paid: fromCurrency(order.paid),
      balance: fromCurrency(order.balance),
      costTotal: fromCurrency(order.costTotal),
      margin: fromCurrency(order.margin),
      marginPercent: toNumber(order.marginPercent),
      productionStartDate: toDate(order.productionStartDate),
      installationDeadline: toDate(order.installationDeadline),
      installedAt: toDate(order.installedAt),
      readyAt: toDate(order.readyAt),
      daysLate: toNumber(order.daysLate),
      masterBonus: fromCurrency(order.masterBonus),
      masterPayCalculated: fromCurrency(order.masterPayCalculated),
      masterPenalty: fromCurrency(order.masterPenalty),
      masterPayTotal: fromCurrency(order.masterPayTotal),
      status: order.status ?? null,
      deadlineState: (order.deadlineState ?? null) as DeadlineState | null,
    },
    master:
      order.master && masterId !== null
        ? {
            penaltyPercentPerDay:
              toNumber(order.master.penaltyPercentPerDay) ?? 0,
            rules: payRules.filter((rule) => rule.workerId === masterId),
            // The lines of an order that is not installed are about to be removed;
            // their rates must not stay in the pay stored on the order.
            keptRates: isOrderInstalled
              ? keptMasterRates(accrualNodes, masterId)
              : [],
            workshop: {
              masterId,
              catalog: toWorkshopCatalog({
                workshopRates,
                designs,
                grilleKinds,
              }),
              kept: keptSquareMeterRates(
                isOrderInstalled ? accrualNodes : [],
                masterId,
              ),
            },
          }
        : null,
    paymentsTotal: (orderPayments?.edges ?? []).reduce(
      (sum, { node }) => sum + (fromCurrency(node.amount) ?? 0),
      0,
    ),
    payTotal: (payAccruals?.edges ?? []).reduce(
      (sum, { node }) => sum + (fromCurrency(node.amount) ?? 0),
      0,
    ),
    items: (orderItems?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? null,
      product: toProduct(node.product),
      shape: node.shape ?? null,
      designId: node.designId ?? null,
      widthCm: toNumber(node.widthCm),
      heightCm: toNumber(node.heightCm),
      projectionCm: toNumber(node.projectionCm),
      projectionKind: (node.projectionKind ?? null) as ProjectionKind | null,
      quantity: toNumber(node.quantity),
      areaSquareMeters: toNumber(node.areaSquareMeters),
      pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
      costPerSquareMeter: fromCurrency(node.costPerSquareMeter),
      lineTotal: fromCurrency(node.lineTotal),
      lineCost: fromCurrency(node.lineCost),
    })),
    extraServiceLines: (orderExtraServices?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? null,
      extraServiceId: node.extraServiceId ?? null,
      quantity: toNumber(node.quantity),
      price: fromCurrency(node.price),
      cost: fromCurrency(node.cost),
      lineTotal: fromCurrency(node.lineTotal),
      lineCost: fromCurrency(node.lineCost),
    })),
    grilles: (designs?.edges ?? []).map(({ node }) => ({
      id: node.id,
      product: toProduct(node.product),
      pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
      costPerSquareMeter: grilleCosts.get(node.id) ?? null,
    })),
    extraServiceCatalog: (extraServices?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? '',
      unit: (node.unit ?? null) as ExtraServiceUnit | null,
      price: fromCurrency(node.price),
      cost: serviceCosts.get(node.id) ?? null,
    })),
    today: todayInTashkent(),
    ...refresh,
  };
};
