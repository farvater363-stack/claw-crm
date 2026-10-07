import { CoreApiClient } from 'twenty-client-sdk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type PayRule } from 'src/payroll/pay-rules';
import { planFixedAccruals } from 'src/payroll/plan-fixed-accruals';
import { todayInTashkent } from 'src/pricing/dates';
import { fromCurrency, toCurrency } from 'src/recalc/money';

// The key allows 100 requests a minute, and the waits below read in a loop:
// every request of this file goes out one at a time, each after a pause.
const REQUEST_PAUSE = 700;
let lastRequest: Promise<unknown> = Promise.resolve();

const pacedFetch = (...request: Parameters<typeof fetch>) => {
  const result = lastRequest
    .then(
      () => new Promise((resolve) => setTimeout(resolve, REQUEST_PAUSE)),
    )
    .then(() => fetch(...request));

  lastRequest = result.catch(() => undefined);

  return result;
};

const client = new CoreApiClient({ fetch: pacedFetch });

// Synthetic. One position of 100 × 100 cm, 2 pieces, is 2 m².
const PRICE_PER_SQUARE_METER = 100_000;
const SUBTOTAL = 200_000;
const DISCOUNT_PERCENT = 10;
const TOTAL = 180_000;
const MATERIAL_PER_SQUARE_METER = 25;
const MATERIAL_NEED = 50;
const MASTER_RATE = 10_000;
const INSTALLER_RATE = 5_000;
const SALES_PERCENT = 3;
const MEASUREMENT_PAY = 50_000;
const FIXED_PAY = 2_000_000;

// No real row starts with this, so every row that does is this file's own:
// the cleanup finds its rows by it, and so does the next run after a run that
// was killed or whose cleanup was refused.
const PREFIX = 'Интеграция путь';
const OWN_NAME = { like: `${PREFIX} %` };
// People carry the prefix as their whole first name.
const OWN_FULL_NAME = { firstName: { eq: PREFIX } };

// The key allows 100 requests a minute and the cases spend most of them.
const DESTROY_PAUSE = 1_000;

let orderId = '';
let materialId = '';
let masterId = '';
let installerId = '';
let sellerId = '';
let measurerWorkerId = '';
let fixedWorkerId = '';
// A measurement is paid to the worker whose login is the order's measurer.
// The test needs a member who is nobody's login yet: linking a second worker
// to a taken one would leave the line with two possible owners. Null when
// every member is already somebody's login.
let freeMemberId: string | null = null;
let accrualsAtMeasured: Awaited<ReturnType<typeof readState>>['accruals'] = [];

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitFor = async <TValue>(
  read: () => Promise<TValue>,
  isDone: (value: TValue) => boolean,
): Promise<TValue> => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = await read();

    if (isDone(value)) return value;

    await sleep(1_000);
  }

  throw new Error('Timed out waiting for the order to settle');
};

const idOf = (mutation: string, id: string | undefined) => {
  if (id === undefined) throw new Error(`${mutation}: create returned no id`);

  return id;
};

const createWorker = async (name: string, data: Record<string, unknown>) => {
  const { createMaster } = await client.mutation({
    createMaster: {
      __args: {
        data: {
          fullName: { firstName: PREFIX, lastName: name },
          isActive: true,
          ...data,
        },
      },
      id: true,
    },
  });

  return idOf('createMaster', createMaster?.id);
};

const createRule = async (data: Record<string, unknown>) => {
  const { createPayRule } = await client.mutation({
    createPayRule: {
      __args: { data: { name: `${PREFIX} правило`, ...data } },
      id: true,
    },
  });

  return idOf('createPayRule', createPayRule?.id);
};

const updateOrder = (data: Record<string, unknown>) =>
  client.mutation({ updateOrder: { __args: { id: orderId, data }, id: true } });

