import { CoreApiClient } from 'twenty-client-sdk/core';
import { afterAll, describe, expect, it } from 'vitest';

import { type PayRule } from 'src/payroll/pay-rules';
import { planFixedAccruals } from 'src/payroll/plan-fixed-accruals';
import { todayInTashkent } from 'src/pricing/dates';
import { fromCurrency, toCurrency } from 'src/recalc/money';

const client = new CoreApiClient();

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

const created: { mutation: string; id: string }[] = [];
let orderId = '';
let materialId = '';
let masterId = '';
let installerId = '';
let sellerId = '';
let measurerWorkerId = '';
let fixedWorkerId = '';
// A member no worker is linked to, so the measurement line can have one owner
// only. Null when every member is already somebody's login.
let freeMemberId: string | null = null;

const waitFor = async <TValue>(
  read: () => Promise<TValue>,
  isDone: (value: TValue) => boolean,
): Promise<TValue> => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = await read();

    if (isDone(value)) return value;

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error('Timed out waiting for the order to settle');
};

const remember = (mutation: string, id: string | undefined) => {
  if (id === undefined) throw new Error(`${mutation}: create returned no id`);

  created.push({ mutation, id });

  return id;
};

const createWorker = async (name: string, data: Record<string, unknown>) => {
  const { createMaster } = await client.mutation({
    createMaster: {
      __args: { data: { name, isActive: true, ...data } },
      id: true,
    },
  });

  return remember('destroyMaster', createMaster?.id);
};

const createRule = async (data: Record<string, unknown>) => {
  const { createPayRule } = await client.mutation({
    createPayRule: {
      __args: { data: { name: 'Правило пути (тест)', ...data } },
      id: true,
    },
  });

  return remember('destroyPayRule', createPayRule?.id);
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

describe('the order path', () => {
  // The suite runs against a real workspace; one failed destroy must not stop the rest.
  afterAll(async () => {
    const system: { mutation: string; id: string }[] = [];
    const idsOf = (
      page: { edges?: { node: { id: string } }[] } | undefined,
      mutation: string,
    ) => (page?.edges ?? []).map(({ node }) => ({ mutation, id: node.id }));

    // A run that failed before creating the order has no system records to find.
    if (orderId !== '') {
      // Soft-deleted first: the functions started by the destroys below stop
      // when they do not find the order, so none writes a line or an accrual back.
      try {
        await client.mutation({
          deleteOrder: { __args: { id: orderId }, id: true },
        });
      } catch (error) {
        console.error('cleanup: deleting the order failed', error);
      }

      try {
        const { payAccruals, stockMovements, orderMaterials } =
          await client.query({
            payAccruals: {
              __args: { filter: { orderId: { eq: orderId } }, first: 20 },
              edges: { node: { id: true } },
            },
            stockMovements: {
              __args: { filter: { orderId: { eq: orderId } }, first: 10 },
              edges: { node: { id: true } },
            },
            orderMaterials: {
              __args: { filter: { orderId: { eq: orderId } }, first: 10 },
              edges: { node: { id: true } },
            },
          });

        system.push(
          ...idsOf(payAccruals, 'destroyPayAccrual'),
          ...idsOf(stockMovements, 'destroyStockMovement'),
          ...idsOf(orderMaterials, 'destroyOrderMaterial'),
        );
      } catch (error) {
        console.error('cleanup: loading system records failed', error);
      }
    }

    if (fixedWorkerId !== '') {
      try {
        const { payAccruals } = await client.query({
          payAccruals: {
            __args: { filter: { workerId: { eq: fixedWorkerId } }, first: 10 },
            edges: { node: { id: true } },
          },
        });

        system.push(...idsOf(payAccruals, 'destroyPayAccrual'));
      } catch (error) {
        console.error('cleanup: loading the fixed line failed', error);
      }
    }

    for (const { mutation, id } of [...system, ...[...created].reverse()]) {
      try {
        await client.mutation({ [mutation]: { __args: { id }, id: true } });
      } catch (error) {
        console.error(`cleanup ${mutation} ${id} failed`, error);
      }
    }
  });

  it('reserves material and pays the measurer at «Замер выполнен»', async () => {
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

    masterId = await createWorker('Путь мастер (тест)', {
      categories: ['MASTER'],
    });
    installerId = await createWorker('Путь установщик (тест)', {
      categories: ['INSTALLER'],
    });
    sellerId = await createWorker('Путь продажник (тест)', {
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
      measurerWorkerId = await createWorker('Путь замерщик (тест)', {
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
            name: 'Путь (тест)',
            pricePerSquareMeter: toCurrency(PRICE_PER_SQUARE_METER),
          },
        },
        id: true,
      },
    });
    const designId = remember('destroyDesign', createDesign?.id);

    const { createMaterial } = await client.mutation({
      createMaterial: {
        __args: {
          data: { name: 'Пруток пути (тест)', unit: 'METER', minimumStock: 0 },
        },
        id: true,
      },
    });

    materialId = remember('destroyMaterial', createMaterial?.id);

    const { createMaterialNorm } = await client.mutation({
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

    remember('destroyMaterialNorm', createMaterialNorm?.id);

    const { createStockMovement } = await client.mutation({
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

    remember('destroyStockMovement', createStockMovement?.id);

    const { createOrder } = await client.mutation({
      createOrder: {
        __args: {
          data: {
            name: '',
            clientName: 'Тест путь',
            soldById: sellerId,
            measurerId: freeMemberId,
            discountKind: 'PERCENT',
            discountValue: DISCOUNT_PERCENT,
          },
        },
        id: true,
      },
    });

    orderId = remember('destroyOrder', createOrder?.id);

    const { createOrderItem } = await client.mutation({
      createOrderItem: {
        __args: {
          data: { orderId, designId, widthCm: 100, heightCm: 100, quantity: 2 },
        },
        id: true,
      },
    });

    remember('destroyOrderItem', createOrderItem?.id);

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
    expect(measured.money).toEqual({
      subtotal: SUBTOTAL,
      discount: SUBTOTAL - TOTAL,
      total: TOTAL,
      paid: 0,
      balance: TOTAL,
    });
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

      // Destroyed by id at the end: a soft-deleted payment is not found by a query.
      return remember('destroyOrderPayment', createOrderPayment?.id);
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
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    const again = await readState();

    expect(again.movements).toEqual([
      { kind: 'WRITE_OFF', quantity: -MATERIAL_NEED },
    ]);
    expect(again.material?.onHand).toBe(100 - MATERIAL_NEED);
  });

  it('accrues pay for the master, the installer, the measurer and the salesperson at «Установлен»', async () => {
    await updateOrder({ status: 'QUALITY_CHECK', installerId });

    const sent = await waitFor(
      readState,
      (state) => state.order?.readyAt !== null,
    );

    // Nobody but the measurer has earned anything before the order is installed.
    expect(sent.accruals).toEqual(measurementLine());

    await updateOrder({ status: 'INSTALLED' });

    const installed = await waitFor(
      readState,
      (state) => state.accruals.length === 3 + measurementLine().length,
    );

    expect(installed.order?.installedAt).not.toBeNull();
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
    fixedWorkerId = await createWorker('Путь фикса (тест)', {
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
