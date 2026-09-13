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
const navigation = await module(
  "src/components/app/record-sheet/record-navigation.ts",
);
const query = await module("src/components/app/data-table/table-query.ts");
test("record URL grammar round trips punctuation, keeps last duplicates and preserves unrelated query", () => {
  const refs = [
    { kind: "company", id: "ACME:a,b &/+?" },
    { kind: "contact", id: "c:2" },
  ];
  const encoded = navigation.serializeRecordStack(
    refs,
    new URLSearchParams(
      "q=sales&currency=USD&record-tab=notes&record-view=x&record-add=1",
    ),
  );
  assert.deepEqual(navigation.parseRecordStack(encoded), refs);
  assert.equal(encoded.get("q"), "sales");
  assert.equal(encoded.get("currency"), "USD");
  assert.equal(encoded.has("record-tab"), false);
  assert.equal(encoded.has("record-view"), false);
  assert.equal(encoded.has("record-add"), false);
  assert.deepEqual(
    navigation.parseRecordStack(
      "record=company:a&record=contact:b&record=company:a",
    ),
    [
      { kind: "contact", id: "b" },
      { kind: "company", id: "a" },
    ],
  );
  assert.equal(
    navigation.buildRecordUrl(
      "https://crm.test/companies?q=x#table",
      { kind: "company", id: "a" },
      "https://crm.test",
    ),
    "/companies?q=x&record=company%3Aa#table",
  );
  assert.throws(
    () =>
      navigation.buildRecordUrl(
        "https://evil.test/companies",
        { kind: "company", id: "a" },
        "https://crm.test",
      ),
    navigation.RecordLinkError,
  );
});
test("record grammar rejects malformed kinds, IDs and excessive depth with recoverable errors", () => {
  for (const value of [
    "record=company",
    "record=company:",
    "record=company:%20",
    "record=other:a",
    "record=company:%",
    "record=company:%E0%A4",
    "record=company:%ZZ",
    `record=company:${"x".repeat(201)}`,
    Array.from({ length: 11 }, (_, i) => `record=company:${i}`).join("&"),
  ])
    assert.throws(
      () => navigation.parseRecordStack(value),
      navigation.RecordLinkError,
    );
  assert.equal(
    navigation.parseRecordStack(`record=company:${"x".repeat(200)}`)[0].id
      .length,
    200,
  );
  assert.deepEqual(navigation.parseRecordStack("q=sales"), []);
});
test("first open pushes; nested, duplicate, pop and close replace while preserving table state", () => {
  const writes = [];
  let href = "https://crm.test/companies?q=sales&record-tab=old";
  globalThis.window = {
    location: {
      get href() {
        return href;
      },
      get origin() {
        return new URL(href).origin;
      },
      get search() {
        return new URL(href).search;
      },
    },
    history: {
      pushState(_state, _title, url) {
        writes.push("push");
        href = new URL(url, href).href;
      },
      replaceState(_state, _title, url) {
        writes.push("replace");
        href = new URL(url, href).href;
      },
    },
    dispatchEvent() {},
  };
  globalThis.PopStateEvent = class {
    constructor(type) {
      this.type = type;
    }
  };
  try {
    navigation.openRecord({ kind: "company", id: "a" });
    navigation.openRecord({ kind: "contact", id: "b" });
    navigation.openRecord({ kind: "company", id: "a" });
    navigation.writeRecordStack([{ kind: "contact", id: "b" }]);
    navigation.writeRecordStack([]);
    assert.deepEqual(writes, [
      "push",
      "replace",
      "replace",
      "replace",
      "replace",
    ]);
    assert.equal(new URL(href).searchParams.get("q"), "sales");
    assert.equal(new URL(href).searchParams.has("record"), false);
  } finally {
    delete globalThis.window;
    delete globalThis.PopStateEvent;
  }
});
test("table codecs validate entity facets and omit browser record stack from API queries", () => {
  const state = query.parseTableQuery(
    "deal",
    "q=real&record=company:a&record=deal:b&currency=eur&filters=%7B%22status%22%3A%5B%22open%22%5D%7D&page=2&limit=50",
  );
  assert.equal(state.currency, "EUR");
  assert.deepEqual(state.filters, { status: ["open"] });
  assert.equal(query.tableQueryToApi(state).search, "real");
  assert.equal("record" in query.tableQueryToApi(state), false);
  const url = query.tableQueryUrl(
    "/deals?record=company:a&record=deal:b&custom=keep",
    state,
  );
  const params = new URL(url, "https://crm.test").searchParams;
  assert.equal(params.getAll("record").length, 2);
  assert.equal(params.get("custom"), "keep");
  assert.equal(query.parseTableQuery("deal", params.toString()).page, 2);
  for (const value of [
    "filters=broken",
    "sort=amount",
    "filters=%7B%22field%3A%22%3A%5B%22v%22%5D%7D",
    "page=1&page=2",
    "archived=maybe",
  ])
    assert.throws(() => query.parseTableQuery("company", value));
  const custom = query.parseTableQuery("company", "filters=%7B%22field%3Ax%22%3A%5B%22v%22%5D%7D");
  assert.deepEqual(query.tableQueryToApi(custom).filters, { "field:x": ["v"] });
  assert.deepEqual(query.savedConfiguration(custom).filters, { "field:x": ["v"] });
  assert.deepEqual(Object.keys(query.savedConfiguration(state)).sort(), [
    "archived",
    "dir",
    "filters",
    "q",
    "sort",
  ]);
});

test("mounted host can defer an opener before the URL or stack changes", () => {
  let action;
  globalThis.window = {
    dispatchEvent(event) {
      assert.equal(event.type, navigation.RECORD_OPEN_EVENT);
      assert.equal(event.cancelable, true);
      action = event.detail;
      event.preventDefault();
      return false;
    },
    get location() { throw new Error("Navigation must wait for the draft decision"); },
  };
  try {
    navigation.openRecord({ kind: "company", id: "deferred" });
    assert.equal(typeof action, "function");
  } finally { delete globalThis.window; }
});