const readState = async () => {
  const { orders, orderMaterials, stockMovements, materials, payAccruals } =
    await client.query({
      orders: {
        __args: { filter: { id: { eq: orderId } }, first: 1 },
        edges: {
          node: {
            materialState: true,
            measuredAt: true,
            readyAt: true,
            installedAt: true,
            subtotal: { amountMicros: true },
            discount: { amountMicros: true },
            total: { amountMicros: true },
            paid: { amountMicros: true },
            balance: { amountMicros: true },
            masterPayTotal: { amountMicros: true },
          },
        },
      },
      orderMaterials: {
        __args: { filter: { orderId: { eq: orderId } }, first: 10 },
        edges: { node: { plannedQuantity: true, writtenOffQuantity: true } },
      },
      stockMovements: {
        __args: { filter: { orderId: { eq: orderId } }, first: 10 },
        edges: { node: { kind: true, quantity: true } },
      },
      materials: {
        __args: { filter: { id: { eq: materialId } }, first: 1 },
        edges: { node: { onHand: true, reserved: true } },
      },
      payAccruals: {
        __args: { filter: { orderId: { eq: orderId } }, first: 20 },
        edges: {
          node: {
            workerId: true,
            method: true,
            work: true,
            basis: true,
            rate: true,
            amount: { amountMicros: true },
          },
        },
      },
    });
  const order = orders?.edges[0]?.node;

  return {
    order,
    money: {
      subtotal: fromCurrency(order?.subtotal),
      discount: fromCurrency(order?.discount),
      total: fromCurrency(order?.total),
      paid: fromCurrency(order?.paid),
      balance: fromCurrency(order?.balance),
    },
    lines: (orderMaterials?.edges ?? []).map(({ node }) => node),
    movements: (stockMovements?.edges ?? []).map(({ node }) => node),
    material: materials?.edges[0]?.node,
    accruals: (payAccruals?.edges ?? [])
      .map(({ node }) => ({
        workerId: node.workerId,
        method: node.method,
        work: node.work,
        basis: Number(node.basis),
        rate: Number(node.rate),
        amount: fromCurrency(node.amount),
      }))
      .sort((left, right) =>
        `${left.work}-${left.method}` < `${right.work}-${right.method}`
          ? -1
          : 1,
      ),
  };
};

const measurementLine = () =>
  freeMemberId === null
    ? []
    : [
        {
          workerId: measurerWorkerId,
          method: 'PER_MEASUREMENT',
          work: 'MEASURER',
          basis: 1,
          rate: MEASUREMENT_PAY,
          amount: MEASUREMENT_PAY,
        },
      ];

// The functions that follow a write run after it and nothing says when the
// last one has ended: a state read the same three times, two seconds apart,
// is taken as settled.
const waitUntilSettled = async () => {
  let previous = '';
  let equalReads = 0;

  for (let attempt = 0; attempt < 20; attempt++) {
    const state = await readState();
    const serialized = JSON.stringify(state);

    equalReads = serialized === previous ? equalReads + 1 : 1;

    if (equalReads === 3) return state;

    previous = serialized;
    await sleep(2_000);
  }

  throw new Error('The order did not settle');
};

type IdPage = { edges?: { node: { id: string } }[] } | null | undefined;

const idsOf = (page: IdPage) => (page?.edges ?? []).map(({ node }) => node.id);

// A row removed by the app or by a cleanup that stopped halfway is
// soft-deleted, and a plain query skips it.
const DELETED_STATES = ['NULL', 'NOT_NULL'] as const;

