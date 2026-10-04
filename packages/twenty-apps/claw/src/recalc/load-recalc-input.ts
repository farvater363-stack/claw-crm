import { type CoreApiClient } from 'twenty-client-sdk/core';

import {
  type DeadlineState,
  type DiscountKind,
  type ExtraServiceUnit,
} from 'src/constants/select-options';
import { todayInTashkent } from 'src/pricing/dates';
import { type RecalcInput } from 'src/pricing/plan-order-recalc';
import { fromCurrency } from 'src/recalc/money';

const PAGE_SIZE = 200;

const money = { amountMicros: true, currencyCode: true } as const;

// planOrderRecalc compares with `!==`, so every value must have the exact type the planner produces.
export const toNumber = (value: unknown): number | null =>
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
    designs,
    extraServices,
    orderPayments,
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
    designs: {
      __args: { first: PAGE_SIZE },
      edges: {
        node: {
          id: true,
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
    master: order.master
      ? {
          ratePerSquareMeter:
            fromCurrency(order.master.ratePerSquareMeter) ?? 0,
          penaltyPercentPerDay:
            toNumber(order.master.penaltyPercentPerDay) ?? 0,
        }
      : null,
    paymentsTotal: (orderPayments?.edges ?? []).reduce(
      (sum, { node }) => sum + (fromCurrency(node.amount) ?? 0),
      0,
    ),
    items: (orderItems?.edges ?? []).map(({ node }) => ({
      id: node.id,
      name: node.name ?? null,
      designId: node.designId ?? null,
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
    grilles: (designs?.edges ?? []).map(({ node }) => ({
      id: node.id,
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
    today: todayInTashkent(),
    ...refresh,
  };
};
