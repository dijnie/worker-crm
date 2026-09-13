import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const bundle = await build({ entryPoints: ["src/components/app/record-sheet/property-values.ts"], bundle: true, format: "esm", platform: "browser", write: false, logLevel: "silent" });
const { parseProperty, safePropertyHref, fieldsFor } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
test("manual property allowlists reject stage, closure, enrichment and unknown writes", () => {
  assert.equal(fieldsFor("company").length, 13);
  assert.equal(fieldsFor("contact").length, 10);
  assert.equal(fieldsFor("deal").length, 7);
  for (const field of ["stage", "closedAt", "closedReason", "baseAmount", "enrichmentStatus", "unexpected"])
    assert.throws(() => parseProperty("deal", field, "x"), /read-only/);
});
test("property edits normalize identities and text without coupling independent relations", () => {
  assert.equal(parseProperty("company", "domain", " HTTPS://WWW.Example.COM/path "), "example.com");
  assert.equal(parseProperty("contact", "email", " PERSON@Example.COM "), "person@example.com");
  assert.equal(parseProperty("company", "primaryContactId", " external-contact "), "external-contact");
  assert.equal(parseProperty("contact", "companyId", ""), null);
  assert.equal(parseProperty("company", "ownerId", "former-user"), "former-user");
  assert.equal(parseProperty("company", "description", " "), null);
  assert.throws(() => parseProperty("company", "domain", "localhost"));
  assert.throws(() => parseProperty("contact", "email", "invalid"));
  assert.throws(() => parseProperty("company", "name", " "));
  assert.throws(() => parseProperty("contact", "firstName", "x".repeat(1001)));
  assert.throws(() => parseProperty("company", "description", "x".repeat(100001)));
  assert.throws(() => parseProperty("contact", "ownerId", "x".repeat(201)));
  assert.throws(() => parseProperty("deal", "ownerId", ""));
  assert.throws(() => parseProperty("deal", "companyId", ""));
});
test("amount updates keep exact safe cents and reject unsupported values", () => {
  assert.equal(parseProperty("deal", "amount", "90071992547409.91"), "90071992547409.91");
  assert.equal(parseProperty("deal", "amount", "000012.30"), "000012.30");
  assert.equal(parseProperty("deal", "amount", "0"), "0");
  assert.equal(parseProperty("deal", "amount", ""), null);
  for (const value of ["90071992547409.92", "-1", "1.001", "NaN", "1e2", "1,000", "Infinity", "1".repeat(201)])
    assert.throws(() => parseProperty("deal", "amount", value));
  assert.equal(parseProperty("deal", "currency", " usd "), "USD");
  assert.throws(() => parseProperty("deal", "currency", "US"));
});
test("date-only updates preserve intended UTC day and permit explicit clearing", () => {
  assert.equal(parseProperty("deal", "expectedCloseDate", "2026-03-08"), "2026-03-08T00:00:00.000Z");
  assert.equal(parseProperty("deal", "expectedCloseDate", ""), null);
  assert.throws(() => parseProperty("deal", "expectedCloseDate", "2026-02-30"));
});
test("stored links only navigate to HTTP or HTTPS and remain text otherwise", () => {
  assert.equal(safePropertyHref("https://example.com/path"), "https://example.com/path");
  assert.equal(safePropertyHref("http://example.com"), "http://example.com/");
  for (const value of ["javascript:alert(1)", "data:text/html,Hi", "file:///tmp/x", "//example.com", "not a URL"])
    assert.equal(safePropertyHref(value), undefined);
});
