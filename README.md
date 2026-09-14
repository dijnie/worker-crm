# Vinext

<!-- dash-content-start -->

A shared-workspace CRM built with Vinext App Router, Drizzle ORM, and Cloudflare
Workers/D1. Verified email/password sessions protect business APIs and the workspace.
Companies, Contacts and Deals have interactive lists, creation forms and nested
record sheets with property editing and activity history, alongside account and
system-managed roles and member administration. Record sheets support manual activities and task
actions and typed custom fields. The overview shows live workspace counts,
currency-specific pipeline values and linked recent activity. The former SaaS customer/subscription tools
and endpoints are retired. Interactive API documentation is public at `/docs`.

<!-- dash-content-end -->

## Design intent

Use the captured Cloudflare dashboard for the application header, sidebar controls,
and theme: neutral surfaces, blue primary actions, orange brand accents, and Inter
typography. The business model and record workflows draw from htcrm; the shared
application shell uses neutral names so it can serve additional areas.
The [theme stylesheet](src/styles/globals.css) owns visual tokens, and
[programmatic tokens](src/lib/design-tokens.ts) reference those CSS values.
The [application shell](src/components/app/app-shell.tsx) composes the
[header](src/components/app/app-header.tsx) and
[desktop sidebar](src/components/app/app-sidebar.tsx). The collapsed sidebar opens
temporarily on mouse hover, overlaying content without shifting the page. Leaving
the sidebar or pressing Escape dismisses that preview. The bottom button pins it
open or collapses it; mobile navigation remains a separate drawer.
Ask AI and Support remain disabled placeholders.
[Account](src/components/app/account-menu.tsx) shows the signed-in identity and role
and provides signout.
The [workspace layout](src/app/(workspace)/layout.tsx) applies this shell to
business screens. `/docs` is a standalone page with no application header or sidebar.
It uses locally bundled `swagger-ui-react` with the application's custom theme.

## Routes

| Route | Screen |
| --- | --- |
| `/` | [Overview](src/app/(workspace)/page.tsx) |
| `/companies` | [Companies](src/app/(workspace)/companies/page.tsx) |
| `/contacts` | [Contacts](src/app/(workspace)/contacts/page.tsx) |
| `/deals` | [Deals](src/app/(workspace)/deals/page.tsx) |
| `/settings` | [Settings](src/app/(workspace)/settings/page.tsx) |
| `/settings/members` | [System-only member administration](src/app/(workspace)/settings/members/page.tsx) |
| `/settings/roles` | [Role and permission management](src/app/(workspace)/settings/roles/page.tsx) |
| `/docs` | [Interactive API documentation](src/app/docs/page.tsx) |

