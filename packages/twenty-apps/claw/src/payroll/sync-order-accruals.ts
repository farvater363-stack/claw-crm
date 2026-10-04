import { type CoreApiClient } from 'twenty-client-sdk/core';

import { isInstalled } from 'src/constants/order-status-sets';
import {
  ACCRUAL_SELECTION,
  ALL_PAY_RULES_QUERY,
  toAccrualLine,
  toPayRules,
} from 'src/payroll/pay-records';
import { withLegacyMasterRate } from 'src/payroll/pay-rules';
import {
  type AccrualLine,
  planOrderAccruals,
} from 'src/payroll/plan-order-accruals';
import { todayInTashkent } from 'src/pricing/dates';
import { toNumber } from 'src/recalc/load-recalc-input';
import { fromCurrency, toCurrency } from 'src/recalc/money';

// ponytail: every worker and every line of the order in one page of 200; filter by the order's people and page when the shop outgrows it.
const PAGE_SIZE = 200;

const money = { amountMicros: true } as const;

// The id is fixed by what the line stands for, so writing it again changes the
// line in place, and brings back one that was removed, instead of adding a second.
export const upsertAccrualLine = async (
  client: CoreApiClient,
  { amount, ...line }: AccrualLine,
): Promise<void> => {
  await client.mutation({
    createPayAccrual: {
      __args: { data: { ...line, amount: toCurrency(amount) }, upsert: true },
      id: true,
    },
  });
};

export const syncOrderAccruals = async (
  client: CoreApiClient,
  orderId: string,
): Promise<void> => {
  const { orders, payAccruals, payRules, masters } = await client.query({
    orders: {
      __args: { filter: { id: { eq: orderId } }, first: 1 },
      edges: {
        node: {
          id: true,
          name: true,
          status: true,
          areaSquareMeters: true,
          total: money,
          masterId: true,
          installerId: true,
          soldById: true,
          measurerId: true,
          masterBonus: money,
          masterPenalty: money,
          installedAt: true,
          measuredAt: true,
        },
      },
    },
    payAccruals: {
      __args: { filter: { orderId: { eq: orderId } }, first: PAGE_SIZE },
      edges: { node: ACCRUAL_SELECTION },
    },
    payRules: ALL_PAY_RULES_QUERY,
    masters: {
      __args: { first: PAGE_SIZE },
      edges: { node: { id: true, loginId: true, ratePerSquareMeter: money } },
    },
  });
  const order = orders?.edges[0]?.node;

  if (!order) return;

  const workers = (masters?.edges ?? []).map(({ node }) => node);
  const rules = toPayRules((payRules?.edges ?? []).map(({ node }) => node));
  const status = order.status ?? null;
  const masterId = order.masterId ?? null;
  const master = workers.find((worker) => worker.id === masterId);
  const measurer = order.measurerId
    ? workers.find((worker) => worker.loginId === order.measurerId)
    : undefined;
  // The update trigger stamps installedAt before this runs; an order created as installed has none yet.
  const installedOn = order.installedAt
    ? String(order.installedAt).slice(0, 10)
    : isInstalled(status)
      ? todayInTashkent()
      : null;

  const plan = planOrderAccruals({
    order: {
      id: order.id,
      name: order.name ?? '',
      status,
      areaSquareMeters: toNumber(order.areaSquareMeters),
      total: fromCurrency(order.total),
      masterId,
      installerId: order.installerId ?? null,
      measurerWorkerId: measurer?.id ?? null,
      soldById: order.soldById ?? null,
      masterBonus: fromCurrency(order.masterBonus),
      masterPenalty: fromCurrency(order.masterPenalty),
      installedOn,
      measuredOn: order.measuredAt
        ? todayInTashkent(new Date(order.measuredAt))
        : null,
    },
    // The same rules the recalc pays the master by, so his lines add up to the pay on the order.
    rules:
      master && masterId !== null
        ? withLegacyMasterRate(rules, {
            workerId: masterId,
            ratePerSquareMeter: fromCurrency(master.ratePerSquareMeter) ?? 0,
          })
        : rules,
    existing: (payAccruals?.edges ?? []).flatMap(
      ({ node }) => toAccrualLine(node) ?? [],
    ),
  });

  for (const line of plan.upserts) {
    await upsertAccrualLine(client, line);
  }

  for (const id of plan.deleteIds) {
    await client.mutation({ deletePayAccrual: { __args: { id }, id: true } });
  }
};
