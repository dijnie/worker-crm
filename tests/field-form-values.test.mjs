import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const result = await build({ entryPoints: ["src/lib/field-form-values.ts"], bundle: true, format: "esm", platform: "browser", write: false, metafile: true });
assert.ok(!Object.keys(result.metafile.inputs).some(path => /(?:^|\/)(?:services|server)\/|drizzle-orm|cloudflare:workers/.test(path)));
const { derivedFieldKey, fieldDateInput, fieldDraft, parseFieldDraft, safeFieldHref, fieldValueText } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);

test("field keys follow server derivation including reserved, Unicode and numeric labels", () => {
  assert.equal(derivedFieldKey("Customer’s Rating"), "customers_rating");
  assert.equal(derivedFieldKey("42 choices"), "f_42_choices");
  assert.equal(derivedFieldKey("Owner ID"), "owner_id");
  assert.equal(derivedFieldKey("OwnerId"), "ownerid_field");
  assert.equal(derivedFieldKey("你好"), "");
  assert.equal(derivedFieldKey("x".repeat(90)).length, 60);
});

test("ten field types preserve their wire values without truthiness or numeric coercion", () => {
  const cases = [ ["TEXT", "  Café 👋  ", "Café 👋"], ["LONG_TEXT", " Line one\n第二行 ", "Line one\n第二行"],
    ["NUMBER", "-90071992547409931234567890.00000000001", "-90071992547409931234567890.00000000001"],
    ["DATE", "2028-02-29", "2028-02-29T00:00:00.000Z"], ["CHECKBOX", false, false], ["SELECT", "option:opaque", "option:opaque"],
    ["URL", "https://example.com/path?q=1", "https://example.com/path?q=1"], ["EMAIL", "person@example.com", "person@example.com"],
    ["PHONE", " +001 0234 ", "+001 0234"], ["USER", "legacy:opaque", "legacy:opaque"] ];
  for (const [type, input, expected] of cases) assert.equal(parseFieldDraft(type, input, true), expected, type);
  assert.equal(parseFieldDraft("NUMBER", "0", true), "0");
  assert.equal(parseFieldDraft("NUMBER", "-0.00"), "-0.00");
  for (const type of cases.map(([type]) => type)) {
    assert.equal(parseFieldDraft(type, null), null);
    assert.throws(() => parseFieldDraft(type, null, true), /required/);
  }
  assert.equal(fieldDraft("CHECKBOX", null), null);
  assert.equal(fieldDraft("CHECKBOX", false), false);
  assert.equal(parseFieldDraft("TEXT", "  "), null);
});

test("date codec is UTC and rejects invalid dates and permissive browser date inputs", () => {
  for (const tz of ["Pacific/Kiritimati", "America/Los_Angeles", "Asia/Ho_Chi_Minh"]) {
    const previous = process.env.TZ; process.env.TZ = tz;
    try { assert.equal(fieldDateInput(parseFieldDraft("DATE", "2026-09-13")), "2026-09-13"); }
    finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  }
  for (const value of ["2027-02-29", "2026-04-31", "2026-13-01", "2026-09-13T12:00:00Z", "9/13/2026"]) assert.throws(() => parseFieldDraft("DATE", value));
  assert.equal(fieldDateInput("2026-09-13T23:00:00-07:00"), "2026-09-14");
});

test("invalid decimal, link and length drafts are rejected without changing input", () => {
  for (const input of ["1e8", "+5", ".5", "NaN", "1,000", "1.", "9".repeat(201)]) assert.throws(() => parseFieldDraft("NUMBER", input));
  for (const input of ["javascript:alert(1)", "data:text/html,bad", "https://", "ftp://example.com"]) assert.throws(() => parseFieldDraft("URL", input));
  assert.throws(() => parseFieldDraft("EMAIL", "bad@"));
  assert.throws(() => parseFieldDraft("PHONE", "x".repeat(1001)));
  assert.throws(() => parseFieldDraft("CHECKBOX", "false"));
});

test("safe display preserves retired IDs, false, decimals and blocks unsafe link protocols", () => {
  const definition = { type: "SELECT", options: [{ id: "old", label: "Former plan", archivedAt: "2026-01-01" }] };
  assert.equal(fieldValueText(definition, "old"), "Former plan (retired)");
  assert.match(fieldValueText(definition, "missing"), /missing/);
  assert.equal(fieldValueText({ ...definition, type: "CHECKBOX" }, false), "No");
  assert.equal(fieldValueText({ ...definition, type: "CHECKBOX" }, null), "Not set");
  assert.equal(fieldValueText({ ...definition, type: "NUMBER" }, "90071992547409930.000001"), "90071992547409930.000001");
  assert.match(fieldValueText({ ...definition, type: "USER" }, "former-user"), /former-user/);
  assert.equal(fieldValueText({ ...definition, type: "USER" }, "active-user", "Active member"), "Active member");
  assert.equal(safeFieldHref("URL", "javascript:alert(1)"), undefined);
  assert.equal(safeFieldHref("URL", "https://example.com\n"), undefined);
  assert.equal(safeFieldHref("EMAIL", "a@example.com?subject=injected"), undefined);
  assert.equal(safeFieldHref("EMAIL", "a+b@example.com"), "mailto:a%2Bb@example.com");
});

test("value display escapes historical content and uses safe URL/mail anchors", async () => {
  const bundle = await build({ stdin: { contents: `import { createElement } from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { FieldValueDisplay } from "./src/components/app/fields/field-value-display";
    export const render = (type, value) => renderToStaticMarkup(createElement(FieldValueDisplay, { definition: {type, options: []}, value }));`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, format: "esm", platform: "browser", jsx: "automatic", write: false, metafile: true,
    plugins: [{ name: "react-external", setup(build) { build.onResolve({ filter: /^react(?:\/.*)?$|^react-dom(?:\/.*)?$/ }, args => ({ path: import.meta.resolve(args.path), external: true })); } }] });
  assert.ok(!Object.keys(bundle.metafile.inputs).some(path => /(?:^|\/)(?:services|server)\/|drizzle-orm/.test(path)));
  const { render } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const html = render("LONG_TEXT", "<img src=x onerror=alert(1)>\nsecond line");
  assert.ok(html.includes("&lt;img")); assert.ok(!html.includes("<img")); assert.ok(html.includes("\nsecond line"));
  assert.ok(!render("URL", "javascript:alert(1)").includes("href="));
  assert.ok(render("URL", "https://example.com").includes('rel="noopener noreferrer"'));
  assert.ok(render("URL", "https://example.com").includes('target="_blank"'));
  assert.ok(render("EMAIL", "test@example.com").includes('href="mailto:test@example.com"'));
  assert.ok(render("CHECKBOX", false).includes("No"));
  assert.ok(render("NUMBER", "0").includes(">0<"));
});
