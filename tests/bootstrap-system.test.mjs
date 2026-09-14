import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { bootstrapSql, parseArguments } from '../scripts/bootstrap-system.mjs';

test('system bootstrap requires an explicit local account and defaults to inspection', () => {
  assert.deepEqual(parseArguments(['--user-id', 'chosen']), { apply: false, userId: 'chosen', help: false });
  assert.equal(parseArguments(['--user-id', 'chosen', '--apply']).apply, true);
  assert.equal(parseArguments(['--help']).help, true);
  for (const args of [[], ['--apply'], ['--user-id'], ['--user-id', '--apply'], ['--user-id', 'chosen', '--remote'], ['--user-id', 'chosen', '--apply', '--apply']]) assert.throws(() => parseArguments(args));
});

test('bootstrap promotes only one explicitly selected verified active roleless account', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const filename of (await readdir(new URL('../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) db.exec(await readFile(new URL(`../migrations/${filename}`, import.meta.url), 'utf8'));
    for (const id of ['first', "chosen'account", 'revoked']) {
      db.prepare('INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)').run(id,id,`${id}@example.test`);
      db.prepare('INSERT INTO singleton_membership(user_id,role_id,status,created_at,updated_at) VALUES(?,NULL,?,1000,1000)').run(id,id==='revoked'?'revoked':'active');
    }
    db.exec(bootstrapSql('missing'));
    db.exec(bootstrapSql('revoked'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM singleton_membership WHERE role_id IS NOT NULL').get().n, 0);
    db.exec(bootstrapSql("chosen'account"));
    assert.equal(db.prepare('SELECT role_id FROM singleton_membership WHERE user_id=?').get("chosen'account").role_id,'system');
    assert.equal(db.prepare('SELECT revision FROM singleton_membership WHERE user_id=?').get("chosen'account").revision,1);
    db.exec(bootstrapSql('first'));
    db.exec(bootstrapSql("chosen'account"));
    assert.equal(db.prepare('SELECT role_id FROM singleton_membership WHERE user_id=?').get('first').role_id,null);
    assert.equal(db.prepare('SELECT revision FROM singleton_membership WHERE user_id=?').get("chosen'account").revision,1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM singleton_membership WHERE role_id IS NOT NULL').get().n,1);
  } finally { db.close(); }
});
