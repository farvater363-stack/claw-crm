import { type CoreApiClient } from 'twenty-client-sdk/core';
import { type MetadataApiClient } from 'twenty-client-sdk/metadata';
import { describe, expect, it } from 'vitest';

import { IDS } from 'src/constants/universal-identifiers';
import {
  acceptPayment,
  cancelOrder,
  findMeasurementFormPageId,
  isPaymentStored,
  loadOrderHeader,
  writeStep,
} from 'src/order-header/load-order-header';

type Request = Record<string, { __args?: unknown }>;

const page = (nodes: Record<string, unknown>[]) => ({
  edges: nodes.map((node) => ({ node })),
  pageInfo: { hasNextPage: false, endCursor: null },
});

const micros = (amount: number) => ({
  amountMicros: amount * 1_000_000,
  currencyCode: 'UZS',
});

const ORDER = {
  id: 'order-1',
  name: '№1042',
  status: 'MEASURED',
  clientName: 'Клиент 1',
  clientPhone: '+998900000001',
  district: 'CHILANZAR',
  floor: 4,
  materialState: 'ENOUGH',
  materialNote: null,
  total: micros(1_410_000),
  paid: micros(500_000),
  balance: micros(910_000),
  masterId: null,
  installerId: 'worker-2',
  cancelReason: null,
};

const WORKERS = [
  { id: 'worker-1', name: 'Работник 1', categories: ['MASTER'] },
  { id: 'worker-2', name: 'Работник 2', categories: ['INSTALLER', 'SALES'] },
  { id: 'worker-3', name: 'Работник 3', categories: ['MASTER', 'INSTALLER'] },
  { id: 'worker-4', name: 'Работник 4', categories: null },
];

const MEMBERS = [
  { id: 'member-1', name: { firstName: 'Замерщик', lastName: '1' } },
  { id: 'member-2', name: { firstName: 'Менеджер', lastName: '' } },
];

const fakeClient = ({
  orders = [ORDER] as Record<string, unknown>[],
  payments = [] as Record<string, unknown>[],
  workersError = null as Error | null,
} = {}) => {
  const queries: Request[] = [];
  const mutations: Request[] = [];
  const client = {
    query: async (request: Request) => {
      queries.push(request);

      if (request.masters && workersError) throw workersError;

      return {
        orders: page(orders),
        orderPayments: page(payments),
        workspaceMembers: page(MEMBERS),
        masters: page(WORKERS),
      };
    },
    mutation: async (request: Request) => {
      mutations.push(request);

      return {};
    },
  } as unknown as CoreApiClient;

  return { client, queries, mutations };
};

describe('loadOrderHeader', () => {
  it('reads the order with money in whole sums and the district by its label', async () => {
    const { client, queries } = fakeClient();

    expect((await loadOrderHeader(client, 'order-1'))?.order).toEqual({
      id: 'order-1',
      name: '№1042',
      status: 'MEASURED',
      clientName: 'Клиент 1',
      clientPhone: '+998900000001',
      districtLabel: 'Чиланзарский',
      floor: 4,
      materialState: 'ENOUGH',
      materialNote: null,
      total: 1_410_000,
      paid: 500_000,
      balance: 910_000,
      masterId: null,
      installerId: 'worker-2',
      cancelReason: null,
    });
    expect(
      queries.find((request) => request.orders)?.orders.__args,
    ).toMatchObject({ filter: { id: { eq: 'order-1' } }, first: 1 });
  });

  it('offers active workers by category and every workspace member', async () => {
    const { client, queries } = fakeClient();
    const data = await loadOrderHeader(client, 'order-1');

    expect(data?.masters).toEqual([
      { value: 'worker-1', label: 'Работник 1' },
      { value: 'worker-3', label: 'Работник 3' },
    ]);
    expect(data?.installers).toEqual([
      { value: 'worker-2', label: 'Работник 2' },
      { value: 'worker-3', label: 'Работник 3' },
    ]);
    expect(data?.measurers).toEqual([
      { value: 'member-1', label: 'Замерщик 1' },
      { value: 'member-2', label: 'Менеджер' },
    ]);
    expect(
      queries.find((request) => request.masters)?.masters.__args,
    ).toMatchObject({ filter: { isActive: { eq: true } } });
  });

  it('asks for workers apart from the order, so a role without them still gets the header', async () => {
    const { client, queries } = fakeClient({
      workersError: new Error('User does not have permission'),
    });
    const data = await loadOrderHeader(client, 'order-1');

    expect(data?.order.id).toBe('order-1');
    expect(data?.masters).toEqual([]);
    expect(data?.installers).toEqual([]);
    expect(queries.find((request) => request.orders)?.masters).toBeUndefined();
  });

  it('passes on an error that is not about rights', async () => {
    const { client } = fakeClient({ workersError: new Error('Network down') });

    await expect(loadOrderHeader(client, 'order-1')).rejects.toThrow(
      'Network down',
    );
  });

  it('returns null for an order that is gone', async () => {
    const { client } = fakeClient({ orders: [] });

    expect(await loadOrderHeader(client, 'order-1')).toBeNull();
  });
});

