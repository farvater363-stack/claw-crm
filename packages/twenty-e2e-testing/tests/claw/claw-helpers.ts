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

export const equalTo = (field: string, value: string) =>
  `${field}: { eq: ${JSON.stringify(value)} }`;

// `filter` is the inside of a GraphQL filter object, e.g. equalTo('name', …).
export const findIds = async (
  plural: string,
  filter: string,
): Promise<string[]> => {
  const ids: string[] = [];

  // A row removed on a screen or by the app is soft-deleted, and a plain
  // query skips it.
  for (const deletedAt of ['NULL', 'NOT_NULL']) {
    const data =
      await graphql(`{ ${plural}(filter: { ${filter}, deletedAt: { is: ${deletedAt} } }) { edges { node { id } } } }`);

    ids.push(
      ...data[plural].edges.map(
        ({ node }: { node: { id: string } }) => node.id,
      ),
    );
  }

  return ids;
};

const LOCAL_API_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

// A destroy cannot be undone and CLAW_API_URL can name any server. A cleanup
// calls this first, so a run against another server stops before it writes.
export const assertLocalApi = () => {
  const { hostname } = new URL(API_URL);

  if (!LOCAL_API_HOSTS.includes(hostname)) {
    throw new Error(
      `Refusing to destroy records on ${hostname}: the cleanup of these specs runs only against a local server (CLAW_API_URL on localhost, 127.0.0.1 or [::1])`,
    );
  }
};

// A failure is recorded, not thrown, so one failed step does not skip the
// rest of a cleanup; throwCleanupFailures reports them all at the end.
export const destroyRecord = async (
  object: string,
  id: string,
  failures: string[],
) => {
  assertLocalApi();

  try {
    await graphql(`mutation($id: UUID!) { destroy${object}(id: $id) { id } }`, {
      id,
    });
  } catch (error) {
    failures.push(`${object} ${id}: ${String(error)}`);
  }
};

export const throwCleanupFailures = (failures: string[]) => {
  if (failures.length > 0) {
    throw new Error(`Cleanup left data behind:\n${failures.join('\n')}`);
  }
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