The [record list](src/components/app/data-table/record-list.tsx),
[creation forms](src/components/app/records/record-form.tsx),
[saved views](src/components/app/data-table/saved-views.tsx) and
[bulk actions](src/components/app/records/bulk-actions.tsx) own the list workflows.
Search, filters, saved views and column visibility share a compact toolbar attached
to each table. [Toolbar panels](src/components/app/data-table/toolbar-menu.tsx)
fit the viewport and dismiss on Escape or outside interaction. Active facets appear
as removable chips; bulk actions appear after selecting records, with results
remaining visible after successful selections clear.
Record links use the [URL navigation boundary](src/components/app/record-sheet/record-navigation.ts)
and [sheet host](src/components/app/record-sheet/record-sheet-host.tsx). The
[property panel](src/components/app/record-sheet/property-panel.tsx),
[edit lifecycle](src/components/app/record-sheet/inline-field.tsx) and
[navigation guard](src/components/app/record-sheet/use-record-stack.ts) own editing
and recovery of unsaved changes. Company primary contact, contact employer and
deal participation are independent business relationships; the
[relation controls](src/components/app/record-sheet/related-records.tsx) preserve
that distinction. [Record actions](src/components/app/record-sheet/record-actions.tsx)
use archive/restore because historical records must remain viewable. The
[timeline](src/components/app/timeline/timeline-panel.tsx) owns paginated history,
the [activity composer](src/components/app/timeline/activity-composer.tsx) and
[task and deletion actions](src/components/app/timeline/activity-actions.tsx).
Email and meeting entries are manual CRM logs; they do not send mail or sync
calendars. Deleting stage history does not reverse a deal's current stage.
System accounts manage custom field definitions in
[Settings](src/components/app/fields/field-definition-list.tsx), including immutable
keys, placement flags, atomic ordering, and definition/option archive and restore.
When leaving a field-definition draft, Keep editing preserves it; Discard changes
continues the navigation that prompted the confirmation.
Same-document Back/Forward protection uses the browser Navigation API; browser
regressions cover current Chromium. Older-browser fallback parity is unverified.
The [custom field panel](src/components/app/fields/custom-fields-panel.tsx) supports
all ten types, preserves exact decimal strings, and retains drafts when a save
fails or an editor's field type changes. Required fields reject explicit clears;
existing records do not require backfilling. SELECT and USER fields can filter
lists and saved views. Retired selections remain readable, and unavailable field
filters require explicit repair. Fields shown in tables are display-only columns.
List APIs keep their default response shape; `includeFields=true` adds a typed
map keyed by field key. The [OpenAPI contract](src/lib/openapi/document.ts)
documents projections, `field:<key>` filters, reorder and optional `expectedType`
write preconditions. The [overview](src/components/app/overview/overview-dashboard.tsx)
shows active company/contact totals and a global open-deal count. Its exact open
value and all seven pipeline stage counts/values use the selected currency only;
the validated `currency` URL parameter defaults to USD. Stage links open matching
deal lists. The ten latest activities open record sheets, and record edits refresh
their linked names and archive state. Statistics and activity have separate retry
states, so a failed request does not appear as zero data.

The [workspace data provider](src/components/app/app-data-provider.tsx) and
[invalidation store](src/lib/app-data-store.ts) are the shared integration point
for lists, sheets, overview and account/member controls. Mutations and access
changes remain consistent across these screens.
Standalone authentication pages use flat `/sign-up`, `/sign-in`, `/verify-email`,
`/forgot-password`, `/reset-password`, and `/access-revoked` URLs; see the
[auth route group](src/app/(auth)).
The former `/admin` routes, including customer and subscription detail URLs,
have been removed and return 404.
Anonymous workspace links return after signin with their record stack and table
query intact, including encoded search spaces. The [request proxy](src/proxy.ts)
and [safe return URL boundary](src/lib/auth/safe-return-url.ts) own this navigation;
return destinations stay inside the application.

## Accounts and shared access

Signup is open and requires email verification. Every new account starts with no
role, including the first signup. It can sign in but sees only a pending-access
screen until a system account assigns a role. There is no default role or implicit
admin/member group. An assigned role with no grants also has no CRM access.

All roles live in the [role schema](src/lib/db/schema/role.schema.ts). The protected
system role has full access; system accounts create other roles and select grants
from the [entity/action catalog](src/lib/auth/permissions.ts) in Settings → Roles.
Each account has at most one role. Write grants require read for the same entity.
Company/Contact/Deal removal remains archive/restore; Activity delete remains
permanent. Field-definition configuration is system-only, while entering field
values follows the record's update permission.

The workspace dataset remains shared within each role's entity access; record
ownership does not grant permissions. System accounts assign/clear roles and
revoke/restore accounts in Members. The last active system account and system role
are protected. Assigned roles cannot be deleted. Restoring access leaves no role
and requires a fresh signin; old sessions remain invalid. Revocation preserves
accounts, record assignments and history. See the [member service](services/member.service.ts)
and [role service](services/role.service.ts).

Role changes apply to the next request. The [authorized database](src/lib/auth/authorized-db.ts)
checks the live membership/session and role revisions inside each database batch,
including standalone queries. The UI rechecks identity on focus, periodically and
after permission errors; changed access clears cached records and open editors.
This is request-based enforcement, not a server push notification mechanism.

For a fresh local installation, verify and sign in to the intended system account,
then get its ID from `/api/account`. After applying local migrations, run
`npm run db:bootstrap-system -- --user-id ID` to inspect eligibility, then add
`--apply` to promote it. The [local bootstrap script](scripts/bootstrap-system.mjs)
exports a private backup before writing and only promotes a verified active
roleless account when no active system exists. It never targets a remote database.
Existing active system accounts grant further system roles through Members.