describe('writes', () => {
  it('writes a step as one update of the order', async () => {
    const { client, mutations } = fakeClient();

    await writeStep(client, 'order-1', {
      status: 'PRODUCTION',
      masterId: 'worker-1',
    });

    expect(mutations).toEqual([
      {
        updateOrder: {
          __args: {
            id: 'order-1',
            data: { status: 'PRODUCTION', masterId: 'worker-1' },
          },
          id: true,
        },
      },
    ]);
  });

  it('cancels with the reason', async () => {
    const { client, mutations } = fakeClient();

    await cancelOrder(client, 'order-1', 'TOO_EXPENSIVE');

    expect(mutations[0]?.updateOrder.__args).toEqual({
      id: 'order-1',
      data: { status: 'CANCELLED', cancelReason: 'TOO_EXPENSIVE' },
    });
  });

  it('records a payment under the id of the attempt, so a retry cannot record it twice', async () => {
    const { client, mutations } = fakeClient();

    await acceptPayment(client, 'payment-1', {
      orderId: 'order-1',
      amount: 410_000,
      method: 'CASH',
      comment: 'остаток',
      paidOn: '2026-10-04',
    });

    expect(mutations[0]?.createOrderPayment.__args).toEqual({
      data: {
        id: 'payment-1',
        orderId: 'order-1',
        amount: { amountMicros: 410_000_000_000, currencyCode: 'UZS' },
        method: 'CASH',
        comment: 'остаток',
        paidOn: '2026-10-04',
      },
      upsert: true,
    });
  });
});

describe('isPaymentStored', () => {
  it('finds the payment of an attempt whose answer was lost', async () => {
    const { client, queries } = fakeClient({ payments: [{ id: 'payment-1' }] });

    expect(await isPaymentStored(client, 'payment-1')).toBe(true);
    expect(queries[0]?.orderPayments.__args).toEqual({
      filter: { id: { eq: 'payment-1' } },
      first: 1,
    });
  });

  it('says no when the payment never reached the server', async () => {
    const { client } = fakeClient();

    expect(await isPaymentStored(client, 'payment-1')).toBe(false);
  });
});

describe('findMeasurementFormPageId', () => {
  const metadataClient = (
    layouts: { id: string; universalIdentifier: string }[],
  ) =>
    ({
      query: async () => ({ getPageLayouts: layouts }),
    }) as unknown as MetadataApiClient;

  it('finds the id «Новый замер» has in this workspace', async () => {
    expect(
      await findMeasurementFormPageId(
        metadataClient([
          { id: 'layout-1', universalIdentifier: IDS.stock.pageLayout },
          { id: 'layout-2', universalIdentifier: IDS.measurerForm.pageLayout },
        ]),
      ),
    ).toBe('layout-2');
  });

  it('returns null when the page is not installed', async () => {
    expect(await findMeasurementFormPageId(metadataClient([]))).toBeNull();
  });
});
