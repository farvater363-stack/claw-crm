import { defineLogicFunction } from 'twenty-sdk/define';

import { IDS } from 'src/constants/universal-identifiers';
import { PAY_RULE_SELECTION, toPayRules } from 'src/payroll/pay-records';
import { currentMonthInTashkent } from 'src/payroll/payroll-month';
import { planFixedAccruals } from 'src/payroll/plan-fixed-accruals';
import { upsertAccrualLine } from 'src/payroll/sync-order-accruals';
import { createRecalcClient } from 'src/recalc/create-recalc-client';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';

const PAGE_SIZE = 200;

// Fixed pay is earned on the first day of the month. The run is daily so that a
// worker or a rule added later in the month still gets this month's line.
const handler = async (): Promise<void> => {
  const client = createRecalcClient();
  const month = currentMonthInTashkent();
  const ofMonth = {
    method: { eq: 'FIXED' as const },
    earnedOn: { eq: `${month}-01` },
  };

  const workers = await fetchAllPages(async (after) => {
    const { masters } = await client.query({
      masters: {
        __args: { first: PAGE_SIZE, after },
        edges: { node: { id: true, isActive: true } },
        pageInfo: PAGE_INFO,
      },
    });

    return masters;
  });
  const rules = await fetchAllPages(async (after) => {
    const { payRules } = await client.query({
      payRules: {
        __args: {
          filter: { method: { eq: 'FIXED' } },
          first: PAGE_SIZE,
          after,
        },
        edges: { node: PAY_RULE_SELECTION },
        pageInfo: PAGE_INFO,
      },
    });

    return payRules;
  });
  const linesOfMonth = (removed: boolean) =>
    fetchAllPages(async (after) => {
      const { payAccruals } = await client.query({
        payAccruals: {
          __args: {
            filter: removed
              ? { ...ofMonth, deletedAt: { is: 'NOT_NULL' } }
              : ofMonth,
            first: PAGE_SIZE,
            after,
          },
          edges: { node: { id: true } },
          pageInfo: PAGE_INFO,
        },
      });

      return payAccruals;
    });
  const written = await linesOfMonth(false);
  // A line the owner removed by hand is soft-deleted, and an upsert of its id would bring it back.
  const removed = await linesOfMonth(true);

  const lines = planFixedAccruals({
    month,
    workers: workers.map(({ id, isActive }) => ({
      id,
      isActive: isActive === true,
    })),
    rules: toPayRules(rules),
    existingIds: [...written, ...removed].map(({ id }) => id),
  });

  for (const line of lines) {
    await upsertAccrualLine(client, line);
  }
};

export default defineLogicFunction({
  universalIdentifier: IDS.logicFunction.accrueFixedPay,
  name: 'accrue-fixed-pay',
  description:
    "Writes this month's fixed pay line for each active worker who has a fixed rule",
  timeoutSeconds: 300,
  // 19:15 UTC is 00:15 in Tashkent, after refresh-deadline-states.
  cronTriggerSettings: { pattern: '15 19 * * *' },
  handler,
});