Verify the email link, then sign in explicitly. A failed signup email may leave
an unverified account: use resend verification instead of assuming access was
granted. Password reset uses an expiring one-use link and invalidates old sessions.
The [auth factory](src/lib/auth/auth.ts) owns expiry, cookie, rate-limit, and
delivery-error handling; the [request guard](src/lib/auth/request-context.ts)
checks verified active membership for protected requests.
The [API permission boundary](src/lib/server/api-permissions.ts) additionally
requires the configured role grants; identity access alone grants no CRM reads.

## Local setup and email

Run commands from this directory after `npm ci`. [package.json](package.json)
owns scripts and dependency pins: Better Auth, its standalone Drizzle adapter,
and the `auth` schema CLI are aligned at 1.7.4. Root Zod 4 satisfies dependency
peer requirements; CRM validators retain their Zod 3 contracts via `zod/v3`.

Set `AUTH_BASE_URL` in your private `.dev.vars` for local development and in the
Worker's **Settings → Variables and Secrets** on Cloudflare for production.
Use the canonical browser origin, including its port. Production requires HTTPS;
HTTP is allowed only on loopback. Do not include a path, credentials, query, or
fragment. The local example uses `http://localhost:3000`. The email adapter reads
its sender from runtime `AUTH_EMAIL_FROM`; the `EMAIL` binding does not hard-code
a sender allowlist.

