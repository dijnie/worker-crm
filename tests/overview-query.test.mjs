import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/lib/overview-query.ts"], bundle: true, format: "esm", platform: "browser", write: false, metafile: true, logLevel: "silent" });
assert.ok(!Object.keys(bundle.metafile.inputs).some(path => /(?:^|\/)(?:services|server)\/|cloudflare:workers|drizzle-orm/.test(path)), "overview URL parsing stays browser safe");
const { overviewCurrencyUrl, parseOverviewCurrency } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("overview currency uses the stored reporting currency only when absent and normalizes three-letter codes", () => {
  assert.equal(parseOverviewCurrency("?record=company:one&q=deal", "EUR"), "EUR");
  assert.equal(parseOverviewCurrency("", "VND"), "VND");
  assert.equal(parseOverviewCurrency("?currency=eur", "VND"), "EUR");
  assert.equal(parseOverviewCurrency("?currency=%20vnd%20", "USD"), "VND");
  for (const search of ["?currency=", "?currency=EU", "?currency=USDD", "?currency=123", "?currency=USD&currency=EUR", "?currency=USD&currency=USD"]) {
    assert.throws(() => parseOverviewCurrency(search, "USD"));
  }
});

test("currency navigation preserves the complete record stack, list state, unrelated parameters and fragment", () => {
  const original = "/?record=company%3Aone&record=contact%3Atwo&record-tab=activity&q=long+search&filters=%7B%22owner%22%3A%5B%22one%22%5D%7D&page=3&view=saved&currency=USD&custom=retained#activity";
  const before = new URL(original, "https://crm.example");
  const after = new URL(overviewCurrencyUrl(original, "eur"), before);
  assert.equal(after.pathname, before.pathname);
  assert.equal(after.hash, before.hash);
  assert.equal(after.searchParams.get("currency"), "EUR");
  before.searchParams.delete("currency"); after.searchParams.delete("currency");
  assert.deepEqual([...after.searchParams], [...before.searchParams]);
  assert.deepEqual(after.searchParams.getAll("record"), ["company:one", "contact:two"]);
});

test("valid selection repairs duplicate currency parameters but rejects invalid draft values", () => {
  const next = overviewCurrencyUrl("/?currency=USD&currency=EUR&record=deal:one", "GBP");
  assert.deepEqual(new URL(next, "https://crm.example").searchParams.getAll("currency"), ["GBP"]);
  assert.equal(parseOverviewCurrency(next.slice(next.indexOf("?")), "USD"), "GBP");
  for (const draft of ["", "US", "EURO", "1$2"]) assert.throws(() => overviewCurrencyUrl("/?currency=USD", draft));
});
