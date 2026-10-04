import { describe, expect, it } from 'vitest';

import {
  ALL_PAYOUTS_NOTE,
  checkDeleteConfirmation,
  DELETE_BATCH_SIZE,
  type DeleteObject,
  describeDeletedBatch,
  describeRun,
  planDeleteAllOrders,
} from 'src/moves/plan-delete-all-orders';

const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}`);

const idsByObject = (
  overrides: Partial<Record<DeleteObject, string[]>> = {},
): Record<DeleteObject, string[]> => ({
  orders: [],
  orderPayments: [],
  payAccruals: [],
  orderItems: [],
  orderExtraServices: [],
  orderMaterials: [],
  stockMovements: [],
  masterPayments: [],
  ...overrides,
});

const plan = (
  overrides: Partial<Parameters<typeof planDeleteAllOrders>[0]> = {},
) =>
  planDeleteAllOrders({
    apiUrl: 'http://localhost:3000',
    confirmation: undefined,
    apply: false,
    deletePayouts: false,
    idsByObject: idsByObject(),
    ...overrides,
  });

describe('planDeleteAllOrders', () => {
  it('counts every object, in the order it is deleted', () => {
    expect(
      plan({
        idsByObject: idsByObject({
          orders: ids('order', 3),
          orderItems: ids('item', 5),
          stockMovements: ids('movement', 2),
        }),
      }).counts,
    ).toEqual([
      { label: 'orders', count: 3 },
      { label: 'payments', count: 0 },
      { label: 'accruals of orders', count: 0 },
      { label: 'positions', count: 5 },
      { label: 'service lines', count: 0 },
      { label: 'material lines', count: 0 },
      { label: 'stock movements of orders', count: 2 },
    ]);
  });

  it('deletes orders first, so no trigger can write a line back, and stock movements last', () => {
    const { batches } = plan({
      idsByObject: idsByObject({
        stockMovements: ['movement-1'],
        orderMaterials: ['line-1'],
        orderExtraServices: ['service-1'],
        orderItems: ['item-1'],
        payAccruals: ['accrual-1'],
        orderPayments: ['payment-1'],
        orders: ['order-1'],
      }),
    });

    expect(batches.map(({ mutation }) => mutation)).toEqual([
      'deleteOrders',
      'deleteOrderPayments',
      'deletePayAccruals',
      'deleteOrderItems',
      'deleteOrderExtraServices',
      'deleteOrderMaterials',
      'deleteStockMovements',
    ]);
    expect(batches[0]).toEqual({
      mutation: 'deleteOrders',
      label: 'orders',
      ids: ['order-1'],
    });
  });

  it('splits the ids of one object into batches', () => {
    const { batches } = plan({
      idsByObject: idsByObject({
        orderItems: ids('item', DELETE_BATCH_SIZE * 2 + 1),
      }),
    });

    expect(batches.map(({ ids: batchIds }) => batchIds.length)).toEqual([
      DELETE_BATCH_SIZE,
      DELETE_BATCH_SIZE,
      1,
    ]);
    expect(batches.flatMap(({ ids: batchIds }) => batchIds)).toEqual(
      ids('item', DELETE_BATCH_SIZE * 2 + 1),
    );
  });

  it('plans nothing when nothing is left', () => {
    expect(plan().batches).toEqual([]);
  });

  it('keeps the payouts to workers unless asked, and says how many', () => {
    const result = plan({
      idsByObject: idsByObject({
        orders: ['order-1'],
        masterPayments: ids('payout', 4),
      }),
    });

    expect(result.payoutsKept).toBe(4);
    expect(result.counts.map(({ label }) => label)).not.toContain(
      'payouts to workers',
    );
    expect(result.batches.map(({ mutation }) => mutation)).toEqual([
      'deleteOrders',
    ]);
  });

  it('deletes the payouts to workers last when asked', () => {
    const result = plan({
      deletePayouts: true,
      idsByObject: idsByObject({
        masterPayments: ids('payout', 2),
        stockMovements: ['movement-1'],
      }),
    });

    expect(result.payoutsKept).toBeNull();
    expect(result.counts[result.counts.length - 1]).toEqual({
      label: 'payouts to workers',
      count: 2,
    });
    expect(result.batches).toEqual([
      {
        mutation: 'deleteStockMovements',
        label: 'stock movements of orders',
        ids: ['movement-1'],
      },
      {
        mutation: 'deleteMasterPayments',
        label: 'payouts to workers',
        ids: ids('payout', 2),
      },
    ]);
  });

  it('never refuses a dry run', () => {
    expect(plan({ apply: false, confirmation: undefined }).refusal).toBeNull();
  });

  it.each([
    ['nothing', undefined],
    ['an empty value', ''],
    ['a plain yes', 'yes'],
    ['the name of another server', 'app.example.test'],
    ['the whole address', 'http://localhost:3000'],
    ['the host without its port', 'localhost'],
    ['the host with another port', 'localhost:3001'],
    ['the host in other letters', 'LOCALHOST:3000'],
  ])('refuses to apply when the confirmation is %s', (_, confirmation) => {
    expect(plan({ apply: true, confirmation }).refusal).toBe(
      'Refusing to delete on localhost:3000: CONFIRM_DELETE_ALL_ORDERS must be exactly "localhost:3000", the host of TWENTY_API_URL with its port.',
    );
  });

  it.each([
    ['http://localhost:3000', 'localhost:3000'],
    ['https://app.example.test', 'app.example.test'],
    ['https://app.example.test:8443/graphql', 'app.example.test:8443'],
  ])('applies on %s only with the confirmation %s', (apiUrl, host) => {
    const result = plan({ apply: true, apiUrl, confirmation: host });

    expect(result.host).toBe(host);
    expect(result.refusal).toBeNull();
  });

  it.each([
    ['https://app.example.test:8443', 'app.example.test'],
    ['https://app.example.test', 'app.example.test:8443'],
  ])('refuses %s when the confirmation is %s', (apiUrl, confirmation) => {
    expect(plan({ apply: true, apiUrl, confirmation }).refusal).not.toBeNull();
  });
});

describe('checkDeleteConfirmation', () => {
  it('names the server and refuses before anything is read', () => {
    expect(
      checkDeleteConfirmation({
        apiUrl: 'https://app.example.test:8443',
        confirmation: 'localhost',
        apply: true,
      }),
    ).toEqual({
      host: 'app.example.test:8443',
      refusal:
        'Refusing to delete on app.example.test:8443: CONFIRM_DELETE_ALL_ORDERS must be exactly "app.example.test:8443", the host of TWENTY_API_URL with its port.',
    });
  });

  it.each([
    ['has no scheme', 'app.example.test'],
    ['has a port and no scheme', 'localhost:3000'],
    ['is empty', ''],
    ['is not a web address', 'ftp://app.example.test'],
  ])('refuses, dry run included, when the address %s', (_, apiUrl) => {
    for (const apply of [true, false]) {
      expect(
        checkDeleteConfirmation({ apiUrl, confirmation: '', apply }),
      ).toEqual({
        host: '',
        refusal: `TWENTY_API_URL is "${apiUrl}": it needs http:// or https:// in front to name a server.`,
      });
    }
  });
});

