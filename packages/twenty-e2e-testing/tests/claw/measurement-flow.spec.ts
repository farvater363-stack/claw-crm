import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { LoginPage } from '../../lib/pom/loginPage';
import { graphql, requireEnv, type Role } from './claw-helpers';

const API_URL = process.env.CLAW_API_URL ?? 'http://localhost:3000';
const TABLET_VIEWPORT = { width: 820, height: 1180 };
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

const PHOTO_NAME = 'e2e-photo.png';
// A 1 x 1 PNG.
const PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// Phone numbers no real customer uses; beforeAll refuses to run if a Person
// already owns one, so afterAll can delete whatever the triggers created.
const SEEDED_ORDER_PHONE = '+998930000002';
const SEEDED_ORDER_NATIONAL_PHONE = '930000002';

// 140 x 150 x 30 cm, 2 pieces: area 7.68 m2 at 180 000 UZS/m2.
// Money renders in full with the viewer's group separator (space, comma or dot).
const EXPECTED_TOTAL = /^1\D?382\D?400$/;
const EXPECTED_AREA = /^7[.,]68$/;
const EXPECTED_MARGIN = /^614\D?400$/;

// The seeded order is priced by its own grille, so it never depends on, or
// disturbs, the real price list.
const SEEDED_PRICE_PER_SQUARE_METER_MICROS = 180_000_000_000;
const SEEDED_MATERIAL_COST_PER_SQUARE_METER_MICROS = 100_000_000_000;

const RESTRICTED_ORDER_FIELDS = [
  'costTotal { amountMicros }',
  'margin { amountMicros }',
  'marginPercent',
  'daysLate',
  'masterPayCalculated { amountMicros }',
  'masterBonus { amountMicros }',
  'masterPayTotal { amountMicros }',
  'masterPenalty { amountMicros }',
];

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
type Viewport = { width: number; height: number };