Store a cryptographically random `BETTER_AUTH_SECRET` of at least 32 characters
in an ignored `.dev.vars` file beside `wrangler.jsonc`. Keep secrets out of source,
terminal output, and shared logs. For an approved remote environment, provision it
through `npx wrangler secret put BETTER_AUTH_SECRET --config wrangler.jsonc`;
see [Cloudflare secret management](https://developers.cloudflare.com/workers/configuration/secrets/).
Use separate local and production secrets and retain the production secret during recovery.

Use [.dev.vars.example](.dev.vars.example) as the key inventory; its empty secret
must be replaced in your private `.dev.vars`. Local development uses
`AUTH_BASE_URL=http://localhost:3000` and `AUTH_EMAIL_FROM=noreply@example.invalid`.
Existing local setups must include both values in `.dev.vars`; they are no longer
provided by `wrangler.jsonc`. Do not copy another application's origin or unrelated
secret keys.

After changing bindings, regenerate [Worker types](worker-configuration.d.ts) with
`npx wrangler types --env-file .dev.vars.example --strict-vars=false` so generated
types use the public example rather than private local values.

Keep `secrets.required` out of the shared Wrangler configuration: it filters local
dotenv keys and would exclude the auth origin and sender. This also means Wrangler
does not enforce a declared secret list before deployment; provision and verify
`BETTER_AUTH_SECRET` as described above. The application still requires a secret
of at least 32 characters. See [Cloudflare's local variable-loading rules](https://developers.cloudflare.com/workers/configuration/secrets/#local-development-with-secrets).

```bash
npm run dev
```

This checks the local migration history, backs up before applying pending
migrations, then starts Vinext at `http://localhost:3000`. An incompatible legacy
schema stops startup instead of replaying the baseline. The port is strict: stop
the existing server before starting another. Vinext, Wrangler, and the migration
runner all use this project's `.wrangler/state` directory. See
[Cloudflare's local persistence documentation](https://developers.cloudflare.com/workers/local-development/local-data/).

To inspect migration state without applying changes, run `npm run db:inspect`.
To preview the built Worker using the same database and origin, stop the dev
server and run:

```bash
npm run build
npm start
```

`npm start` verifies the built configuration against source before migrating.

The native [email adapter](src/lib/email/cloudflare-email-adapter.ts) uses
Cloudflare's `EMAIL.send` binding. Email Sending is beta and requires the Workers
Paid plan for this open-signup use case; confirm availability on the target account.
See [Email Service](https://developers.cloudflare.com/email-service/). Onboard an
authorized sender domain using Cloudflare DNS and complete its MX/SPF/DKIM/DMARC
setup before real delivery, following [sender onboarding](https://developers.cloudflare.com/email-service/get-started/send-emails/).
The runtime sender must belong to that onboarded domain. The
[send binding](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
is declared by name only, so changing `AUTH_EMAIL_FROM` does not require a matching
change to a sender address in source configuration.
There is no alternative email provider or API-key fallback.

The checked-in `noreply@example.invalid` sender is a placeholder and cannot
deliver real email. Local/production origins, sender authorization, and account
onboarding remain environment inputs; real delivery and deployment require
separate environment verification. Local Wrangler uses simulated email unless a
remote binding is enabled. Treat locally captured verification/reset links as
secrets and keep them out of shared logs; see
[local email development](https://developers.cloudflare.com/email-service/local-development/sending/).
Enabling a remote email binding causes real sends.

After local signup or a password-reset request, the dev terminal prints a
`Text:` file path under `.wrangler/tmp/email/`. Open that file locally and follow
its verification/reset link; the simulated message does not arrive in an external
inbox. Do not share the file or its token-bearing link.

### Preserve storage before migrations

The [initial migration](migrations/0000_initial_schema.sql) is a fresh CRM baseline,
not a conversion of an existing SaaS database. It remains unchanged. The
[auth migration](migrations/0001_auth_membership.sql) upgrades that baseline
additively, preserving business records and historical owner/creator IDs.
The [RBAC migration](migrations/0002_dynamic_rbac.sql) replaces the old role enum
with nullable role references. Existing owners become system; existing members
become roleless and require deliberate assignment. CRM records and assignment
IDs remain unchanged. Back up before upgrading. After migration, use compatible
RBAC application code; an older owner/member binary cannot read the new schema.

Before migrating existing storage, identify its actual D1 binding and persistence
path, record applied migrations, and take a restorable backup outside the repository.
The [local migration runner](scripts/d1-migrations.mjs) exports the selected D1
database to a private, timestamped directory under `~/.worker-crm/backups` before
applying pending migrations. It stops if export fails. Keep these backups private:
they can contain account and business data. Verify restoration on an isolated
copy before manually recovering or replacing existing storage.

Populated company/contact relationships can be cyclic, so direct Wrangler import
of an exported SQL file is not the verified local recovery path. The
[restore helper](tests/upgrade-preservation-harness.mjs), exercised by
[migration](tests/migration.test.mjs) and [local-runner tests](tests/local-dev.test.mjs),
imports the unchanged export into a separate stopped disposable SQLite store
initialized by D1. Foreign-key enforcement is disabled only during that import;
an empty `foreign_key_check` is required before reopening through D1 and comparing
every business/auth row and the migration ledger. This establishes local recovery
evidence, not a remote restore procedure.

Stop local writers before copying an entire persistence directory. Copy the
actual `.wrangler/state` used by this project; another directory is a different
database. Startup never resets storage or rewrites incompatible migration history.

For remote D1, use `npx wrangler d1 export DB --remote --output=/absolute/private/backup.sql`.
For default local `.wrangler/state`, use the same command with `--local` instead
of `--remote`. Choose a new private output path for each backup. The installed
`npx wrangler d1 export --help` has no `--persist-to` option: a default local
export does not back up a custom persistence directory. Use the stopped-directory
copy for that case. See [D1 export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
and [local persistence](https://developers.cloudflare.com/workers/local-development/local-data/).

`npm run db:migrate` applies migrations to the same default local store without
starting a server. The guarded runner intentionally does not accept a custom
persistence path or remote target. For isolated manual validation, use Wrangler
directly and give both migration and runtime commands the same `--persist-to`
directory; this does not prepare the database used by `npm run dev`.

Installations that applied an older baseline must verify both its schema and
migration record before choosing recovery. A matching filename alone is not proof
of compatibility. Preserve the old database and decide explicitly whether to
convert its records or initialize a fresh local database.

Before an authorized deployment, reconcile remote resources with
[wrangler.jsonc](wrangler.jsonc). Renaming configured resources does not rename
existing Cloudflare resources; verify the actual D1 ID and target before any
remote migration. D1 is the configured application data store; removed template
bindings do not delete existing local R2 data or remote buckets. Authentication's
database rate limits remain owned by the [auth factory](src/lib/auth/auth.ts).
Prefer a forward fix during recovery. A rollback must preserve
the session access boundary and newer business writes; do not restore token-only
code or overwrite newer data with an older backup.

## Cloudflare deployment

Production `AUTH_BASE_URL` and `AUTH_EMAIL_FROM` are managed in the Worker's
**Settings → Variables and Secrets**, not in the build environment or source
`vars`. [wrangler.jsonc](wrangler.jsonc) sets `keep_vars: true` and omits `vars`
so redeploys preserve Dashboard values. Local examples live only in
[.dev.vars.example](.dev.vars.example) and are not uploaded. If an earlier deploy
overwrote a value, restore it in the Dashboard once; this setting preserves values
but cannot recover old ones. See
[Wrangler's configuration behavior](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth).
This preserves environment variables; resource bindings remain configured in
`wrangler.jsonc`.

After verifying the production bindings, HTTPS auth origin, authorized email
sender and secret described above, back up existing remote storage as described
in **Preserve storage before migrations**, then run:

```bash
npm run deploy
```

The [deploy runner](scripts/deploy.mjs) builds the app, applies pending migrations to
the remote `DB` binding in `wrangler.jsonc`, then deploys the built Worker. A
failed build or migration stops deployment. Already applied migrations are
skipped; a release without new SQL files still checks for pending migrations.
If Worker deployment fails after migration succeeds, the applied migrations
remain in D1. Fix the deployment and rerun; do not reset the database.

`npm run deploy -- --dry-run` validates setup without building, migrating or
publishing. The runner targets the production configuration only and rejects
other flags so a Worker override cannot silently use the production database.

For Cloudflare Workers Builds, set the production **Deploy command** to
`npm run deploy`; it includes the build step. A direct `wrangler deploy` or
`vinext-cloudflare deploy` bypasses this project's migration step. The build's
Cloudflare token must have access to both the Worker and its D1 database.
Wrangler skips migration confirmation in CI; see
[D1 migration behavior](https://developers.cloudflare.com/workers/wrangler/commands/d1/#d1-migrations-apply).

## API integration

Open `/docs` for Swagger UI or fetch `/api/openapi` for the OpenAPI 3.0.3 JSON
document. Both are public and contain no application records or environment
secrets. The [OpenAPI generator](src/lib/openapi/document.ts) reuses request
validators and database column metadata, with explicit response relationships
and business-rule descriptions. [Contract tests](tests/openapi.test.mjs) validate
the document and compare it with the actual route handlers; HTTP integration
tests also validate real responses against it.

Sign in through `/sign-in`, then return to Swagger's **Try it out** on the same
origin. The browser supplies its HttpOnly session cookie automatically; there is
no manual token or cookie entry. Swagger assets are bundled locally and external
schema validation is disabled. Better Auth delegates `/api/auth/*` separately
from the business OpenAPI catalog. Role/member administration is system-only;
`/api/account` returns current identity even before role assignment. See the
endpoint catalog for role CRUD and nullable membership role assignment.

The [endpoint catalog](src/lib/api-endpoints.ts) and
[typed client](src/lib/api.ts) own the REST integration surface. Business
[services](services) receive a database instance; the HTTP boundary supplies
trusted account context. [HTTP integration tests](tests/api.test.mjs) exercise the route
handlers and client against temporary D1 storage; the test scripts in
[package.json](package.json) preserve existing local databases.

For list integration, start with the browser-safe
[query contract](src/lib/record-list-contracts.ts),
[server query implementation](services/record-list-query.ts) and
[list tests](tests/record-lists.test.mjs). Sorting and filtering cover the full
matching dataset before pagination. Send `filters` as one JSON query value;
saved-view `q` maps to the list's `search` input. `includeSummary=true` opts into
relationship summaries, while `includeFields=true` opts into custom values;
default list responses retain their existing shape. The
[assignee service](services/assignee.service.ts) is the assignment directory for
accounts with CRM read access; system-only member administration is separate.
[Saved-view ownership](services/saved-view.service.ts) is personal even in a shared
workspace: members see their own and shared views, but only the creator can edit
or delete one, including when a reader has the system role. Revoking a creator
does not remove their shared views. The [field list query](services/field-list-query.ts)
owns page-bounded custom-field projections and SELECT/USER facets, including retained retired
selections and counts that exclude their own facet predicate. Saved views also
require entity read access; views whose related filters/sorts need unavailable
permissions are withheld until that access is restored or the creator repairs them.

Read restrictions apply to nested records and mutation responses as well as lists.
Unread relation IDs and objects become null, unread relation arrays are empty,
and inaccessible summary counts are omitted. Related search/sort/filter queries
cannot probe unread entities. Denormalized last-activity timestamps and their
sort/filter controls require all entity reads because they include linked history.
Stats return null for inaccessible metrics. Activity lists/counts include only
activities whose linked entities are all readable. Record details include
`canCreateActivity` for composer availability after inferred-link checks.

For independent deal participation, start with the
[deal-contact service](services/deal-contact.service.ts) and its methods in the
typed client. The [activity service](services/activity.service.ts) owns named
timeline views and `/api/activities/counts`; tab counts cover the matching dataset,
so consumers must not infer totals or outstanding tasks from embedded detail
previews. Their public routes and validation remain in the endpoint catalog and
OpenAPI document above.

`API_TOKEN` clients must migrate to verified sessions; token headers no longer
grant access. The [server API boundary](src/lib/server/api-handler.ts) requires
a session and active membership. Private POST/PATCH/PUT/DELETE requests also
require `Origin` to equal `AUTH_BASE_URL`'s origin, including for non-browser
clients, and `Content-Type: application/json` when a body is present. Missing or
invalid sessions return 401; inactive membership or insufficient role permissions
returns 403. The [typed client](src/lib/api.ts) sends same-origin credentials.

Activity creation rejects caller-supplied `createdById`; deal stage changes reject
`actorId`. Attribution comes from the authenticated account at the HTTP boundary.
See the public [activity](src/lib/server/activity-api-inputs.ts) and
[stage](src/lib/server/deal-api-inputs.ts) input contracts. Existing attribution
remains intact. Ordinary deal edits and stage transitions stay separate so a
transition cannot bypass its history entry or losing-reason requirement.
Company records represent customers, not tenant boundaries. Activity links are
independent: a contact may participate in another company's deal. Company
attribution follows an explicit company, then the linked deal, then the contact's
employer, preserving the source workflow.

List bodies are arrays, with pagination metadata in response headers; the typed
client reconstructs the page result. Monetary API values are decimal strings to
preserve exact cents. [Stats](services/stats.service.ts) keeps active record and
open-deal counts global; `openDealValue` and the seven ordered `pipeline` buckets
use the requested currency, default USD, without FX conversion. The weekly activity
window starts Monday UTC. Exact sums use one consistent batch and a scan of the
selected currency's active deal amounts; time and memory grow with that dataset.
`GET /api/activities?limit=10&includeLinks=true` adds bounded company/contact/deal
link labels and archive state, including fallbacks for unresolved stored IDs.
The default activity response remains unchanged.

Date-only inputs represent a calendar day, encoded at UTC midnight in the existing
ISO datetime API contract to preserve that day across timezones. The
[record form conversion](src/components/app/records/form-values.ts) and
[custom-field conversion](src/lib/field-form-values.ts) own this boundary;
timestamped activities retain their datetime semantics.

The shared [JSON reader](src/lib/http/json-body.ts) limits parsed JSON bodies to
1 MiB (1,048,576 bytes), including JSON encoding overhead. It checks declared size
and counts actual streamed bytes, stopping oversized reads with HTTP 413. This
aggregate transport limit applies in addition to individual field validation.
Malformed JSON returns 400 and unsupported content types return 415;
`application/json; charset=utf-8` remains accepted. Permission inspection and route
validation reuse one parsed body. Optional bodyless mutations remain supported.

The shared [security policy](src/lib/http/security-headers.ts) applies to pages,
API and auth responses. It disables framing and unused device permissions, sets
nosniff and referrer headers, and restricts resource loading to this application
with data images and inline scripts/styles required by Vinext and Swagger.
Development additionally permits WebSocket connections for HMR. HSTS is emitted
for HTTPS requests without opting other subdomains into that policy. This CSP
permits inline execution; it is not a nonce-based policy.
Vinext's development server can reject a foreign Origin before the application
proxy runs; those framework-generated 403 responses have no application headers
or request ID. React's development-only debug stack reconstruction also probes
`eval`, which this policy blocks; React catches that failure and falls back.
Production browser verification requires no CSP violations.

Business API, OpenAPI and auth responses return an opaque `X-Request-Id` header
on success and failure, keeping their existing JSON bodies. A server-generated
ID follows the request through context and internal auth request reconstruction;
the typed client's `ApiError.requestId` retains it for support correlation.
For unexpected failures, use that ID to find the corresponding `request_failure`
event in Cloudflare Worker logs. The [error reporter](src/lib/server/error-reporting.ts) records only the
generated ID, a route template, method, status and a fixed failure category.
It excludes account/record identifiers, query strings, request bodies, cookies,
tokens, email addresses, raw SQL and error messages. Incoming request IDs are not
trusted. Expected validation and permission failures do not generate these events.
The [OpenAPI document](src/lib/openapi/document.ts) describes the header on business
API responses and HTTP 413; native auth endpoints remain outside that catalog.

## Storage decisions

The [schema entry point](src/lib/db/schema/index.ts) owns the business model and
relations. Deal `amount` uses integer cents to avoid floating-point money
rounding. Other source decimal fields—`baseAmount`, `fxRate`, and
`fieldValues.number`—retain exact decimal strings in SQLite TEXT columns rather
than losing precision through floating-point conversion. Future services must
handle their numeric comparison, range filtering, sorting, and arithmetic
explicitly; ordinary SQL text ordering is lexical.

Legacy business user and external-system identifiers remain scalar values without
auth foreign keys or forced backfills. The separate auth and membership tables
protect workspace access without rewriting those integration references.

[Constants](src/lib/db/schema/constants.ts) follow the source model, including
its enrichment and user-field values. The source has no lifecycle-stage field;
future filters must follow the actual schema instead of assuming one exists.

## Verification

Run focused auth checks with `node --test tests/auth.test.mjs tests/email.test.mjs tests/members.test.mjs`;
[package.json](package.json) owns the full test/build scripts. The
[auth harness](tests/auth-harness.mjs) uses disposable workerd/D1 and captures
actual Better Auth verification/reset links for HTTP consumption. It does not
SQL-flip verification to prove successful signup. [Migration tests](tests/migration.test.mjs)
and [local-runner tests](tests/local-dev.test.mjs) cover fresh installs, populated
baseline/current-auth upgrades, repeat apply, backup-failure abort and actual
export restoration using the [preservation harness](tests/upgrade-preservation-harness.mjs).
[API tests](tests/api.test.mjs) cover the protected HTTP boundary. These checks
preserve existing local databases.
Captured-link tests and adapter tests do not prove remote email delivery or
production HTTPS cookie behavior; verify those in an authorized target environment.

The [browser runner](scripts/run-browser-tests.mjs) owns suite registration and
runtime modes; [the harness](tests/browser/browser-harness.mjs) owns disposable
storage, verified browser identities and cleanup. Install its pinned Chromium
with `npx playwright install chromium`, then run the integrated journey from
this directory:

```bash
node scripts/run-browser-tests.mjs --mode=both --suite=integration
```

Use `--mode=dev` or `--mode=built` for a focused run. The combined mode verifies
the same session and record across the dev-to-built handoff; separate fresh runs
cannot establish that continuity. Keep port 3100 free for the isolated harness.
The [integration suite](tests/browser/integration.test.mjs) composes the workflow
suites below with cross-screen mutations, native signup/reset links, signin return,
public/authenticated Swagger, member lifecycle, account data clearing and real
server-failure recovery. Local suite results do not establish production email,
HTTPS cookies or deployment readiness.
Select `--suite=record-sheets` for the
[sheet acceptance suite](tests/browser/record-sheets.test.mjs) and
[relation scenarios](tests/browser/record-sheet-relations.test.mjs), or
`--suite=lists` for [list acceptance](tests/browser/lists.test.mjs).
Select `--suite=activities` for [manual activity and task acceptance](tests/browser/activities.test.mjs),
`--suite=fields` for [custom-field acceptance](tests/browser/fields.test.mjs), or
`--suite=overview` for [overview acceptance](tests/browser/overview.test.mjs). The runner's
registry owns available suites; future workflow names are rejected until implemented.
