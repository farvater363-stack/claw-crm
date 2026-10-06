import { expect, type Locator, type Page, test } from '@playwright/test';
import { LoginPage } from '../../lib/pom/loginPage';

const API_URL = process.env.CLAW_API_URL ?? 'http://localhost:3000';
const TABLET_VIEWPORT = { width: 820, height: 1180 };

// A number no real customer uses; beforeAll refuses to run if any order or
// Person already has it, so afterAll can delete everything carrying it.
const TEST_NATIONAL_PHONE = '930000013';
const TEST_STORED_PHONE = `+998${TEST_NATIONAL_PHONE}`;

// The test's own grille with a synthetic price, so what it expects never
// depends on the real price list. 7.68 m² at this price is 1 920 000.
const TEST_GRILLE_NAME = 'E2E grille (temporary)';
const TEST_GRILLE_PRICE = 250_000;

// 8×8 red PNG.
const createPhotoFixture = (name: string) => ({
  name,
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGO4YGCAFTEMLQkA2ntMAeuWKpoAAAAASUVORK5CYII=',
    'base64',
  ),
});

// Twenty wraps every widget in a dnd-kit draggable with aria-disabled="true"
// outside layout edit mode; Playwright reads that as disabled for the whole
// subtree although the controls work for a person.
const FORCE = { force: true } as const;

// selectOption also refuses options it reads as disabled, so pick the option
// the way the browser does: native setter plus a change event.
const chooseOption = (select: Locator, label: string) =>
  select.evaluate((element, optionLabel) => {
    const selectElement = element as HTMLSelectElement;
    const option = Array.from(selectElement.options).find(
      (candidate) => candidate.label === optionLabel,
    );

    if (!option) throw new Error(`No option ${optionLabel}`);

    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      'value',
    )?.set?.call(selectElement, option.value);
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
  }, label);

test.use({ actionTimeout: 20_000 });

