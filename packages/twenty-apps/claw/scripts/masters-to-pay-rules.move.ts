import { CoreApiClient } from 'twenty-client-sdk/core';
import { it } from 'vitest';

// Relative paths: scripts/ is outside the tsconfig, so the src/* alias is not resolved for this file itself.
import { savePayRule, updateWorker } from '../src/payroll/load-payroll-data';
import { PAY_RULE_SELECTION, toPayRules } from '../src/payroll/pay-records';
import { describePayRule } from '../src/payroll/pay-rules';
import { planMastersToRules } from '../src/payroll/plan-masters-to-rules';
import { fromCurrency } from '../src/recalc/money';
import { fetchAllPages, PAGE_INFO } from '../src/utils/fetch-all-pages';

const IS_APPLY = process.env.MOVE === 'apply';
const PAGE_SIZE = 200;
// The API key allows 100 requests a minute, reads included.
const PAUSE_MILLISECONDS = 700;

const paced = async <TResult>(label: string, send: () => Promise<TResult>): Promise<TResult> => {
  await new Promise((resolve) => setTimeout(resolve, PAUSE_MILLISECONDS));

  try {
    return await send();
  } catch (error) {
    throw new Error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
};

it('turns each master rate into a pay rule', async () => {
  const url = process.env.TWENTY_API_URL;

  if (!url || !process.env.TWENTY_API_KEY) {
    throw new Error('Set TWENTY_API_URL and TWENTY_API_KEY');
  }

  console.log(`server: ${url}, ${IS_APPLY ? 'apply' : 'dry run (MOVE=apply writes)'}`);

  const client = new CoreApiClient();
  const workerNodes = await fetchAllPages(async (after) => {
    const { masters } = await paced('read workers', () =>
      client.query({
        masters: {
          __args: { first: PAGE_SIZE, after },
          edges: { node: { id: true, name: true, categories: true, ratePerSquareMeter: { amountMicros: true } } },
          pageInfo: PAGE_INFO,
        },
      }),
    );

    return masters;
  });
  const ruleNodes = await fetchAllPages(async (after) => {
    const { payRules } = await paced('read pay rules', () =>
      client.query({
        payRules: { __args: { first: PAGE_SIZE, after }, edges: { node: PAY_RULE_SELECTION }, pageInfo: PAGE_INFO },
      }),
    );

    return payRules;
  });
  // A rule removed on the screen is soft-deleted and a plain query skips it,
  // but an upsert on its id would bring it back.
  const removedRuleNodes = await fetchAllPages(async (after) => {
    const { payRules } = await paced('read removed pay rules', () =>
      client.query({
        payRules: {
          __args: { filter: { deletedAt: { is: 'NOT_NULL' } }, first: PAGE_SIZE, after },
          edges: { node: { id: true } },
          pageInfo: PAGE_INFO,
        },
      }),
    );

    return payRules;
  });

  const nameOf = (workerId: string) => workerNodes.find((node) => node.id === workerId)?.name || workerId;
  const plan = planMastersToRules({
    workers: workerNodes.map((node) => ({
      id: node.id,
      categories: (node.categories ?? []).flatMap((category) => category ?? []),
      ratePerSquareMeter: fromCurrency(node.ratePerSquareMeter),
    })),
    rules: toPayRules(ruleNodes),
    removedRuleIds: removedRuleNodes.map((node) => node.id),
  });

  console.log(`${url}: ${workerNodes.length} workers, ${ruleNodes.length} pay rules`);

  for (const { workerId, categories } of plan.categoryUpdates) {
    console.log(`category: ${nameOf(workerId)} -> ${categories.join(', ')}`);
  }

  for (const rule of plan.ruleCreates) {
    console.log(`rule: ${nameOf(rule.workerId)} -> ${describePayRule(rule)}`);
  }

  for (const workerId of plan.removedRuleWorkerIds) {
    console.log(`left alone: ${nameOf(workerId)} (his moved rule was removed on the screen; the old rate still pays)`);
  }

  if (!IS_APPLY) {
    console.log(
      `dry run: would write ${plan.categoryUpdates.length} category updates and ${plan.ruleCreates.length} rules; nothing written`,
    );

    return;
  }

  for (const { workerId, categories } of plan.categoryUpdates) {
    await paced(`category of ${nameOf(workerId)}`, () => updateWorker(client, workerId, { categories }));
  }

  for (const rule of plan.ruleCreates) {
    await paced(`rule of ${nameOf(rule.workerId)}`, () => savePayRule(client, rule));
  }

  console.log(`applied: ${plan.categoryUpdates.length} category updates, ${plan.ruleCreates.length} rules`);
});