// Destroys every row named with the prefix and what hangs on those rows.
// A refused request is recorded and the rest goes on.
const removeOwnRows = async (): Promise<{
  found: number;
  failures: string[];
}> => {
  const failures: string[] = [];
  const orderIds: string[] = [];
  const workerIds: string[] = [];
  const linkedWorkerIds: string[] = [];
  const materialIds: string[] = [];
  const designIds: string[] = [];
  // In the order of destruction; a line of an order is also a line of its
  // worker or its material, so a row can be found twice.
  const children = new Map<string, string>();
  const addChildren = (mutation: string, page: IdPage) => {
    for (const id of idsOf(page)) children.set(id, mutation);
  };
  const attempt = async (label: string, request: () => Promise<unknown>) => {
    try {
      await request();
    } catch (error) {
      failures.push(`${label}: ${String(error)}`);
    }
  };

  for (const is of DELETED_STATES) {
    const deletedAt = { is };

    await attempt(`find rows (deletedAt ${is})`, async () => {
      const { orders, masters, materials, designs } = await client.query({
        orders: {
          __args: {
            filter: { clientFullName: OWN_FULL_NAME, deletedAt },
            first: 50,
          },
          edges: { node: { id: true } },
        },
        masters: {
          __args: { filter: { fullName: OWN_FULL_NAME, deletedAt }, first: 50 },
          edges: { node: { id: true, loginId: true } },
        },
        materials: {
          __args: { filter: { name: OWN_NAME, deletedAt }, first: 50 },
          edges: { node: { id: true } },
        },
        designs: {
          __args: { filter: { name: OWN_NAME, deletedAt }, first: 50 },
          edges: { node: { id: true } },
        },
      });

      orderIds.push(...idsOf(orders));
      workerIds.push(...idsOf(masters));
      materialIds.push(...idsOf(materials));
      designIds.push(...idsOf(designs));

      if (is === 'NULL') {
        linkedWorkerIds.push(
          ...(masters?.edges ?? [])
            .filter(({ node }) => node.loginId !== null)
            .map(({ node }) => node.id),
        );
      }
    });
  }

  const found =
    orderIds.length + workerIds.length + materialIds.length + designIds.length;

  if (found === 0) return { found, failures };

  // First of all: a worker left linked would keep the member taken, and every
  // later run would find nobody free to be its measurer.
  for (const id of linkedWorkerIds) {
    await attempt(`unlink the login of worker ${id}`, () =>
      client.mutation({
        updateMaster: { __args: { id, data: { loginId: null } }, id: true },
      }),
    );
  }

  // Soft-deleted before its rows go: the functions started by the destroys
  // below stop when they do not find the order, so none writes a line or an
  // accrual back. An order that is already deleted refuses, which is fine.
  for (const id of orderIds) {
    await client
      .mutation({ deleteOrder: { __args: { id }, id: true } })
      .catch(() => undefined);
  }

  for (const is of DELETED_STATES) {
    const deletedAt = { is };

    if (orderIds.length > 0) {
      const filter = { orderId: { in: orderIds }, deletedAt };

      await attempt(`find rows of the orders (deletedAt ${is})`, async () => {
        const found = await client.query({
          payAccruals: {
            __args: { filter, first: 50 },
            edges: { node: { id: true } },
          },
          stockMovements: {
            __args: { filter, first: 50 },
            edges: { node: { id: true } },
          },
          orderMaterials: {
            __args: { filter, first: 50 },
            edges: { node: { id: true } },
          },
          orderPayments: {
            __args: { filter, first: 50 },
            edges: { node: { id: true } },
          },
          orderItems: {
            __args: { filter, first: 50 },
            edges: { node: { id: true } },
          },
        });

        addChildren('destroyPayAccrual', found.payAccruals);
        addChildren('destroyStockMovement', found.stockMovements);
        addChildren('destroyOrderMaterial', found.orderMaterials);
        addChildren('destroyOrderPayment', found.orderPayments);
        addChildren('destroyOrderItem', found.orderItems);
      });
    }

    if (workerIds.length > 0) {
      const filter = { workerId: { in: workerIds }, deletedAt };

      await attempt(`find rows of the workers (deletedAt ${is})`, async () => {
        const found = await client.query({
          payAccruals: {
            __args: { filter, first: 50 },
            edges: { node: { id: true } },
          },
          payRules: {
            __args: { filter, first: 50 },
            edges: { node: { id: true } },
          },
        });

        addChildren('destroyPayAccrual', found.payAccruals);
        addChildren('destroyPayRule', found.payRules);
      });
    }

    if (materialIds.length > 0) {
      const filter = { materialId: { in: materialIds }, deletedAt };

      await attempt(`find rows of the material (deletedAt ${is})`, async () => {
        const found = await client.query({
          stockMovements: {
            __args: { filter, first: 50 },
            edges: { node: { id: true } },
          },
          materialNorms: {
            __args: { filter, first: 50 },
            edges: { node: { id: true } },
          },
        });

        addChildren('destroyStockMovement', found.stockMovements);
        addChildren('destroyMaterialNorm', found.materialNorms);
      });
    }
  }

  const destroys = [
    ...[...children].map(([id, mutation]) => ({ mutation, id })),
    ...orderIds.map((id) => ({ mutation: 'destroyOrder', id })),
    ...workerIds.map((id) => ({ mutation: 'destroyMaster', id })),
    ...materialIds.map((id) => ({ mutation: 'destroyMaterial', id })),
    ...designIds.map((id) => ({ mutation: 'destroyDesign', id })),
  ];

  for (const { mutation, id } of destroys) {
    await attempt(`${mutation} ${id}`, () =>
      client.mutation({ [mutation]: { __args: { id }, id: true } }),
    );
    await sleep(DESTROY_PAUSE);
  }

  return { found, failures };
};

