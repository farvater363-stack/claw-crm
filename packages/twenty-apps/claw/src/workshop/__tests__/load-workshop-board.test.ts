import { type CoreApiClient } from 'twenty-client-sdk/core';
import { describe, expect, it } from 'vitest';

import {
  addFinishedPhotos,
  buildFinishedPhotoLabel,
  loadWorkshopOrders,
  markReady,
  setStage,
} from 'src/workshop/load-workshop-board';

type Request = Record<string, { __args?: unknown; edges?: { node?: unknown } }>;

const page = (nodes: Record<string, unknown>[]) => ({
  edges: nodes.map((node) => ({ node })),
  pageInfo: { hasNextPage: false, endCursor: null },
});

const ORDERS = [
  {
    id: 'order-1',
    name: '№1042',
    status: 'PRODUCTION',
    productionStage: 'WELDING',
    urgency: 'URGENT',
    masterId: 'worker-1',
    clientName: ' Клиент 1 ',
    district: 'CHILANZAR',
    addressLine: 'ул. Тестовая, 1',
    floor: 4,
    comment: 'Нижнюю варить на месте',
    paintColor: 'Чёрный',
    productionStartDate: '2026-09-30',
    installationDeadline: '2026-10-07',
    areaSquareMeters: 7.5,
    finishedPhotos: [{ url: 'https://files/done.jpg' }],
    master: { name: 'Мастер 1' },
    installer: null,
  },
  {
    id: 'order-2',
    name: '№1035',
    status: 'QUALITY_CHECK',
    productionStage: null,
    urgency: null,
    masterId: null,
    clientName: '',
    district: null,
    addressLine: null,
    floor: null,
    comment: '  ',
    paintColor: null,
    productionStartDate: null,
    installationDeadline: null,
    areaSquareMeters: null,
    finishedPhotos: null,
    master: null,
    installer: { name: 'Работник 2' },
  },
];

const ITEMS = [
  {
    id: 'item-1',
    orderId: 'order-1',
    name: '80×150',
    quantity: 5,
    areaSquareMeters: 6,
    notes: 'Две открываются',
    photos: [{ url: 'https://files/opening.jpg' }, { url: '' }],
    design: {
      name: 'Решётка А',
      metal: 'ROD',
      photos: [{ url: 'https://files/design.jpg' }],
    },
  },
  {
    id: 'item-2',
    orderId: 'order-2',
    name: '100×100',
    quantity: null,
    areaSquareMeters: null,
    notes: null,
    photos: null,
    design: null,
  },
];

const SERVICES = [
  { id: 'line-1', orderId: 'order-1', name: 'Козырёк пробный', quantity: 2 },
  { id: 'line-2', orderId: 'order-1', name: null, quantity: 1 },
];

const MATERIALS = [
  {
    id: 'material-line-1',
    orderId: 'order-1',
    name: 'Прут 12 мм — №1042',
    plannedQuantity: 42,
    material: { name: 'Прут 12 мм', unit: 'METER', onHand: -18 },
  },
  {
    id: 'material-line-2',
    orderId: 'order-1',
    name: 'Полоса — №1042',
    plannedQuantity: 16,
    material: { name: 'Полоса 40×4', unit: 'METER', onHand: 120 },
  },
];

const fakeClient = (
  orders: Record<string, unknown>[] = ORDERS,
  // What the filtered update matched: nothing when the order has moved on
  updatedOrders: { id: string }[] = [{ id: 'order-1' }],
) => {
  const queries: Request[] = [];
  const mutations: Request[] = [];
  const client = {
    query: async (request: Request) => {
      queries.push(request);

      return {
        orders: page(orders),
        orderItems: page(ITEMS),
        orderExtraServices: page(SERVICES),
        orderMaterials: page(MATERIALS),
      };
    },
    mutation: async (request: Request) => {
      mutations.push(request);

      return { updateOrders: updatedOrders };
    },
  } as unknown as CoreApiClient;

  return { client, queries, mutations };
};

