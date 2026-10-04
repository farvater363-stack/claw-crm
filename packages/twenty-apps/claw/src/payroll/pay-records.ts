import {
  ACCRUAL_METHOD_OPTIONS,
  PAY_METHOD_OPTIONS,
  WORKER_CATEGORY_OPTIONS,
} from 'src/constants/select-options';
import { type KeptRate, type PayRule } from 'src/payroll/pay-rules';
// Type only, as a whole statement: that module imports node:crypto, which must not reach a front component's bundle.
import type { AccrualLine } from 'src/payroll/plan-order-accruals';
import { fromCurrency } from 'src/recalc/money';

export const PAY_RULE_SELECTION = {
  id: true,
  workerId: true,
  method: true,
  work: true,
  amount: { amountMicros: true },
  percent: true,
} as const;

// The recalc and the accrual sync read the rules through this one query, so of
// two rules of one method both pick the same first one.
// ponytail: every rule in one page of 200; filter by the order's people and page when workers times rules passes it.
export const ALL_PAY_RULES_QUERY = {
  __args: { first: 200 },
  edges: { node: PAY_RULE_SELECTION },
} as const;

type Money = { amountMicros?: number | string | null } | null;

type PayRuleNode = {
  id: string;
  workerId?: string | null;
  method?: string | null;
  work?: string | null;
  amount?: Money;
  percent?: number | null;
};

export const toWork = (work: string | null | undefined) =>
  WORKER_CATEGORY_OPTIONS.find((option) => option.value === work)?.value ??
  null;

// A rule without a worker, or with a method this version does not know, pays nothing.
export const toPayRule = (node: PayRuleNode): PayRule | null => {
  const method = PAY_METHOD_OPTIONS.find(
    (option) => option.value === node.method,
  )?.value;

  if (!node.workerId || method === undefined) return null;

  return {
    id: node.id,
    workerId: node.workerId,
    method,
    work: toWork(node.work),
    amount: fromCurrency(node.amount),
    percent:
      typeof node.percent === 'number' && Number.isFinite(node.percent)
        ? node.percent
        : null,
  };
};

export const toPayRules = (nodes: PayRuleNode[]): PayRule[] =>
  nodes.flatMap((node) => toPayRule(node) ?? []);

// The rates already written on an order's lines for its master. They win over
// his rules, so a rule changed after the order was installed does not reprice it.
export const keptMasterRates = (
  lines: {
    workerId?: string | null;
    work?: string | null;
    method?: string | null;
    rate?: number | null;
  }[],
  masterId: string,
): KeptRate[] =>
  lines.flatMap((line) =>
    line.workerId === masterId &&
    line.work === 'MASTER' &&
    (line.method === 'PER_SQUARE_METER' || line.method === 'PER_ORDER')
      ? [{ method: line.method, rate: line.rate ?? 0 }]
      : [],
  );

export const ACCRUAL_SELECTION = {
  id: true,
  workerId: true,
  orderId: true,
  earnedOn: true,
  method: true,
  work: true,
  basis: true,
  rate: true,
  amount: { amountMicros: true },
  name: true,
} as const;

type AccrualNode = {
  id: string;
  workerId?: string | null;
  orderId?: string | null;
  earnedOn?: string | null;
  method?: string | null;
  work?: string | null;
  basis?: number | null;
  rate?: number | null;
  amount?: Money;
  name?: string | null;
};

// A NaN never equals itself, so a stored one would make the sync rewrite the line on every run.
const finiteOrZero = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

// A line without a worker or a date belongs to no row and no month.
export const toAccrualLine = (node: AccrualNode): AccrualLine | null => {
  const method = ACCRUAL_METHOD_OPTIONS.find(
    (option) => option.value === node.method,
  )?.value;

  if (!node.workerId || !node.earnedOn || method === undefined) return null;

  return {
    id: node.id,
    workerId: node.workerId,
    orderId: node.orderId ?? null,
    earnedOn: String(node.earnedOn).slice(0, 10),
    method,
    work: toWork(node.work),
    basis: finiteOrZero(node.basis),
    rate: finiteOrZero(node.rate),
    amount: fromCurrency(node.amount) ?? 0,
    name: node.name ?? '',
  };
};
