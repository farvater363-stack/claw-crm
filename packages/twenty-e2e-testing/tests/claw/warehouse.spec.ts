import { expect, type Page, test } from '@playwright/test';
import {
  chooseOption,
  FORCE,
  graphql,
  type Role,
  signIn,
} from './claw-helpers';

test.use({
  actionTimeout: 20_000,
  viewport: { width: 1440, height: 900 },
  // Each test signs in as its own role.
  storageState: { cookies: [], origins: [] },
});

// No real row starts with this, so a run killed before afterAll leaves rows
// that the next run recognises and removes.
const PREFIX = 'Спек склад';
const RUN = String(Date.now());
const MATERIAL = `${PREFIX} пруток ${RUN}`;
const MANAGER_MATERIAL = `${PREFIX} уголок ${RUN}`;
const ORDER_MATERIAL = `${PREFIX} лист ${RUN}`;
const GRILLE = `${PREFIX} решётка ${RUN}`;
const CLIENT = `${PREFIX} клиент ${RUN}`;

// Synthetic. One position of 100 × 100 cm, 2 pieces, is 2 m²: 5 m of material.
const GRILLE_PRICE_MICROS = 100_000_000_000;
const AMOUNT_PER_SQUARE_METER = 2.5;
const ORDER_NEED = 5;

// The API key allows 100 requests a minute and the app's recalculations,
// started by every write, spend from the same budget.
const RECALC_PAUSE = 3_000;
const DESTROY_PAUSE = 1_500;
const POLL = { intervals: [3_000], timeout: 90_000 };

const SINGULAR = {
  orders: 'Order',
  orderItems: 'OrderItem',
  orderMaterials: 'OrderMaterial',
  materials: 'Material',
  materialNorms: 'MaterialNorm',
  stockMovements: 'StockMovement',
  designs: 'Design',
} as const;

type TestObject = keyof typeof SINGULAR;

const pause = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const create = async (
  object: (typeof SINGULAR)[TestObject],
  data: Record<string, unknown>,
): Promise<string> => {
  const result = await graphql(
    `mutation($data: ${object}CreateInput!) { create${object}(data: $data) { id } }`,
    { data },
  );

  return result[`create${object}`].id;
};

const findIds = async (
  plural: TestObject,
  filter: string,
): Promise<string[]> => {
  const ids: string[] = [];

  // A row removed by the app is soft-deleted, and a plain query skips it.
  for (const deletedAt of ['NULL', 'NOT_NULL']) {
    const data =
      await graphql(`{ ${plural}(filter: { ${filter}, deletedAt: { is: ${deletedAt} } }) { edges { node { id } } } }`);

    ids.push(
      ...data[plural].edges.map(
        ({ node }: { node: { id: string } }) => node.id,
      ),
    );
  }

  return ids;
};

const startsWithPrefix = (field: string) =>
  `${field}: { like: ${JSON.stringify(`${PREFIX} %`)} }`;

const belongsTo = (field: string, id: string) =>
  `${field}: { eq: ${JSON.stringify(id)} }`;

// Every step is independent so one failure does not skip the rest.
const destroyTestData = async () => {
  const failures: string[] = [];

  const find = async (plural: TestObject, filter: string) => {
    try {
      return await findIds(plural, filter);
    } catch (error) {
      failures.push(`find ${plural}: ${String(error)}`);

      return [];
    }
  };

  const destroy = async (plural: TestObject, ids: string[]) => {
    for (const id of ids) {
      try {
        await graphql(
          `mutation($id: UUID!) { destroy${SINGULAR[plural]}(id: $id) { id } }`,
          { id },
        );
      } catch (error) {
        failures.push(`${SINGULAR[plural]} ${id}: ${String(error)}`);
      }

      await pause(DESTROY_PAUSE);
    }
  };

  for (const orderId of await find('orders', startsWithPrefix('clientName'))) {
    const ofOrder = belongsTo('orderId', orderId);

    // Positions first: while one is left, the sync can write the order's
    // material lines again.
    await destroy('orderItems', await find('orderItems', ofOrder));
    await destroy('orderMaterials', await find('orderMaterials', ofOrder));
    await destroy('orders', [orderId]);
  }

  for (const materialId of await find('materials', startsWithPrefix('name'))) {
    const ofMaterial = belongsTo('materialId', materialId);

    // History and composition lines outlive their material.
    await destroy('stockMovements', await find('stockMovements', ofMaterial));
    await destroy('materialNorms', await find('materialNorms', ofMaterial));
    await destroy('materials', [materialId]);
  }

  await destroy('designs', await find('designs', startsWithPrefix('name')));

  if (failures.length > 0) {
    throw new Error(`Cleanup left data behind:\n${failures.join('\n')}`);
  }
};

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await destroyTestData();
});

test.afterAll(async () => {
  test.setTimeout(180_000);
  await destroyTestData();
});

// A role name matches by substring unless it is exact.
const stockLink = (page: Page) =>
  page.getByRole('link', { name: 'Склад', exact: true });

