import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({ entryPoints: ["src/lib/activity-composer-values.ts"], bundle: true, format: "esm", platform: "browser", write: false, metafile: true, logLevel: "silent" });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`;
const values = await import(moduleUrl);
const anchor = { kind: "contact", id: "contact-independent" };
const draft = overrides => ({ ...values.emptyActivityDraft(), body: "Discussion notes", ...overrides });

test("composer payload code has no server service, database or Cloudflare runtime dependency", () => {
  assert.ok(!Object.keys(bundle.metafile.inputs).some(path => /(?:^|\/)(?:services|server)\/|cloudflare:workers|drizzle-orm/.test(path)));
});

test("five manual activity types use only the current record anchor by default", () => {
  assert.deepEqual(values.MANUAL_ACTIVITY_TYPES, ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"]);
  for (const kind of ["company", "contact", "deal"]) for (const type of values.MANUAL_ACTIVITY_TYPES) {
    const input = values.buildActivityCreateInput({ kind, id: "record" }, draft({ type, subject: "  Subject  ", body: "  Notes  " }));
    assert.deepEqual(input, { type, subject: "Subject", body: "Notes", [`${kind}Id`]: "record" });
    assert.equal(Object.hasOwn(input, "occurredAt"), false, "omitted occurrence lets the server choose now");
  }
});

test("explicit independent related links survive and cannot replace the current anchor", () => {
  assert.deepEqual(values.buildActivityCreateInput(anchor, draft(), {
    companyId: "explicit-company", contactId: "different-contact", dealId: "independent-deal",
  }), {
    type: "NOTE", body: "Discussion notes", companyId: "explicit-company", contactId: anchor.id, dealId: "independent-deal",
  });
  const input = values.buildActivityCreateInput(anchor, draft(), { companyId: null, dealId: undefined });
  assert.equal(Object.hasOwn(input, "companyId"), false);
  assert.equal(Object.hasOwn(input, "dealId"), false);
});

test("payload projection ignores actor, system metadata, provider and stamp fields", () => {
  const forbidden = { createdById: "spoof", actorId: "spoof", meta: { generated: true }, completedAt: "2026-01-01", emailThreadId: "thread", calendarEventId: "event", lastActivityAt: "2026-01-01", updatedAt: "2026-01-01" };
  const input = values.buildActivityCreateInput(anchor, draft(forbidden), { ...forbidden, companyId: "explicit" });
  assert.deepEqual(input, { type: "NOTE", body: "Discussion notes", contactId: anchor.id, companyId: "explicit" });
});

test("task requires subject, non-task requires subject or body, and errors identify fields", () => {
  for (const type of values.MANUAL_ACTIVITY_TYPES) {
    assert.throws(() => values.buildActivityCreateInput(anchor, draft({ type, subject: " \n", body: "\t" })), failure => {
      assert.ok(failure instanceof values.ActivityComposerValidationError);
      assert.ok(failure.fields[type === "TASK" ? "subject" : "body"]);
      return true;
    });
  }
  for (const type of ["NOTE", "CALL", "EMAIL", "MEETING"]) {
    assert.equal(values.buildActivityCreateInput(anchor, draft({ type, subject: "Subject only", body: "" })).subject, "Subject only");
    assert.equal(values.buildActivityCreateInput(anchor, draft({ type, subject: "", body: "Body only" })).body, "Body only");
  }
  assert.throws(() => values.buildActivityCreateInput(anchor, draft({ type: "STAGE_CHANGE" })), error => !!error.fields.type);
  assert.throws(() => values.buildActivityCreateInput(anchor, draft({ type: "ENRICHMENT" })), error => !!error.fields.type);
  assert.throws(() => values.buildActivityCreateInput(anchor, draft({ body: "x".repeat(100001) })), error => !!error.fields.body);
  assert.throws(() => values.buildActivityCreateInput(anchor, draft(), { companyId: " " }), error => !!error.fields.companyId);
});

test("task due dates are optional and cannot leak to other types even from a retained draft", () => {
  const task = draft({ type: "TASK", subject: "Follow up", dueAt: "2026-09-15" });
  assert.equal(values.buildActivityCreateInput(anchor, task).dueAt, "2026-09-15T00:00:00.000Z");
  assert.equal(Object.hasOwn(values.buildActivityCreateInput(anchor, { ...task, dueAt: "" }), "dueAt"), false);
  for (const type of ["NOTE", "CALL", "EMAIL", "MEETING"]) {
    assert.equal(Object.hasOwn(values.buildActivityCreateInput(anchor, { ...task, type }), "dueAt"), false);
    assert.equal(Object.hasOwn(values.buildActivityCreateInput(anchor, { ...task, type, dueAt: "invalid hidden date" }), "dueAt"), false);
  }
});

test("invalid calendar, overflowing time and unrecognized date inputs fail with field errors", () => {
  for (const occurredAt of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-00-15", "2026-09-00", "2026-02-30T10:00", "2026-09-15T24:00", "2026-09-15T12:61", "09/15/2026", "2026-09-15T12:00Z"]) {
    assert.throws(() => values.buildActivityCreateInput(anchor, draft({ occurredAt })), failure => !!failure.fields.occurredAt, occurredAt);
  }
  assert.throws(() => values.buildActivityCreateInput(anchor, draft({ type: "TASK", subject: "Follow up", dueAt: "2026-02-29" })), failure => !!failure.fields.dueAt);
  assert.equal(values.activityInputDateToUtc("2028-02-29"), "2028-02-29T00:00:00.000Z");
});

test("date-only stays midnight UTC while datetime-local captures positive and negative offsets", () => {
  for (const [timezone, expected] of [["Asia/Ho_Chi_Minh", "2026-09-15T03:30:00.000Z"], ["America/Los_Angeles", "2026-09-15T17:30:00.000Z"]]) {
    const script = `const values = await import(${JSON.stringify(moduleUrl)});
      console.log(JSON.stringify([values.activityInputDateToUtc("2026-09-15"), values.activityInputDateToUtc("2026-09-15T10:30")]));`;
    const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, TZ: timezone } }));
    assert.deepEqual(result, ["2026-09-15T00:00:00.000Z", expected]);
  }
});

test("local times skipped by daylight saving are rejected rather than silently shifted", () => {
  const script = `const values = await import(${JSON.stringify(moduleUrl)});
    try { values.activityInputDateToUtc("2026-03-08T02:30"); process.exitCode = 1; } catch { console.log("rejected"); }`;
  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", env: { ...process.env, TZ: "America/Los_Angeles" } }).trim(), "rejected");
});

test("draft dirty state preserves typed whitespace and optional dates, and reset keeps selected type", () => {
  assert.equal(values.isActivityDraftDirty(values.emptyActivityDraft("EMAIL")), false);
  assert.equal(values.isActivityDraftDirty({ ...values.emptyActivityDraft(), body: " " }), true);
  assert.equal(values.isActivityDraftDirty({ ...values.emptyActivityDraft(), occurredAt: "2026-09-15" }), true);
  assert.equal(values.isActivityDraftDirty({ ...values.emptyActivityDraft("TASK"), dueAt: "2026-09-15" }), true);
  assert.equal(values.isActivityDraftDirty({ ...values.emptyActivityDraft("NOTE"), dueAt: "2026-09-15" }), false);
  assert.deepEqual(values.emptyActivityDraft("MEETING"), { type: "MEETING", subject: "", body: "", occurredAt: "", dueAt: "" });
});
