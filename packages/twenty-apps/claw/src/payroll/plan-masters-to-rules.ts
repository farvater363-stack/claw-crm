import { WORKER_CATEGORY_OPTIONS, type WorkerCategory } from 'src/constants/select-options';
import { type PayRule } from 'src/payroll/pay-rules';
import { deterministicUuid } from 'src/utils/deterministic-uuid';

export type MoveWorker = { id: string; categories: string[]; ratePerSquareMeter: number | null };

// One id per worker: a run that stopped half-way and is started again upserts
// the same rule, it cannot add a second one.
export const masterRateRuleId = (workerId: string): string => deterministicUuid(`pay-rule:master-rate:${workerId}`);

export const planMastersToRules = ({
  workers,
  rules,
  removedRuleIds = [],
}: {
  workers: MoveWorker[];
  rules: PayRule[];
  // Ids of soft-deleted rules: an upsert on such an id would bring the rule back.
  removedRuleIds?: string[];
}): {
  categoryUpdates: { workerId: string; categories: WorkerCategory[] }[];
  ruleCreates: PayRule[];
  // Workers whose moved rule the owner removed afterwards; nothing is written for them.
  removedRuleWorkerIds: string[];
} => {
  const rateOf = (worker: MoveWorker) => worker.ratePerSquareMeter ?? 0;
  // The same condition as withLegacyMasterRate: the order recalc stops paying by
  // the old rate exactly for the workers who have this rule.
  const hasMasterRule = (workerId: string) =>
    rules.some((rule) => rule.workerId === workerId && rule.method === 'PER_SQUARE_METER' && rule.work === 'MASTER');
  const withoutRule = workers.filter((worker) => rateOf(worker) > 0 && !hasMasterRule(worker.id));
  const isRemoved = (worker: MoveWorker) => removedRuleIds.includes(masterRateRuleId(worker.id));

  return {
    // Everybody who existed before the categories did was a master.
    categoryUpdates: workers
      .filter(
        (worker) => !worker.categories.includes('MASTER') && (rateOf(worker) > 0 || worker.categories.length === 0),
      )
      .map((worker) => ({
        workerId: worker.id,
        categories: WORKER_CATEGORY_OPTIONS.map((option) => option.value).filter(
          (value) => value === 'MASTER' || worker.categories.includes(value),
        ),
      })),
    ruleCreates: withoutRule
      .filter((worker) => !isRemoved(worker))
      .map((worker) => ({
        id: masterRateRuleId(worker.id),
        workerId: worker.id,
        method: 'PER_SQUARE_METER',
        work: 'MASTER',
        amount: rateOf(worker),
        percent: null,
      })),
    removedRuleWorkerIds: withoutRule.filter(isRemoved).map((worker) => worker.id),
  };
};
