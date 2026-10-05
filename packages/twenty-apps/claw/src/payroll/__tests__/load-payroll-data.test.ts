import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import {
  createPayment,
  loadPayrollData,
  removePayRule,
  savePayRule,
  saveWorker,
  updateWorker,
} from 'src/payroll/load-payroll-data';

type Node = Record<string, unknown>;
type Request = Record<string, { __args?: unknown }>;

const micros = (amount: number) => ({ amountMicros: amount * 1_000_000 });
const page = (nodes: Node[]) => ({
  edges: nodes.map((node) => ({ node })),
  pageInfo: { hasNextPage: false, endCursor: null },
});

const LINE: Node = {
  id: 'line-1',
  workerId: 'worker-2',
  orderId: 'order-1',
  order: { id: 'order-1' },
  earnedOn: '2026-10-12',
  method: 'PER_SQUARE_METER',
  work: 'INSTALLER',
  basis: 3.84,
  rate: 15_000,
  amount: micros(57_600),
  name: '№1042',
};
const PAYMENT: Node = {
  id: 'pay-1',
  masterId: 'worker-2',
  paidOn: '2026-10-05',
  amount: micros(300_000),
  kind: 'ADVANCE',
  comment: null,
};

const WORKER: Node = {
  id: 'worker-2',
  name: 'Работник 2',
  isActive: true,
  categories: ['INSTALLER'],
  loginId: null,
  penaltyPercentPerDay: 0,
};

const fakeClient = ({
  accruals = [] as Node[],
  payments = [] as Node[],
  workers = [WORKER],
  rules = [] as Node[],
  members = [] as Node[],
} = {}) => {
  const queries: Request[] = [];
  const mutations: Request[] = [];
  const client = {
    query: async (request: Request) => {
      queries.push(request);

      return {
        masterPayments: page(payments),
        payAccruals: page(accruals),
        masters: page(workers),
        payRules: page(rules),
        workspaceMembers: page(members),
      };
    },
    mutation: async (request: Request) => {
      mutations.push(request);

      return {};
    },
  } as unknown as CoreApiClient;

  return { client, queries, mutations };
};

const argsOf = (queries: Request[], root: string) => queries.find((request) => request[root])?.[root].__args;