describe('the order path', () => {
  beforeAll(async () => {
    const { found, failures } = await removeOwnRows();

    if (failures.length > 0) {
      throw new Error(
        `Rows named «${PREFIX} …» were left by an earlier run and could not be removed:\n${failures.join('\n')}`,
      );
    }

    if (found > 0) {
      console.warn(
        `Removed ${found} rows named «${PREFIX} …» that an earlier run left behind`,
      );
    }
  }, 300_000);

  afterAll(async () => {
    const { failures } = await removeOwnRows();

    if (failures.length > 0) {
      throw new Error(`Cleanup left data behind:\n${failures.join('\n')}`);
    }
  }, 300_000);

  it('reserves material at «Замер выполнен»', async () => {
    const { workspaceMembers, masters } = await client.query({
      workspaceMembers: {
        __args: { first: 50 },
        edges: { node: { id: true } },
      },
      masters: {
        __args: { filter: { loginId: { is: 'NOT_NULL' } }, first: 200 },
        edges: { node: { loginId: true } },
      },
    });
    const takenMemberIds = new Set(
      (masters?.edges ?? []).map(({ node }) => node.loginId),
    );

    freeMemberId =
      (workspaceMembers?.edges ?? [])
        .map(({ node }) => node.id)
        .find((id) => !takenMemberIds.has(id)) ?? null;

    masterId = await createWorker('мастер', {
      categories: ['MASTER'],
    });
    installerId = await createWorker('установщик', {
      categories: ['INSTALLER'],
    });
    sellerId = await createWorker('продажник', {
      categories: ['SALES'],
    });
    await createRule({
      workerId: masterId,
      method: 'PER_SQUARE_METER',
      work: 'MASTER',
      amount: toCurrency(MASTER_RATE),
    });
    await createRule({
      workerId: installerId,
      method: 'PER_SQUARE_METER',
      work: 'INSTALLER',
      amount: toCurrency(INSTALLER_RATE),
    });
    await createRule({
      workerId: sellerId,
      method: 'PERCENT_OF_SALES',
      work: 'SALES',
      percent: SALES_PERCENT,
    });

    if (freeMemberId !== null) {
      measurerWorkerId = await createWorker('замерщик', {
        categories: ['MEASURER'],
        loginId: freeMemberId,
      });
      await createRule({
        workerId: measurerWorkerId,
        method: 'PER_MEASUREMENT',
        work: 'MEASURER',
        amount: toCurrency(MEASUREMENT_PAY),
      });
    }

    const { createDesign } = await client.mutation({
      createDesign: {
        __args: {
          data: {
            name: `${PREFIX} решётка`,
            pricePerSquareMeter: toCurrency(PRICE_PER_SQUARE_METER),
          },
        },
        id: true,
      },
    });
    const designId = idOf('createDesign', createDesign?.id);

    const { createMaterial } = await client.mutation({
      createMaterial: {
        __args: {
          data: {
            name: `${PREFIX} пруток`,
            unit: 'METER',
            minimumStock: 0,
          },
        },
        id: true,
      },
    });

    materialId = idOf('createMaterial', createMaterial?.id);

    await client.mutation({
      createMaterialNorm: {
        __args: {
          data: {
            materialId,
            designId,
            quantityPerUnit: MATERIAL_PER_SQUARE_METER,
          },
        },
        id: true,
      },
    });

    await client.mutation({
      createStockMovement: {
        __args: {
          data: {
            kind: 'STOCKTAKE',
            materialId,
            countedQuantity: 100,
            date: '2026-10-01',
          },
        },
        id: true,
      },
    });

    const { createOrder } = await client.mutation({
      createOrder: {
        __args: {
          data: {
            name: '',
            clientFullName: { firstName: PREFIX, lastName: 'клиент' },
            soldById: sellerId,
            measurerId: freeMemberId,
            discountKind: 'PERCENT',
            discountValue: DISCOUNT_PERCENT,
          },
        },
        id: true,
      },
    });

    orderId = idOf('createOrder', createOrder?.id);

    await client.mutation({
      createOrderItem: {
        __args: {
          data: { orderId, designId, widthCm: 100, heightCm: 100, quantity: 2 },
        },
        id: true,
      },
    });

    await waitFor(readState, (state) => state.money.total === TOTAL);
    await updateOrder({ status: 'MEASUREMENT_SCHEDULED' });
    await updateOrder({ status: 'MEASURED' });

    const measured = await waitFor(
      readState,
      (state) =>
        state.order?.materialState === 'ENOUGH' &&
        state.material?.reserved === MATERIAL_NEED &&
        state.accruals.length === measurementLine().length,
    );

    expect(measured.order?.measuredAt).not.toBeNull();
    expect(measured.lines).toMatchObject([
      { plannedQuantity: MATERIAL_NEED, writtenOffQuantity: null },
    ]);
    expect(measured.movements).toEqual([]);
    expect(measured.accruals).toEqual(measurementLine());
    accrualsAtMeasured = measured.accruals;
    expect(measured.money).toEqual({
      subtotal: SUBTOTAL,
      discount: SUBTOTAL - TOTAL,
      total: TOTAL,
      paid: 0,
      balance: TOTAL,
    });
  });

  it('pays the measurer at «Замер выполнен»', (context) => {
    if (freeMemberId === null) {
      const reason =
        "every workspace member is already the login of a worker, so no measurer could be linked and the measurement pay was NOT checked; free a member (clear a worker's login) and run again";

      console.warn(`SKIPPED: ${reason}`);
      context.skip(reason);
    }

    expect(accrualsAtMeasured).toEqual([
      {
        workerId: measurerWorkerId,
        method: 'PER_MEASUREMENT',
        work: 'MEASURER',
        basis: 1,
        rate: MEASUREMENT_PAY,
        amount: MEASUREMENT_PAY,
      },
    ]);
  });

  it('counts payments into «Оплачено» and «Остаток», and a removed one out again', async () => {
    const pay = async (amount: number) => {
      const { createOrderPayment } = await client.mutation({
        createOrderPayment: {
          __args: {
            data: {
              orderId,
              amount: toCurrency(amount),
              method: 'CASH',
              paidOn: todayInTashkent(),
            },
          },
          id: true,
        },
      });

      return idOf('createOrderPayment', createOrderPayment?.id);
    };

    await pay(50_000);
    await waitFor(readState, (state) => state.money.balance === TOTAL - 50_000);

    const secondPaymentId = await pay(130_000);
    const settled = await waitFor(
      readState,
      (state) => state.money.balance === 0,
    );

    expect(settled.money.paid).toBe(TOTAL);

    await client.mutation({
      deleteOrderPayment: { __args: { id: secondPaymentId }, id: true },
    });

    const afterRemoval = await waitFor(
      readState,
      (state) => state.money.balance === 130_000,
    );

    expect(afterRemoval.money.paid).toBe(50_000);
  });

  it('writes the material off once at «Производство»', async () => {
    await updateOrder({ status: 'PRODUCTION', masterId });

    const writtenOff = await waitFor(
      readState,
      (state) =>
        state.lines[0]?.writtenOffQuantity === MATERIAL_NEED &&
        state.material?.onHand === 100 - MATERIAL_NEED &&
        state.order?.materialState === null,
    );

    expect(writtenOff.movements).toEqual([
      { kind: 'WRITE_OFF', quantity: -MATERIAL_NEED },
    ]);
    expect(writtenOff.material?.reserved).toBe(0);

    await updateOrder({ status: 'MEASURED' });
    await updateOrder({ status: 'PRODUCTION' });

    const again = await waitUntilSettled();

    expect(again.movements).toEqual([
      { kind: 'WRITE_OFF', quantity: -MATERIAL_NEED },
    ]);
    expect(again.material?.onHand).toBe(100 - MATERIAL_NEED);
  });

  it('accrues pay for the master, the installer, the measurer and the salesperson at «Установлен»', async () => {
    await updateOrder({ status: 'QUALITY_CHECK', installerId });

    await waitFor(readState, (state) => state.order?.readyAt !== null);

    // Nobody but the measurer has earned anything before the order is installed.
    expect((await waitUntilSettled()).accruals).toEqual(measurementLine());

    await updateOrder({ status: 'INSTALLED' });

    const installed = await waitFor(
      readState,
      (state) => state.accruals.length === 3 + measurementLine().length,
    );

    expect(installed.order?.installedAt).not.toBeNull();
    // Long after the second «Производство»: a late second write-off would show here.
    expect(installed.movements).toEqual([
      { kind: 'WRITE_OFF', quantity: -MATERIAL_NEED },
    ]);
    expect(installed.material?.onHand).toBe(100 - MATERIAL_NEED);
    expect(installed.accruals).toEqual([
      {
        workerId: installerId,
        method: 'PER_SQUARE_METER',
        work: 'INSTALLER',
        basis: 2,
        rate: INSTALLER_RATE,
        amount: 10_000,
      },
      {
        workerId: masterId,
        method: 'PER_SQUARE_METER',
        work: 'MASTER',
        basis: 2,
        rate: MASTER_RATE,
        amount: 20_000,
      },
      ...measurementLine(),
      {
        workerId: sellerId,
        method: 'PERCENT_OF_SALES',
        work: 'SALES',
        basis: TOTAL,
        rate: SALES_PERCENT,
        amount: 5_400,
      },
    ]);
    // Installed on time and without a bonus: the master's lines add up to his pay on the order.
    expect(fromCurrency(installed.order?.masterPayTotal)).toBe(20_000);
  });

  it('writes the fixed line of a month once', async () => {
    fixedWorkerId = await createWorker('фикса', {
      categories: ['MASTER'],
    });

    const fixedRuleId = await createRule({
      workerId: fixedWorkerId,
      method: 'FIXED',
      amount: toCurrency(FIXED_PAY),
    });
    const month = todayInTashkent().slice(0, 7);
    const workers = [{ id: fixedWorkerId, isActive: true }];
    const rules: PayRule[] = [
      {
        id: fixedRuleId,
        workerId: fixedWorkerId,
        method: 'FIXED',
        work: null,
        amount: FIXED_PAY,
        percent: null,
      },
    ];
    const lines = planFixedAccruals({ month, workers, rules, existingIds: [] });

    expect(lines).toMatchObject([
      {
        workerId: fixedWorkerId,
        orderId: null,
        earnedOn: `${month}-01`,
        method: 'FIXED',
        amount: FIXED_PAY,
      },
    ]);

    // Twice, as two runs of the nightly function would: the id is built from
    // the worker, the rule and the month, so the second write lands on the first.
    for (let run = 0; run < 2; run++) {
      for (const line of lines) {
        await client.mutation({
          createPayAccrual: {
            __args: {
              data: {
                id: line.id,
                name: line.name,
                workerId: line.workerId,
                earnedOn: line.earnedOn,
                method: line.method,
                basis: line.basis,
                rate: line.rate,
                amount: toCurrency(line.amount),
              },
              upsert: true,
            },
            id: true,
          },
        });
      }
    }

    const { payAccruals } = await client.query({
      payAccruals: {
        __args: { filter: { workerId: { eq: fixedWorkerId } }, first: 10 },
        edges: { node: { id: true, amount: { amountMicros: true } } },
      },
    });

    expect(
      (payAccruals?.edges ?? []).map(({ node }) => [
        node.id,
        fromCurrency(node.amount),
      ]),
    ).toEqual([[lines[0].id, FIXED_PAY]]);
    expect(
      planFixedAccruals({
        month,
        workers,
        rules,
        existingIds: [lines[0].id],
      }),
    ).toEqual([]);
  });
});