describe('loadWorkshopOrders', () => {
  it('reads the orders of the two workshop steps with photos, client, lines and materials', async () => {
    const { client, queries } = fakeClient();

    expect(await loadWorkshopOrders(client)).toEqual([
      {
        id: 'order-1',
        name: '№1042',
        status: 'PRODUCTION',
        stage: 'WELDING',
        isUrgent: true,
        masterId: 'worker-1',
        masterName: 'Мастер 1',
        installerName: null,
        clientName: 'Клиент 1',
        districtLabel: 'Чиланзарский',
        addressLine: 'ул. Тестовая, 1',
        floor: 4,
        comment: 'Нижнюю варить на месте',
        paintColor: 'Чёрный',
        startDate: '2026-09-30',
        deadline: '2026-10-07',
        areaSquareMeters: 7.5,
        items: [
          {
            id: 'item-1',
            designName: 'Решётка А',
            metalLabel: 'Прут',
            size: '80×150',
            quantity: 5,
            areaSquareMeters: 6,
            notes: 'Две открываются',
            designPhotoUrl: 'https://files/design.jpg',
            openingPhotoUrls: ['https://files/opening.jpg'],
          },
        ],
        services: [{ id: 'line-1', name: 'Козырёк пробный', quantity: 2 }],
        materials: [
          {
            id: 'material-line-1',
            name: 'Прут 12 мм',
            plannedQuantity: 42,
            unitLabel: 'м',
            isShort: true,
          },
          {
            id: 'material-line-2',
            name: 'Полоса 40×4',
            plannedQuantity: 16,
            unitLabel: 'м',
            isShort: false,
          },
        ],
        finishedPhotoUrls: ['https://files/done.jpg'],
      },
      {
        id: 'order-2',
        name: '№1035',
        status: 'QUALITY_CHECK',
        stage: null,
        isUrgent: false,
        masterId: null,
        masterName: null,
        installerName: 'Работник 2',
        clientName: null,
        districtLabel: null,
        addressLine: null,
        floor: null,
        comment: null,
        paintColor: null,
        startDate: null,
        deadline: null,
        areaSquareMeters: null,
        items: [
          {
            id: 'item-2',
            designName: null,
            metalLabel: null,
            size: '100×100',
            quantity: 1,
            areaSquareMeters: null,
            notes: null,
            designPhotoUrl: null,
            openingPhotoUrls: [],
          },
        ],
        services: [],
        materials: [],
        finishedPhotoUrls: [],
      },
    ]);
    expect(
      queries.find((request) => request.orders)?.orders.__args,
    ).toMatchObject({
      filter: { status: { in: ['PRODUCTION', 'QUALITY_CHECK'] } },
    });

    for (const key of ['orderItems', 'orderExtraServices', 'orderMaterials']) {
      expect(
        queries.find((request) => request[key])?.[key].__args,
      ).toMatchObject({ filter: { orderId: { in: ['order-1', 'order-2'] } } });
    }
  });

  // A query that names a field the workshop role cannot read fails as a
  // whole, so the selection is pinned: no money, no cost, no phone, no
  // linked person.
  it('names only what the workshop role reads', async () => {
    const { client, queries } = fakeClient();

    await loadWorkshopOrders(client);

    const selectionOf = (key: string) =>
      queries.find((request) => request[key])?.[key].edges?.node;

    expect(selectionOf('orders')).toEqual({
      id: true,
      name: true,
      status: true,
      productionStage: true,
      urgency: true,
      masterId: true,
      clientName: true,
      district: true,
      addressLine: true,
      floor: true,
      comment: true,
      paintColor: true,
      productionStartDate: true,
      installationDeadline: true,
      areaSquareMeters: true,
      finishedPhotos: { url: true },
      master: { name: true },
      installer: { name: true },
    });
    expect(selectionOf('orderItems')).toEqual({
      id: true,
      orderId: true,
      name: true,
      quantity: true,
      areaSquareMeters: true,
      notes: true,
      photos: { url: true },
      design: { name: true, metal: true, workshopKind: true, photos: { url: true } },
    });
    expect(selectionOf('orderExtraServices')).toEqual({
      id: true,
      orderId: true,
      name: true,
      quantity: true,
    });
    expect(selectionOf('orderMaterials')).toEqual({
      id: true,
      orderId: true,
      name: true,
      plannedQuantity: true,
      material: { name: true, unit: true, onHand: true },
    });
  });

  it('asks for no lines when the workshop is empty', async () => {
    const { client, queries } = fakeClient([]);

    expect(await loadWorkshopOrders(client)).toEqual([]);
    expect(queries).toHaveLength(1);
  });
});

