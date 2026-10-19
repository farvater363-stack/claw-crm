# ProfMet site

Static, mobile-first site in Russian and Uzbek (Latin). No dependencies.

```bash
node build.mjs          # renders dist/ru/, dist/uz/ and the language picker at dist/index.html
node serve.mjs          # preview on http://localhost:4321, /api/* forwarded to the CRM at CRM_URL (default http://localhost:3000)
MOCK=1 node serve.mjs   # same, with sample designs and prices instead of a running CRM
```

## What to edit

| Change | File |
| --- | --- |
| Any text | `src/copy/ru.json` and `src/copy/uz.json` (same keys in both, the build fails otherwise) |
| Phone, Telegram, Instagram | `src/settings.json` (an empty handle is left off the page) |
| Callback minutes, price-hold days | `src/settings.json`: `callbackMinutes`, `priceHoldDays`; copy refers to them as `{minutes}` and `{days}`. |
| Monthly discount | Not in the site: the CRM app variable `WEBSITE_OFFER_PERCENT` (Settings → Applications → Claw CRM). The catalog route returns it, the server applies it, and `0` hides every offer element. It always ends on the last day of the current month. Copy refers to it as `{percent}` in `js.*` keys only. |
| Team photo | `src/assets/team.jpg`; shown in the workshop section with the `craft.team` caption. |
| Photos of finished work | drop `.jpg`/`.webp` files into `src/assets/works/` named `01.jpg`, `02.jpg`, …; they show in that order, the first is also the hero image. Captions come from `works.1`, `works.2`, … in the copy files. Without photos the works section is left out. |
| Layout | `src/page.html`, `src/assets/styles.css` |
| Estimate wizard | `src/assets/app.js` |

Designs and prices come from the CRM (`Дизайны` and `Прайс`) through `GET /api/website/catalog`, so the site follows the price list. Metal size is not asked: Прут 8, Профиль 15/15, Арматура without size (`DEFAULT_METAL_SIZE` in the Claw app). The CRM order keeps the list price; its comment notes the discount the site showed. Spam limits on the estimate route: 5 requests per visitor IP per hour, 3 site orders per phone per hour, 30 site orders per hour in total.

Merging to main rebuilds the `claw-web` image; on the Droplet run `docker compose pull && docker compose up -d`.
