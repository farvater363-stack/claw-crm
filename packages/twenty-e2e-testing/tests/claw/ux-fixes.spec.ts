import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { FORCE, graphql, type Role, signIn } from './claw-helpers';

const TABLET_VIEWPORT = { width: 820, height: 1180 };
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

// A number no real customer uses; beforeAll refuses to run if any order or
// Person already has it, so afterAll can delete everything carrying it.
const TEST_NATIONAL_PHONE = '930000014';
const TEST_STORED_PHONE = `+998${TEST_NATIONAL_PHONE}`;

const TEST_DESIGN_NAME = 'E2E UX design (temporary)';
// 140 x 150 x 30 cm is 3.84 m2 per piece; one piece at 180 000 UZS/m2.
const PRICE_PER_SQUARE_METER_MICROS = 180_000_000_000;
const EXPECTED_LINE_TOTAL = /^Итого: 691\D200 сум$/;

// Compact money such as "2.3m" or "950k" instead of the full amount.
const COMPACT_MONEY = /\d(\.\d)?[km]\b/;

// Any date in the past; the deadline state is recomputed when it is set.
const PAST_DEADLINE = '2020-01-01';

const RESTRICTED_LABELS = ['Себестоимость', 'Маржа', 'ЗП итого', 'Штраф'];

test.use({ actionTimeout: 20_000 });

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
type Viewport = { width: number; height: number };

const storageStateByRole = new Map<Role, StorageState>();
const openContexts: BrowserContext[] = [];

test.afterEach(async () => {
  for (const context of openContexts.splice(0)) {
    await context.close();
  }
});

// Each role signs in once; later tests reuse its session to keep the run short.
const openPageAs = async (browser: Browser, role: Role, viewport: Viewport) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport,
    // Overrides the project's default session file: this spec signs in itself.
    storageState: storageStateByRole.get(role),
  });

  openContexts.push(context);

  const page = await context.newPage();

  if (!storageStateByRole.has(role)) {
    await signIn(page, role);
    storageStateByRole.set(role, await context.storageState());
  }

  return page;
};

const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);

// Boxes of every visible element whose whole text is `text`.
const boxesOfText = async (page: Page, text: string) => {
  const boxes = [];

  for (const element of await page.getByText(text, { exact: true }).all()) {
    const box = await element.boundingBox();

    if (box) boxes.push(box);
  }

  return boxes;
};

const findTestOrderIds = async (): Promise<string[]> => {
  const { orders } = await graphql(
    'query($phone: String!) { orders(filter: { clientPhone: { eq: $phone } }) { edges { node { id } } } }',
    { phone: TEST_STORED_PHONE },
  );

  return orders.edges.map(({ node }: { node: { id: string } }) => node.id);
};

const findTestPersonIds = async (): Promise<string[]> => {
  const { people } = await graphql(
    'query($phone: String!) { people(filter: { phones: { primaryPhoneNumber: { eq: $phone } } }) { edges { node { id } } } }',
    { phone: TEST_NATIONAL_PHONE },
  );

  return people.edges.map(({ node }: { node: { id: string } }) => node.id);
};

const destroyTestDesigns = async () => {
  const { designs } = await graphql(
    'query($name: String!) { designs(filter: { name: { eq: $name } }) { edges { node { id } } } }',
    { name: TEST_DESIGN_NAME },
  );

  for (const { node } of designs.edges) {
    await graphql('mutation($id: UUID!) { destroyDesign(id: $id) { id } }', {
      id: node.id,
    });
  }
};

let isTestPhoneUnused = false;
let seededOrderId: string;
let seededOrderName: string;

