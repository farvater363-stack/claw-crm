One-off import of the old `Рассчеты.xlsx` into Claw CRM.
`TWENTY_API_URL=... TWENTY_API_KEY=... python import-excel.py <path-to-xlsx> [--dry-run]` (needs `openpyxl`).
Never commit the xlsx: it contains customer names and phone numbers.
Historical orders import as CLOSED (PRODUCTION if the installation deadline is in the future); the workbook has no status column, so the admin adjusts them.
`normalize-phones.py`: one-off rewrite of order phones to `+998XXXXXXXXX` (same env vars, `--dry-run` prints the changes only).
`setup-owner-dashboard.py`: once per workspace after `yarn twenty apply`, creates the «Аналитика» dashboard record and its sidebar item (admins only, and the admin's landing page); rerunning changes nothing (same env vars, `--dry-run` prints the plan).
`masters-to-pay-rules.move.ts`: one-off move after the pay rules are applied: each worker with a rate per m² gets the «Мастер» category and a pay rule with that rate; rerunning changes nothing. Dry by default (prints the plan), writes only with `MOVE=apply`: `TWENTY_API_URL=... TWENTY_API_KEY=... MOVE=apply yarn vitest run --config vitest.move.config.ts scripts/masters-to-pay-rules.move.ts`.
