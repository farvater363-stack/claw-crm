import { type Locator, type Page } from '@playwright/test';
import { LoginPage } from '../../lib/pom/loginPage';

const API_URL = process.env.CLAW_API_URL ?? 'http://localhost:3000';

export type Role = 'ADMIN' | 'MANAGER' | 'MEASURER';

// Twenty wraps every widget in a dnd-kit draggable with aria-disabled="true"
// outside layout edit mode; Playwright reads that as disabled for the whole
// subtree although the controls work for a person.
export const FORCE = { force: true } as const;

// selectOption also refuses options it reads as disabled, so pick the option
// the way the browser does: native setter plus a change event.
export const chooseOption = (select: Locator, label: string) =>
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

export const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

export const graphql = async (
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

export const signIn = async (page: Page, role: Role) => {
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
  await page.waitForURL(/objects|object\/|dashboard|\/page\//, {
    timeout: 60_000,
  });
};
