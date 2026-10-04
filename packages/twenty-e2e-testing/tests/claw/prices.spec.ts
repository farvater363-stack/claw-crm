import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  chooseOption,
  destroyRecord,
  equalTo,
  findIds,
  FORCE,
  graphql,
  signIn,
  throwCleanupFailures,
} from './claw-helpers';

test.use({
  actionTimeout: 20_000,
  viewport: { width: 1440, height: 900 },
  // Each test signs in as its own role.
  storageState: { cookies: [], origins: [] },
});

// The grille the first test adds on the screen is the one the others open.
test.describe.configure({ mode: 'serial' });

// Names no real row uses, so a run killed before afterAll leaves rows that
// the next run recognises and removes.
const TEST_GRILLE_NAME = 'E2E цены решётка';
const TEST_MATERIAL_NAME = 'E2E цены материал';
// The name the screen gives every grille it adds.
const NEW_GRILLE_PLACEHOLDER = 'Новая решётка';

// Synthetic. 140 × 150 × 30 cm, 2 pieces, is 7.68 m²: 944 640 at this price.
const TEST_GRILLE_PRICE = 123_000;
// \s: the thousands separator is a non-breaking space.
const PRICE_TEXT = /123\s000 сум за м²/;
const MEASUREMENT_TOTAL = /^Итого: 944\s640 сум$/;
const MATERIAL_AMOUNT = '2,5';

// Every step is independent so one failure does not skip the rest.
const destroyTestData = async () => {
  const failures: string[] = [];

  const destroy = (
    object: 'Design' | 'Material' | 'MaterialNorm',
    id: string,
  ) => destroyRecord(object, id, failures);

  for (const materialId of await findIds(
    'materials',
    equalTo('name', TEST_MATERIAL_NAME),
  )) {
    // A composition line outlives both its grille and its material.
    for (const normId of await findIds(
      'materialNorms',
      equalTo('materialId', materialId),
    )) {
      await destroy('MaterialNorm', normId);
    }

    await destroy('Material', materialId);
  }

  for (const designId of await findIds(
    'designs',
    equalTo('name', TEST_GRILLE_NAME),
  )) {
    await destroy('Design', designId);
  }

  throwCleanupFailures(failures);
};

test.beforeAll(async () => {
  await destroyTestData();

  // There is no «Склад» screen yet to add a material on.
  await graphql(
    'mutation($data: MaterialCreateInput!) { createMaterial(data: $data) { id } }',
    { data: { name: TEST_MATERIAL_NAME, unit: 'METER' } },
  );
});

test.afterAll(destroyTestData);

// A role name matches by substring unless it is exact.
const pricesLink = (page: Page) =>
  page.getByRole('link', { name: 'Цены', exact: true });

const openPrices = async (page: Page) => {
  await pricesLink(page).first().click();
  await expect(
    page.getByRole('button', { name: '+ Добавить решётку' }),
  ).toBeVisible({ timeout: 60_000 });
};

const rowHeader = (page: Page, name: string) =>
  page.locator('button[aria-expanded]').filter({ hasText: name });

// The header's parent holds the header and, once open, the fields under it.
const openRow = async (page: Page, name: string) => {
  const header = rowHeader(page, name);

  await header.click(FORCE);
  await expect(header).toHaveAttribute('aria-expanded', 'true');

  return header.locator('xpath=..');
};

// A grille added on the screen and not yet renamed has the name every new
// grille gets, so cleanup by name would miss it: of the rows with that name,
// the ones added since `idsBefore` was read are this test's.
const destroyPlaceholdersAddedSince = async (idsBefore: string[]) => {
  for (const designId of await findIds(
    'designs',
    equalTo('name', NEW_GRILLE_PLACEHOLDER),
  )) {
    if (!idsBefore.includes(designId)) {
      await graphql('mutation($id: UUID!) { destroyDesign(id: $id) { id } }', {
        id: designId,
      });
    }
  }
};

const field = (row: Locator, label: string) =>
  row.locator('label').filter({ hasText: label });

const typeAndSave = async (row: Locator, label: string, value: string) => {
  const input = field(row, label).locator('input');

  await input.fill(value, FORCE);
  await input.press('Enter');
};

test('the owner adds a grille and its price stays after a reload', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page, 'ADMIN');
  await openPrices(page);

  const placeholderIdsBefore = await findIds(
    'designs',
    equalTo('name', NEW_GRILLE_PLACEHOLDER),
  );

  await page.getByRole('button', { name: '+ Добавить решётку' }).click(FORCE);

  try {
    // The new row opens by itself.
    const newRow = page
      .locator('button[aria-expanded="true"]')
      .filter({ hasText: NEW_GRILLE_PLACEHOLDER })
      .locator('xpath=..');

    await expect(field(newRow, 'Название').locator('input')).toHaveValue(
      NEW_GRILLE_PLACEHOLDER,
      { timeout: 30_000 },
    );
    await typeAndSave(newRow, 'Название', TEST_GRILLE_NAME);
    await expect(rowHeader(page, TEST_GRILLE_NAME)).toBeVisible();
  } catch (error) {
    // A cleanup that fails too is logged, so the error rethrown is the one
    // that explains the test.
    await destroyPlaceholdersAddedSince(placeholderIdsBefore).catch(
      console.error,
    );

    throw error;
  }

  const row = rowHeader(page, TEST_GRILLE_NAME).locator('xpath=..');

  await typeAndSave(row, 'Цена', String(TEST_GRILLE_PRICE));
  await expect(field(row, 'Цена').getByText('Сохранено')).toBeVisible();
  await expect(rowHeader(page, TEST_GRILLE_NAME)).toContainText(PRICE_TEXT);

  await page.reload();

  await expect(rowHeader(page, TEST_GRILLE_NAME)).toContainText(PRICE_TEXT, {
    timeout: 60_000,
  });
});

