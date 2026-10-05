import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  chooseOption,
  createRecord,
  destroyOrderTestData,
  findIds,
  findRows,
  FORCE,
  graphql,
  LEFTOVER_AGE_MINUTES,
  leftoverCutoff,
  pause,
  requireEnv,
  type Role,
  signIn,
  updateRecord,
} from './claw-helpers';

test.use({
  actionTimeout: 20_000,
  viewport: { width: 1440, height: 900 },
  // Each test signs in as its own role.
  storageState: { cookies: [], origins: [] },
});

// One order walks the path, so each case starts where the last one ended.
test.describe.configure({ mode: 'serial' });

// No real row starts with this, so a run killed before afterAll leaves rows
// that a later run recognises and removes once they are old enough.
const PREFIX = 'Спек путь';
const RUN = String(Date.now());
const CLIENT = `${PREFIX} клиент ${RUN}`;
const WORKSHOP_CLIENT = `${PREFIX} цех ${RUN}`;
const GRILLE = `${PREFIX} решётка ${RUN}`;
const MASTER = `${PREFIX} мастер ${RUN}`;
const INSTALLER = `${PREFIX} установщик ${RUN}`;

// A number no real customer uses. The form needs a phone, and a phone makes
// the app link a client; beforeAll refuses to run if a client or an order
// that is not this spec's own leftover already has it.
const NATIONAL_PHONE = '930000016';
const STORED_PHONE = `+998${NATIONAL_PHONE}`;

// Synthetic. 140 × 150 × 30 cm, 2 pieces, is 7.68 m²: 1 920 000 at this price.
const GRILLE_PRICE = 250_000;
const SUBTOTAL = 1_920_000;
const DISCOUNT_PERCENT = 10;
const DISCOUNT = 192_000;
const TOTAL = 1_728_000;
const PREPAYMENT = 228_000;
const BALANCE_AFTER_MEASUREMENT = 1_500_000;
const SECOND_PAYMENT = 500_000;
const BALANCE_AT_THE_END = 1_000_000;

// The API key allows 100 requests a minute and the app's recalculations,
// started by every write, spend from the same budget.
const RECALC_PAUSE = 3_000;
const POLL = { intervals: [3_000], timeout: 90_000 };

const HAS_WORKSHOP_LOGIN = Boolean(process.env.CLAW_WORKSHOP_EMAIL);

const money = (amount: number) => ({
  amountMicros: amount * 1_000_000,
  currencyCode: 'UZS',
});

// 1 728 000 on screen: the separator follows the viewer's locale.
const shown = (amount: number) =>
  amount.toLocaleString('en-US').replace(/,/g, '\\D');

const whole = (value: { amountMicros: number | string } | null) =>
  value === null ? null : Number(value.amountMicros) / 1_000_000;

let orderId = '';
let workshopOrderId = '';
let masterId = '';
let installerId = '';
let measurerMemberId = '';

const readOrder = async (id: string) => {
  const { order } = await graphql(
    `
      query ($id: UUID!) {
        order(filter: { id: { eq: $id } }) {
          name
          status
          measurerId
          masterId
          installerId
          cancelReason
          discountKind
          discountValue
          measuredAt
          readyAt
          installedAt
          subtotal {
            amountMicros
          }
          discount {
            amountMicros
          }
          total {
            amountMicros
          }
          paid {
            amountMicros
          }
          balance {
            amountMicros
          }
        }
      }
    `,
    { id },
  );

  return order;
};

type Payment = {
  method: string;
  comment: string | null;
  amount: number | null;
};

const readPayments = async (id: string): Promise<Payment[]> => {
  const { orderPayments } = await graphql(
    'query($id: UUID!) { orderPayments(filter: { orderId: { eq: $id } }) { edges { node { method comment amount { amountMicros } } } } }',
    { id },
  );

  return orderPayments.edges
    .map(
      ({
        node,
      }: {
        node: {
          method: string;
          comment: string | null;
          amount: { amountMicros: number | string };
        };
      }) => ({
        method: node.method,
        comment: node.comment,
        amount: whole(node.amount),
      }),
    )
    .sort(
      (left: Payment, right: Payment) =>
        (left.amount ?? 0) - (right.amount ?? 0),
    );
};

