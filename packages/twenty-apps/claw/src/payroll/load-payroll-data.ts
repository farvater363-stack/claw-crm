import { type CoreApiClient } from 'twenty-client-sdk/core';

import { WORKER_CATEGORY_OPTIONS, type WorkerCategory } from 'src/constants/select-options';
import { type PayrollPayment, type PayrollWorker } from 'src/payroll/compute-monthly-payroll';
import { ACCRUAL_SELECTION, PAY_RULE_SELECTION, toAccrualLine, toPayRules } from 'src/payroll/pay-records';
import { describePayRule, type PayRule } from 'src/payroll/pay-rules';
import { type buildPaymentInput } from 'src/payroll/payment-draft';
import { shiftMonth } from 'src/payroll/payroll-month';
// Type only, as a whole statement: that module imports node:crypto, which must not reach a front component's bundle.
import type { AccrualLine } from 'src/payroll/plan-order-accruals';
import { fromCurrency, toCurrency } from 'src/recalc/money';
import { fetchAllPages, PAGE_INFO } from 'src/utils/fetch-all-pages';
import { type FullName, joinFullName } from 'src/utils/full-name';

export type PayrollScreenWorker = PayrollWorker & { loginId: string | null; penaltyPercentPerDay: number };

export type PayrollData = {
  workers: PayrollScreenWorker[];
  rules: PayRule[];
  accruals: AccrualLine[];
  payments: PayrollPayment[];
  // Workspace members, for the «Логин» select
  logins: { id: string; name: string }[];
  // Records in no sum because their worker, date or amount is missing
  skipped: { payments: number; accruals: number };
};

export type WorkerChange = Partial<{
  categories: WorkerCategory[];
  loginId: string | null;
  penaltyPercentPerDay: number;
  isActive: boolean;
}>;

export type PaymentData = Extract<ReturnType<typeof buildPaymentInput>, { isValid: true }>['data'];

// Twenty caps a page at 200 records.
const PAGE_SIZE = 200;

