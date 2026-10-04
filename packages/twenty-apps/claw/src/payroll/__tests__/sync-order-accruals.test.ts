import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import { accrualId } from 'src/payroll/plan-order-accruals';
import { syncOrderAccruals } from 'src/payroll/sync-order-accruals';
import { todayInTashkent } from 'src/pricing/dates';

type Node = Record<string, unknown>;
type Mutation = Record<string, { __args: { data?: Node; id?: string } }>;

const micros = (amount: number) => ({ amountMicros: amount * 1_000_000 });
const uzs = (amount: number) => ({ ...micros(amount), currencyCode: 'UZS' });

const ORDER: Node = {
  id: 'order-1',
  name: '№1042',
  status: 'INSTALLED',
  areaSquareMeters: 3.84,
  total: micros(1_410_000),
  masterId: null,
  installerId: 'farhod',
  soldById: null,
  measurerId: 'member-sardor',
  masterBonus: null,
  masterPenalty: null,
  installedAt: '2026-10-12',
  // 11:00 in Tashkent on the same day
  measuredAt: '2026-10-03T06:00:00.000Z',
};
const RULES: Node[] = [
  {
    id: 'r1',
    workerId: 'farhod',
    method: 'PER_SQUARE_METER',
    work: 'INSTALLER',
    amount: micros(15_000),
    percent: null,
  },
  {
    id: 'r2',
    workerId: 'sardor',
    method: 'PER_MEASUREMENT',
    work: 'MEASURER',
    amount: micros(50_000),
    percent: null,
  },
];
const WORKERS: Node[] = [
  { id: 'farhod', loginId: null, ratePerSquareMeter: micros(0) },
  { id: 'sardor', loginId: 'member-sardor', ratePerSquareMeter: micros(0) },
];
const INSTALLER_LINE_ID = accrualId({
  orderId: 'order-1',
  workerId: 'farhod',
  method: 'PER_SQUARE_METER',
  work: 'INSTALLER',
});
const MEASUREMENT_LINE_ID = accrualId({
  orderId: 'order-1',
  workerId: 'sardor',
  method: 'PER_MEASUREMENT',
  work: 'MEASURER',
});

const fakeClient = ({
  order = ORDER as Node | null,
  accruals = [] as Node[],
  rules = RULES,
  workers = WORKERS,
} = {}) => {
  const queries: Record<string, { __args?: unknown }>[] = [];
  const mutations: Mutation[] = [];
  const page = (nodes: Node[]) => ({ edges: nodes.map((node) => ({ node })) });
  const client = {
    query: async (request: Record<string, { __args?: unknown }>) => {
      queries.push(request);

      return {
        orders: page(order === null ? [] : [order]),
        payAccruals: page(accruals),
        payRules: page(rules),
        masters: page(workers),
      };
    },
    mutation: async (request: Mutation) => {
      mutations.push(request);

      return {};
    },
  } as unknown as CoreApiClient;

  return { client, queries, mutations };
};

const writtenLines = (mutations: Mutation[]): Node[] =>
  mutations.flatMap((mutation): Node[] => {
    const data = mutation.createPayAccrual?.__args.data;

    return data ? [data] : [];
  });