const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);

const openOrder = (page: Page, id: string) => page.goto(`/object/order/${id}`);

// Exact: «Принять» and «Принять оплату» are two buttons of the header.
const headerButton = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

// By role as well as by name: the card's own fields beside the header carry
// the same words («Мастер», «Установщик») and are not selects.
const headerSelect = (page: Page, name: string) =>
  page.getByRole('combobox', { name, exact: true });

// The options of these selects carry record ids; the labels are the screen's
// own wording of a person or of a scheduled order.
const chooseValue = (select: Locator, value: string) =>
  select.evaluate((element, optionValue) => {
    const selectElement = element as HTMLSelectElement;

    if (
      !Array.from(selectElement.options).some(
        (option) => option.value === optionValue,
      )
    ) {
      throw new Error(`No option with the value ${optionValue}`);
    }

    Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      'value',
    )?.set?.call(selectElement, optionValue);
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

// In the shape a datetime-local input takes.
const tomorrowAtTen = () =>
  `${new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString().slice(0, 10)}T10:00`;

// A card of the wall is an article named by its order.
const wallCard = (page: Page, orderName: string) =>
  page.getByRole('article', { name: orderName, exact: true });

const openWall = async (page: Page, role: Role) => {
  await signIn(page, role);
  await page
    .getByRole('link', { name: 'В работе', exact: true })
    .first()
    .click();
};

test.beforeAll(async () => {
  test.setTimeout(300_000);

  // Read before anything is removed: what holds the phone decides whether
  // this run may remove or create anything at all.
  const cutoff = leftoverCutoff();
  const holders = [
    ...(
      await findRows<{
        id: string;
        createdAt: string;
        name: { firstName: string | null } | null;
      }>(
        'people',
        `phones: { primaryPhoneNumber: { eq: "${NATIONAL_PHONE}" } }`,
        'id createdAt name { firstName }',
      )
    ).map(({ createdAt, name }) => ({ createdAt, name: name?.firstName })),
    ...(
      await findRows<{
        id: string;
        createdAt: string;
        clientName: string | null;
      }>(
        'orders',
        `clientPhone: { eq: "${STORED_PHONE}" }`,
        'id createdAt clientName',
      )
    ).map(({ createdAt, clientName }) => ({ createdAt, name: clientName })),
  ];

  if (holders.some(({ name }) => !name?.startsWith(`${PREFIX} `))) {
    throw new Error(
      `A client or an order already uses ${STORED_PHONE}; refusing to create and delete data that may be real`,
    );
  }

  if (
    holders.some(({ createdAt }) => Date.parse(createdAt) >= Date.parse(cutoff))
  ) {
    throw new Error(
      `Rows of this spec younger than ${LEFTOVER_AGE_MINUTES} minutes use ${STORED_PHONE}: another run is going, or one was killed a moment ago. Wait for it, or remove the «${PREFIX} …» rows by hand`,
    );
  }

  await destroyOrderTestData(PREFIX, {
    createdBefore: cutoff,
    nationalPhones: [NATIONAL_PHONE],
  });

  const { workspaceMembers } = await graphql(
    'query($email: String!) { workspaceMembers(filter: { userEmail: { eq: $email } }) { edges { node { id } } } }',
    { email: requireEnv('CLAW_MEASURER_EMAIL') },
  );

  measurerMemberId = workspaceMembers.edges[0].node.id;

  const grilleId = await createRecord('Design', {
    name: GRILLE,
    pricePerSquareMeter: money(GRILLE_PRICE),
  });

  masterId = await createRecord('Master', {
    name: MASTER,
    isActive: true,
    categories: ['MASTER'],
  });
  installerId = await createRecord('Master', {
    name: INSTALLER,
    isActive: true,
    categories: ['INSTALLER'],
  });
  await pause(RECALC_PAUSE);

  orderId = await createRecord('Order', {
    name: '',
    clientName: CLIENT,
    clientPhone: STORED_PHONE,
    district: 'CHILANZAR',
    addressLine: 'Спек адрес',
    floor: 3,
    source: 'OLX',
  });
  await pause(RECALC_PAUSE);

  workshopOrderId = await createRecord('Order', {
    name: '',
    clientName: WORKSHOP_CLIENT,
    masterId,
  });
  await pause(RECALC_PAUSE);
  await createRecord('OrderItem', {
    orderId: workshopOrderId,
    designId: grilleId,
    widthCm: 100,
    heightCm: 100,
    quantity: 1,
  });
  await pause(RECALC_PAUSE);
  await updateRecord('Order', workshopOrderId, { status: 'PRODUCTION' });

  // Both orders get their number from a function that runs after the create.
  await expect
    .poll(
      async () => [
        (await readOrder(orderId)).name,
        (await readOrder(workshopOrderId)).name,
      ],
      POLL,
    )
    .toEqual([
      expect.stringMatching(/^№\d{4}$/),
      expect.stringMatching(/^№\d{4}$/),
    ]);
});

test.afterAll(async () => {
  test.setTimeout(300_000);
  // The client the app linked to the order is named after it, so the run's
  // stamp finds him too.
  await destroyOrderTestData(PREFIX, {
    run: RUN,
    nationalPhones: [NATIONAL_PHONE],
  });
});

test('«Назначить замер» asks for the measurer and the time and schedules the order', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await signIn(page, 'ADMIN');
  await openOrder(page, orderId);

  const step = headerButton(page, 'Назначить замер');

  await expect(step).toBeVisible({ timeout: 60_000 });

  await test.step('pressed with nothing chosen, it says what is missing and writes nothing', async () => {
    await step.click(FORCE);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Выберите замерщика' }),
    ).toBeVisible();
    expect((await readOrder(orderId)).status).toBe('NEW');
  });

  // The question sits above the button; the button writes the answer.
  await chooseValue(headerSelect(page, 'Замерщик'), measurerMemberId);
  await page
    .getByLabel('Дата и время замера', { exact: true })
    .fill(tomorrowAtTen(), FORCE);
  await step.click(FORCE);

  await expect
    .poll(async () => {
      const order = await readOrder(orderId);

      return [order.status, order.measurerId];
    }, POLL)
    .toEqual(['MEASUREMENT_SCHEDULED', measurerMemberId]);
  await expect(headerButton(page, 'Замер сделан')).toBeVisible({
    timeout: 30_000,
  });
});