test.beforeAll(async () => {
  if (
    (await findTestOrderIds()).length > 0 ||
    (await findTestPersonIds()).length > 0
  ) {
    throw new Error(
      `An order or Person already uses ${TEST_STORED_PHONE}; refusing to create and delete data that may be real`,
    );
  }

  isTestPhoneUnused = true;

  // A run killed before afterAll leaves its grille behind, and two tiles with
  // one name make the tile locator ambiguous.
  await destroyTestDesigns();

  // The test's own grille with a synthetic price, so what it expects never
  // depends on, or disturbs, the real price list.
  const { createDesign } = await graphql(
    'mutation($data: DesignCreateInput!) { createDesign(data: $data) { id } }',
    {
      data: {
        name: TEST_DESIGN_NAME,
        pricePerSquareMeter: {
          amountMicros: PRICE_PER_SQUARE_METER_MICROS,
          currencyCode: 'UZS',
        },
        materialCostPerSquareMeter: {
          amountMicros: 100_000_000_000,
          currencyCode: 'UZS',
        },
      },
    },
  );

  const { createOrder } = await graphql(
    'mutation($data: OrderCreateInput!) { createOrder(data: $data) { id } }',
    {
      data: {
        name: '',
        clientName: 'E2E UX',
        clientPhone: TEST_STORED_PHONE,
        addressLine: 'E2E',
        status: 'NEW',
      },
    },
  );

  seededOrderId = createOrder.id;

  await graphql(
    'mutation($data: OrderItemCreateInput!) { createOrderItem(data: $data) { id } }',
    {
      data: {
        orderId: seededOrderId,
        designId: createDesign.id,
        widthCm: 140,
        heightCm: 150,
        projectionCm: 30,
        quantity: 2,
      },
    },
  );

  // The triggers number the order and calculate its total asynchronously.
  await expect
    .poll(
      async () => {
        const { order } = await graphql(
          'query($id: UUID!) { order(filter: { id: { eq: $id } }) { name total { amountMicros } } }',
          { id: seededOrderId },
        );

        seededOrderName = order?.name ?? '';

        return [/^№\d{4}$/.test(seededOrderName), order?.total?.amountMicros];
      },
      { timeout: 60_000 },
    )
    .toEqual([true, 1_382_400_000_000]);

  await graphql(
    'mutation($id: UUID!, $data: OrderUpdateInput!) { updateOrder(id: $id, data: $data) { id } }',
    { id: seededOrderId, data: { installationDeadline: PAST_DEADLINE } },
  );

  await expect
    .poll(
      async () => {
        const { order } = await graphql(
          'query($id: UUID!) { order(filter: { id: { eq: $id } }) { deadlineState } }',
          { id: seededOrderId },
        );

        return order?.deadlineState;
      },
      { timeout: 60_000 },
    )
    .toBe('OVERDUE');
});

// Every step is independent so one failure does not skip the rest.
test.afterAll(async () => {
  if (!isTestPhoneUnused) return;

  const failures: string[] = [];

  const attempt = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      failures.push(`${label}: ${String(error)}`);
    }
  };

  // The created trigger may still be linking a client when a test bails out.
  await new Promise((resolve) => setTimeout(resolve, 3_000));

  let orderIds: string[] = [];

  await attempt('find orders', async () => {
    orderIds = await findTestOrderIds();
  });

  // The phone lookup misses the order if the create call never stored it.
  if (seededOrderId && !orderIds.includes(seededOrderId)) {
    orderIds.push(seededOrderId);
  }

  for (const orderId of orderIds) {
    await attempt(`items of order ${orderId}`, async () => {
      const { orderItems } = await graphql(
        'query($orderId: UUID!) { orderItems(filter: { orderId: { eq: $orderId } }) { edges { node { id } } } }',
        { orderId },
      );

      for (const { node } of orderItems.edges) {
        await attempt(`item ${node.id}`, () =>
          graphql('mutation($id: UUID!) { destroyOrderItem(id: $id) { id } }', {
            id: node.id,
          }),
        );
      }
    });

    await attempt(`order ${orderId}`, () =>
      graphql('mutation($id: UUID!) { destroyOrder(id: $id) { id } }', {
        id: orderId,
      }),
    );
  }

  await attempt('people', async () => {
    for (const personId of await findTestPersonIds()) {
      await attempt(`person ${personId}`, () =>
        graphql('mutation($id: UUID!) { destroyPerson(id: $id) { id } }', {
          id: personId,
        }),
      );
    }
  });

  await attempt('designs', destroyTestDesigns);

  if (failures.length > 0) {
    throw new Error(`Cleanup left data behind:\n${failures.join('\n')}`);
  }
});

