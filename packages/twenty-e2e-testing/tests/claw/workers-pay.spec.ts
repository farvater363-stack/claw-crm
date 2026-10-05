import { expect, type Page, test } from '@playwright/test';
import {
  chooseOption,
  createRecord,
  destroyOrderTestData,
  FORCE,
  graphql,
  leftoverCutoff,
  pause,
  signIn,
  updateRecord,
} from './claw-helpers';

test.use({
  actionTimeout: 20_000,
  viewport: { width: 1440, height: 900 },
  // Each test signs in as its own role.
  storageState: { cookies: [], origins: [] },
});

// The cases share one worker and change what he is owed, in this order.
test.describe.configure({ mode: 'serial' });

// No real row starts with this, so a run killed before afterAll leaves rows
// that a later run recognises and removes once they are old enough.
const PREFIX = 'Спек зп';
const RUN = String(Date.now());
const WORKER = `${PREFIX} работник ${RUN}`;
const NEW_WORKER = `${PREFIX} новый ${RUN}`;
const CLIENT = `${PREFIX} клиент ${RUN}`;
const GRILLE = `${PREFIX} решётка ${RUN}`;

// Synthetic. One position of 100 × 100 cm, 2 pieces, is 2 m²: 200 000 at this price.
const GRILLE_PRICE = 100_000;
const FIXED_PAY = 2_000_000;
const RATE_PER_SQUARE_METER = 15_000;
const RAISED_RATE = 20_000;
const SALES_PERCENT = 3;
// 2 m² × 15 000, and 3 % of 200 000.
const INSTALLER_PAY = 30_000;
const SALES_PAY = 6_000;
const OWED = FIXED_PAY + INSTALLER_PAY + SALES_PAY;
// After a third piece: 3 m² × the kept 15 000, and 3 % of 300 000.
const INSTALLER_PAY_AFTER_CHANGE = 45_000;
const SALES_PAY_AFTER_CHANGE = 9_000;
const OWED_AFTER_CHANGE =
  FIXED_PAY + INSTALLER_PAY_AFTER_CHANGE + SALES_PAY_AFTER_CHANGE;
const PAID_OUT = 54_000;
const NEW_RULE_AMOUNT = 25_000;

const RECALC_PAUSE = 3_000;
const POLL = { intervals: [3_000], timeout: 90_000 };

const money = (amount: number) => ({
  amountMicros: amount * 1_000_000,
  currencyCode: 'UZS',
});

const shown = (amount: number) =>
  amount.toLocaleString('en-US').replace(/,/g, '\\D');

const firstDayOfThisMonthInTashkent = () =>
  `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' })
    .format(new Date())
    .slice(0, 7)}-01`;

let workerId = '';
let rateRuleId = '';
let orderId = '';
let itemId = '';

const readAccrualAmounts = async (): Promise<number[]> => {
  const { payAccruals } = await graphql(
    'query($id: UUID!) { payAccruals(filter: { orderId: { eq: $id } }) { edges { node { amount { amountMicros } } } } }',
    { id: orderId },
  );

  return payAccruals.edges
    .map(
      ({ node }: { node: { amount: { amountMicros: number | string } } }) =>
        Number(node.amount.amountMicros) / 1_000_000,
    )
    .sort((left: number, right: number) => left - right);
};

const openPayroll = async (page: Page) => {
  await signIn(page, 'ADMIN');
  await page.getByRole('link', { name: 'ЗП', exact: true }).first().click();
};

const rowHeader = (page: Page, name: string) =>
  page.locator('button[aria-expanded]').filter({ hasText: name });