// The header leaves the order's id in sessionStorage and opens the form, which
// reads it once. The next case chooses the order in the form itself, so the
// form's own path holds even where this hand-over does not.
test('«Замер сделан» opens «Новый замер» with this order chosen', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await signIn(page, 'ADMIN');
  await openOrder(page, orderId);

  const step = headerButton(page, 'Замер сделан');

  await expect(step).toBeVisible({ timeout: 60_000 });
  await step.click(FORCE);

  await expect(page).toHaveURL(/\/page\//, { timeout: 30_000 });
  await expect(page.getByLabel('Чей замер', { exact: true })).toHaveValue(
    orderId,
    { timeout: 60_000 },
  );
  await expect(page.getByLabel('Имя клиента')).toHaveValue(CLIENT);
  // Opening the form writes nothing to the order.
  expect((await readOrder(orderId)).status).toBe('MEASUREMENT_SCHEDULED');
});

test('the measurer saves the scheduled order: still one order, with its discount and first payment', async ({
  page,
}) => {
  test.setTimeout(300_000);

  await signIn(page, 'MEASURER');
  await page.getByRole('link', { name: 'Новый замер' }).first().click();

  const whose = page.getByLabel('Чей замер', { exact: true });

  await expect(whose).toBeVisible({ timeout: 60_000 });
  await chooseValue(whose, orderId);
  await expect(page.getByLabel('Имя клиента')).toHaveValue(CLIENT);

  const opening = page.getByRole('region', { name: 'Проём 1' });

  await opening.getByRole('button', { name: GRILLE }).click(FORCE);
  await opening.getByLabel('Ширина, см').fill('140', FORCE);
  await opening.getByLabel('Высота, см').fill('150', FORCE);
  await opening.getByLabel('Вылет, см').fill('30', FORCE);
  await opening.getByLabel('Количество').fill('2', FORCE);

  // The payment has a screen of its own, after the sizes.
  await page.getByRole('button', { name: 'Далее: оплата' }).click(FORCE);
  await expect(
    page.getByText(new RegExp(`^Сумма: ${shown(SUBTOTAL)} сум$`)),
  ).toBeVisible({ timeout: 30_000 });
  await chooseOption(page.getByLabel('Скидка в', { exact: true }), '%');
  await page
    .getByLabel('Скидка', { exact: true })
    .fill(String(DISCOUNT_PERCENT), FORCE);
  await page
    .getByLabel('Предоплата', { exact: true })
    .fill(String(PREPAYMENT), FORCE);
  await chooseOption(page.getByLabel('Способ', { exact: true }), 'Карта');
  await page.getByLabel('Комментарий к оплате').fill('Спек', FORCE);

  // The preview: the total after the discount and what is left to pay.
  await expect(
    page.getByText(new RegExp(`^Итого: ${shown(TOTAL)} сум$`)),
  ).toBeVisible();
  await expect(
    page.getByText(
      new RegExp(`^Остаток: ${shown(BALANCE_AFTER_MEASUREMENT)} сум$`),
    ),
  ).toBeVisible();

  // Twice, as a hurried hand does: the second tap must save nothing.
  await page.getByRole('button', { name: 'Сохранить' }).dblclick(FORCE);
  await expect(page.getByText('Замер сохранён')).toBeVisible({
    timeout: 30_000,
  });

  // The form saved into the scheduled order and made no second one.
  expect(await findIds('orders', `clientName: { eq: "${CLIENT}" }`)).toEqual([
    orderId,
  ]);

  await expect
    .poll(async () => {
      const order = await readOrder(orderId);

      return {
        status: order.status,
        isMeasured: order.measuredAt !== null,
        discountKind: order.discountKind,
        discountValue: order.discountValue,
        subtotal: whole(order.subtotal),
        discount: whole(order.discount),
        total: whole(order.total),
        paid: whole(order.paid),
        balance: whole(order.balance),
      };
    }, POLL)
    .toEqual({
      status: 'MEASURED',
      isMeasured: true,
      discountKind: 'PERCENT',
      discountValue: DISCOUNT_PERCENT,
      subtotal: SUBTOTAL,
      discount: DISCOUNT,
      total: TOTAL,
      paid: PREPAYMENT,
      balance: BALANCE_AFTER_MEASUREMENT,
    });

  expect(await readPayments(orderId)).toEqual([
    { method: 'CARD', comment: 'Спек', amount: PREPAYMENT },
  ]);
});

