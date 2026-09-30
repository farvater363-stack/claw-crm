import { type CoreApiClient } from 'twenty-client-sdk/core';

import { type ExtraServiceUnit } from 'src/constants/select-options';
import { type RecalcInput } from 'src/pricing/plan-order-recalc';
import { fromCurrency } from 'src/recalc/money';

const PAGE_SIZE = 200;

const money = { amountMicros: true, currencyCode: true } as const;

// planOrderRecalc compares with `!==`, so every value must have the exact type the planner produces.
const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const toDate = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value).slice(0, 10);

const sumOfCosts = (...values: (number | null)[]): number | null =>
  values.every((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

export const loadRecalcInput = async (
  client: CoreApiClient,
  orderId: string,
  refresh: Pick<
    RecalcInput,
    'refreshPriceItemIds' | 'refreshPriceExtraServiceLineIds'
  >,
): Promise<RecalcInput | null> => {
  const {
    orders,
    orderItems,
    orderExtraServices,
    priceListItems,
    extraServices,
  } = await client.query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: {
        node: {
          id: true,
          areaSquareMeters: true,
          total: money,
          prepayment: money,
          balance: money,
          costTotal: money,
          margin: money,
          marginPercent: true,
          productionStartDate: true,
          installationDeadline: true,
          installedAt: true,
          daysLate: true,
          masterBonus: money,
          masterPayCalculated: money,
          masterPayTotal: money,
          master: { ratePerSquareMeter: money, penaltyPercentPerDay: true },
        },
      },
    },
    orderItems: {
      __args: { filter: { orderId: { eq: orderId } }, first: PAGE_SIZE },
      edges: {
        node: {
          id: true,
          name: true,
          designId: true,
          metal: true,
          metalSize: true,
          widthCm: true,
          heightCm: true,
          projectionCm: true,
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
    priceListItems: {
      __args: { first: PAGE_SIZE },
      edges: {
        node: {
          designId: true,
          metal: true,
          metalSize: true,
          pricePerSquareMeter: money,
          materialCostPerSquareMeter: money,
          manufacturingCostPerSquareMeter: money,
          installationCostPerSquareMeter: money,
        },
      },
    },
    extraServices: {
      __args: { first: PAGE_SIZE },
      edges: {
        node: { id: true, name: true, unit: true, price: money, cost: money },
      },
    },
  });

  const order = orders?.edges[0]?.node;

  if (!order) {
    return null;
  }

  return {
    order: {
      areaSquareMeters: toNumber(order.areaSquareMeters),
      total: fromCurrency(order.total),
      prepayment: fromCurrency(order.prepayment),
      balance: fromCurrency(order.balance),
      costTotal: fromCurrency(order.costTotal),
      margin: fromCurrency(order.margin),
      marginPercent: toNumber(order.marginPercent),
      productionStartDate: toDate(order.productionStartDate),
      installationDeadline: toDate(order.installationDeadline),
      installedAt: toDate(order.installedAt),
      daysLate: toNumber(order.daysLate),
      masterBonus: fromCurrency(order.masterBonus),
      masterPayCalculated: fromCurrency(order.masterPayCalculated),
      masterPayTotal: fromCurrency(order.masterPayTotal),
    },
    master: order.master
      ? {
          ratePerSquareMeter:
            fromCurrency(order.master.ratePerSquareMeter) ?? 0,
          penaltyPercentPerDay:
            toNumber(order.master.penaltyPercentPerDay) ?? 0,
        }
      : null,
    items: (orderItems?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? null,
      designId: node.designId ?? null,
      metal: node.metal ?? null,
      metalSize: node.metalSize ?? null,
      widthCm: toNumber(node.widthCm),
      heightCm: toNumber(node.heightCm),
      projectionCm: toNumber(node.projectionCm),
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
    priceList: (priceListItems?.edges ?? []).map(({ node }) => ({
      designId: node.designId ?? null,
      metal: node.metal ?? null,
      metalSize: node.metalSize ?? null,
      pricePerSquareMeter: fromCurrency(node.pricePerSquareMeter),
      costPerSquareMeter: sumOfCosts(
        fromCurrency(node.materialCostPerSquareMeter),
        fromCurrency(node.manufacturingCostPerSquareMeter),
        fromCurrency(node.installationCostPerSquareMeter),
      ),
    })),
    extraServiceCatalog: (extraServices?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? '',
      unit: (node.unit ?? null) as ExtraServiceUnit | null,
      price: fromCurrency(node.price),
      cost: fromCurrency(node.cost),
    })),
    ...refresh,
  };
};
