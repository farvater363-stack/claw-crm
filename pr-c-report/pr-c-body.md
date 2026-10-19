## What this is

Third and last pull request of "Claw simplification, phase 1". It replaces the warehouse folder (four table views) with one screen, «Склад», and removes the stock fields and steps that nobody used.

## What changed

**Stock rules**
- `toBuy = max(0, reserved + minimumStock − onHand)`. The safety percent and the `available` number are gone.
- State is BUY when orders need more than there is, LOW when orders are covered but the minimum is not, otherwise OK.
- Overuse is read from recounts: the shortage found at a recount against what orders took since the previous one. The first recount is an opening balance and gives no figure.
- Orders no longer have an "actual consumption" step. One write-off when an order enters production, as before.

**«Склад» screen** (one front component on a standalone page)
- List sorted by urgency, with a pill that says what to buy: «Купить 59 м» or «Хватает».
- A row opens in place: «Купил» (amount, and the price for the owner), the orders that need the material as links, «Запас не меньше», the last movements, a link to the full history.
- «Пересчитать склад»: every row becomes a number field; only the rows that were typed create a recount. The save bar stays at the top of the screen while the list scrolls.
- «Добавить материал»: name, unit, optional minimum.
- Purchases, recounts and new materials are sent with an id and `upsert`, so a retry after a failed or lost request cannot record the same thing twice, and «Повторить» sends what is in the fields now.
- Loading, the "needed for orders" rule and the writes live in `src/stock/load-stock-data.ts`; input checks and row building in `src/stock/stock-screen.ts`. Both are covered by unit tests.

**Menu and roles**
- New menu item «Склад», shown to roles that can read stock movements (owner, manager).
- Removed: the «Склад» folder and its four items, the views «Материалы», «План закупок», «Нормы расхода». The movements table stays as «История склада», reached from the screen.
- The workshop role is read-only on order materials.

**Contract (fields and options removed)**
- `material.safetyPercent`, `material.available`, `orderMaterial.actualQuantity`.
- Stock movement kinds CORRECTION and FACT_ADJUSTMENT. The three that remain are relabelled «Купил», «Пересчёт», «Ушло на заказ».
- The logic function `on-order-material-updated`.

## Select options keep their ids

Twenty identifies a select option by an id generated from its label, and on an options update the server carries stored values over only for ids present on both sides; other rows fall back to the field default. Relabelling the movement kinds without care reset stored kinds on a test server.

Each relabelled option now carries the id its previous label produced (the three movement kinds, and «Не указан состав» on `order.materialState`, which an earlier PR relabelled). `src/constants/__tests__/select-options.test.ts` snapshots the effective id of every option of every select field, so a later relabel fails until the old id is pinned.

Because of this, `main` at the previous merge commit must not be applied to an environment on its own. Apply `main` only with this PR in it.

## Applying to an environment

Destroys to expect from `yarn twenty plan`, and nothing else:
- five menu items (the folder and its four children), three views with their columns, one filter and three sorts, the logic function;
- the three fields above, the view columns that showed them, the "written off" column of the order materials table (the field stays), three read-only field permissions on `material.available`, three creation-form widgets.

Before applying, both of these must be zero on that environment:
- stock movements of kind CORRECTION or FACT_ADJUSTMENT;
- order material lines with an actual quantity.

After applying, the count of stock movements per kind must be what it was before.

Things that change for people who already use the warehouse:
- «Купить» is lower for every material with a reserve, by the safety percent that is no longer added.
- «Уходит больше» is empty until a material has had two recounts.
- The first stock recalc renames every existing movement (the name starts with the kind's label).
- The stock Twenty sidebar items (Companies, People, Opportunities, Tasks, Notes, Dashboards list, Workflows folder) are workspace rows, not app definitions: remove them by hand in the sidebar's edit mode.

## Tests

- Unit: 343 passed (27 files). Typecheck clean. Lint: 0 warnings, 0 errors.
- Integration (one file at a time): `warehouse-orders` 2/2 (includes the recount-based overuse: 100 counted, 50 written off, 46 counted gives 8), `warehouse` 1/1, `recalc` 2/2.
- Browser, `tests/claw`: `warehouse.spec.ts` 11/11 (add a material, buy, recount, a failed purchase corrected and retried is recorded once, manager has no price field, measurer has no menu item, menu per role in order and in Russian, a need from an order in price approval, dashboard widget title), `prices.spec.ts` 5/5, `measurer-form`, `ux-fixes`, `payroll`, `owner-dashboard` 13/13, `no-external-requests` 1/1.
- `measurement-flow.spec.ts`: 5/6. The case "manager attaches a design photo and downloads it back" fails on an empty download body. It touches Twenty's standard record page and file download, which this work does not change; it is not known to have passed before.
- Checked by hand in a browser as owner and as manager at 375 px, 768 px and in the dark theme: no sideways scroll, controls 48 px or taller, every number with its unit.
- Order totals, costs, margins and master pay on the test server are identical before and after (same fingerprint over every order and position).

## Not verified

- The workshop role's menu in a browser: there is no workshop login on the test server. It is covered by the roles unit test (the workshop cannot read the objects the hidden items require).
- The update branch of the upsert for a manager (a retry after a lost response) is confirmed from code; the browser case covers the owner.

## Known limits and follow-ups

- The "reserve" rule is spelled in four places; one constant should serve all of them when the next phase moves the reserve point.
- After the «Материалы» view is gone, a material is renamed or removed from its record page (reached from a chip or the system table); the screen itself has no rename or remove.
- A purchase stored although its response was lost, then retried with the price cleared, keeps the old unit price.
- A recount cancelled and started again after a lost response can leave two recounts of one material; the amount stays right, the overuse figure is cleared.
- The recount bar is about 180 px tall on a phone.
- No focus outline on the kit's buttons and links yet.
- Four older specs still hard-delete through the API without the local-server guard that `warehouse.spec.ts` and `prices.spec.ts` now have.
- Wording that is not in the design spec and waits for the owner: «Без названия», «Материалы» as the list heading, «Единица», «Введите название», «Склад ведут владелец и менеджер», «Количество (+ купил, − ушло на заказ)», «Посчитано (пересчёт)».

Please merge with a merge commit, not a squash.
