import { describe, expect, it } from 'vitest';

import { type PayRule, withLegacyMasterRate } from 'src/payroll/pay-rules';
import { masterRateRuleId, type MoveWorker, planMastersToRules } from 'src/payroll/plan-masters-to-rules';

const worker = (overrides: Partial<MoveWorker> = {}): MoveWorker => ({
  id: 'worker-3',
  categories: [],
  ratePerSquareMeter: 25_000,
  ...overrides,
});

const MASTER_RULE: PayRule = {
  id: masterRateRuleId('worker-3'),
  workerId: 'worker-3',
  method: 'PER_SQUARE_METER',
  work: 'MASTER',
  amount: 25_000,
  percent: null,
};

const NOTHING = { categoryUpdates: [], ruleCreates: [], removedRuleWorkerIds: [] };

describe('masterRateRuleId', () => {
  it('gives one worker one id and two workers two', () => {
    expect(masterRateRuleId('worker-3')).toBe(masterRateRuleId('worker-3'));
    expect(masterRateRuleId('worker-3')).not.toBe(masterRateRuleId('worker-2'));
    expect(masterRateRuleId('worker-3')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('planMastersToRules', () => {
  it('makes a worker with a rate a master with one per-m² rule', () => {
    expect(planMastersToRules({ workers: [worker()], rules: [] })).toEqual({
      ...NOTHING,
      categoryUpdates: [{ workerId: 'worker-3', categories: ['MASTER'] }],
      ruleCreates: [MASTER_RULE],
    });
  });

  it('makes a worker from before the categories a master even without a rate', () => {
    for (const ratePerSquareMeter of [0, null]) {
      expect(planMastersToRules({ workers: [worker({ ratePerSquareMeter })], rules: [] })).toEqual({
        ...NOTHING,
        categoryUpdates: [{ workerId: 'worker-3', categories: ['MASTER'] }],
      });
    }
  });

  it('keeps the categories a worker already has and leaves a worker without a rate alone', () => {
    const plan = planMastersToRules({
      workers: [
        worker({ categories: ['SALES'] }),
        worker({ id: 'worker-2', categories: ['INSTALLER'], ratePerSquareMeter: null }),
      ],
      rules: [],
    });

    expect(plan.categoryUpdates).toEqual([{ workerId: 'worker-3', categories: ['MASTER', 'SALES'] }]);
    expect(plan.ruleCreates.map((rule) => rule.workerId)).toEqual(['worker-3']);
  });

  it('gives a master who has a rate and no rule only the rule', () => {
    expect(planMastersToRules({ workers: [worker({ categories: ['MASTER'] })], rules: [] })).toEqual({
      ...NOTHING,
      ruleCreates: [MASTER_RULE],
    });
  });

  it('adds no rule to a worker whose per-m² master rule was made on the screen', () => {
    const own: PayRule = { ...MASTER_RULE, id: 'made-on-the-screen', amount: 30_000 };

    expect(planMastersToRules({ workers: [worker({ categories: ['MASTER'] })], rules: [own] })).toEqual(NOTHING);
  });

  it('still adds the rule when the worker has other rules only', () => {
    const others: PayRule[] = [
      { ...MASTER_RULE, id: 'per-order', method: 'PER_ORDER' },
      { ...MASTER_RULE, id: 'installer', work: 'INSTALLER' },
      { ...MASTER_RULE, id: 'of-another', workerId: 'worker-2' },
    ];

    expect(planMastersToRules({ workers: [worker()], rules: others }).ruleCreates).toEqual([MASTER_RULE]);
  });

  it('plans nothing on a second run', () => {
    expect(planMastersToRules({ workers: [worker({ categories: ['MASTER'] })], rules: [MASTER_RULE] })).toEqual(
      NOTHING,
    );
  });

  it('finishes a run that stopped between the category and the rule, either way round', () => {
    expect(planMastersToRules({ workers: [worker()], rules: [MASTER_RULE] })).toEqual({
      ...NOTHING,
      categoryUpdates: [{ workerId: 'worker-3', categories: ['MASTER'] }],
    });
  });

  it('does not bring back a moved rule the owner removed, and names the worker', () => {
    expect(
      planMastersToRules({
        workers: [worker({ categories: ['MASTER'] })],
        rules: [],
        removedRuleIds: [masterRateRuleId('worker-3')],
      }),
    ).toEqual({ ...NOTHING, removedRuleWorkerIds: ['worker-3'] });
  });

  it('adds the rule exactly where the order recalc would still pay by the old rate', () => {
    const workers = [
      worker(),
      worker({ id: 'worker-2', ratePerSquareMeter: 0 }),
      worker({ id: 'worker-1', ratePerSquareMeter: 18_000 }),
    ];
    const rules: PayRule[] = [{ ...MASTER_RULE, id: 'own', workerId: 'worker-1' }];
    const paidByOldRate = workers
      .filter(
        ({ id, ratePerSquareMeter }) =>
          withLegacyMasterRate(rules, { workerId: id, ratePerSquareMeter: ratePerSquareMeter ?? 0 }) !== rules,
      )
      .map(({ id }) => id);

    expect(planMastersToRules({ workers, rules }).ruleCreates.map((rule) => rule.workerId)).toEqual(paidByOldRate);
  });
});
