# Vinext

<!-- dash-content-start -->

A general-purpose application built with Vinext App Router, Drizzle ORM, and Cloudflare Workers/D1.
The database foundation is available; business services and interactive screens are
still under development. The former SaaS customer/subscription tools and API
endpoints are retired. The application shell provides direct navigation to Overview,
Companies, Contacts, Deals, and Settings, each with an honest availability notice.

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
[desktop sidebar](src/components/app/app-sidebar.tsx). The sidebar follows Cloudflare's
bottom-button expansion control, with no automatic expansion on hover; mobile
navigation remains a separate drawer. Ask AI, Support, and Account are intentionally
disabled placeholders while their capabilities are unavailable. Record workflows
are still under development.

## Routes

| Route | Screen |
| --- | --- |
| `/` | [Overview](src/app/page.tsx) |
| `/companies` | [Companies](src/app/companies/page.tsx) |
| `/contacts` | [Contacts](src/app/contacts/page.tsx) |
| `/deals` | [Deals](src/app/deals/page.tsx) |
| `/settings` | [Settings](src/app/settings/page.tsx) |

These screens use a shared [availability state](src/components/app/app-empty-state.tsx)
and do not yet provide record management or settings controls.
The former `/admin` routes, including customer and subscription detail URLs,
have been removed and return 404.

## Local setup

Install dependencies with `npm install`. The
[initial migration](migrations/0000_initial_schema.sql) replaces the template migration
history with a fresh baseline; it is **not an upgrade or data conversion** for an
existing SaaS database. Back up any existing data before replacing a database.
Keep existing local state and initialize a separate, fresh persistence directory:

```bash
npm run db:migrate -- --persist-to .wrangler/app-local
npm run build
npx wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/app-local
```

Use the same persistence directory for migration and runtime. The default
`npm run start` uses `.wrangler/state`; it will not load the separate database
above. Existing installations that already applied this baseline under its previous
filename must back up their database, confirm the schema matches, and reconcile
the applied migration record to the current filename before running migrations.
Preserve migration history; rerunning the same baseline would attempt duplicate
table creation. Existing persistence directories remain usable at their original paths.

Before deployment, reconcile or provision remote resources to match
[wrangler.jsonc](wrangler.jsonc). The configured Worker, D1 database name, and R2
bucket use neutral application names; the existing `database_id` still identifies
the same target. Editing these names does not rename remote resources. For a fresh
database, set its actual binding ID before applying the baseline; do not apply this
migration to an existing SaaS database as an upgrade.

No API token is needed to view the application shell and availability notices.
[package.json](package.json) owns the `worker-app` package identity and development,
migration, build, and schema-test commands. See the [schema tests](tests/schema.test.mjs)
for executable storage and relation checks and the [type contracts](tests/schema-types.ts)
for nullable relation assertions.

## Storage decisions

The [schema entry point](src/lib/db/schema/index.ts) owns the business model and
relations. Deal `amount` uses integer cents to avoid floating-point money
rounding. Other source decimal fields—`baseAmount`, `fxRate`, and
`fieldValues.number`—retain exact decimal strings in SQLite TEXT columns rather
than losing precision through floating-point conversion. Future services must
handle their numeric comparison, range filtering, sorting, and arithmetic
explicitly; ordinary SQL text ordering is lexical.

User and external-system identifiers remain scalar values without foreign keys
because their source models are outside the current application scope. They preserve integration
references without adding authentication, email, or calendar subsystems.

[Constants](src/lib/db/schema/constants.ts) follow the source model, including
its enrichment and user-field values. The source has no lifecycle-stage field;
future filters must follow the actual schema instead of assuming one exists.