test.describe('admin', () => {
  test('order page opens on «Позиции» with the openings table and the total below', async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const page = await openPageAs(browser, 'ADMIN', DESKTOP_VIEWPORT);

    await page.goto(`/object/order/${seededOrderId}`);

    const positionsTab = page
      .getByRole('tab', { name: 'Позиции' })
      .or(page.getByRole('link', { name: 'Позиции' }))
      .first();

    await expect(positionsTab).toBeVisible({ timeout: 60_000 });
    // Tabs mark the open one with aria-selected or aria-current by variant.
    await expect
      .poll(
        () =>
          positionsTab.evaluate(
            (element) =>
              element.getAttribute('aria-selected') === 'true' ||
              element.getAttribute('aria-current') === 'page',
          ),
        { timeout: 30_000 },
      )
      .toBe(true);

    const tabBox = await positionsTab.boundingBox();

    if (!tabBox) throw new Error('The «Позиции» tab has no box');

    // The pinned «Заказ» column is left of the tab; only look at the main area.
    const inMainArea = (box: { x: number }) => box.x >= tabBox.x - 4;

    await expect
      .poll(
        async () =>
          (await boxesOfText(page, 'Площадь, м²')).filter(inMainArea).length,
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    const headerTop = Math.min(
      ...(await boxesOfText(page, 'Площадь, м²'))
        .filter(inMainArea)
        .map((box) => box.y),
    );
    const totalBoxes = (await boxesOfText(page, 'Итого')).filter(inMainArea);

    expect(
      totalBoxes.some((box) => box.y > headerTop),
      '«Итого» must appear below the table header',
    ).toBe(true);
  });

  test('«Все заказы» opens as the orders view with the new first columns', async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const page = await openPageAs(browser, 'ADMIN', DESKTOP_VIEWPORT);

    await page.goto('/');
    await page.getByRole('link', { name: 'Все заказы' }).first().click();

    // The menu item and the open view both carry the name.
    await expect
      .poll(
        async () =>
          (await page.getByText('Все заказы', { exact: true }).all()).length,
        { timeout: 60_000 },
      )
      .toBeGreaterThanOrEqual(2);
    await expect(
      page.getByText(seededOrderName, { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });

    const headerLeftEdges: number[] = [];

    for (const label of ['№', 'Статус', 'Имя', 'Телефон']) {
      const header = page.getByText(label, { exact: true }).first();

      await expect(header, `column «${label}»`).toBeVisible();
      headerLeftEdges.push((await header.boundingBox())?.x ?? Infinity);
    }

    expect(headerLeftEdges).toEqual([...headerLeftEdges].sort((a, b) => a - b));
  });

  test('board column totals show full amounts, not 2.3m', async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const page = await openPageAs(browser, 'ADMIN', DESKTOP_VIEWPORT);

    await page.goto('/objects/orders');
    await page.getByRole('link', { name: 'Доска заказов' }).first().click();

    await expect(
      page.getByText(seededOrderName, { exact: true }).first(),
    ).toBeVisible({ timeout: 60_000 });
    // The seeded order is worth 1 382 400, so its column total is at least that.
    await expect
      .poll(async () => bodyText(page), { timeout: 30_000 })
      .toMatch(/\d\D\d{3}\D\d{3}/);

    expect(await bodyText(page)).not.toMatch(COMPACT_MONEY);
  });

  test('a board card shows «Просрочен» for an order past its deadline', async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const page = await openPageAs(browser, 'ADMIN', DESKTOP_VIEWPORT);

    await page.goto('/objects/orders');
    await page.getByRole('link', { name: 'Доска заказов' }).first().click();

    const card = page
      .locator('[data-selectable-id]')
      .filter({ hasText: seededOrderName });

    await expect(card.getByText('Просрочен')).toBeVisible({ timeout: 60_000 });
  });
});

test.describe('measurer', () => {
  test('the form shows the price per m² and the total for a priced opening', async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const page = await openPageAs(browser, 'MEASURER', TABLET_VIEWPORT);

    await page.goto('/');
    await page.getByRole('link', { name: 'Новый замер' }).first().click();

    const opening = page.getByRole('region', { name: 'Проём 1' });

    await expect(opening).toBeVisible({ timeout: 60_000 });

    const grilleTile = opening.getByRole('button', { name: TEST_DESIGN_NAME });

    await grilleTile.click(FORCE);
    await expect(grilleTile).toHaveAttribute('aria-pressed', 'true');
    await opening.getByLabel('Ширина, см').fill('140', FORCE);
    await opening.getByLabel('Высота, см').fill('150', FORCE);
    await opening.getByLabel('Вылет, см').fill('30', FORCE);
    await opening.getByLabel('Количество').fill('1', FORCE);

    await expect(grilleTile).toContainText(/180\D000 сум за м²/);
    await expect(page.getByText(/^Итого: /)).toHaveText(EXPECTED_LINE_TOTAL);
  });

  test('the sidebar has no «Работники», «ЗП мастеров» and «Выплаты»', async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const page = await openPageAs(browser, 'MEASURER', TABLET_VIEWPORT);

    await page.goto('/');

    // Wait for the menu to render before asserting that items are missing.
    await expect(
      page.getByRole('link', { name: 'Новый замер' }).first(),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('link', { name: 'Работники' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'ЗП мастеров' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('link', { name: 'Выплаты' })).toHaveCount(0);
  });

  test('an order page shows no cost, margin or master pay', async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const page = await openPageAs(browser, 'MEASURER', TABLET_VIEWPORT);

    await page.goto(`/object/order/${seededOrderId}`);

    await expect(
      page.getByText(seededOrderName, { exact: true }).first(),
    ).toBeVisible({ timeout: 60_000 });
    // The unrestricted «Итого» proves the fields widget has rendered.
    await expect(page.getByText('Итого', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    const pageText = await bodyText(page);

    for (const label of RESTRICTED_LABELS) {
      expect(pageText, `«${label}» must not be on the page`).not.toContain(
        label,
      );
    }
  });
});
