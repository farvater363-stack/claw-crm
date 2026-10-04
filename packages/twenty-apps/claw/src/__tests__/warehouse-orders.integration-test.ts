import { CoreApiClient } from 'twenty-client-sdk/core';
import { afterAll, describe, expect, it } from 'vitest';

const client = new CoreApiClient();

const created: { mutation: string; id: string }[] = [];
let orderId = '';
let materialId = '';

const waitFor = async <TValue>(
  read: () => Promise<TValue>,
  isDone: (value: TValue) => boolean,
): Promise<TValue> => {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = await read();

    if (isDone(value)) return value;

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error('Timed out waiting for the order material sync');
};

const remember = (mutation: string, id: string | undefined) => {
  if (id === undefined) throw new Error(`${mutation}: create returned no id`);

  created.push({ mutation, id });

  return id;
};

const readState = async () => {
  const { orders, orderMaterials, stockMovements, materials } =
    await client.query({
      orders: {
        __args: { filter: { id: { eq: orderId } }, first: 1 },
        edges: { node: { materialState: true, materialNote: true } },
      },
      orderMaterials: {
        __args: { filter: { orderId: { eq: orderId } }, first: 10 },
        edges: {
          node: { id: true, plannedQuantity: true, writtenOffQuantity: true },
        },
      },
      stockMovements: {
        __args: { filter: { orderId: { eq: orderId } }, first: 10 },
        edges: { node: { kind: true, quantity: true } },
      },
      materials: {
        __args: { filter: { id: { eq: materialId } }, first: 1 },
        edges: {
          node: {
            onHand: true,
            reserved: true,
            stockState: true,
            overrunPercent: true,
          },
        },
      },
    });

  return {
    order: orders?.edges[0]?.node,
    lines: (orderMaterials?.edges ?? []).map(({ node }) => node),
    movements: (stockMovements?.edges ?? []).map(({ node }) => node),
    material: materials?.edges[0]?.node,
  };
};

const updateOrder = (data: Record<string, unknown>) =>
  client.mutation({ updateOrder: { __args: { id: orderId, data }, id: true } });

describe('order material lifecycle', () => {
  // The suite runs against a real workspace; one failed destroy must not stop the rest.
  afterAll(async () => {
    const system: { mutation: string; id: string }[] = [];

    // A run that failed before creating the order has no system records to find.
    if (orderId !== '') {
      try {
        const { orderMaterials, stockMovements } = await client.query({
          orderMaterials: {
            __args: { filter: { orderId: { eq: orderId } }, first: 10 },
            edges: { node: { id: true } },
          },
          stockMovements: {
            __args: { filter: { orderId: { eq: orderId } }, first: 10 },
            edges: { node: { id: true } },
          },
        });
        system.push(
          ...(stockMovements?.edges ?? []).map(({ node }) => ({
            mutation: 'destroyStockMovement',
            id: node.id,
          })),
          ...(orderMaterials?.edges ?? []).map(({ node }) => ({
            mutation: 'destroyOrderMaterial',
            id: node.id,
          })),
        );
      } catch (error) {
        console.error('cleanup: loading system records failed', error);
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

  it('reserves, flags shortage and writes off once', async () => {
    const { createDesign } = await client.mutation({
      createDesign: { __args: { data: { name: 'Склад (тест)' } }, id: true },
    });
    const designId = remember('destroyDesign', createDesign?.id);

    const { createMaterial } = await client.mutation({
      createMaterial: {
        __args: {
          data: {
            name: 'Пруток (тест)',
            unit: 'METER',
            minimumStock: 0,
          },
        },
        id: true,
      },
    });
    materialId = remember('destroyMaterial', createMaterial?.id);

    const { createMaterialNorm } = await client.mutation({
      createMaterialNorm: {
        __args: {
          data: { materialId, designId, quantityPerUnit: 25 },
        },
        id: true,
      },
    });
    remember('destroyMaterialNorm', createMaterialNorm?.id);

    // The opening recount: overuse is measured from the second one on.
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
        __args: { data: { name: '', clientName: 'Тест склад' } },
        id: true,
      },
    });
    orderId = remember('destroyOrder', createOrder?.id);

    const { createOrderItem } = await client.mutation({
      createOrderItem: {
        __args: {
          data: {
            orderId,
            designId,
            widthCm: 100,
            heightCm: 100,
            quantity: 2,
          },
        },
        id: true,
      },
    });
    const itemId = remember('destroyOrderItem', createOrderItem?.id);
    const setPieces = (quantity: number) =>
      client.mutation({
        updateOrderItem: {
          __args: { id: itemId, data: { quantity } },
          id: true,
        },
      });

    await waitFor(
      () => readState(),
      (state) => state.material?.onHand === 100,
    );
    await updateOrder({ status: 'PRICE_APPROVAL' });

    const reserved = await waitFor(
      () => readState(),
      (state) =>
        state.order?.materialState === 'ENOUGH' &&
        state.material?.reserved === 50,
    );

    expect(reserved.lines).toMatchObject([
      { plannedQuantity: 50, writtenOffQuantity: null },
    ]);

    await setPieces(6);

    const short = await waitFor(
      () => readState(),
      (state) => state.order?.materialState === 'SHORTAGE',
    );

    expect(short.order?.materialNote).toContain(
      'Не хватает: Пруток (тест) — 50 м',
    );
    expect(short.material?.stockState).toBe('BUY');

    await setPieces(2);
    await waitFor(
      () => readState(),
      (state) => state.order?.materialState === 'ENOUGH',
    );
    await updateOrder({ status: 'PRODUCTION' });

    const writtenOff = await waitFor(
      () => readState(),
      (state) =>
        state.lines[0]?.writtenOffQuantity === 50 &&
        state.material?.onHand === 50 &&
        state.order?.materialState === null,
    );

    expect(writtenOff.movements).toEqual([
      { kind: 'WRITE_OFF', quantity: -50 },
    ]);
    expect(writtenOff.material?.reserved).toBe(0);
    expect(writtenOff.material?.overrunPercent).toBeNull();

    await updateOrder({ status: 'PRICE_APPROVAL' });
    await updateOrder({ status: 'PRODUCTION' });
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    const again = await readState();

    expect(again.movements).toEqual([{ kind: 'WRITE_OFF', quantity: -50 }]);
    expect(again.material?.onHand).toBe(50);
  });

  it('measures overuse at the next recount', async () => {
    if (materialId === '') {
      throw new Error('the write-off case created no material to recount');
    }

    // No date: it falls on today, after the write-off, which the sync dates today.
    const { createStockMovement } = await client.mutation({
      createStockMovement: {
        __args: {
          data: { kind: 'STOCKTAKE', materialId, countedQuantity: 46 },
        },
        id: true,
      },
    });
    remember('destroyStockMovement', createStockMovement?.id);

    const recounted = await waitFor(
      () => readState(),
      (state) => state.material?.onHand === 46,
    );

    // 50 went to the order and 4 more are missing: 4 / 50.
    expect(recounted.material?.overrunPercent).toBe(8);
  });
});