test('the owner adds a material to the composition and it stays after a reload', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page, 'ADMIN');
  await openPrices(page);

  const row = await openRow(page, TEST_GRILLE_NAME);
  const addMaterial = row.getByRole('button', { name: '+ Добавить материал' });
  // The cost block has a «Материал» field too; only this one is a list.
  const materialSelect = field(row, 'Материал').locator('select');
  const amount = field(row, 'Сколько').locator('input');
  const removeLine = row.getByRole('button', {
    name: `Убрать "${TEST_MATERIAL_NAME}" из состава`,
  });

  await addMaterial.click(FORCE);
  await chooseOption(materialSelect, TEST_MATERIAL_NAME);
  await amount.fill(MATERIAL_AMOUNT, FORCE);
  // Both controls write one piece of state: neither edit may undo the other.
  await expect(materialSelect.locator('option:checked')).toHaveText(
    TEST_MATERIAL_NAME,
  );
  await expect(amount).toHaveValue(MATERIAL_AMOUNT);
  await addMaterial.click(FORCE);

  await expect(removeLine).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await expect(rowHeader(page, TEST_GRILLE_NAME)).toBeVisible({
    timeout: 60_000,
  });
  await openRow(page, TEST_GRILLE_NAME);

  await expect(removeLine).toBeVisible();
  await expect(field(row, TEST_MATERIAL_NAME).locator('input')).toHaveValue(
    MATERIAL_AMOUNT,
  );
});

test('a manager opens a grille and sees no cost block', async ({ page }) => {
  test.setTimeout(180_000);

  await signIn(page, 'MANAGER');
  await openPrices(page);

  const row = await openRow(page, TEST_GRILLE_NAME);

  // The composition proves the open row has rendered in full.
  await expect(row.getByText(/^Из чего делается/)).toBeVisible();
  await expect(
    row.getByRole('button', {
      name: `Убрать "${TEST_MATERIAL_NAME}" из состава`,
    }),
  ).toBeVisible();
  await expect(row.getByText('Себестоимость')).toHaveCount(0);
});

test('the measurer has no «Цены» and gets the new grille in «Новый замер»', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page, 'MEASURER');

  const newMeasurement = page
    .getByRole('link', { name: 'Новый замер' })
    .first();

  // Wait for the menu to render before asserting that an item is missing.
  await expect(newMeasurement).toBeVisible({ timeout: 60_000 });
  await expect(pricesLink(page)).toHaveCount(0);

  await newMeasurement.click();

  const opening = page.getByRole('region', { name: 'Проём 1' });
  const grilleTile = opening.getByRole('button', { name: TEST_GRILLE_NAME });

  await expect(grilleTile).toBeVisible({ timeout: 60_000 });

  await opening.getByLabel('Ширина, см').fill('140', FORCE);
  await opening.getByLabel('Высота, см').fill('150', FORCE);
  await opening.getByLabel('Вылет, см').fill('30', FORCE);
  await opening.getByLabel('Количество').fill('2', FORCE);
  await grilleTile.click(FORCE);

  await expect(grilleTile).toHaveAttribute('aria-pressed', 'true');
  await expect(grilleTile).toContainText(PRICE_TEXT);
  await expect(page.getByText(MEASUREMENT_TOTAL)).toBeVisible();
});

test('the owner removes the grille and brings it back with «Вернуть»', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await signIn(page, 'ADMIN');
  await openPrices(page);

  const row = await openRow(page, TEST_GRILLE_NAME);

  await row.getByRole('button', { name: 'Убрать из прайса' }).click(FORCE);
  await expect(row.getByText(`Убрать "${TEST_GRILLE_NAME}"?`)).toBeVisible();
  // exact: the composition line's button is «Убрать "…" из состава».
  await row.getByRole('button', { name: 'Убрать', exact: true }).click(FORCE);

  const undoBar = page.getByText('Убрано.', { exact: true });

  await expect(undoBar).toBeVisible({ timeout: 30_000 });
  await expect(rowHeader(page, TEST_GRILLE_NAME)).toHaveCount(0);

  // exact: «Вернуть» is also inside «Свернуть боковую панель».
  await page.getByRole('button', { name: 'Вернуть', exact: true }).click(FORCE);

  // The screen reloads its data, so the row comes back closed.
  await expect(rowHeader(page, TEST_GRILLE_NAME)).toHaveAttribute(
    'aria-expanded',
    'false',
    { timeout: 30_000 },
  );
  await expect(rowHeader(page, TEST_GRILLE_NAME)).toContainText(PRICE_TEXT);
  await expect(undoBar).toHaveCount(0);
});
