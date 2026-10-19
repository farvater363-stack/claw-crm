# PR B report: prices and composition on the grille, «Цены»

PR: https://github.com/farvater363-stack/claw-crm/pull/11 (branch `claude/simplify-1b-prices`, 22 commits on top of PR A's head `8e50b10`, head `483e4a8`). Base is `claude/simplify-1a-menu-kit`; retarget to `main` after #10 merges.

## What was built

- **Schema (Task 5):** price, three owner-only costs, metal and composition on the grille; `kind` on services; roles.
- **Price by grille (Task 6):** a position's price and cost come from its grille when empty or when the grille changes.
- **Composition by grille (Task 7):** material need from the grille's and the service's composition; a typed-over composition name is restored.
- **Measurement form logic (Task 8) and photo grid (Task 13):** no metal fields, grille picked by tile, visors by kind, «Цену назовёт менеджер» when there is no price.
- **Migration (Tasks 9, 10):** planner and runner, run locally in strict mode with 0 differences, then deleted in Task 14 (kept in history at `b94af83306`).
- **«Цены» (Tasks 11, 12):** pure logic plus the screen: three sections, edit in place, composition, photos, remove with undo.
- **Contract (Task 14):** price list object, position metal and metal size, design catalog and three menu items removed; `prices.spec.ts` added.

## Test results (actual output, head 483e4a8)

Unit, typecheck, lint (`packages/twenty-apps/claw`):

```
 Test Files  21 passed (21)
      Tests  264 passed (264)
typecheck exit 0
Found 0 warnings and 0 errors.
```

Integration, one file at a time against the local server:

```
recalc exit 0            Tests  2 passed (2)      (at b305ae4)
warehouse exit 0         Tests  1 passed (1)      (at b305ae4)
warehouse-orders exit 0  Tests  1 passed (1)      (at 483e4a8)
```

Browser specs (at b305ae4; the later commit changes one trigger and no screen):

```
measurer-form   1 passed (38.3s)
prices          5 passed (2.1m)
ux-fixes        7 passed (2.3m)
payroll         2 passed (53.7s)
warehouse       2 passed (32.2s)
measurement-flow  5 passed, 1 failed   (at b9df067; see "Not verified")
```

Migration, local (`MIGRATE=apply`, strict):

```
Server: http://localhost:3000; mode: apply; positions with an empty price: strict
  grilles updated: 5
  grilles created: 9 (0 skipped as already present)
  positions repointed: 48 (0 skipped as already on that grille)
  norms repointed: 0 (0 skipped as already on a grille)
  visor services: 12 (0 skipped as already visors)
poll 1, 48 seconds in: settled
0 differences
 Tests  1 passed (1)
```

Database checks after the migration and again after the contract apply and all test runs:

- sum of order totals 266 255 000 сум, same as before;
- fingerprint of every order's total, cost, margin and master pay: identical to before;
- fingerprint of every position's price, cost, line total, line cost and area: identical to before;
- 14 grilles, each with a metal, a price and three costs; no position without a grille; the 21 empty-price positions (all under soft-deleted orders) still empty;
- no test records left: 84 orders, 133 positions, 14 grilles, 0 materials, 0 composition rows.

Applies to the local server, each after reading the plan:

| Step | Head | Add / change / destroy | Destroyed |
|---|---|---|---|
| B1b | f11891b | 0 / 19 / 3 | three field permissions on `materialNorm.name` (created and removed by this work) |
| B2 | d2b399a | 5 / 27 / 0 | nothing |
| B2b | 7651552 | 3 / 1 / 0 | nothing |
| B2c, B2d, B2e | e8d809f, e9576e5, b94af83 | 0 / 1 / 0 each | nothing |
| B3 (contract) | b9df067 | 0 / 43 / 119 | the price list object and what it owns (94), five fields with their columns and widgets (22), three menu items (3); applied with your go-ahead |
| B4 | b305ae4 | 0 / 31 / 0 | nothing |
| B5 | 483e4a8 | 0 / 1 / 0 | nothing |

## Screenshots (this folder, local data: not for the PR)

- `prices-375-dark-list.png`, `prices-375-dark-open.png`, `prices-375-dark-cost.png`: «Цены» as the owner at 375 px, dark.
- `prices-375-dark-with-pill.png`: the same list while a material existed, with the amber pill.
- `prices-manager-375-dark-open.png`: the manager's open row, no cost block.
- `prices-desktop-open.png`, `prices-desktop-cost.png`, `prices-desktop-undo-bar.png`: desktop, open row, cost fields, undo bar.
- `new-measurement-375-dark.png`, `new-measurement-768.png`: the grille tiles at 375 px dark (2 per row) and at 768 px (4 per row).

