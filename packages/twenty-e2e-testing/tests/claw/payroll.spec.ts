import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from '@playwright/test';
import {
  chooseOption,
  destroyRecord,
  equalTo,
  findIds,
  FORCE,
  graphql,
  type Role,
  signIn,
} from './claw-helpers';

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

// A number no real customer uses; beforeAll refuses to run if any order or
// Person already has it, so afterAll can delete everything carrying it.
const TEST_NATIONAL_PHONE = '930000015';
const TEST_STORED_PHONE = `+998${TEST_NATIONAL_PHONE}`;

const TEST_MASTER_NAME = 'E2E Мастер';
// One flat 100 x 200 cm piece is 2 m2; at 100 000 UZS/m2 the master earns 200 000.
const RATE_PER_SQUARE_METER_MICROS = 100_000_000_000;
const EXPECTED_PAY_MICROS = 200_000_000_000;
const ADVANCE_AMOUNT = 10_000;

// Amounts render with the viewer's group separator (space, NBSP or dot) and
// are read inside the row header's text, after the worker's name.
const OWED_BEFORE_ADVANCE = /200\D?000 сум/;
const OWED_AFTER_ADVANCE = /190\D?000 сум/;

test.use({ actionTimeout: 20_000 });

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const storageStateByRole = new Map<Role, StorageState>();
const openContexts: BrowserContext[] = [];

test.afterEach(async () => {
  for (const context of openContexts.splice(0)) {
    await context.close();
  }
});

// Each role signs in once; later tests reuse its session to keep the run short.
const openPageAs = async (browser: Browser, role: Role) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: DESKTOP_VIEWPORT,
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

const openPayroll = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'ЗП', exact: true }).first().click();
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

const findMasterIdsByName = async (): Promise<string[]> => {
  const { masters } = await graphql(
    'query($name: String!) { masters(filter: { name: { eq: $name } }) { edges { node { id } } } }',
    { name: TEST_MASTER_NAME },
  );

  return masters.edges.map(({ node }: { node: { id: string } }) => node.id);
};

const findPaymentsOf = async (masterId: string) => {
  const { masterPayments } = await graphql(
    'query($masterId: UUID!) { masterPayments(filter: { masterId: { eq: $masterId } }) { edges { node { id kind amount { amountMicros } } } } }',
    { masterId },
  );

  return masterPayments.edges.map(({ node }: { node: { id: string } }) => node);
};

let isTestDataUnused = false;
let seededMasterId: string;
let seededOrderId: string;

