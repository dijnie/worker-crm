import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

async function bundled(options) {
  const result = await build({ bundle: true, format: "esm", platform: "browser", write: false, logLevel: "silent", metafile: true, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, ...options });
  assert.ok(!Object.keys(result.metafile.inputs).some(path => /(?:^|\/)(?:services|server)\/|cloudflare:workers|drizzle-orm/.test(path)), "client presentation must not pull in server services or database runtime");
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}
const presentation = await bundled({ entryPoints: ["src/lib/activity-presentation.ts"] });
const row = (id, occurredAt, overrides = {}) => ({
  id, type: "NOTE", subject: null, body: null, occurredAt,
  createdAt: "2026-09-13T10:00:00Z", updatedAt: "2026-09-13T10:00:00Z",
  dueAt: null, completedAt: null, createdById: "former-member", meta: null,
  companyId: "company", contactId: null, dealId: null,
  emailThreadId: null, calendarEventId: null, ...overrides,
});

test("all seven types have exhaustive distinct presentation labels", () => {
  assert.deepEqual(Object.keys(presentation.ACTIVITY_PRESENTATION).sort(), ["CALL", "EMAIL", "ENRICHMENT", "MEETING", "NOTE", "STAGE_CHANGE", "TASK"]);
  assert.equal(new Set(Object.values(presentation.ACTIVITY_PRESENTATION).map(value => value.icon)).size, 7);
});

test("timeline dates interpret SQLite timestamps as UTC and recover missing or invalid occurrence dates", () => {
  assert.equal(presentation.activityDate("2026-09-13 12:30:01").toISOString(), "2026-09-13T12:30:01.000Z");
  assert.equal(presentation.activityDate("2026-09-13T12:30:01+07:00").toISOString(), "2026-09-13T05:30:01.000Z");
  assert.equal(presentation.activityDate("bad"), null);
  assert.equal(presentation.activityOccurredAt(row("a", "bad")).toISOString(), "2026-09-13T10:00:00.000Z");
  assert.equal(presentation.activityOccurredAt(row("a", null, { createdAt: "bad" })), null);
});

test("day groups preserve server creation order even when occurrence days are nonmonotonic", () => {
  const rows = [row("a", "2026-09-13T08:00:00Z"), row("b", "2026-09-11T08:00:00Z"), row("c", "2026-09-13T08:00:00Z"), row("d", "2026-09-13T08:01:00Z")];
  const groups = presentation.groupActivityDays(rows);
  assert.deepEqual(groups.map(group => group.items.map(item => item.id)), [["a"], ["b"], ["c", "d"]]);
  assert.equal(new Set(groups.map(group => group.key)).size, groups.length);
  assert.deepEqual(groups.flatMap(group => group.items), rows);
});

test("pinned deduplication excludes only visible IDs and preserves raw server totals and input", () => {
  const rows = [row("shown", null), row("unloaded-task", null, { type: "TASK" }), row("note", null), row("note", null)];
  const visible = presentation.uniqueVisibleActivities(rows, new Set(["shown"]));
  assert.deepEqual(visible.map(value => value.id), ["unloaded-task", "note"]);
  assert.equal(rows.length, 4);
});

test("stage metadata requires both actual deal stages and keeps unknown metadata readable", () => {
  assert.deepEqual(presentation.activityStageTransition({ from: "DEMO_BOOKED", to: "CLOSED_WON" }), { from: "DEMO_BOOKED", to: "CLOSED_WON" });
  for (const meta of [null, [], "bad", { from: "FAKE", to: "CLOSED_WON" }, { from: "CLOSED_LOST" }, { from: "DEMO_BOOKED", to: 1 }]) assert.equal(presentation.activityStageTransition(meta), null);
  assert.equal(presentation.activityMetadataText({ provider: "legacy", html: "<script>unsafe</script>" }), '{\n  "provider": "legacy",\n  "html": "<script>unsafe</script>"\n}');
});

test("tasks use one explicit instant and distinguish completed, overdue, future and undated", () => {
  const now = new Date("2026-09-13T12:00:00Z");
  const task = overrides => presentation.activityTaskState({ dueAt: null, completedAt: null, ...overrides }, now);
  assert.equal(task({ dueAt: "2026-09-12T12:00:00Z" }).label, "Overdue");
  assert.equal(task({ dueAt: "2026-09-14T12:00:00Z" }).label, "Due");
  assert.equal(task({ dueAt: "2026-09-13T12:00:00Z" }).overdue, false);
  assert.equal(task({}).label, "No due date");
  assert.equal(task({ dueAt: "bad" }).label, "Due date unavailable");
  assert.equal(task({ dueAt: "2026-09-12T12:00:00Z", completedAt: "2026-09-13T11:00:00Z" }).label, "Completed");
});

test("actor attribution resolves stored IDs, never substitutes the viewer, and preserves independent record anchors", () => {
  const directory = [{ id: "actor", name: "Historical author" }, { id: "viewer", name: "Current viewer" }];
  assert.equal(presentation.activityActorLabel("actor", directory), "Historical author");
  assert.equal(presentation.activityActorLabel("removed", directory), "Unavailable / historical actor (removed)");
  for (const kind of ["company", "contact", "deal"]) assert.deepEqual(presentation.activityAnchor({ kind, id: "independent" }), { [`${kind}Id`]: "independent" });
  assert.deepEqual(presentation.activityRecordLinks({ companyId: "a", contactId: "b", dealId: "c" }), [{ kind: "company", id: "a" }, { kind: "contact", id: "b" }, { kind: "deal", id: "c" }]);
});

test("timeline entry renders safe historical content with deletion for every type and completion only for tasks", async () => {
  const renderer = await bundled({ stdin: { contents: `import { createElement } from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { TimelineEntry } from "./src/components/app/timeline/timeline-entry";
    import { AppDataProvider } from "./src/components/app/app-data-provider";
    export function render(activity) { return renderToStaticMarkup(createElement(AppDataProvider, {account:{id:"viewer",name:"Viewer",role:{id:"system",name:"System",isSystem:true,revision:0},roleId:"system",permissions:[],membershipRevision:0}}, createElement(TimelineEntry, {activity, now:new Date("2026-09-13T12:00:00Z"), directory:[], record:{kind:"company",id:"company"}, onResult:()=>{}}))); }`, resolveDir: process.cwd(), loader: "tsx" }, plugins: [{ name: "native-react-renderer", setup(build) { build.onResolve({ filter: /^react(?:\/.*)?$|^react-dom(?:\/.*)?$/ }, args => ({ path: import.meta.resolve(args.path), external: true })); } }] });
  for (const [type, value] of Object.entries(presentation.ACTIVITY_PRESENTATION)) {
    const html = renderer.render(row(type, null, { type, body: "<img src=x onerror=alert(1)>", meta: { from: "DEMO_BOOKED", to: "CLOSED_WON" }, emailThreadId: "javascript:alert(1)", contactId: "external-contact" }));
    assert.ok(html.includes(value.label));
    assert.ok(html.includes("&lt;img"));
    assert.ok(!html.includes("<img src=x"));
    assert.ok(html.includes("Unavailable / historical actor (former-member)"));
    assert.ok(html.includes("external-contact"));
    assert.ok(!html.includes('href="javascript:'));
    assert.ok(html.includes("Delete activity"));
    assert.equal(html.includes("Complete task"), type === "TASK");
  }
});
