# Claw CRM outbound-call audit

Bar (spec section 7): nothing runs automatically that contacts twenty.com,
Twenty-operated services or third-party analytics. Verified by
`packages/twenty-e2e-testing/tests/claw/no-external-requests.spec.ts`, which
logs in as the manager and fails on any browser request to a host other than
`localhost` / `127.0.0.1`.

## Defaults changed (`config-variables.ts`)

| Variable | Default | Effect |
| --- | --- | --- |
| `TELEMETRY_ENABLED` | `false` | no sign-up events to `twenty-telemetry.com` |
| `ALLOW_REQUESTS_TO_TWENTY_ICONS` | `false` | server stops building and the front stops requesting `twenty-icons.com` logos (the only external host the browser contacted before this change) |
| `MARKETPLACE_CATALOG_SYNC_CRON_ENABLED` | `false` | catalog cron no longer registered; the job itself also returns early, so a repeatable job registered earlier stays inert |
| `ADMIN_PANEL_VERSION_CHECK_ENABLED` (new) | `false` | admin-panel version info no longer queries Docker Hub |
| `ANALYTICS_ENABLED` | `false` (unchanged) | ClickHouse analytics off |
| `SENTRY_DSN`, `SENTRY_FRONT_DSN` | unset (unchanged); `EXCEPTION_HANDLER_DRIVER=CONSOLE` | no error reporting |
| `ENTERPRISE_API_URL` | unchanged | only read when `ENTERPRISE_KEY` is set, which is never set here |
| `SUPPORT_DRIVER` | `NONE` (unchanged) | Front chat script never loaded |

No overrides exist in `packages/twenty-server/.env` or in the config-variables
DB table.

## Server outbound paths

Found with `grep -rn "fetch(\|axios\.\|HttpService\|new URL('https"` over
`packages/twenty-server/src` (26 hits, tests excluded) plus a scan for
hard-coded external URLs.

| File | Destination | Trigger | Why it is off |
| --- | --- | --- | --- |
| `core-modules/telemetry/telemetry.service.ts` | `twenty-telemetry.com` | user sign-up | `TELEMETRY_ENABLED=false` |
| `core-modules/enterprise/services/enterprise-plan.service.ts` (validate, seats, release, status, portal, checkout) | `ENTERPRISE_API_URL` (twenty.com) | daily cron, admin panel actions | every path returns before any request unless `ENTERPRISE_KEY` is set; never set |
| `core-modules/admin-panel/services/admin-panel-version.service.ts` | `hub.docker.com` | admin opens version info | guarded by `ADMIN_PANEL_VERSION_CHECK_ENABLED=false` |
| `application-marketplace/marketplace.service.ts` | `registry.npmjs.org`, `unpkg.com` | catalog sync cron and CLI command | cron flag `false` (and job guard); CLI `marketplace-catalog-sync` is an explicit operator action |
| `application-registration/application-registration-claim.service.ts` | npm registry, `github.com`, `api.github.com` | admin claims an app registration | explicit admin action only |
| `application-package/application-package-fetcher.service.ts` | `APP_REGISTRY_URL` | admin installs an app from the registry | explicit admin action only |
| `ai/ai-models/services/models-dev-catalog.service.ts` | `models.dev` | admin panel AI provider screen | admin-only screen, not visited by staff; no automatic caller |
| `core-modules/search/...`, `navigation-menu-item-record-identifier.service.ts`, `client-config.service.ts` | `twenty-icons.com` (URL only, fetched by the browser) | record search / navigation icons | `ALLOW_REQUESTS_TO_TWENTY_ICONS=false` |
| `core-modules/tool/tools/search-help-center-tool` | Twenty help search (Mintlify) | AI agent calls the tool | AI chat only, needs an AI provider key; not configured |
| `core-modules/captcha/captcha-driver.factory.ts` | Google reCAPTCHA / Cloudflare Turnstile | sign-in | `CAPTCHA_DRIVER` unset |
| `core-modules/emailing-domain/.../resend-*.service.ts` | `api.resend.com` | emailing domain feature | needs Resend key; not configured |
| `core-modules/geo-map/.../google-places` | `maps.googleapis.com` | address autocomplete | needs Google key; not configured |
| `core-modules/company-enrichment` | `api.peopledatalabs.com` | enrichment | needs key; not configured |
| `modules/messaging-webhooks/.../sns-subscription-confirmer.service.ts` | AWS SNS subscribe URL | inbound SES webhook | only with SES webhook configured |
| `modules/workflow/workflow-tools/tools/update-logic-function-source.tool.ts` | none (text of a prompt example) | n/a | not a request |
| `core-modules/secure-http-client`, `caldav` digest fetch, `imap` client | user-supplied hosts | workflow HTTP steps, calendar/mail accounts | user-configured integrations |
| `core-modules/frontend/frontend.service.ts` | `FRONTEND_URL` (local Vite in dev) | serving index.html | local host |
| `core-modules/auth`, `connected-account` (Google, Microsoft OAuth) | Google / Microsoft | account connection | provider flags `false` |
| `core-modules/dpa/constants/oneleet-trust.constant.ts` | Oneleet trust API | not referenced by any code | dead constant |

## Front outbound paths

Found with `grep -rhoE "https://[a-zA-Z0-9.-]+" packages/twenty-front/src`
(162 hits on twenty.com alone, almost all tests, stories, docs links and
placeholder text) and a scan for injected scripts.

- Links to `twenty.com`, `docs.twenty.com`, `github.com`, social networks:
  plain anchors, contacted only if a user clicks them.
- `twenty-icons.com` company/link logos: gated by the client-config flag
  `allowRequestsToTwentyIcons`, now `false`; the front-end state also defaults
  to `false` so nothing is requested before client config loads. Every call
  site that builds a `twenty-icons.com` URL reads the flag:
  `RecordTableWidgetRelationPickerDropdownContent.tsx` (relation-table "add
  new" picker), `LinkIconWithLinkOverlay.tsx` (navigation link favicons),
  `BackgroundMockTableRow.tsx` (404 page backdrop),
  `OnboardingImportPreviewCompanies.tsx` (onboarding import preview), and the
  chip/identifier paths through `getImageIdentifierFieldValue`. The remaining
  literal `allowRequestsToTwentyIcons: false` call sites
  (`ObjectFilterDropdownActorSelect.tsx`, `FormWorkspaceMemberFilterValueInput.tsx`,
  `EventRelationFieldDiffValues.tsx`) pass `false`, so they never request.
- `chat-assets.frontapp.com`: only when `SUPPORT_DRIVER=FRONT`.
- `challenges.cloudflare.com`, `www.google.com/recaptcha`: only when a captcha
  driver is configured.
- `models.dev/logos`: admin-panel AI settings page only.
- `player.vimeo.com`: only inside the "customize" video modal a user opens.
- Fonts and icons are bundled; no request to Google Fonts or a CDN.
- Sentry front SDK: initialised only with a non-empty `SENTRY_FRONT_DSN`.

## Residuals (not covered by the test, not automatic for existing data)

- New-workspace prefill (`standard-objects-prefill-data/utils/prefill-people.util.ts`)
  stores avatar URLs on `twentyhq.github.io` for demo people, and the
  "My first dashboard" layout embeds a `tradingview.com` widget. Both apply
  only when a new workspace is created. The current Claw workspace shows
  neither.
- Deleting the demo people/dashboard on new workspaces is out of scope for
  stage 1.