test('the header takes the order to «Установлен» and accepts a payment on the way', async ({
  page,
}) => {
  test.setTimeout(420_000);

  await signIn(page, 'ADMIN');
  await openOrder(page, orderId);

  await test.step('the money sentence', async () => {
    await expect
      .poll(() => bodyText(page), { timeout: 60_000 })
      .toMatch(
        new RegExp(
          // \s: the spaces of a formatted sentence may be non-breaking.
          `Итого\\s${shown(TOTAL)}\\sсум\\s·\\sоплачено\\s${shown(PREPAYMENT)}\\s·\\sостаток\\s${shown(BALANCE_AFTER_MEASUREMENT)}`,
        ),
      );
  });

  await test.step('«В производство» asks for a master', async () => {
    const step = headerButton(page, 'В производство');

    await expect(step).toBeVisible({ timeout: 30_000 });
    await step.click(FORCE);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Выберите мастера' }),
    ).toBeVisible();
    expect((await readOrder(orderId)).status).toBe('MEASURED');

    await chooseValue(headerSelect(page, 'Мастер'), masterId);
    await step.click(FORCE);

    await expect
      .poll(async () => {
        const order = await readOrder(orderId);

        return [order.status, order.masterId];
      }, POLL)
      .toEqual(['PRODUCTION', masterId]);
  });

  await test.step('«Принять оплату» offers the balance and records what is typed', async () => {
    await headerButton(page, 'Принять оплату').click(FORCE);

    const amount = page.getByRole('textbox', { name: 'Сумма', exact: true });

    await expect
      .poll(async () => (await amount.inputValue()).replace(/\D/g, ''), {
        timeout: 30_000,
      })
      .toBe(String(BALANCE_AFTER_MEASUREMENT));
    await amount.fill('0', FORCE);
    await headerButton(page, 'Принять').click(FORCE);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Введите число больше нуля' }),
    ).toBeVisible();

    await amount.fill(String(SECOND_PAYMENT), FORCE);
    await chooseOption(headerSelect(page, 'Способ'), 'Перевод');
    // Twice, as a hurried hand does: the second tap must take no second payment.
    await headerButton(page, 'Принять').dblclick(FORCE);

    await expect
      .poll(async () => {
        const order = await readOrder(orderId);

        return [whole(order.paid), whole(order.balance)];
      }, POLL)
      .toEqual([PREPAYMENT + SECOND_PAYMENT, BALANCE_AT_THE_END]);
    expect(
      (await readPayments(orderId)).map((payment) => [
        payment.method,
        payment.amount,
      ]),
    ).toEqual([
      ['CARD', PREPAYMENT],
      ['TRANSFER', SECOND_PAYMENT],
    ]);
  });

  await test.step('«Отправить на установку» goes on without an installer', async () => {
    const step = headerButton(page, 'Отправить на установку');

    await expect(step).toBeVisible({ timeout: 30_000 });
    await step.click(FORCE);

    await expect
      .poll(async () => {
        const order = await readOrder(orderId);

        return [order.status, order.installerId, order.readyAt !== null];
      }, POLL)
      .toEqual(['QUALITY_CHECK', null, true]);
  });

  await test.step('«Установлен» takes an installer and is the last step', async () => {
    const installed = headerButton(page, 'Установлен');

    await expect(installed).toBeVisible({ timeout: 30_000 });
    await installed.click(FORCE);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Выберите установщика' }),
    ).toBeVisible();
    expect((await readOrder(orderId)).status).toBe('QUALITY_CHECK');

    await chooseValue(headerSelect(page, 'Установщик'), installerId);
    await installed.click(FORCE);

    await expect
      .poll(async () => {
        const order = await readOrder(orderId);

        return [order.status, order.installerId, order.installedAt !== null];
      }, POLL)
      .toEqual(['INSTALLED', installerId, true]);

    // No step is left, and the unpaid rest stays in sight.
    await expect(installed).toHaveCount(0, { timeout: 30_000 });
    await expect
      .poll(() => bodyText(page), { timeout: 30_000 })
      .toMatch(new RegExp(`Остаток\\s${shown(BALANCE_AT_THE_END)}\\sсум`));
    await expect(headerButton(page, 'Принять оплату')).toBeVisible();
  });
});