// A role without read on payments or pay lines is refused here; the screen takes that as "not the owner".
// Every worker is read, the ones who left included: what is still owed to them must keep its row.
// ponytail: reads every line and payment up to the month's end on each open; store a closing balance per month when the history passes a few thousand lines.
export const loadPayrollData = async (client: CoreApiClient, month: string): Promise<PayrollData> => {
  const firstDayAfter = `${shiftMonth(month, 1)}-01`;
  // "Before a day" does not match an empty date, and a record never read could not be reported as left out.
  const isUndated = { is: 'NULL' as const };
  const [paymentNodes, accrualNodes, workerNodes, ruleNodes, memberNodes] = await Promise.all([
    fetchAllPages(async (after) => {
      const { masterPayments } = await client.query({
        masterPayments: {
          __args: {
            filter: { or: [{ paidOn: { lt: firstDayAfter } }, { paidOn: isUndated }] },
            first: PAGE_SIZE,
            after,
          },
          edges: {
            node: { id: true, masterId: true, paidOn: true, amount: { amountMicros: true }, kind: true, comment: true },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return masterPayments;
    }),
    fetchAllPages(async (after) => {
      const { payAccruals } = await client.query({
        payAccruals: {
          __args: {
            filter: { or: [{ earnedOn: { lt: firstDayAfter } }, { earnedOn: isUndated }] },
            first: PAGE_SIZE,
            after,
          },
          edges: { node: { ...ACCRUAL_SELECTION, order: { id: true } } },
          pageInfo: PAGE_INFO,
        },
      });

      return payAccruals;
    }),
    fetchAllPages(async (after) => {
      const { masters } = await client.query({
        masters: {
          __args: { first: PAGE_SIZE, after },
          edges: {
            node: { id: true, fullName: { firstName: true, lastName: true }, isActive: true, categories: true, loginId: true, penaltyPercentPerDay: true },
          },
          pageInfo: PAGE_INFO,
        },
      });

      return masters;
    }),
    fetchAllPages(async (after) => {
      const { payRules } = await client.query({
        payRules: { __args: { first: PAGE_SIZE, after }, edges: { node: PAY_RULE_SELECTION }, pageInfo: PAGE_INFO },
      });

      return payRules;
    }),
    fetchAllPages(async (after) => {
      const { workspaceMembers } = await client.query({
        workspaceMembers: {
          __args: { first: PAGE_SIZE, after },
          edges: { node: { id: true, name: { firstName: true, lastName: true } } },
          pageInfo: PAGE_INFO,
        },
      });

      return workspaceMembers;
    }),
  ]);

  // A soft-deleted order is not returned, so a line that names an order and gets none belongs to a deleted order.
  const liveAccrualNodes = accrualNodes.filter((node) => !node.orderId || node.order);
  // The mapper reads a missing amount as zero; here such a line is reported instead of shown as nothing earned.
  // A removed worker is not returned and has no row: what is his is reported as left out instead of vanishing.
  const workerIds = new Set(workerNodes.map((node) => node.id));
  const accruals = liveAccrualNodes
    .flatMap((node) => (fromCurrency(node.amount) === null ? [] : (toAccrualLine(node) ?? [])))
    .filter((line) => workerIds.has(line.workerId));
  const payments = paymentNodes.flatMap((node): PayrollPayment[] => {
    const amount = fromCurrency(node.amount);

    return node.masterId && workerIds.has(node.masterId) && node.paidOn && amount !== null
      ? [
          {
            id: node.id,
            masterId: node.masterId,
            paidOn: String(node.paidOn).slice(0, 10),
            amount,
            kind: node.kind ?? null,
            comment: node.comment ?? null,
          },
        ]
      : [];
  });

  return {
    workers: workerNodes.map((node) => {
      const stored: readonly (string | null | undefined)[] = node.categories ?? [];

      return {
        id: node.id,
        name: joinFullName(node.fullName),
        isActive: node.isActive !== false,
        categories: WORKER_CATEGORY_OPTIONS.map((option) => option.value).filter((value) => stored.includes(value)),
        loginId: node.loginId ?? null,
        penaltyPercentPerDay: node.penaltyPercentPerDay ?? 0,
      };
    }),
    rules: toPayRules(ruleNodes),
    accruals,
    payments,
    logins: memberNodes.map((node) => ({
      id: node.id,
      name: joinFullName(node.name) ?? 'Без имени',
    })),
    skipped: {
      payments: paymentNodes.length - payments.length,
      accruals: liveAccrualNodes.length - accruals.length,
    },
  };
};

// Each create carries the id of the user's attempt: a request whose answer was
// lost may already be stored, and its retry must overwrite that record, not add one.
export const saveWorker = async (
  client: CoreApiClient,
  id: string,
  data: { fullName: FullName; categories: WorkerCategory[] },
): Promise<void> => {
  await client.mutation({
    createMaster: { __args: { data: { id, ...data, isActive: true }, upsert: true }, id: true },
  });
};

export const updateWorker = async (client: CoreApiClient, id: string, data: WorkerChange): Promise<void> => {
  await client.mutation({ updateMaster: { __args: { id, data }, id: true } });
};

// Saves a new rule and a changed one alike: the rule's id stays, its sum and name are written again.
export const savePayRule = async (client: CoreApiClient, rule: PayRule): Promise<void> => {
  await client.mutation({
    createPayRule: {
      __args: {
        data: {
          id: rule.id,
          workerId: rule.workerId,
          method: rule.method,
          work: rule.work,
          amount: toCurrency(rule.amount),
          percent: rule.percent,
          name: describePayRule(rule),
        },
        upsert: true,
      },
      id: true,
    },
  });
};

// A soft delete: the lines already written under the rule keep their rate and stay.
export const removePayRule = async (client: CoreApiClient, id: string): Promise<void> => {
  await client.mutation({ deletePayRule: { __args: { id }, id: true } });
};

export const createPayment = async (client: CoreApiClient, id: string, data: PaymentData): Promise<void> => {
  await client.mutation({
    createMasterPayment: { __args: { data: { id, ...data }, upsert: true }, id: true },
  });
};
