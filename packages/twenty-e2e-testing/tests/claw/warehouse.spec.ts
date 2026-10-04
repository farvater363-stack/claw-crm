import { expect, test } from '@playwright/test';
import { signIn } from './claw-helpers';

test.use({
  actionTimeout: 20_000,
  viewport: { width: 1440, height: 900 },
  // Each test signs in as its own role.
  storageState: { cookies: [], origins: [] },
});

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