// The empty screen offers «Добавить материал», the list «+ Добавить материал».
const addMaterialButton = (page: Page) =>
  page.getByRole('button', { name: /Добавить материал$/ });

const openStock = async (page: Page) => {
  await stockLink(page).first().click();
  await expect(addMaterialButton(page)).toBeVisible({ timeout: 60_000 });
};

const rowHeader = (page: Page, name: string) =>
  page.locator('button[aria-expanded]').filter({ hasText: name });

// The header's parent holds the header and, once open, the fields under it.
const openRow = async (page: Page, name: string) => {
  const header = rowHeader(page, name);

  await expect(header).toBeVisible({ timeout: 60_000 });

  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await header.click(FORCE);
  }

  await expect(header).toHaveAttribute('aria-expanded', 'true');

  return header.locator('xpath=..');
};

// The screen shows a typed amount at once, before the server has it.
const readOnHand = async (name: string): Promise<number | undefined> => {
  const { materials } = await graphql(
    'query($name: String!) { materials(filter: { name: { eq: $name } }) { edges { node { onHand } } } }',
    { name },
  );

  return materials.edges[0]?.node.onHand;
};

test.describe('the owner keeps stock', () => {
  // The material the first test adds on the screen is the one the next two use.
  test.describe.configure({ mode: 'serial' });

  test('adds a material and its row reads «Хватает»', async ({ page }) => {
    test.setTimeout(180_000);

    await signIn(page, 'ADMIN');
    await openStock(page);

    // The first click opens the form, the second saves it.
    await addMaterialButton(page).click(FORCE);
    await page
      .getByRole('textbox', { name: 'Название', exact: true })
      .fill(MATERIAL, FORCE);
    await chooseOption(page.getByRole('combobox', { name: 'Единица' }), 'м');
    await page
      .getByRole('button', { name: '+ Добавить материал', exact: true })
      .click(FORCE);

    await expect(rowHeader(page, MATERIAL)).toContainText('Хватает', {
      timeout: 30_000,
    });
  });

  test('buys 60 and «Есть» reads «60 м»', async ({ page }) => {
    test.setTimeout(180_000);

    await signIn(page, 'ADMIN');
    await openStock(page);

    const row = await openRow(page, MATERIAL);

    await row
      .getByRole('textbox', { name: 'Купил', exact: true })
      .fill('60', FORCE);
    // exact: «+ Добавить материал» contains «Добавить».
    await row
      .getByRole('button', { name: 'Добавить', exact: true })
      .click(FORCE);

    await expect(rowHeader(page, MATERIAL)).toContainText(/Есть 60\sм/, {
      timeout: 30_000,
    });
    await expect.poll(() => readOnHand(MATERIAL), POLL).toBe(60);
  });

  test('recounts to 55 and «Есть» reads «55 м»', async ({ page }) => {
    test.setTimeout(180_000);

    await signIn(page, 'ADMIN');
    await openStock(page);
    await expect(rowHeader(page, MATERIAL)).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: 'Пересчитать склад' }).click(FORCE);
    await page
      .getByRole('textbox', { name: MATERIAL, exact: true })
      .fill('55', FORCE);
    await page.getByRole('button', { name: 'Сохранить пересчёт' }).click(FORCE);

    await expect(rowHeader(page, MATERIAL)).toContainText(/Есть 55\sм/, {
      timeout: 30_000,
    });
    await expect.poll(() => readOnHand(MATERIAL), POLL).toBe(55);
  });
});