// The header's parent holds the header, «Выплатить» and, once open, the details.
const openRow = async (page: Page, name: string) => {
  const header = rowHeader(page, name);

  await expect(header).toBeVisible({ timeout: 60_000 });

  if ((await header.getAttribute('aria-expanded')) !== 'true') {
    await header.click(FORCE);
  }

  await expect(header).toHaveAttribute('aria-expanded', 'true');

  return header.locator('xpath=..');
};

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await destroyOrderTestData(PREFIX, { createdBefore: leftoverCutoff() });

  workerId = await createRecord('Master', {
    name: WORKER,
    isActive: true,
    categories: ['INSTALLER', 'SALES'],
  });
  await createRecord('PayRule', {
    name: `${PREFIX} фикса`,
    workerId,
    method: 'FIXED',
    amount: money(FIXED_PAY),
  });
  rateRuleId = await createRecord('PayRule', {
    name: `${PREFIX} за м²`,
    workerId,
    method: 'PER_SQUARE_METER',
    work: 'INSTALLER',
    amount: money(RATE_PER_SQUARE_METER),
  });
  await createRecord('PayRule', {
    name: `${PREFIX} процент`,
    workerId,
    method: 'PERCENT_OF_SALES',
    work: 'SALES',
    percent: SALES_PERCENT,
  });
  // The line the nightly function writes on the first day of a month.
  await createRecord('PayAccrual', {
    name: `${PREFIX} фикса ${RUN}`,
    workerId,
    earnedOn: firstDayOfThisMonthInTashkent(),
    method: 'FIXED',
    basis: 1,
    rate: FIXED_PAY,
    amount: money(FIXED_PAY),
  });

  const grilleId = await createRecord('Design', {
    name: GRILLE,
    pricePerSquareMeter: money(GRILLE_PRICE),
  });

  await pause(RECALC_PAUSE);
  orderId = await createRecord('Order', {
    name: '',
    clientName: CLIENT,
    installerId: workerId,
    soldById: workerId,
  });
  await pause(RECALC_PAUSE);
  itemId = await createRecord('OrderItem', {
    orderId,
    designId: grilleId,
    widthCm: 100,
    heightCm: 100,
    quantity: 2,
  });
  await pause(RECALC_PAUSE);
  await updateRecord('Order', orderId, { status: 'INSTALLED' });

  // Pay is counted when the order is installed, by a function that runs after.
  await expect
    .poll(readAccrualAmounts, POLL)
    .toEqual([SALES_PAY, INSTALLER_PAY]);
});

test.afterAll(async () => {
  test.setTimeout(300_000);
  await destroyOrderTestData(PREFIX, { run: RUN });
});

test('«ЗП» shows the fixed pay, the rate per m² and the percent of sales of one worker', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await openPayroll(page);

  const header = rowHeader(page, WORKER);

  await expect(header).toContainText(new RegExp(`${shown(OWED)}\\sсум`), {
    timeout: 60_000,
  });
  await expect(header).toContainText('Установщик, Продажник');

  const row = await openRow(page, WORKER);

  // One sentence per way he is paid, each ending in what it earned.
  await expect(
    row.getByText(new RegExp(`^Фикса\\s${shown(FIXED_PAY)}$`)),
  ).toBeVisible();
  await expect(
    row.getByText(
      new RegExp(
        `^Установщик, за м²: 2\\sм² × ${shown(RATE_PER_SQUARE_METER)} = ${shown(INSTALLER_PAY)}$`,
      ),
    ),
  ).toBeVisible();
  await expect(
    row.getByText(
      new RegExp(
        `^Продажник, % от продаж: ${SALES_PERCENT}\\s?% от ${shown(200_000)} = ${shown(SALES_PAY)}$`,
      ),
    ),
  ).toBeVisible();
});

test('a changed pay rule does not change what an installed order earned', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await updateRecord('PayRule', rateRuleId, { amount: money(RAISED_RATE) });
  await pause(RECALC_PAUSE);
  // A third piece: the order's lines are rewritten, with the rate they were first written with.
  await updateRecord('OrderItem', itemId, { quantity: 3 });

  await expect
    .poll(readAccrualAmounts, POLL)
    .toEqual([SALES_PAY_AFTER_CHANGE, INSTALLER_PAY_AFTER_CHANGE]);

  await openPayroll(page);
  await expect(rowHeader(page, WORKER)).toContainText(
    new RegExp(`${shown(OWED_AFTER_CHANGE)}\\sсум`),
    { timeout: 60_000 },
  );
});

