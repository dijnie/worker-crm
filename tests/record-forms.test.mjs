import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
async function module(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    logLevel: "silent",
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
}
const forms = await module("src/components/app/records/form-values.ts");
const { runBulkOperation } = await module(
  "src/components/app/records/bulk-operations.ts",
);
test("complete create drafts retain manual fields and exact money, deliberately omit blanks and stage", () => {
  const company = Object.fromEntries(
    forms.COMPANY_FIELDS.map((key) => [
      key,
      key === "email" ? "a@example.test" : ` ${key} `,
    ]),
  );
  assert.deepEqual(
    Object.keys(forms.buildCreateInput("company", company)),
    forms.COMPANY_FIELDS,
  );
  const contact = Object.fromEntries(
    forms.CONTACT_FIELDS.map((key) => [
      key,
      key === "email" ? "a@example.test" : key,
    ]),
  );
  assert.deepEqual(
    Object.keys(forms.buildCreateInput("contact", contact)),
    forms.CONTACT_FIELDS,
  );
  const deal = forms.buildCreateInput("deal", {
    name: " Exact ",
    companyId: "c",
    ownerId: "o",
    amount: "90071992547409.01",
    currency: "usd",
    expectedCloseDate: "2026-03-08",
    description: "Details",
    stage: "CLOSED_WON",
  });
  assert.equal(deal.amount, "90071992547409.01");
  assert.equal(deal.currency, "USD");
  assert.equal(deal.expectedCloseDate, "2026-03-08T00:00:00.000Z");
  assert.equal("stage" in deal, false);
  assert.deepEqual(
    forms.buildCreateInput("company", {
      name: "Acme",
      website: "",
      domain: "",
    }),
    { name: "Acme" },
  );
  assert.equal(
    forms.inputDateToUtc("2026-03-08T15:30:00+07:00"),
    "2026-03-08T08:30:00.000Z",
  );
});
test("obvious invalid drafts fail before submission and date normalization preserves intended days", () => {
  for (const amount of ["-1", "1.234", "1e3", "NaN", "1,000"])
    assert.throws(() =>
      forms.buildCreateInput("deal", {
        name: "Deal",
        companyId: "c",
        ownerId: "o",
        amount,
      }),
    );
  assert.throws(() => forms.buildCreateInput("contact", { firstName: " " }));
  assert.throws(() =>
    forms.buildCreateInput("deal", { name: "Deal", ownerId: "o" }),
  );
  assert.throws(() =>
    forms.buildCreateInput("company", { name: "Acme", email: "broken" }),
  );
  assert.throws(() => forms.inputDateToUtc("2026-02-30"));
});
test("bulk operations cap concurrency, deduplicate and preserve ordered partial outcomes", async () => {
  let active = 0,
    max = 0;
  const called = [];
  const outcome = await runBulkOperation(
    ["a", "b", "a", "c", "d", "e"],
    async (id) => {
      called.push(id);
      active++;
      max = Math.max(max, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (id === "c")
        throw Object.assign(new Error("Conflict"), { status: 409 });
    },
  );
  assert.equal(max, 4);
  assert.equal(called.filter((id) => id === "a").length, 1);
  assert.deepEqual(
    outcome.map((item) => item.id),
    ["a", "b", "c", "d", "e"],
  );
  assert.deepEqual(outcome[2], {
    id: "c",
    ok: false,
    error: "Conflict",
    status: 409,
  });
  assert.equal(outcome.filter((item) => item.ok).length, 4);
  await assert.rejects(() =>
    runBulkOperation(
      Array.from({ length: 101 }, (_, index) => String(index)),
      async () => {},
    ),
  );
});
test("bulk stops scheduling after access loss and returns an outcome for every selected record", async () => {
  let current = true;
  const called = [];
  const outcome = await runBulkOperation(
    ["a", "b", "c", "d", "e", "f", "g"],
    async (id) => {
      called.push(id);
      if (id === "a") {
        current = false;
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }
    },
    { isCurrent: () => current },
  );
  assert.equal(called.length, 1);
  assert.equal(outcome.length, 7);
  assert.equal(
    outcome.every((item) => !item.ok),
    true,
  );
  assert.match(outcome[6].error, /access changed/);
});
