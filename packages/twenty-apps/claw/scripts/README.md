One-off import of the old `Рассчеты.xlsx` into Claw CRM.
`TWENTY_API_URL=... TWENTY_API_KEY=... python import-excel.py <path-to-xlsx> [--dry-run]` (needs `openpyxl`).
Never commit the xlsx: it contains customer names and phone numbers.
Historical orders import as CLOSED (PRODUCTION if the installation deadline is in the future); the workbook has no status column, so the admin adjusts them.
`normalize-phones.py`: one-off rewrite of order phones to `+998XXXXXXXXX` (same env vars, `--dry-run` prints the changes only).
`setup-owner-dashboard.py`: once per workspace after `yarn twenty apply`, creates the «Аналитика» dashboard record and its sidebar item (admins only, and the admin's landing page); rerunning changes nothing (same env vars, `--dry-run` prints the plan).