## Fallbacks taken

- **Photos on a front component (plan Task 12 Step 2):** the fallback was NOT needed. `design.photos { url }` gives a signed link that renders; upload, thumbnail and reload were checked in the browser.
- **Focus on a new row's name field:** not done. The front-component renderer does not allow `autoFocus`; the row opens, the user taps the field.
- **Running the 1b browser specs:** the 1b worktree has no root install, so the specs ran with the main checkout's Playwright (the copy the specs' own import resolves to) and a scratch config pointing at the 1b `tests/claw`.

## Not verified

- The workshop role in a browser (no local user has it). Unit tests cover its permissions.
- `measurement-flow.spec.ts` «manager attaches a design photo and downloads it back»: fails locally, the download response body is empty. The test and Twenty's file download are untouched by this branch; I did not establish whether it passed before.
- «Доступно только владельцу» on the payroll page for a manager arriving by direct URL: no browser test any more (the manager has no menu item since PR A).
- "One composition edit = one resync plus one recalc-only run" was reviewed in code and unit-tested, not observed in a function log.
- Escape closing the «Добавить материал» form: implemented and reviewed, not exercised in the browser.
- The migration on production data.

## Decisions waiting for you

1. **Tag and merge style.** Tag `b94af83306` (Version A, the only commit tree with the migration runner) before merging #11, and merge with a merge commit, not a squash.
2. **Wording I chose or allowed** (not in the design dictionary): «Где используется» (a material's list of composition rows), «Козырёк или услуга (на ед.)», «Не указан состав», and on «Цены»: «Не удалось загрузить цены. Проверьте интернет и нажмите "Повторить"», «Введите название», «Не указан», «За что», «Материал», «Сколько», «Отмена», «Сначала добавьте материалы в «Склад»», «Все материалы уже в составе», «+ Фото», «Убрано.», «Из чего делается, на 1 п.м. / шт / заказ», «Новый козырёк», «Новая услуга».
3. **A price of 0** shows «0 сум за м²» with no «Укажите цену» pill (a free service is plausible, a free grille is not).
4. **No undo** when a composition row is removed (inline question only), and **no way to remove or replace a photo** on «Цены».
5. **Money input:** «1.500» is read as 1500; «012.000» as 12 000.
6. **Commit author address:** all commits carry `mardon@msagroupllc.com` (same as the base); the repo is public.
7. **Real design names** («Мараканд 2», «Мараканд 3», «Хайтек») remain in `scripts/import-excel.py`, as they already are on `main`.
8. **Side effect of my testing on local data:** order №1043 (the only one in «Согласование цены») now carries the note «Не указано, из чего делается: Хайтек» and the state «Не указан состав». That is the new rule; no money changed.

## Known gaps carried from the start

- No local user has the «Цех» role, so the workshop menu and redirect are covered by unit tests only.
- Linear is not authorized in these sessions: no issue lookup or progress comment was made.

## Rulings I made

Every ledger line that contains "Ruling:", in order, verbatim.

1. | 1 | own test vs own code | Plan test has no VIEW/OBJECT case though Step 1 mentions "the VIEW case" and spec §9 says per item type. Ruling: add VIEW (hidden target -> false, readable -> true) and OBJECT-unchanged cases — spec §9 — cost if wrong: two extra test cases. |

2. | 3 | kit vs spec §6.4 names (NumberField, SavedTick, PhotoGrid) | Ruling: plan's API (Field/TextInput/SelectInput, grid inline in Task 13) stands — design spec wins on wording/layout only — cost if wrong: renames. |

3. | 3 | TextInput `outline: none` vs design spec §10 "focus always visible, 2px accent" | Ruling: TextInput wrapper shows a 2px accent outline while focused (focus state) — accessibility basic — cost if wrong: 6 lines. Motion (§4.4) not built: nothing animates yet. |

4. Task 4 note: no user has the «Цех» role locally (Admin 2, Менеджер 1, Замерщик 1); the workshop menu cannot be checked by signing in. Ruling: verify owner, manager, measurer in the browser and report the workshop as not verified in the browser (role definition + unit test cover it) — creating a user on the shared server was not asked for — cost if wrong: one unverified role.

5. Task 2: implemented 8d050de (BASE bcc7154). Ruling: measurement-notes switches to the shared palette although its border gets stronger (#ebebeb -> #d6d6d6 light, #333333 -> #3d3d3d dark) — spec §6.4 "own PALETTE copies are deleted", design spec §4 "values are final" — cost if wrong: slightly darker dividers in the notes widget, two-line revert.

6. Task 2: Ruling: shared formatMoney also replaces the identical local copy in new-measurement (beyond the brief) — one formatter — cost if wrong: two-line revert.

7. Task 4: Ruling: add a server change in PR A — navigationMenuItem.targetObjectMetadataId toCompare: true, with a test — spec §7.3 says to relax the server "in the same change" if it does not accept a target object; the update handler already resolves universal relation ids generically; alternative (new ids for the three items) destroys three menu items, which the user said to ask about — cost if wrong: one-line core change to revert; production needs the server deployed before the apply or the three items stay visible to everyone (fails open). If the plan still shows no updates after this change: stop and ask the user.

8. Task 3: review — Needs fixes. Ruling (plan-mandated finding): TextInput keeps firing onCommit on Enter and on blur (design spec §10 "Enter saves a field"); the contract is stated in a comment and carried into the Task 12/13/18 dispatches (consumers skip unchanged values) — a kit-side guard is not airtight when onCommit reformats, and blur() may not exist in the sandbox — cost if wrong: a consumer that forgets the guard double-saves.

9. PR A: Ruling: fix Important 1 in this PR (one fix dispatch, FIX_BASE 77b8eb4), together with the no-op OBJECT condition, the duplicate validator comment and a missing-permissions-entry test — spec §7.3 exists so roles never reach a screen that only fails — cost if wrong: a few more lines of core delta.

10. Task 5: Ruling: drop the materialNorm.name read-only row (and its assertion); the name stays writable like order names, the trigger restores it — the file's own comment states this constraint and a failing create is a silent-failure trap — deviates from spec §7.4 "computed fields stay read-only" for this one field — cost if wrong: a manager can overtype a composition row's name until the trigger rewrites it. Fix round 1 to dispatch AFTER the Task 6 implementer commits (same worktree). The next plan will list those fieldPermission rows (created at B1 by this task) as destroyed: that destroy is this task's own change.

11. Task 6: parked — Ruling: accept the interim gap, no fix round — Task 7 (next commit, same PR, nothing applied in between) moves demand off metal/metalSize, after which the two fields feed nothing — cost if wrong: none once Task 7 lands; if Task 7 were dropped the trigger fields must come back.

12. Task 9: Ruling: the planner keeps the brief's behaviour for catalog shapes the local data does not have (sized price rows ignored; a second generic row of one metal collapses into the first; a second row naming one design survives only as a variant; a row with neither design nor metal is skipped) and the Task 10 runner prints every price row the plan does not carry over, before anything is written — spec §8 does not define these shapes, the local catalog has none (6 rows: 3 generic, 3 design rows, no sizes), and stored money is protected by the write-back either way — cost if wrong: on a catalog that has such rows, the grille's price for FUTURE orders is the unsized or first-row number until the owner corrects it in «Цены»; the runbook must make a non-empty "not carried over" list a stop for the owner.

13. Task 9: Ruling: a tie in "most used metal" resolves by input order, and the Task 10 runner sorts every loaded list by id before planning so the dry run and the apply produce the same plan — the planner stays as the plan wrote it — cost if wrong: which of two equally used metals becomes the design's own row and which a variant is arbitrary; no stored money depends on it.

14. Task 10: Ruling: the runner gets a MIGRATE_EMPTY_PRICES switch, strict by default, `fill` only after the user decides — the user's stop point asks how to treat empty-price positions, and null written back does not hold under the "fill when empty" rule — cost if wrong: one unused env switch in a script that Task 14 deletes.

15. Task 9: Ruling: fix (1) in the planner — `designs` input gains `metal`; a design that already has a metal is treated as migrated (main metal = its metal, no designUpdates entry); add a re-plan test — spec §8 says the script is idempotent and a retry after a failed apply is exactly when that matters — cost if wrong: a design whose metal was set by hand before the migration keeps its old numbers (not the case on any environment: Version A and the migration run back to back).

16. Task 9: Ruling: (2), (3), (4) stand as planned, covered by the earlier ruling (runner prints every row not carried over; non-empty list = stop for the owner in the runbook); the inaccurate comment at plan-catalog-migration.ts:78 is corrected in the fix round — these shapes do not exist locally and the spec does not define them — cost if wrong: see the earlier Task 9 ruling.

17. Task 10: Ruling: Important 1 — replace "wait 90 s and trust it" with: recalc-triggering writes (position repoints, write-backs) paced 3 s apart and two writes to the same order at least 15 s apart; after each wait, reload until two loads 15 s apart are identical (give up and fail after 10 minutes) — the plan's fixed sleep cannot prove money did not move, and overlapping recalcs of one order can leave a stale total (locally 4 orders have 2+ positions to repoint) — cost if wrong: the local apply takes ~4 minutes longer.

18. Task 10: Ruling: Important 2 — in strict mode the apply refuses to start (before the first write) when an empty-price or empty-cost position sits in an order the API returns and the migration touches — a fill cannot be undone, so it must be decided before, not reported after; locally the count is zero — cost if wrong: one more early exit to explain in the runbook.

19. Task 11: Ruling: money input is whole sums only — after removing every kind of space, accept digits only, or groups of three separated by dots or commas («250.000», «1,250,000») read as thousands separators; anything else (fractions, minus, letters, exponent) is an error with the text «Введите цену целым числом, без минуса»; no rounding — design spec §6.2 "Money: no decimals" and §12 "no silent failures"; a price 1000 times too small saved without a word is the worst failure this screen can have — cost if wrong: somebody who really means 1,5 сум gets an error, and «1.500» is read as 1500.

20. Task 11: Ruling: parsePositiveNumber accepts only digits with one optional dot or comma (no exponent, hex or sign), same error text as before — same root cause (Number() accepts «1e3» and «0x10»), one regex — cost if wrong: none realistic.

21. Task 12: Ruling: the application role gains soft delete on design, extraService and materialNorm (with a roles test) — spec §6.1 requires «Убрать из прайса» with undo and removing a composition row from the screen; spec §7.4 "Functions: no change" did not foresee that front components run through that role; the user's own role still bounds the request (the manager's cost read is refused inside the same component), so no role gains anything it could not already do in the standard tables — cost if wrong: logic functions could soft-delete those three objects, which none of them does.

22. Task 12: Ruling: accept "no focus on the new row's name field" — the front-component renderer does not allow autoFocus (AllowedHtmlElements/HtmlCommonProperties); the row still opens — cost if wrong: one extra tap for the user.

23. Ruling (Task 13 wording): an opening whose grille has no price, or «Другая», shows its area only and no per-opening price hint; the old hint «Цены нет в прайсе» is removed; the total line reads «Цену назовёт менеджер»; the block label «Дизайн» becomes «Решётка» — design spec §8.4 wireframe and text ("«Другая» means no price yet, and the total then reads «Цену назовёт менеджер»") — cost if wrong: one string to put back.

24. Task 13: Ruling: the opening line shows the area of ALL pieces next to the sum for all pieces («7,68 м² · 1 920 000 сум» for 2 pieces), not the area of one piece — design rule 3 (a number with its unit, readable arithmetic): one-piece area beside an all-pieces sum under «250 000 сум за м²» does not add up for the client — cost if wrong: one expression and one spec expectation to put back.

25. PR B: Ruling: fix Important 4 in this PR — NO_NORM option label «Не указан состав» (spec §4.9) and the order.missingNorms field label «Не указано, из чего делается» (design dictionary), with the stale fixtures — the plan put it in Task 19, but this PR already changed the note's wording, and a pill that disagrees with its note is a wording defect of this PR's end state; label-only, nothing destroyed — cost if wrong: Task 19 finds that item already done.

26. PR B: Ruling: the relation label on materialNorm.extraService becomes «Козырёк или услуга (на ед.)» and on material.norms «Где используется»; extraService.norms keeps «Из чего делается» — my Task 14 instruction applied the dictionary to the wrong side of two relations (final reviewer: a service name under the header «Из чего делается») — cost if wrong: two labels; «Где используется» is not in the design dictionary, OWNER to confirm in the PR report.

27. PR B: Ruling: money input tightened: thousands groups must use ONE kind of separator and may not start with a zero group («0.250», «1.250,000» are errors), and a non-finite number is an error — final reviewer's Minor 5 on my Task 11 ruling — cost if wrong: an unusual but valid entry gets the error text.

28. PR B: Ruling: one more, narrow fix dispatch for finding 1 only, with a scoped re-review, although the process allows a single fix wave — the user's instruction for a PR is "fix what the review finds", the repair is about five lines with a named test case (decide by the ABSENCE of composition fields: materialId, designId, extraServiceId, quantityPerUnit and the relation names material, design, extraService), and shipping a fix that does not do what its commit message says is worse than a second small commit — cost if wrong: about fifteen minutes; if it still misses, the behaviour stays "two resyncs per edit" (rate-limit cost only, never wrong data) and goes to the PR text as a known limit.