test('a manager opens «Склад» and a row has no price field', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await create('Material', { name: MANAGER_MATERIAL, unit: 'METER' });

  await signIn(page, 'MANAGER');
  await expect(stockLink(page).first()).toBeVisible({ timeout: 60_000 });
  await openStock(page);

  const row = await openRow(page, MANAGER_MATERIAL);

  // The purchase field proves the open row has rendered.
  await expect(
    row.getByRole('textbox', { name: 'Купил', exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole('textbox', { name: 'Цена', exact: true }),
  ).toHaveCount(0);
});

// No local user has the workshop role; the roles unit test covers it: the
// workshop cannot read the stock history, which the menu item opens.
test('the measurer has no «Склад» in the sidebar', async ({ page }) => {
  test.setTimeout(180_000);

  await signIn(page, 'MEASURER');

  // Wait for the menu to render before asserting that an item is missing.
  await expect(
    page.getByRole('link', { name: 'Новый замер' }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(stockLink(page)).toHaveCount(0);
});

// Two entries every role has.
const MENU_ANCHORS = ['Новый замер', 'Производство'] as const;

// The workspace section has no role, test id or fixed heading (its title
// follows the user's language), so it is the smallest block that holds both
// anchors. Twenty's own entries (search, settings) sit outside it.
const workspaceMenuEntries = (page: Page): Promise<string[]> =>
  page.evaluate(([firstLabel, lastLabel]) => {
    const items = Array.from(
      document.querySelectorAll('.navigation-drawer-item'),
    );
    const textOf = (item: Element) => (item.textContent ?? '').trim();
    const firstItem = items.find((item) => textOf(item).startsWith(firstLabel));
    const lastItem = items.find((item) => textOf(item).startsWith(lastLabel));

    if (firstItem === undefined || lastItem === undefined) return [];

    let section = firstItem.parentElement;

    while (section !== null && !section.contains(lastItem)) {
      section = section.parentElement;
    }

    return Array.from(
      section?.querySelectorAll('.navigation-drawer-item') ?? [],
    ).map(textOf);
  }, MENU_ANCHORS);

// A view's entry reads «Все заказы · Заказы»: the view, then its object.
const entryName = (entry: string) => entry.split(' · ')[0];

const MENUS: { role: Role; title: string; entries: string[] }[] = [
  {
    role: 'ADMIN',
    title: 'the owner',
    entries: [
      'Аналитика',
      'Новый замер',
      'Все заказы',
      'Доска заказов',
      'Мои замеры',
      'Производство',
      'ЗП за месяц',
      'Мастера',
      'Выплаты',
      'Склад',
      'Цены',
    ],
  },
  {
    role: 'MANAGER',
    title: 'a manager',
    entries: [
      'Новый замер',
      'Все заказы',
      'Доска заказов',
      'Мои замеры',
      'Производство',
      'Мастера',
      'Склад',
      'Цены',
    ],
  },
  {
    role: 'MEASURER',
    title: 'the measurer',
    entries: [
      'Новый замер',
      'Все заказы',
      'Доска заказов',
      'Мои замеры',
      'Производство',
    ],
  },
];

for (const { role, title, entries } of MENUS) {
  test(`the sidebar of ${title} has the phase 1 menu and only Russian entries`, async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await signIn(page, role);
    await expect(
      page.getByRole('link', { name: MENU_ANCHORS[0] }).first(),
    ).toBeVisible({ timeout: 60_000 });

    // Compared without order: the spec lists the entries, not their order.
    await expect
      .poll(
        async () => (await workspaceMenuEntries(page)).map(entryName).sort(),
        { timeout: 30_000 },
      )
      .toEqual([...entries].sort());

    expect(
      (await workspaceMenuEntries(page)).filter((entry) =>
        /[A-Za-z]/.test(entry),
      ),
    ).toEqual([]);
  });
}

test('an order in «Согласование цены» is a need on the material and the pill reads «Купить»', async ({
  page,
}) => {
  test.setTimeout(300_000);

  const materialId = await create('Material', {
    name: ORDER_MATERIAL,
    unit: 'METER',
  });

  await pause(RECALC_PAUSE);

  const designId = await create('Design', {
    name: GRILLE,
    pricePerSquareMeter: {
      amountMicros: GRILLE_PRICE_MICROS,
      currencyCode: 'UZS',
    },
  });

  await create('MaterialNorm', {
    designId,
    materialId,
    quantityPerUnit: AMOUNT_PER_SQUARE_METER,
  });
  await pause(RECALC_PAUSE);

  const orderId = await create('Order', { name: '', clientName: CLIENT });

  await pause(RECALC_PAUSE);
  await create('OrderItem', {
    orderId,
    designId,
    widthCm: 100,
    heightCm: 100,
    quantity: 2,
  });
  await pause(RECALC_PAUSE);
  await graphql(
    'mutation($id: UUID!, $data: OrderUpdateInput!) { updateOrder(id: $id, data: $data) { id } }',
    { id: orderId, data: { status: 'PRICE_APPROVAL' } },
  );

  // The order's material lines and the material's totals are written by
  // functions that run after the status change.
  await expect
    .poll(async () => {
      const { material } = await graphql(
        'query($id: UUID!) { material(filter: { id: { eq: $id } }) { reserved toBuy } }',
        { id: materialId },
      );

      return [material?.reserved, material?.toBuy];
    }, POLL)
    .toEqual([ORDER_NEED, ORDER_NEED]);

  await signIn(page, 'ADMIN');
  await openStock(page);

  const header = rowHeader(page, ORDER_MATERIAL);

  await expect(header).toContainText(
    new RegExp(`Нужно на заказы ${ORDER_NEED}\\sм`),
    { timeout: 60_000 },
  );
  // Nothing is in stock, so the whole need is to buy.
  await expect(header).toContainText(new RegExp(`Купить ${ORDER_NEED}\\sм`));

  const row = await openRow(page, ORDER_MATERIAL);

  await expect(row.getByText('Нужно на заказы:')).toBeVisible();
  await expect(row.locator(`a[href="/object/order/${orderId}"]`)).toContainText(
    new RegExp(`${ORDER_NEED}\\sм`),
  );
});

test('the owner dashboard names the overuse table «Уходит больше нормы»', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page, 'ADMIN');

  for (const title of [
    'Всего материалов',
    'Достаточно',
    'Скоро закончится',
    'Нужно купить',
    'План закупок',
    'Уходит больше нормы',
  ]) {
    await expect(
      page.locator('[data-widget-id]').filter({ hasText: title }).first(),
    ).toBeVisible({ timeout: 30_000 });
  }
});