test.beforeAll(async () => {
  if (
    (await findTestOrderIds()).length > 0 ||
    (await findTestPersonIds()).length > 0 ||
    (await findMasterIdsByName()).length > 0
  ) {
    throw new Error(
      `An order or Person uses ${TEST_STORED_PHONE}, or a master is named «${TEST_MASTER_NAME}»; refusing to create and delete data that may be real`,
    );
  }

  isTestDataUnused = true;

  const { createMaster } = await graphql(
    'mutation($data: MasterCreateInput!) { createMaster(data: $data) { id } }',
    {
      data: {
        name: TEST_MASTER_NAME,
        categories: ['MASTER'],
        penaltyPercentPerDay: 0,
        isActive: true,
      },
    },
  );

  seededMasterId = createMaster.id;

  await graphql(
    'mutation($data: PayRuleCreateInput!) { createPayRule(data: $data) { id } }',
    {
      data: {
        name: 'E2E',
        workerId: seededMasterId,
        method: 'PER_SQUARE_METER',
        work: 'MASTER',
        amount: {
          amountMicros: RATE_PER_SQUARE_METER_MICROS,
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
        clientName: 'E2E Payroll',
        clientPhone: TEST_STORED_PHONE,
        addressLine: 'E2E',
        status: 'NEW',
        masterId: seededMasterId,
      },
    },
  );

  seededOrderId = createOrder.id;

  await graphql(
    'mutation($data: OrderItemCreateInput!) { createOrderItem(data: $data) { id } }',
    {
      data: {
        orderId: seededOrderId,
        widthCm: 100,
        heightCm: 200,
        projectionCm: 0,
        quantity: 1,
      },
    },
  );

  // Pay is earned when the order is installed: the recalc then writes the
  // master's accrual line, dated today, which puts it in this month's payroll.
  await graphql(
    'mutation($id: UUID!, $data: OrderUpdateInput!) { updateOrder(id: $id, data: $data) { id } }',
    { id: seededOrderId, data: { status: 'INSTALLED' } },
  );

  await expect
    .poll(
      async () => {
        const { payAccruals } = await graphql(
          'query($orderId: UUID!) { payAccruals(filter: { orderId: { eq: $orderId } }) { edges { node { amount { amountMicros } } } } }',
          { orderId: seededOrderId },
        );

        return payAccruals.edges.map(
          ({ node }: { node: { amount: { amountMicros: number } } }) =>
            node.amount.amountMicros,
        );
      },
      { timeout: 60_000 },
    )
    .toEqual([EXPECTED_PAY_MICROS]);
});

// Every step is independent so one failure does not skip the rest.
test.afterAll(async () => {
  if (!isTestDataUnused) return;

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

  await attempt('payments', async () => {
    const masterIds = new Set(await findMasterIdsByName());

    if (seededMasterId) masterIds.add(seededMasterId);

    for (const masterId of masterIds) {
      for (const payment of await findPaymentsOf(masterId)) {
        await attempt(`payment ${payment.id}`, () =>
          graphql(
            'mutation($id: UUID!) { destroyMasterPayment(id: $id) { id } }',
            { id: payment.id },
          ),
        );
      }
    }
  });

  // Live and soft-deleted alike: a rule removed on the screen and a line the
  // app withdrew are soft-deleted.
  const destroyOfWorker = (plural: string, object: string) =>
    attempt(plural, async () => {
      if (!seededMasterId) return;

      for (const id of await findIds(
        plural,
        equalTo('workerId', seededMasterId),
      )) {
        await destroyRecord(object, id, failures);
      }
    });

  // The rule goes before the order: a recalc started by the order's removal
  // then finds no rule and cannot write the worker's line again.
  await destroyOfWorker('payRules', 'PayRule');

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

  await destroyOfWorker('payAccruals', 'PayAccrual');

  if (seededMasterId) {
    await attempt(`master ${seededMasterId}`, () =>
      graphql('mutation($id: UUID!) { destroyMaster(id: $id) { id } }', {
        id: seededMasterId,
      }),
    );
  }

  if (failures.length > 0) {
    throw new Error(`Cleanup left data behind:\n${failures.join('\n')}`);
  }
});

test("the owner pays an advance and the worker's row drops by that amount", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  const page = await openPageAs(browser, 'ADMIN');

  await openPayroll(page);

  const header = page
    .locator('button[aria-expanded]')
    .filter({ hasText: TEST_MASTER_NAME });
  // The header's parent is the whole row: the header, «Выплатить» and, once
  // open, the row's content.
  const row = header.locator('xpath=..');

  await expect(header).toContainText(OWED_BEFORE_ADVANCE, { timeout: 60_000 });

  await row
    .getByRole('button', { name: 'Выплатить', exact: true })
    .click(FORCE);

  const amount = row.getByRole('textbox', { name: 'Сумма', exact: true });

  // The form opens with what is owed.
  await expect(amount).toHaveValue(/^200\D?000$/);
  await amount.fill(String(ADVANCE_AMOUNT), FORCE);
  await chooseOption(
    row.getByRole('combobox', { name: 'Тип', exact: true }),
    'Аванс',
  );
  await row
    .getByRole('button', { name: 'Сохранить', exact: true })
    .click(FORCE);

  await expect(header).toContainText(OWED_AFTER_ADVANCE, { timeout: 30_000 });

  const payments = await findPaymentsOf(seededMasterId);

  expect(payments).toHaveLength(1);
  expect(payments[0].kind).toBe('ADVANCE');
  expect(payments[0].amount.amountMicros).toBe(ADVANCE_AMOUNT * 1_000_000);
});

test('a manager has no «ЗП» in the sidebar', async ({ browser }) => {
  test.setTimeout(120_000);

  const page = await openPageAs(browser, 'MANAGER');

  await page.goto('/');

  // Wait for the menu to render before asserting that an item is missing.
  await expect(
    page.getByRole('link', { name: 'Новый замер' }).first(),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('link', { name: 'ЗП', exact: true })).toHaveCount(
    0,
  );
});
