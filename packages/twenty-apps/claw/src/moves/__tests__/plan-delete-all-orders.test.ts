import { describe, expect, it } from 'vitest';

import {
  checkDeleteConfirmation,
  DELETE_BATCH_SIZE,
  type DeleteObject,
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
    ['the name in other letters', 'LOCALHOST'],
  ])('refuses to apply when the confirmation is %s', (_, confirmation) => {
    expect(plan({ apply: true, confirmation }).refusal).toBe(
      'Refusing to delete on localhost: CONFIRM_DELETE_ALL_ORDERS must equal "localhost".',
    );
  });

  it.each([
    ['http://localhost:3000', 'localhost'],
    ['https://app.example.test', 'app.example.test'],
    ['https://app.example.test:8443/graphql', 'app.example.test'],
  ])('applies on %s only with the confirmation %s', (apiUrl, hostName) => {
    const result = plan({ apply: true, apiUrl, confirmation: hostName });

    expect(result.hostName).toBe(hostName);
    expect(result.refusal).toBeNull();
  });
});

describe('checkDeleteConfirmation', () => {
  it('names the server and refuses before anything is read', () => {
    expect(
      checkDeleteConfirmation({
        apiUrl: 'https://app.example.test',
        confirmation: 'localhost',
        apply: true,
      }),
    ).toEqual({
      hostName: 'app.example.test',
      refusal:
        'Refusing to delete on app.example.test: CONFIRM_DELETE_ALL_ORDERS must equal "app.example.test".',
    });
  });
});
