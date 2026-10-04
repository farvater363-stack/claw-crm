import { CoreApiClient } from 'twenty-client-sdk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const client = new CoreApiClient();

const TEST_PHONE = '+998 93 000 00 01';
const TEST_PHONE_NATIONAL = '930000001';

type Destroyable =
  | 'destroyOrderPayment'
  | 'destroyOrderItem'
  | 'destroyOrder'
  | 'destroyDesign';

const created: { mutation: Destroyable; id: string }[] = [];

let personIdBefore: string | undefined;

const waitFor = async <TValue>(
  read: () => Promise<TValue>,
  isDone: (value: TValue) => boolean,
): Promise<TValue> => {
  for (let attempt = 0; attempt < 30; attempt++) {
    const value = await read();

    if (isDone(value)) return value;

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error('Timed out waiting for recalculation');
};

const findPersonIdByTestPhone = async () => {
  const { people } = await client.query({
    people: {
      __args: {
        filter: { phones: { primaryPhoneNumber: { eq: TEST_PHONE_NATIONAL } } },
        first: 1,
      },
      edges: { node: { id: true } },
    },
  });

  return people?.edges[0]?.node?.id;
};

const readOrder = async (id: string) => {
  const { orders } = await client.query({
    orders: {
      __args: { filter: { id: { eq: id } }, first: 1 },
      edges: {
        node: {
          name: true,
          clientId: true,
          areaSquareMeters: true,
          total: { amountMicros: true },
          paid: { amountMicros: true },
          balance: { amountMicros: true },
        },
      },
    },
  });

  return orders?.edges[0]?.node;
};

const waitForTotal = (orderId: string, total: number) =>
  waitFor(
    () => readOrder(orderId),
    (order) => Number(order?.total?.amountMicros) === total * 1_000_000,
  );

const createGrille = async () => {
  const { createDesign } = await client.mutation({
    createDesign: {
      __args: {
        data: {
          name: 'Решётка (тест)',
          pricePerSquareMeter: {
            amountMicros: 180_000_000_000,
            currencyCode: 'UZS',
          },
        },
      },
      id: true,
    },
  });

  created.push({ mutation: 'destroyDesign', id: createDesign?.id as string });

  return createDesign?.id as string;
};

const createOrder = async (data: { clientPhone?: string }) => {
  const { createOrder: order } = await client.mutation({
    createOrder: {
      __args: {
        data: {
          name: '',
          clientName: 'Тест',
          clientPhone: data.clientPhone,
        },
      },
      id: true,
    },
  });

  created.push({ mutation: 'destroyOrder', id: order?.id as string });

  return order?.id as string;
};

const createItem = async (
  orderId: string,
  designId: string,
  itemData: Record<string, number>,
) => {
  const { createOrderItem } = await client.mutation({
    createOrderItem: {
      __args: { data: { orderId, designId, ...itemData } },
      id: true,
    },
  });

  created.push({
    mutation: 'destroyOrderItem',
    id: createOrderItem?.id as string,
  });

  return createOrderItem?.id as string;
};

describe('order recalculation', () => {
  beforeAll(async () => {
    personIdBefore = await findPersonIdByTestPhone();
  });

  // The suite runs against a real workspace, so it removes everything it made.
  afterAll(async () => {
    // Items before orders, so no item outlives its order.
    for (const { mutation, id } of [...created].reverse()) {
      await client.mutation({ [mutation]: { __args: { id }, id: true } });
    }

    // Only a person that did not exist before the run was created by it.
    const personId = await findPersonIdByTestPhone();

    if (personIdBefore === undefined && personId !== undefined) {
      await client.mutation({
        destroyPerson: { __args: { id: personId }, id: true },
      });
    }
  });

  it('numbers the order, links the client and totals an item from the grille price', async () => {
    const designId = await createGrille();

    const orderId = await createOrder({ clientPhone: TEST_PHONE });

    await createItem(orderId, designId, {
      widthCm: 140,
      heightCm: 150,
      projectionCm: 30,
      quantity: 2,
    });

    const order = await waitForTotal(orderId, 1_382_400);

    expect(order?.name).toMatch(/^№\d{4}$/);
    expect(order?.clientId).toBeTruthy();
    expect(order?.areaSquareMeters).toBe(7.68);

    const { createOrderPayment } = await client.mutation({
      createOrderPayment: {
        __args: {
          data: {
            orderId,
            method: 'CASH',
            amount: { amountMicros: 1_000_000_000_000, currencyCode: 'UZS' },
          },
        },
        id: true,
      },
    });

    created.push({
      mutation: 'destroyOrderPayment',
      id: createOrderPayment?.id as string,
    });

    const paidOrder = await waitFor(
      () => readOrder(orderId),
      (current) => Number(current?.paid?.amountMicros) === 1_000_000_000_000,
    );

    expect(Number(paidOrder?.balance?.amountMicros)).toBe(382_400_000_000);
  });

  it('recalculates when an item is soft-deleted, restored and destroyed', async () => {
    const designId = await createGrille();

    const orderId = await createOrder({});

    // 100x100 cm without projection is exactly 1 m², 180 000 per item.
    await createItem(orderId, designId, { widthCm: 100, heightCm: 100 });

    const secondItemId = await createItem(orderId, designId, {
      widthCm: 100,
      heightCm: 100,
    });

    await waitForTotal(orderId, 360_000);

    await client.mutation({
      deleteOrderItem: { __args: { id: secondItemId }, id: true },
    });
    await waitForTotal(orderId, 180_000);

    await client.mutation({
      restoreOrderItem: { __args: { id: secondItemId }, id: true },
    });
    await waitForTotal(orderId, 360_000);

    // Destroying a live item never passes through the soft-delete event.
    await client.mutation({
      destroyOrderItem: { __args: { id: secondItemId }, id: true },
    });
    await waitForTotal(orderId, 180_000);

    created.splice(
      created.findIndex(({ id }) => id === secondItemId),
      1,
    );
  });
});
