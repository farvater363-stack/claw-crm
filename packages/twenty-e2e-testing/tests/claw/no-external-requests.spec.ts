import { expect, test } from '@playwright/test';
import { LoginPage } from '../../lib/pom/loginPage';

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1']);

// The workspace is not the Apple seed, so this logs in as the local manager
// account instead of relying on the shared auth storage state.
test.use({ storageState: { cookies: [], origins: [] } });

test('the app never calls external hosts', async ({ page }) => {
  test.setTimeout(120_000);

  const email = process.env.CLAW_MANAGER_EMAIL;
  const password = process.env.CLAW_MANAGER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'CLAW_MANAGER_EMAIL and CLAW_MANAGER_PASSWORD are required',
    );
  }

  const externalRequests = new Set<string>();

  page.on('request', (request) => {
    const url = new URL(request.url());

    if (url.protocol.startsWith('http') && !ALLOWED_HOSTS.has(url.hostname)) {
      externalRequests.add(request.url());
    }
  });

  const loginPage = new LoginPage(page);

  await page.goto('/');
  await loginPage.clickLoginWithEmailIfVisible();
  await loginPage.typeEmail(email);
  await loginPage.clickContinueButton();
  await loginPage.typePassword(password);
  await loginPage.clickSignInButton();
  await page.waitForURL(/objects|dashboard|\/page\//);

  for (const path of [
    '/objects/orders',
    '/objects/people',
    '/objects/companies',
    '/settings/profile',
    '/this-page-does-not-exist',
  ]) {
    await page.goto(path);
    // networkidle alone can fire before lazy avatars and logos are requested
    // and never settles while the app polls, so cap it and add a fixed settle.
    await page
      .waitForLoadState('networkidle', { timeout: 15_000 })
      .catch(() => undefined);
    await page.waitForTimeout(4_000);
  }

  expect([...externalRequests]).toEqual([]);
});