// Not the shared signIn: this one also records the tab title before and after.
const signIn = async (page: Page, role: Role) => {
  const loginPage = new LoginPage(page);

  await page.goto('/');
  // The dev server needs ~10 s to render the sign-in page, longer than the
  // helper's 3 s look for the "Continue with Email" button.
  await page
    .getByRole('button', { name: 'Continue with Email' })
    .or(page.getByPlaceholder('Email'))
    .first()
    .waitFor({ timeout: 60_000 });
  const signInTitle = await page.title();
  await loginPage.clickLoginWithEmailIfVisible();
  await loginPage.typeEmail(requireEnv(`CLAW_${role}_EMAIL`));
  await loginPage.clickContinueButton();
  await loginPage.typePassword(requireEnv(`CLAW_${role}_PASSWORD`));
  await loginPage.clickSignInButton();
  await page.waitForURL(/objects|dashboard|\/page\//, { timeout: 60_000 });
  test.info().annotations.push({
    type: 'tab-title',
    description: `${role}: sign-in "${signInTitle}", after sign-in "${await page.title()}"`,
  });
};

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

const frontendOrigin = () =>
  new URL(test.info().project.use.baseURL ?? 'http://localhost:3001').origin;

const bodyLines = async (page: Page) =>
  (await page.evaluate(() => document.body.innerText))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

// The record page renders "label, value" as consecutive text lines; money is
// shown in full, grouped by the viewer's locale.
const readFieldValue = async (page: Page, label: string) => {
  const lines = await bodyLines(page);
  const labelIndex = lines.indexOf(label);

  return labelIndex === -1 ? null : (lines[labelIndex + 1] ?? null);
};

const createdOrderIds: string[] = [];
const createdDesignIds: string[] = [];
const createdPersonIds: string[] = [];
// Only when the test phone was unused at start can a linked client be ours.
let isTestPhoneUnused = false;

const createOrder = async (data: Record<string, unknown>) => {
  const { createOrder: order } = await graphql(
    'mutation($data: OrderCreateInput!) { createOrder(data: $data) { id } }',
    { data: { name: '', ...data } },
  );

  createdOrderIds.push(order.id);

  return order.id as string;
};

const waitForOrderName = async (orderId: string) => {
  let name = '';

  await expect
    .poll(
      async () => {
        const { order } = await graphql(
          'query($id: UUID!) { order(filter: { id: { eq: $id } }) { name } }',
          { id: orderId },
        );

        name = order?.name ?? '';

        return name;
      },
      { timeout: 30_000 },
    )
    .toMatch(/^№\d{4}$/);

  return name;
};

const getOrderStatus = async (orderId: string) => {
  const { order } = await graphql(
    'query($id: UUID!) { order(filter: { id: { eq: $id } }) { status } }',
    { id: orderId },
  );

  return order?.status as string;
};

const findPersonIdsByPhone = async (nationalPhone: string) => {
  const { people } = await graphql(
    'query($phone: String!) { people(filter: { phones: { primaryPhoneNumber: { eq: $phone } } }) { edges { node { id } } } }',
    { phone: nationalPhone },
  );

  return people.edges.map(({ node }: { node: { id: string } }) => node.id);
};

let seededOrderId: string;

test.beforeAll(async () => {
  if ((await findPersonIdsByPhone(SEEDED_ORDER_NATIONAL_PHONE)).length > 0) {
    throw new Error(
      `A Person already owns ${SEEDED_ORDER_PHONE}; refusing to create and delete data that may be real`,
    );
  }

  isTestPhoneUnused = true;

  const { createDesign } = await graphql(
    'mutation($data: DesignCreateInput!) { createDesign(data: $data) { id } }',
    {
      data: {
        name: 'E2E design (temporary)',
        pricePerSquareMeter: {
          amountMicros: SEEDED_PRICE_PER_SQUARE_METER_MICROS,
          currencyCode: 'UZS',
        },
        materialCostPerSquareMeter: {
          amountMicros: SEEDED_MATERIAL_COST_PER_SQUARE_METER_MICROS,
          currencyCode: 'UZS',
        },
      },
    },
  );

  createdDesignIds.push(createDesign.id);

  seededOrderId = await createOrder({
    clientName: 'E2E',
    clientPhone: SEEDED_ORDER_PHONE,
    addressLine: 'E2E',
  });

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

  // The triggers calculate asynchronously; wait so every test sees final numbers.
  await expect
    .poll(
      async () => {
        const { order } = await graphql(
          'query($id: UUID!) { order(filter: { id: { eq: $id } }) { total { amountMicros } margin { amountMicros } } }',
          { id: seededOrderId },
        );

        return [order?.total?.amountMicros, order?.margin?.amountMicros];
      },
      { timeout: 60_000 },
    )
    .toEqual([1_382_400_000_000, 614_400_000_000]);
});

// Every step is independent so one failure does not skip the rest.
test.afterAll(async () => {
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

  for (const orderId of createdOrderIds) {
    if (isTestPhoneUnused) {
      await attempt(`client of order ${orderId}`, async () => {
        const { order } = await graphql(
          'query($id: UUID!) { order(filter: { id: { eq: $id } }) { clientId } }',
          { id: orderId },
        );

        if (order?.clientId) createdPersonIds.push(order.clientId);
      });
    }

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

  for (const personId of createdPersonIds) {
    await attempt(`person ${personId}`, () =>
      graphql('mutation($id: UUID!) { destroyPerson(id: $id) { id } }', {
        id: personId,
      }),
    );
  }

  for (const designId of createdDesignIds) {
    await attempt(`design ${designId}`, () =>
      graphql('mutation($id: UUID!) { destroyDesign(id: $id) { id } }', {
        id: designId,
      }),
    );
  }

  if (failures.length > 0) {
    throw new Error(`Cleanup left data behind:\n${failures.join('\n')}`);
  }
});

test.describe('order totals and role visibility', () => {
  test('admin sees the calculated total and margin on a tablet', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const page = await openPageAs(browser, 'ADMIN', TABLET_VIEWPORT);
    await page.goto(`/object/order/${seededOrderId}`);

    await expect(page.getByText(/^№\d{4}$/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() => readFieldValue(page, 'Итого'), { timeout: 30_000 })
      .toMatch(EXPECTED_TOTAL);
    expect(await readFieldValue(page, 'Площадь, м²')).toMatch(EXPECTED_AREA);
    expect(await readFieldValue(page, 'Маржа')).toMatch(EXPECTED_MARGIN);
    expect(await readFieldValue(page, 'Себестоимость')).toMatch(/^768\D?000$/);

    test.info().annotations.push({
      type: 'rendered',
      description: (
        await Promise.all(
          ['Итого', 'Площадь, м²', 'Себестоимость', 'Маржа'].map(
            async (label) => `${label}=${await readFieldValue(page, label)}`,
          ),
        )
      ).join(', '),
    });
  });

  for (const role of ['MANAGER', 'MEASURER'] as const) {
    test(`${role.toLowerCase()} sees the total but no cost, margin or pay`, async ({
      browser,
    }) => {
      test.setTimeout(120_000);
      const page = await openPageAs(browser, role, TABLET_VIEWPORT);
      await page.goto(`/object/order/${seededOrderId}`);

      await expect
        .poll(() => readFieldValue(page, 'Итого'), { timeout: 30_000 })
        .toMatch(EXPECTED_TOTAL);

      // Margin 614 400 and cost 768 000 are what the admin test above sees
      // for the same order; neither value may reach this page.
      const pageText = (await bodyLines(page)).join('\n');

      expect(pageText).not.toMatch(/614\D?400|768\D?000/);
      // Rows of fields the role cannot read are not rendered at all.
      expect(await readFieldValue(page, 'Маржа')).toBeNull();
      expect(await readFieldValue(page, 'Себестоимость')).toBeNull();

      // The same session, asked directly through the API, is refused.
      for (const restrictedField of RESTRICTED_ORDER_FIELDS) {
        const response = await page
          .context()
          .request.post(`${API_URL}/graphql`, {
            headers: { Origin: frontendOrigin() },
            data: {
              query: `{ orders(filter: { id: { eq: "${seededOrderId}" } }) { edges { node { ${restrictedField} } } } }`,
            },
          });
        const body = await response.json();

        expect(
          body.data?.orders ?? null,
          `${restrictedField} must not be readable`,
        ).toBeNull();
        expect(body.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
      }

      const allowedResponse = await page
        .context()
        .request.post(`${API_URL}/graphql`, {
          headers: { Origin: frontendOrigin() },
          data: {
            query: `{ orders(filter: { id: { eq: "${seededOrderId}" } }) { edges { node { total { amountMicros } } } } }`,
          },
        });

      expect(
        (await allowedResponse.json()).data.orders.edges[0].node.total
          .amountMicros,
      ).toBe(1_382_400_000_000);
    });
  }
});

test.describe('kanban and measurer views', () => {
  test('dragging a card on the kanban board changes the order status', async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const orderId = await createOrder({
      clientName: 'E2E kanban',
      status: 'NEW',
    });
    const orderName = await waitForOrderName(orderId);

    const page = await openPageAs(browser, 'ADMIN', DESKTOP_VIEWPORT);
    await page.goto('/objects/orders');
    await page.getByRole('link', { name: 'Доска заказов' }).first().click();

    const card = page.getByText(orderName, { exact: true }).first();

    await expect(card).toBeVisible({ timeout: 30_000 });

    const targetColumn = page
      .getByText('Замер назначен', { exact: true })
      .first();
    const cardBox = await card.boundingBox();
    const targetBox = await targetColumn.boundingBox();

    if (!cardBox || !targetBox) {
      throw new Error('Kanban card or target column is not on screen');
    }

    // hello-pangea/dnd needs real pointer movement in several steps.
    await page.mouse.move(
      cardBox.x + cardBox.width / 2,
      cardBox.y + cardBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cardBox.x + cardBox.width / 2 + 10,
      cardBox.y + cardBox.height / 2 + 10,
      { steps: 5 },
    );
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + 120,
      { steps: 25 },
    );
    await page.waitForTimeout(500);
    await page.mouse.up();

    await expect
      .poll(() => getOrderStatus(orderId), { timeout: 15_000 })
      .toBe('MEASUREMENT_SCHEDULED');
  });

  test('"Мои замеры" lists the measurer their scheduled and done measurements', async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const { workspaceMembers } = await graphql(
      'query($email: String!) { workspaceMembers(filter: { userEmail: { eq: $email } }) { edges { node { id } } } }',
      { email: requireEnv('CLAW_MEASURER_EMAIL') },
    );
    const measurerId = workspaceMembers.edges[0].node.id;

    // Client names identify the rows: order numbers come from an async
    // max+1 trigger and two orders created together can share one.
    await createOrder({
      clientName: 'E2E scheduled',
      status: 'MEASUREMENT_SCHEDULED',
      measurerId,
    });
    await createOrder({
      clientName: 'E2E measured',
      status: 'MEASURED',
      measurerId,
    });
    await createOrder({
      clientName: 'E2E not scheduled',
      status: 'NEW',
      measurerId,
    });

    const page = await openPageAs(browser, 'MEASURER', TABLET_VIEWPORT);
    await page.goto('/objects/orders');
    await page.getByRole('link', { name: 'Мои замеры' }).first().click();

    await expect(
      page.getByText('E2E scheduled', { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    const measuredRow = page.getByText('E2E measured', { exact: true }).first();

    await expect(measuredRow).toBeVisible();
    await expect(
      page.getByText('E2E not scheduled', { exact: true }),
    ).toHaveCount(0);

    // Two kanban columns: scheduled measurements left of done ones.
    const scheduledBox = await page
      .getByText('E2E scheduled', { exact: true })
      .first()
      .boundingBox();
    const measuredBox = await measuredRow.boundingBox();

    expect(scheduledBox?.x ?? Infinity).toBeLessThan(
      measuredBox?.x ?? -Infinity,
    );
  });
});

test.describe('manager photos', () => {
  test('manager attaches a design photo and downloads it back', async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const page = await openPageAs(browser, 'MANAGER', DESKTOP_VIEWPORT);
    await page.goto(`/object/design/${createdDesignIds[0]}`);

    // An empty files field shows its label as the placeholder, after the label itself.
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page
      .getByText('Фото', { exact: true })
      .nth(1)
      .click({ timeout: 30_000 });
    await (
      await fileChooserPromise
    ).setFiles({ name: PHOTO_NAME, mimeType: 'image/png', buffer: PHOTO });

    // Without UPLOAD_FILE the server rejects the upload and this toast never shows.
    await expect(
      page.getByText(`File "${PHOTO_NAME}" uploaded successfully`),
    ).toBeVisible({ timeout: 30_000 });

    // The chip renders twice; the last copy sits on top and takes the click.
    await page.getByText(PHOTO_NAME, { exact: true }).last().click();
    const downloadResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/file/files-field/'),
    );
    await page.getByRole('button', { name: 'Download file' }).click();

    expect(await (await downloadResponsePromise).body()).toEqual(PHOTO);
  });
});
