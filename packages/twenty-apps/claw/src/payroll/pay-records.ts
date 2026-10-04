import {
  PAY_METHOD_OPTIONS,
  WORKER_CATEGORY_OPTIONS,
} from 'src/constants/select-options';
import { type KeptRate, type PayRule } from 'src/payroll/pay-rules';
import { fromCurrency } from 'src/recalc/money';

export const PAY_RULE_SELECTION = {
  id: true,
  workerId: true,
  method: true,
  work: true,
  amount: { amountMicros: true },
  percent: true,
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