describe('describeRun', () => {
  const run = {
    host: 'localhost:3000',
    graphqlUrl: 'http://localhost:3000/graphql',
    apply: false,
    deletePayouts: false,
  };

  it('names the server and the mode', () => {
    expect(describeRun(run)).toBe(
      'delete-all-orders on localhost:3000 (http://localhost:3000/graphql): dry run, nothing will be deleted',
    );
    expect(describeRun({ ...run, apply: true })).toBe(
      'delete-all-orders on localhost:3000 (http://localhost:3000/graphql): APPLY, records will be deleted',
    );
  });

  it('says that all payouts go when they are asked for', () => {
    expect(describeRun({ ...run, apply: true, deletePayouts: true })).toBe(
      `delete-all-orders on localhost:3000 (http://localhost:3000/graphql): APPLY, records will be deleted. MOVE_PAYOUTS=delete: ${ALL_PAYOUTS_NOTE}`,
    );
    expect(ALL_PAYOUTS_NOTE).toBe(
      'ALL payouts to workers are deleted, because a payout is not tied to an order',
    );
  });
});

describe('describeDeletedBatch', () => {
  it('reports the rows the server returned', () => {
    expect(
      describeDeletedBatch({ label: 'orders', sent: 20, returned: 20 }),
    ).toBe('deleted 20 orders');
  });

  it('says so plainly when the server returned fewer rows than were sent', () => {
    expect(
      describeDeletedBatch({ label: 'orders', sent: 20, returned: 18 }),
    ).toBe(
      'deleted 18 orders, FEWER than the 20 sent: the server did not delete 2 of them',
    );
  });
});
