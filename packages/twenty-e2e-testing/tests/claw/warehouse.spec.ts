import { expect, type Page, test } from '@playwright/test';
import { LoginPage } from '../../lib/pom/loginPage';

test.use({
  actionTimeout: 20_000,
  viewport: { width: 1440, height: 900 },
  // Each test signs in as its own role.
  storageState: { cookies: [], origins: [] },
});

type Role = 'ADMIN' | 'MANAGER';

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

test('the owner sees the warehouse block on the dashboard', async ({
  page,
}) => {
  await signIn(page, 'ADMIN');

  for (const title of [
    'Всего материалов',
    'Достаточно',
    'Скоро закончится',
    'Нужно купить',
    'План закупок',
    'Перерасход',
  ]) {
    // Scoped to widgets: the sidebar also has a «План закупок» item.
    await expect(
      page.locator('[data-widget-id]').filter({ hasText: title }).first(),
    ).toBeVisible({ timeout: 30_000 });
  }
});

test('a manager opens the warehouse materials and movements', async ({
  page,
}) => {
  await signIn(page, 'MANAGER');
  await page.getByText('Склад', { exact: true }).click();
  await page.getByText('Материалы', { exact: false }).first().click();
  await expect(page.getByText('На складе').first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByText('Движения', { exact: false }).first().click();
  await expect(page.getByText('Количество').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('button', { name: 'Create Движение склада' }).first(),
  ).toBeVisible();
});