test('«Готово» on «В работе» sends an order to installation', async ({
  page,
}) => {
  test.setTimeout(240_000);

  const orderName: string = (await readOrder(workshopOrderId)).name;

  // The workshop marks orders ready; without a local workshop login the
  // owner does, on the same screen.
  await openWall(page, HAS_WORKSHOP_LOGIN ? 'WORKSHOP' : 'ADMIN');

  const card = wallCard(page, orderName);

  await expect(card).toBeVisible({ timeout: 60_000 });
  // The card says what to build, in the workshop's terms.
  await expect(card).toContainText(GRILLE);
  // Its column is its master's.
  await expect(
    page.getByRole('heading', { name: MASTER, exact: true }),
  ).toBeVisible();
  await card.getByRole('button', { name: 'Готово', exact: true }).click(FORCE);

  await expect(
    card.getByText(`Готов заказ ${orderName}?`, { exact: true }),
  ).toBeVisible();

  await test.step('«Нет» takes the question back and writes nothing', async () => {
    await card.getByRole('button', { name: 'Нет', exact: true }).click(FORCE);
    await expect(
      card.getByRole('button', { name: 'Да, готов', exact: true }),
    ).toHaveCount(0);
    expect((await readOrder(workshopOrderId)).status).toBe('PRODUCTION');
  });

  await card.getByRole('button', { name: 'Готово', exact: true }).click(FORCE);
  await card
    .getByRole('button', { name: 'Да, готов', exact: true })
    .click(FORCE);

  await expect
    .poll(async () => (await readOrder(workshopOrderId)).status, POLL)
    .toBe('QUALITY_CHECK');
  // The order leaves its column for the strip below.
  await expect(card).toHaveCount(0, { timeout: 30_000 });
  await expect
    .poll(() => bodyText(page), { timeout: 30_000 })
    .toMatch(new RegExp(`Отправлены на установку[\\s\\S]*${orderName}`));
});

