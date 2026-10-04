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
  openWithHandOff,
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
  updatedOrders = [{ id: 'order-1' }] as { id: string }[],
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

      return { updateOrders: updatedOrders };
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
  it('writes a step only while the order is in the status the header showed', async () => {
    const { client, mutations } = fakeClient();

    expect(
      await writeStep(client, 'order-1', 'MEASURED', {
        status: 'PRODUCTION',
        masterId: 'worker-1',
      }),
    ).toBe('saved');
    expect(mutations).toEqual([
      {
        updateOrders: {
          __args: {
            filter: { id: { eq: 'order-1' }, status: { eq: 'MEASURED' } },
            data: { status: 'PRODUCTION', masterId: 'worker-1' },
          },
          id: true,
        },
      },
    ]);
  });

  // The server applies the status filter, so an order somebody else has
  // moved or cancelled is matched by nothing and stays where it is.
  it('reports a step on an order that is no longer in that status as moved', async () => {
    const { client, mutations } = fakeClient({ updatedOrders: [] });

    expect(
      await writeStep(client, 'order-1', 'MEASURED', { status: 'PRODUCTION' }),
    ).toBe('moved');
    expect(mutations).toHaveLength(1);
  });

  it('cancels with the reason, only while the order is in the status the header showed', async () => {
    const { client, mutations } = fakeClient();

    expect(
      await cancelOrder(client, 'order-1', 'PRODUCTION', 'TOO_EXPENSIVE'),
    ).toBe('saved');
    expect(mutations).toEqual([
      {
        updateOrders: {
          __args: {
            filter: { id: { eq: 'order-1' }, status: { eq: 'PRODUCTION' } },
            data: { status: 'CANCELLED', cancelReason: 'TOO_EXPENSIVE' },
          },
          id: true,
        },
      },
    ]);
  });

  it('reports a cancel of an order that is no longer in that status as moved', async () => {
    const { client, mutations } = fakeClient({ updatedOrders: [] });

    expect(
      await cancelOrder(client, 'order-1', 'PRODUCTION', 'TOO_EXPENSIVE'),
    ).toBe('moved');
    expect(mutations).toHaveLength(1);
  });

  it('matches an order without a status by its empty status', async () => {
    const { client, mutations } = fakeClient();

    await cancelOrder(client, 'order-1', null, 'TOO_EXPENSIVE');

    expect(mutations[0]?.updateOrders.__args).toMatchObject({
      filter: { id: { eq: 'order-1' }, status: { is: 'NULL' } },
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

describe('openWithHandOff', () => {
  const handOff = ({
    remember = () => undefined,
    open = async () => undefined,
  }: { remember?: () => void; open?: () => Promise<void> } = {}) => {
    const calls: string[] = [];
    const result = openWithHandOff({
      remember: () => {
        calls.push('remember');
        remember();
      },
      forget: () => {
        calls.push('forget');
      },
      open: () => {
        calls.push('open');

        return open();
      },
    });

    return { calls, result };
  };

  it('remembers the order, then opens the form', async () => {
    const { calls, result } = handOff();

    expect(await result).toBe(true);
    expect(calls).toEqual(['remember', 'open']);
  });

  it('forgets the order when opening throws at once', async () => {
    const { calls, result } = handOff({
      open: () => {
        throw new Error('navigate is not available');
      },
    });

    expect(await result).toBe(false);
    expect(calls).toEqual(['remember', 'open', 'forget']);
  });

  it('forgets the order when opening is refused later', async () => {
    const { calls, result } = handOff({
      open: async () => {
        throw new Error('refused');
      },
    });

    expect(await result).toBe(false);
    expect(calls).toEqual(['remember', 'open', 'forget']);
  });

  it('does not open the form when the order cannot be remembered', async () => {
    const { calls, result } = handOff({
      remember: () => {
        throw new Error('storage is not available');
      },
    });

    expect(await result).toBe(false);
    expect(calls).toEqual(['remember']);
  });

  it('says no even when forgetting fails too', async () => {
    expect(
      await openWithHandOff({
        remember: () => undefined,
        forget: () => {
          throw new Error('storage is not available');
        },
        open: async () => {
          throw new Error('refused');
        },
      }),
    ).toBe(false);
  });
});