describe('loadPayrollData', () => {
  it('asks for the lines and the payments up to the end of the month', async () => {
    const { client, queries } = fakeClient();

    await loadPayrollData(client, '2026-12');

    expect(argsOf(queries, 'payAccruals')).toMatchObject({
      filter: { or: [{ earnedOn: { lt: '2027-01-01' } }, { earnedOn: { is: 'NULL' } }] },
    });
    expect(argsOf(queries, 'masterPayments')).toMatchObject({
      filter: { or: [{ paidOn: { lt: '2027-01-01' } }, { paidOn: { is: 'NULL' } }] },
    });
  });

  it('counts a payment and a line saved without a date as left out', async () => {
    const { client } = fakeClient({
      accruals: [{ ...LINE, earnedOn: null }],
      payments: [{ ...PAYMENT, paidOn: null }, PAYMENT],
    });
    const data = await loadPayrollData(client, '2026-10');

    expect(data.payments.map((payment) => payment.id)).toEqual(['pay-1']);
    expect(data.skipped).toEqual({ payments: 1, accruals: 1 });
  });

  it('asks for every worker, the ones who left included', async () => {
    const { client, queries } = fakeClient();

    await loadPayrollData(client, '2026-10');

    expect(argsOf(queries, 'masters')).not.toHaveProperty('filter');
  });

  it('reads workers, rules, lines, payments and logins', async () => {
    const { client } = fakeClient({
      accruals: [LINE],
      payments: [PAYMENT],
      workers: [
        {
          id: 'worker-2',
          name: 'Работник 2',
          isActive: true,
          categories: ['SALES', 'INSTALLER'],
          loginId: 'member-1',
          penaltyPercentPerDay: 0,
        },
        { id: 'worker-1', name: 'Работник 1', isActive: false, categories: null, loginId: null, penaltyPercentPerDay: null },
      ],
      rules: [
        { id: 'r1', workerId: 'worker-2', method: 'PER_SQUARE_METER', work: 'INSTALLER', amount: micros(15_000), percent: null },
      ],
      members: [
        { id: 'member-1', name: { firstName: 'Логин', lastName: '1' } },
        { id: 'member-2', name: { firstName: '', lastName: '' } },
      ],
    });

    expect(await loadPayrollData(client, '2026-10')).toEqual({
      workers: [
        {
          id: 'worker-2',
          name: 'Работник 2',
          isActive: true,
          categories: ['INSTALLER', 'SALES'],
          loginId: 'member-1',
          penaltyPercentPerDay: 0,
        },
        { id: 'worker-1', name: 'Работник 1', isActive: false, categories: [], loginId: null, penaltyPercentPerDay: 0 },
      ],
      rules: [{ id: 'r1', workerId: 'worker-2', method: 'PER_SQUARE_METER', work: 'INSTALLER', amount: 15_000, percent: null }],
      accruals: [
        {
          id: 'line-1',
          workerId: 'worker-2',
          orderId: 'order-1',
          earnedOn: '2026-10-12',
          method: 'PER_SQUARE_METER',
          work: 'INSTALLER',
          basis: 3.84,
          rate: 15_000,
          amount: 57_600,
          name: '№1042',
        },
      ],
      payments: [{ id: 'pay-1', masterId: 'worker-2', paidOn: '2026-10-05', amount: 300_000, kind: 'ADVANCE', comment: null }],
      logins: [
        { id: 'member-1', name: 'Логин 1' },
        { id: 'member-2', name: 'Без имени' },
      ],
      skipped: { payments: 0, accruals: 0 },
    });
  });

  it('cuts a date with a time down to its day', async () => {
    const { client } = fakeClient({
      accruals: [{ ...LINE, earnedOn: '2026-10-12T00:00:00.000Z' }],
      payments: [{ ...PAYMENT, paidOn: '2026-10-05T00:00:00.000Z' }],
    });
    const data = await loadPayrollData(client, '2026-10');

    expect(data.accruals[0].earnedOn).toBe('2026-10-12');
    expect(data.payments[0].paidOn).toBe('2026-10-05');
  });

  it('leaves out a line of a deleted order without counting it as broken', async () => {
    const { client } = fakeClient({
      accruals: [
        { ...LINE, order: null },
        { ...LINE, id: 'fixed', orderId: null, order: null, method: 'FIXED', work: null },
      ],
    });
    const data = await loadPayrollData(client, '2026-10');

    expect(data.accruals.map((line) => line.id)).toEqual(['fixed']);
    expect(data.skipped).toEqual({ payments: 0, accruals: 0 });
  });

  it('leaves out and counts the lines and payments that cannot be counted for anyone', async () => {
    const { client } = fakeClient({
      accruals: [
        { ...LINE, id: 'no-date', earnedOn: null },
        { ...LINE, id: 'no-sum', amount: null },
        { ...LINE, id: 'bad-sum', amount: { amountMicros: 'много' } },
        { ...LINE, id: 'no-worker', workerId: null },
        LINE,
      ],
      payments: [
        { ...PAYMENT, id: 'no-worker', masterId: null },
        { ...PAYMENT, id: 'no-sum', amount: null },
        { ...PAYMENT, id: 'no-date', paidOn: '' },
        PAYMENT,
      ],
    });
    const data = await loadPayrollData(client, '2026-10');

    expect(data.accruals.map((line) => line.id)).toEqual(['line-1']);
    expect(data.payments.map((payment) => payment.id)).toEqual(['pay-1']);
    expect(data.skipped).toEqual({ payments: 3, accruals: 4 });
  });

  it('counts the lines and payments of a worker who is not in the list as left out', async () => {
    const { client } = fakeClient({
      accruals: [{ ...LINE, id: 'of-removed', workerId: 'removed' }, LINE],
      payments: [{ ...PAYMENT, id: 'to-removed', masterId: 'removed' }, PAYMENT],
    });
    const data = await loadPayrollData(client, '2026-10');

    expect(data.accruals.map((line) => line.id)).toEqual(['line-1']);
    expect(data.payments.map((payment) => payment.id)).toEqual(['pay-1']);
    expect(data.skipped).toEqual({ payments: 1, accruals: 1 });
  });
});

describe('writes', () => {
  it('creates a worker and a rule with upsert under the id of the attempt', async () => {
    const { client, mutations } = fakeClient();

    await saveWorker(client, 'worker-1', { name: 'Работник 2', categories: ['INSTALLER'] });
    await savePayRule(client, {
      id: 'rule-1',
      workerId: 'worker-1',
      method: 'PER_SQUARE_METER',
      work: 'INSTALLER',
      amount: 15_000,
      percent: null,
    });

    expect(mutations).toEqual([
      {
        createMaster: {
          __args: { data: { id: 'worker-1', name: 'Работник 2', categories: ['INSTALLER'], isActive: true }, upsert: true },
          id: true,
        },
      },
      {
        createPayRule: {
          __args: {
            data: {
              id: 'rule-1',
              workerId: 'worker-1',
              method: 'PER_SQUARE_METER',
              work: 'INSTALLER',
              amount: { amountMicros: 15_000_000_000, currencyCode: 'UZS' },
              percent: null,
              // The thousands are grouped with a no-break space.
              name: 'Установщик: 15,000 сум за м²',
            },
            upsert: true,
          },
          id: true,
        },
      },
    ]);
  });

  it('updates a worker, removes a rule and records a payment under the id of the attempt', async () => {
    const { client, mutations } = fakeClient();
    const payment = {
      name: 'Аванс · Работник 2',
      masterId: 'worker-1',
      paidOn: '2026-10-05',
      amount: { amountMicros: 300_000_000_000, currencyCode: 'UZS' as const },
      kind: 'ADVANCE' as const,
      comment: null,
    };

    await updateWorker(client, 'worker-1', { loginId: null, isActive: false });
    await removePayRule(client, 'rule-1');
    await createPayment(client, 'payment-1', payment);

    expect(mutations).toEqual([
      { updateMaster: { __args: { id: 'worker-1', data: { loginId: null, isActive: false } }, id: true } },
      { deletePayRule: { __args: { id: 'rule-1' }, id: true } },
      { createMasterPayment: { __args: { data: { id: 'payment-1', ...payment }, upsert: true }, id: true } },
    ]);
  });
});