const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const graphql = async (
  query: string,
  variables: Record<string, unknown> = {},
) => {
  const response = await fetch(`${API_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requireEnv('CLAW_API_KEY')}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();

  if (body.errors) throw new Error(JSON.stringify(body.errors));

  return body.data;
};

const signInAsMeasurer = async (page: Page) => {
  const loginPage = new LoginPage(page);

  await page.goto('/');
  // The dev server needs ~10 s to render the sign-in page.
  await page
    .getByRole('button', { name: 'Continue with Email' })
    .or(page.getByPlaceholder('Email'))
    .first()
    .waitFor({ timeout: 60_000 });
  await loginPage.clickLoginWithEmailIfVisible();
  await loginPage.typeEmail(requireEnv('CLAW_MEASURER_EMAIL'));
  await loginPage.clickContinueButton();
  await loginPage.typePassword(requireEnv('CLAW_MEASURER_PASSWORD'));
  await loginPage.clickSignInButton();
  await page.waitForURL(/objects|dashboard|\/page\//, { timeout: 60_000 });
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

const destroyTestGrilles = async () => {
  const { designs } = await graphql(
    'query($name: String!) { designs(filter: { name: { eq: $name } }) { edges { node { id } } } }',
    { name: TEST_GRILLE_NAME },
  );

  for (const { node } of designs.edges) {
    await graphql('mutation($id: UUID!) { destroyDesign(id: $id) { id } }', {
      id: node.id,
    });
  }
};

let isTestPhoneUnused = false;
let testGrilleId: string | null = null;
// Signed URLs of the photos the test attached; afterAll checks they stop
// serving once the items are destroyed.
const attachedPhotoUrls: string[] = [];

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
  await destroyTestGrilles();

  const { createDesign } = await graphql(
    'mutation($data: DesignCreateInput!) { createDesign(data: $data) { id } }',
    {
      data: {
        name: TEST_GRILLE_NAME,
        pricePerSquareMeter: {
          amountMicros: TEST_GRILLE_PRICE * 1_000_000,
          currencyCode: 'UZS',
        },
      },
    },
  );

  testGrilleId = createDesign.id;
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

  for (const orderId of orderIds) {
    await attempt(`payments of order ${orderId}`, async () => {
      const { orderPayments } = await graphql(
        'query($orderId: UUID!) { orderPayments(filter: { orderId: { eq: $orderId } }) { edges { node { id } } } }',
        { orderId },
      );

      for (const { node } of orderPayments.edges) {
        await attempt(`payment ${node.id}`, () =>
          graphql(
            'mutation($id: UUID!) { destroyOrderPayment(id: $id) { id } }',
            { id: node.id },
          ),
        );
      }
    });

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

  await attempt('grilles', destroyTestGrilles);

  // Destroying an item queues deletion of its photo files on the worker.
  await attempt('photo files', () =>
    expect
      .poll(
        async () => {
          const statuses = await Promise.all(
            attachedPhotoUrls.map(
              async (url) => (await fetch(url)).status === 200,
            ),
          );

          return statuses.filter(Boolean).length;
        },
        { timeout: 30_000 },
      )
      .toBe(0),
  );

  await attempt('people', async () => {
    for (const personId of await findTestPersonIds()) {
      await attempt(`person ${personId}`, () =>
        graphql('mutation($id: UUID!) { destroyPerson(id: $id) { id } }', {
          id: personId,
        }),
      );
    }
  });

  if (failures.length > 0) {
    throw new Error(`Cleanup left data behind:\n${failures.join('\n')}`);
  }
});

test('measurer records a measurement from the tablet form', async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: TABLET_VIEWPORT,
    // Overrides the project's default session file: this spec signs in itself.
    storageState: undefined,
  });
  const page = await context.newPage();

  try {
    await signInAsMeasurer(page);

    // Load the measurer's own list first, as he does during the day: the
    // app caches it, and the new order must still show up after saving.
    await page.getByRole('link', { name: 'Мои замеры' }).first().click();
    await expect(
      page.getByText('Замер назначен', { exact: true }).first(),
    ).toBeVisible({ timeout: 60_000 });

    // Step 1: open the form from the sidebar.
    await page.getByRole('link', { name: 'Новый замер' }).first().click();

    const phone = page.getByLabel('Телефон');

    await expect(phone).toBeVisible({ timeout: 60_000 });

    // Step 2: fill the client block (the date defaults to now).
    await page.getByLabel('Имя клиента').fill('E2E замер', FORCE);
    // Key by key at a person's pace: every digit must land at the end.
    await phone.click(FORCE);
    await page.keyboard.type(TEST_NATIONAL_PHONE, { delay: 80 });
    await expect(phone).toHaveValue(TEST_NATIONAL_PHONE);
    await page.keyboard.press('Tab');
    await expect(phone).toHaveValue('93 000 00 13');
    await chooseOption(page.getByLabel('Район'), 'Чиланзарский');
    await page.getByLabel('Адрес').fill('E2E адрес', FORCE);
    await page.getByLabel('Этаж').fill('3', FORCE);
    await chooseOption(page.getByLabel('Источник'), 'OLX');

    // Step 3: one opening, 140 × 150 × 30 cm, 2 pieces.
    const opening = page.getByRole('region', { name: 'Проём 1' });

    await opening.getByLabel('Ширина, см').fill('140', FORCE);
    await opening.getByLabel('Высота, см').fill('150', FORCE);
    await opening.getByLabel('Вылет, см').fill('30', FORCE);
    await opening.getByLabel('Количество').fill('2', FORCE);

    // «Другая» is chosen until a grille is tapped: the area of both pieces
    // alone, no price.
    await expect(opening.getByText('7,68 м²', { exact: true })).toBeVisible();
    await expect(page.getByText('Итого площадь: 7,68 м²')).toBeVisible();

    const grilleTile = opening.getByRole('button', { name: TEST_GRILLE_NAME });

    await grilleTile.click(FORCE);
    await expect(grilleTile).toHaveAttribute('aria-pressed', 'true');
    // \D: the thousands separator is a non-breaking space.
    await expect(grilleTile).toContainText(/250\D000 сум за м²/);
    await expect(
      opening.getByText(/^7,68 м² · 1\D920\D000 сум$/),
    ).toBeVisible();

    // Two photos picked, the second removed again: one goes up with the item.
    await opening
      .getByLabel('Добавить фото, проём 1')
      .setInputFiles([
        createPhotoFixture('e2e-opening.png'),
        createPhotoFixture('e2e-removed.png'),
      ]);
    await expect(opening.getByText('Фото: 2 из 5')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      opening.getByRole('img', { name: 'Фото 1, проём 1' }),
    ).toBeVisible();
    await opening
      .getByRole('button', { name: 'Удалить фото 2, проём 1' })
      .click(FORCE);
    await expect(opening.getByText('Фото: 1 из 5')).toBeVisible();

    // «Чей замер» is there only while this measurer has a scheduled order, and
    // then the form refuses to go on until it is answered.
    const measurementTarget = page.getByLabel('Чей замер');

    if (await measurementTarget.isVisible()) {
      await chooseOption(measurementTarget, 'Новый клиент');
    }

    // The payment has a screen of its own, after the sizes.
    await page.getByRole('button', { name: 'Далее: оплата' }).click(FORCE);
    await expect(page.getByText(/^Итого: 1\D920\D000 сум$/)).toBeVisible();

    // The price is agreed on site: 5 % off 1 920 000 and a prepayment by card.
    await page.getByLabel('Скидка', { exact: true }).fill('5', FORCE);
    await expect(page.getByText(/^Итого: 1\D824\D000 сум$/)).toBeVisible();
    await page.getByLabel('Предоплата').fill('500000', FORCE);
    await chooseOption(page.getByLabel('Способ'), 'Карта');
    await page.getByLabel('Комментарий к оплате').fill('E2E предоплата', FORCE);
    await expect(page.getByText(/^Остаток: 1\D324\D000 сум$/)).toBeVisible();

    // Step 4: save.
    await page.getByRole('button', { name: 'Сохранить' }).click(FORCE);

    await expect(page.getByText('Замер сохранён')).toBeVisible({
      timeout: 30_000,
    });
    const savedOrderText = page.getByText(/^Заказ №\d{4}$/);

    await expect(savedOrderText).toBeVisible({ timeout: 30_000 });

    const orderName = (await savedOrderText.innerText()).replace('Заказ ', '');

    const orderIds = await findTestOrderIds();

    expect(orderIds).toHaveLength(1);

    const { workspaceMembers } = await graphql(
      'query($email: String!) { workspaceMembers(filter: { userEmail: { eq: $email } }) { edges { node { id } } } }',
      { email: requireEnv('CLAW_MEASURER_EMAIL') },
    );

    await expect
      .poll(
        async () => {
          const { order } = await graphql(
            'query($id: UUID!) { order(filter: { id: { eq: $id } }) { status measurerId clientPhone areaSquareMeters items { edges { node { designId areaSquareMeters quantity photos { label url } } } } } }',
            { id: orderIds[0] },
          );

          const items: {
            designId: string | null;
            areaSquareMeters: number;
            quantity: number;
            photos: { label: string; url: string }[] | null;
          }[] = order.items.edges.map(({ node }: { node: unknown }) => node);

          attachedPhotoUrls.splice(
            0,
            attachedPhotoUrls.length,
            ...items.flatMap(({ photos }) =>
              (photos ?? []).map((photo) => photo.url),
            ),
          );

          return {
            status: order.status,
            measurerId: order.measurerId,
            clientPhone: order.clientPhone,
            areaSquareMeters: order.areaSquareMeters,
            items: items.map(({ photos, ...item }) => ({
              ...item,
              photoLabels: (photos ?? []).map((photo) => photo.label),
            })),
          };
        },
        { timeout: 30_000 },
      )
      .toEqual({
        status: 'MEASURED',
        measurerId: workspaceMembers.edges[0].node.id,
        clientPhone: TEST_STORED_PHONE,
        areaSquareMeters: 7.68,
        items: [
          {
            designId: testGrilleId,
            areaSquareMeters: 3.84,
            quantity: 2,
            photoLabels: ['Проём 1, фото 1.png'],
          },
        ],
      });

    await expect
      .poll(
        async () => {
          const { order } = await graphql(
            'query($id: UUID!) { order(filter: { id: { eq: $id } }) { discountKind discountValue total { amountMicros } paid { amountMicros } balance { amountMicros } payments { edges { node { method comment amount { amountMicros } } } } } }',
            { id: orderIds[0] },
          );

          return {
            discountKind: order.discountKind,
            discountValue: order.discountValue,
            total: Number(order.total?.amountMicros),
            paid: Number(order.paid?.amountMicros),
            balance: Number(order.balance?.amountMicros),
            payments: order.payments.edges.map(
              ({
                node,
              }: {
                node: {
                  method: string;
                  comment: string | null;
                  amount: { amountMicros: number };
                };
              }) => ({
                method: node.method,
                comment: node.comment,
                amount: Number(node.amount.amountMicros),
              }),
            ),
          };
        },
        { timeout: 60_000 },
      )
      .toEqual({
        discountKind: 'PERCENT',
        discountValue: 5,
        total: 1_824_000_000_000,
        paid: 500_000_000_000,
        balance: 1_324_000_000_000,
        payments: [
          {
            method: 'CARD',
            comment: 'E2E предоплата',
            amount: 500_000_000_000,
          },
        ],
      });

    const [photoUrl] = attachedPhotoUrls;

    expect((await fetch(photoUrl)).status).toBe(200);
    await expect(page.getByText(/Проём 1: .*, фото: 1$/)).toBeVisible();

    // Step 5 (fallback): more photos through Twenty's own upload.
    await page
      .getByRole('button', { name: 'Добавить фото: проём 1' })
      .click(FORCE);

    // The item's own record (title set by the trigger) with its FILES field.
    await expect(
      page.getByText('140×150×30', { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText('Фото схемы / проёма', { exact: true }).first(),
    ).toBeVisible();

    if (process.env.CLAW_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${process.env.CLAW_SCREENSHOT_DIR}/measurer-form-photos.png`,
      });
    }

    // Back in the list, the new order is there without a reload.
    await page.getByRole('link', { name: 'Мои замеры' }).first().click();
    await expect(
      page.getByText(orderName, { exact: true }).first(),
    ).toBeVisible({ timeout: 60_000 });

    // The photo is kept on the opening; the order card shows it too. At
    // tablet width the tab hides in a «Ещё» menu.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/object/order/${orderIds[0]}`);
    await page
      .getByText('Фото и заметки', { exact: true })
      // The tab bar keeps a hidden copy of every tab to measure its width.
      .filter({ visible: true })
      .first()
      .click({ timeout: 60_000 });
    await expect(
      page.getByRole('img', { name: /^Проём 1/ }).first(),
    ).toBeVisible({ timeout: 60_000 });

    if (process.env.CLAW_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${process.env.CLAW_SCREENSHOT_DIR}/order-card-photos.png`,
      });
    }
  } finally {
    await context.close();
  }
});
