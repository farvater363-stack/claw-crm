import { expect, type Page, test } from '@playwright/test';
import { LoginPage } from '../../lib/pom/loginPage';

const API_URL = process.env.CLAW_API_URL ?? 'http://localhost:3000';

test.use({
  actionTimeout: 20_000,
  viewport: { width: 1440, height: 900 },
  // Each test signs in as its own role.
  storageState: { cookies: [], origins: [] },
});

type Role = 'ADMIN' | 'MANAGER' | 'MEASURER';

const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const signIn = async (page: Page, role: Role) => {
  const loginPage = new LoginPage(page);

  await page.goto('/');
  // The dev server needs ~10 s to render the sign-in page.
  await page
    .getByRole('button', { name: 'Continue with Email' })
    .or(page.getByPlaceholder('Email'))
    .first()
    .waitFor({ timeout: 60_000 });
  await loginPage.clickLoginWithEmailIfVisible();
  await loginPage.typeEmail(requireEnv(`CLAW_${role}_EMAIL`));
  await loginPage.clickContinueButton();
  await loginPage.typePassword(requireEnv(`CLAW_${role}_PASSWORD`));
  await loginPage.clickSignInButton();
  await page.waitForURL(/objects|object\/|\/page\//, { timeout: 60_000 });
};

const tashkentMonthBounds = () => {
  const [year, month] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
  })
    .format(new Date())
    .split('-')
    .map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    from: `${year}-${pad(month)}-01`,
    to: `${nextYear}-${pad(nextMonth)}-01`,
  };
};

const countReadyThisMonth = async (): Promise<number> => {
  const { from, to } = tashkentMonthBounds();
  const response = await fetch(`${API_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requireEnv('CLAW_API_KEY')}`,
    },
    body: JSON.stringify({
      // Twenty accepts one operator per field filter, hence the and.
      query: `query($from: Date, $to: Date) {
        orders(
          filter: { and: [{ readyAt: { gte: $from } }, { readyAt: { lt: $to } }] }
          first: 1000
        ) {
          edges { node { status } }
        }
      }`,
      variables: { from, to },
    }),
  });
  const body = await response.json();

  if (body.errors) throw new Error(JSON.stringify(body.errors));

  return body.data.orders.edges.filter(
    ({ node }: { node: { status: string } }) => node.status !== 'CANCELLED',
  ).length;
};

test('the owner lands on the dashboard and sees this month in numbers', async ({
  page,
}) => {
  const expectedReadyCount = await countReadyThisMonth();

  await signIn(page, 'ADMIN');

  await expect(page).toHaveURL(/\/object\/dashboard\//);
  await expect(
    page.getByRole('link', { name: 'Аналитика' }).first(),
  ).toBeVisible();
  // Whole number only: a count of 1 must not match 12.
  await expect(
    page.locator('[data-widget-id]').filter({ hasText: 'Готово заказов' }),
  ).toContainText(new RegExp(`(^|\\D)${expectedReadyCount}(\\D|$)`));
  await expect(page.getByText('Должны нам', { exact: true })).toBeVisible();
});

test('a manager never sees the dashboard', async ({ page }) => {
  await signIn(page, 'MANAGER');

  // «Новый замер» is a page item, shown to every role, so it stays first.
  await expect(page).toHaveURL(/\/page\//);
  // Without a rendered sidebar the absence check below would pass vacuously.
  await expect(
    page.getByRole('link', { name: 'Новый замер' }).first(),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Аналитика' })).toHaveCount(0);
});

test('a measurer still lands on the measurement form', async ({ page }) => {
  await signIn(page, 'MEASURER');

  await expect(page).toHaveURL(/\/page\//);
  await expect(
    page.getByRole('link', { name: 'Новый замер' }).first(),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Аналитика' })).toHaveCount(0);
});