describe('syncOrderAccruals', () => {
  it("upserts the installer's line and the measurer's line under their fixed ids", async () => {
    const { client, queries, mutations } = fakeClient();

    await syncOrderAccruals(client, 'order-1');

    expect(queries[0].payAccruals.__args).toMatchObject({
      filter: { orderId: { eq: 'order-1' } },
    });
    expect(mutations).toEqual([
      {
        createPayAccrual: {
          __args: {
            data: {
              id: INSTALLER_LINE_ID,
              workerId: 'farhod',
              orderId: 'order-1',
              earnedOn: '2026-10-12',
              method: 'PER_SQUARE_METER',
              work: 'INSTALLER',
              basis: 3.84,
              rate: 15_000,
              amount: uzs(57_600),
              name: expect.any(String),
            },
            upsert: true,
          },
          id: true,
        },
      },
      {
        createPayAccrual: {
          __args: {
            data: {
              id: MEASUREMENT_LINE_ID,
              workerId: 'sardor',
              orderId: 'order-1',
              earnedOn: '2026-10-03',
              method: 'PER_MEASUREMENT',
              work: 'MEASURER',
              basis: 1,
              rate: 50_000,
              amount: uzs(50_000),
              name: expect.any(String),
            },
            upsert: true,
          },
          id: true,
        },
      },
    ]);
  });

  it("pays no measurement when no worker is linked to the measurer's login", async () => {
    const { client, mutations } = fakeClient({
      workers: WORKERS.map((worker) => ({ ...worker, loginId: null })),
    });

    await syncOrderAccruals(client, 'order-1');

    expect(writtenLines(mutations).map((line) => line.id)).toEqual([
      INSTALLER_LINE_ID,
    ]);
  });

  it('writes nothing on a second run', async () => {
    const first = fakeClient();

    await syncOrderAccruals(first.client, 'order-1');

    const second = fakeClient({ accruals: writtenLines(first.mutations) });

    await syncOrderAccruals(second.client, 'order-1');

    expect(second.mutations).toEqual([]);
  });

  it('soft-deletes the installation lines of an order that is no longer installed', async () => {
    const first = fakeClient();

    await syncOrderAccruals(first.client, 'order-1');

    const second = fakeClient({
      order: { ...ORDER, status: 'CANCELLED' },
      accruals: writtenLines(first.mutations),
    });

    await syncOrderAccruals(second.client, 'order-1');

    expect(second.mutations).toEqual([
      { deletePayAccrual: { __args: { id: INSTALLER_LINE_ID }, id: true } },
    ]);
  });

  it('pays a master without rules by the old rate', async () => {
    const { client, mutations } = fakeClient({
      order: {
        ...ORDER,
        masterId: 'rustam',
        installerId: null,
        measurerId: null,
      },
      rules: [],
      workers: [
        { id: 'rustam', loginId: null, ratePerSquareMeter: micros(25_000) },
      ],
    });

    await syncOrderAccruals(client, 'order-1');

    expect(writtenLines(mutations)).toMatchObject([
      {
        workerId: 'rustam',
        method: 'PER_SQUARE_METER',
        work: 'MASTER',
        rate: 25_000,
        amount: uzs(96_000),
      },
    ]);
  });

  it('reads the rules as the recalc does and takes the first of two rules of one method', async () => {
    const masterRule = (id: string, amount: number): Node => ({
      id,
      workerId: 'rustam',
      method: 'PER_SQUARE_METER',
      work: 'MASTER',
      amount: micros(amount),
      percent: null,
    });
    const { client, queries, mutations } = fakeClient({
      order: {
        ...ORDER,
        masterId: 'rustam',
        installerId: null,
        measurerId: null,
      },
      rules: [masterRule('first', 25_000), masterRule('second', 40_000)],
      // The old rate is not added next to a per-m² rule.
      workers: [
        { id: 'rustam', loginId: null, ratePerSquareMeter: micros(30_000) },
      ],
    });

    await syncOrderAccruals(client, 'order-1');

    expect(queries[0].payRules.__args).toEqual({ first: 200 });
    expect(writtenLines(mutations)).toMatchObject([
      { workerId: 'rustam', rate: 25_000, amount: uzs(96_000) },
    ]);
  });

  it('dates the lines today for an order that is installed but has no installation date', async () => {
    const { client, mutations } = fakeClient({
      order: { ...ORDER, installedAt: null, measurerId: null },
    });

    await syncOrderAccruals(client, 'order-1');

    expect(writtenLines(mutations).map((line) => line.earnedOn)).toEqual([
      todayInTashkent(),
    ]);
  });

  it('writes nothing for an order nobody is paid for', async () => {
    const { client, mutations } = fakeClient({
      order: { ...ORDER, status: 'NEW', installedAt: null, measuredAt: null },
    });

    await syncOrderAccruals(client, 'order-1');

    expect(mutations).toEqual([]);
  });

  it('does nothing for an order that is gone', async () => {
    const { client, mutations } = fakeClient({ order: null });

    await syncOrderAccruals(client, 'order-1');

    expect(mutations).toEqual([]);
  });
});
