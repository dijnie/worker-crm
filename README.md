# Worker CRM

<!-- dash-content-start -->

A CRM port built with Vinext App Router, Drizzle ORM, and Cloudflare Workers/D1.
The database foundation is available; CRM services and interactive screens are
still under development. The former SaaS customer/subscription tools and API
endpoints are retired. Existing admin URLs display a
[transition notice](src/components/admin/crm-transition.tsx).

<!-- dash-content-end -->

## Local setup

Install dependencies with `npm install`. The
[CRM migration](migrations/0000_crm_schema.sql) replaces the template migration
history with a fresh baseline; it is **not an upgrade or data conversion** for an
existing SaaS database. Back up any existing data before replacing a database.
Keep existing local state and initialize a separate, fresh persistence directory:

```bash
npm run db:migrate -- --persist-to .wrangler/crm-local
npm run build
npx wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/crm-local
```

Use the same persistence directory for migration and runtime. The default
`npm run start` uses `.wrangler/state`; it will not load the separate database
above. For deployment, provision a fresh D1 database and update its binding in
[wrangler.jsonc](wrangler.jsonc) before applying this baseline. Do not apply it to
an existing SaaS database as an upgrade.

No API token is needed to view the transition pages. See
[package.json](package.json) for development, migration, build, and schema-test
commands, and [the schema tests](tests/crm-schema.test.mjs) for executable storage
and relation checks.

## Storage decisions

The [schema entry point](src/lib/db/schema/index.ts) owns the CRM model and
relations. Deal `amount` uses integer cents to avoid floating-point money
rounding. Other source decimal fields—`baseAmount`, `fxRate`, and
`fieldValues.number`—retain exact decimal strings in SQLite TEXT columns rather
than losing precision through floating-point conversion. Future services must
handle their numeric comparison, range filtering, sorting, and arithmetic
explicitly; ordinary SQL text ordering is lexical.

User and external-system identifiers remain scalar values without foreign keys
because their source models are outside this CRM port. They preserve integration
references without adding authentication, email, or calendar subsystems.

[Constants](src/lib/db/schema/constants.ts) follow the source model, including
its enrichment and user-field values. The source has no lifecycle-stage field;
future filters must follow the actual schema instead of assuming one exists.