test('«Выплатить» offers the whole sum and lowers what is owed by what is paid', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await openPayroll(page);

  const header = rowHeader(page, WORKER);

  await expect(header).toBeVisible({ timeout: 60_000 });

  const row = header.locator('xpath=..');

  await row
    .getByRole('button', { name: 'Выплатить', exact: true })
    .click(FORCE);

  // The payment form is the one form open in the row.
  const amount = row.getByRole('textbox', { name: 'Сумма', exact: true });

  await expect
    .poll(async () => (await amount.inputValue()).replace(/\D/g, ''), {
      timeout: 30_000,
    })
    .toBe(String(OWED_AFTER_CHANGE));
  await amount.fill(String(PAID_OUT), FORCE);
  await chooseOption(
    row.getByRole('combobox', { name: 'Тип', exact: true }),
    'Аванс',
  );
  // Twice, as a hurried hand does: the second tap must pay nothing more.
  await row
    .getByRole('button', { name: 'Сохранить', exact: true })
    .dblclick(FORCE);

  await expect(header).toContainText(
    new RegExp(`${shown(OWED_AFTER_CHANGE - PAID_OUT)}\\sсум`),
    { timeout: 30_000 },
  );

  const { masterPayments } = await graphql(
    'query($id: UUID!) { masterPayments(filter: { masterId: { eq: $id } }) { edges { node { kind amount { amountMicros } } } } }',
    { id: workerId },
  );

  expect(
    masterPayments.edges.map(
      ({
        node,
      }: {
        node: { kind: string; amount: { amountMicros: number | string } };
      }) => [node.kind, Number(node.amount.amountMicros)],
    ),
  ).toEqual([['ADVANCE', PAID_OUT * 1_000_000]]);
});

test('the owner adds a worker with two categories and a pay rule', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await openPayroll(page);

  const addWorker = page.getByRole('button', {
    name: '+ Добавить работника',
    exact: true,
  });

  await expect(addWorker).toBeVisible({ timeout: 60_000 });
  await addWorker.click(FORCE);
  await page
    .getByRole('textbox', { name: 'Имя', exact: true })
    .fill(NEW_WORKER, FORCE);
  // No row is open, so the form's checkboxes are the only ones on the screen.
  // A click, not check(): inside a widget Playwright cannot read the state back.
  await page
    .getByRole('checkbox', { name: 'Мастер', exact: true })
    .click(FORCE);
  await page
    .getByRole('checkbox', { name: 'Замерщик', exact: true })
    .click(FORCE);
  // The worker's form is the one form open, and «Сохранить» is its button.
  await page
    .getByRole('button', { name: 'Сохранить', exact: true })
    .click(FORCE);

  const readNewWorker = async () => {
    const { masters } = await graphql(
      'query($name: String!) { masters(filter: { name: { eq: $name } }) { edges { node { id categories isActive } } } }',
      { name: NEW_WORKER },
    );

    return masters.edges.map(
      ({
        node,
      }: {
        node: { id: string; categories: string[]; isActive: boolean };
      }) => ({ ...node, categories: [...node.categories].sort() }),
    );
  };

  await expect.poll(async () => (await readNewWorker()).length, POLL).toBe(1);

  const [newWorker] = await readNewWorker();

  expect(newWorker.categories).toEqual(['MASTER', 'MEASURER']);
  expect(newWorker.isActive).toBe(true);

  // A saved worker's row opens by itself, so the first rule can be added.
  const row = await openRow(page, NEW_WORKER);

  await expect(rowHeader(page, NEW_WORKER)).toContainText('Мастер, Замерщик');
  await row
    .getByRole('button', { name: '+ Добавить правило', exact: true })
    .click(FORCE);
  await chooseOption(
    row.getByRole('combobox', { name: 'Способ', exact: true }),
    'За м²',
  );
  await chooseOption(
    row.getByRole('combobox', { name: 'За что', exact: true }),
    'Мастер',
  );
  // The value field is «Сумма» for every way of paying but a percent.
  await row
    .getByRole('textbox', { name: 'Сумма', exact: true })
    .fill(String(NEW_RULE_AMOUNT), FORCE);
  await row
    .getByRole('button', { name: 'Сохранить', exact: true })
    .click(FORCE);

  await expect
    .poll(async () => {
      const { payRules } = await graphql(
        'query($id: UUID!) { payRules(filter: { workerId: { eq: $id } }) { edges { node { method work amount { amountMicros } } } } }',
        { id: newWorker.id },
      );

      return payRules.edges.map(
        ({
          node,
        }: {
          node: {
            method: string;
            work: string | null;
            amount: { amountMicros: number | string } | null;
          };
        }) => [
          node.method,
          node.work,
          Number(node.amount?.amountMicros) / 1_000_000,
        ],
      );
    }, POLL)
    .toEqual([['PER_SQUARE_METER', 'MASTER', NEW_RULE_AMOUNT]]);
  // The saved rule is a line of the row, named by its work and its way.
  await expect(
    row.getByRole('textbox', { name: 'Мастер · за м²', exact: true }),
  ).toHaveValue(NEW_RULE_AMOUNT.toLocaleString('en-US'), { timeout: 30_000 });
});