describe('markReady', () => {
  it('sends an order still in production to installation and writes nothing else', async () => {
    const { client, mutations } = fakeClient();

    expect(await markReady(client, 'order-1')).toBe('saved');
    expect(mutations).toEqual([
      {
        updateOrders: {
          __args: {
            filter: { id: { eq: 'order-1' }, status: { eq: 'PRODUCTION' } },
            data: { status: 'QUALITY_CHECK' },
          },
          id: true,
        },
      },
    ]);
  });

  // The server applies the status filter, so an order a manager has already
  // moved on or cancelled is matched by nothing and stays where it is.
  it('reports an order that has left production as moved', async () => {
    const { client, mutations } = fakeClient(ORDERS, []);

    expect(await markReady(client, 'order-1')).toBe('moved');
    expect(mutations).toHaveLength(1);
    expect(mutations[0]?.updateOrders?.__args).toMatchObject({
      filter: { status: { eq: 'PRODUCTION' } },
    });
  });
});

describe('setStage', () => {
  it.each([['CUTTING' as const], [null]])(
    'writes the stage %s of an order still in production, and nothing else',
    async (stage) => {
      const { client, mutations } = fakeClient();

      expect(await setStage(client, 'order-1', stage)).toBe('saved');
      expect(mutations).toEqual([
        {
          updateOrders: {
            __args: {
              filter: { id: { eq: 'order-1' }, status: { eq: 'PRODUCTION' } },
              data: { productionStage: stage },
            },
            id: true,
          },
        },
      ]);
    },
  );

  it('leaves an order that has left production where it is', async () => {
    const { client } = fakeClient(ORDERS, []);

    expect(await setStage(client, 'order-1', 'PAINTING')).toBe('moved');
  });
});

describe('addFinishedPhotos', () => {
  const NEW_PHOTO = { fileId: 'file-new', label: 'Готово №1042, фото 2.jpg' };

  it('keeps the photos already on the order and adds the new ones', async () => {
    const { client, queries, mutations } = fakeClient([
      {
        finishedPhotos: [
          { fileId: 'file-old', label: 'Старое.jpg' },
          { fileId: null, label: 'broken' },
        ],
      },
    ]);

    expect(await addFinishedPhotos(client, 'order-1', [NEW_PHOTO])).toBe(
      'saved',
    );
    expect(queries[0]?.orders.__args).toMatchObject({
      filter: { id: { eq: 'order-1' }, status: { eq: 'PRODUCTION' } },
    });
    expect(mutations).toEqual([
      {
        updateOrders: {
          __args: {
            filter: { id: { eq: 'order-1' }, status: { eq: 'PRODUCTION' } },
            data: {
              finishedPhotos: [
                { fileId: 'file-old', label: 'Старое.jpg' },
                NEW_PHOTO,
              ],
            },
          },
          id: true,
        },
      },
    ]);
  });

  it('writes nothing to an order that has left production', async () => {
    const { client, mutations } = fakeClient([]);

    expect(await addFinishedPhotos(client, 'order-1', [NEW_PHOTO])).toBe(
      'moved',
    );
    expect(mutations).toEqual([]);
  });
});

describe('buildFinishedPhotoLabel', () => {
  it('names the photo after the order, keeping the file type', () => {
    expect(buildFinishedPhotoLabel('№1042', 3, 'IMG_0042.JPG')).toBe(
      'Готово №1042, фото 3.jpg',
    );
    expect(buildFinishedPhotoLabel('№1042', 1, 'image')).toBe(
      'Готово №1042, фото 1',
    );
  });
});