test('the workshop sees the wall and no money on it', async ({ page }) => {
  test.skip(
    !HAS_WORKSHOP_LOGIN,
    'no local login for the workshop: CLAW_WORKSHOP_EMAIL is not set',
  );
  test.setTimeout(180_000);

  const orderName: string = (await readOrder(workshopOrderId)).name;

  await openWall(page, 'WORKSHOP');

  // The case before sent the order on, so it is a row of the strip here.
  await expect
    .poll(() => bodyText(page), { timeout: 60_000 })
    .toMatch(new RegExp(`Отправлены на установку[\\s\\S]*${orderName}`));
  expect(await bodyText(page)).not.toMatch(/\d\sсум/);
});

test('«Отменить заказ» asks for the reason and leaves no step', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await signIn(page, 'ADMIN');
  await openOrder(page, workshopOrderId);

  const cancel = headerButton(page, 'Отменить заказ');

  await expect(cancel).toBeVisible({ timeout: 60_000 });
  await cancel.click(FORCE);

  const reason = headerSelect(page, 'Причина отмены');

  // The link that opened the question gives way to it: the one button with
  // these words is now the confirm.
  await expect(reason).toBeVisible();
  await expect(cancel).toHaveCount(1);

  await test.step('without a reason it refuses and writes nothing', async () => {
    await cancel.click(FORCE);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Выберите причину' }),
    ).toBeVisible();
    expect((await readOrder(workshopOrderId)).status).toBe('QUALITY_CHECK');
  });

  await chooseOption(reason, 'Передумал');
  await cancel.click(FORCE);

  await expect
    .poll(async () => {
      const order = await readOrder(workshopOrderId);

      return [order.status, order.cancelReason];
    }, POLL)
    .toEqual(['CANCELLED', 'CHANGED_MIND']);
  await expect(headerButton(page, 'Установлен')).toHaveCount(0, {
    timeout: 30_000,
  });
  // A cancelled order cannot be cancelled again, and says why it stopped.
  await expect(cancel).toHaveCount(0);
  await expect
    .poll(() => bodyText(page), { timeout: 30_000 })
    .toMatch(/Отменен: Передумал/);
});
