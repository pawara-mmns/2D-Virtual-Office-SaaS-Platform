import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { bootstrapAdmin, adminLogin, beginEnrollment, completeAdminMfa, lookupAdminSession } from '../apps/web/src/features/platform-admin/auth-service.ts';
import { randomToken, totp } from '../apps/web/src/features/platform-admin/crypto.ts';

test('proposed hosted identity-only SQL supports independent password/MFA sessions without Auth or tenant tables', async () => {
  const pg = new PGlite(), password = randomToken(), key = randomBytes(32).toString('hex');
  const db = { query: (sql, values) => pg.query(sql, values), transaction: work => pg.transaction(tx => work(tx)) };
  try {
    await pg.exec('create role anon nologin; create role authenticated nologin;');
    await pg.exec(readFileSync(new URL('sql/platform-admin-hosted-identity.sql', import.meta.url), 'utf8'));
    const provisioned = await pg.exec(readFileSync(new URL('sql/platform-admin-hosted-runtime.sql', import.meta.url), 'utf8'));
    assert.equal(typeof provisioned.at(-1).rows[0].runtime_password, 'string');
    const role = (await pg.query("select rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,rolcanlogin from pg_roles where rolname='platform_admin_hosted'")).rows[0];
    assert.deepEqual(role, { rolsuper:false, rolbypassrls:false, rolcreatedb:false, rolcreaterole:false, rolreplication:false, rolcanlogin:true });
    assert.equal((await pg.query("select to_regnamespace('auth') is null absent")).rows[0].absent, true);
    assert.equal((await pg.query("select count(*)::int count from pg_tables where schemaname='public'")).rows[0].count, 0);
    await pg.exec('set role platform_admin_hosted');
    await bootstrapAdmin(db, 'hosted.fixture', password, randomUUID());
    const pending = await adminLogin(db, 'hosted.fixture', password, randomUUID());
    assert.equal(await lookupAdminSession(db, pending), null);
    const session = await lookupAdminSession(db, pending, true);
    const enrolled = await beginEnrollment(db, session, key, randomUUID());
    const token = await completeAdminMfa(db, session, totp(enrolled.secret, Math.floor(Date.now() / 30000)), null, key, randomUUID());
    assert.equal((await lookupAdminSession(db, token)).mfa, true);
    assert.equal(await lookupAdminSession(db, pending, true), null);
    await db.query(`insert into platform_private.platform_admin_audit_logs(admin_id,action,target_type,target_id,result,request_id,changes)
      values($1,'admin.identity_migrated','administrator',$2,'success',$3,$4::jsonb)`,
      [session.adminId, session.adminId, randomUUID(), JSON.stringify({ passwordHashPreserved:true, encryptedMfaPreserved:true, priorSessionsCopied:false })]);
    await assert.rejects(db.query('delete from platform_private.platform_admin_audit_logs'), /permission denied/);
    await pg.exec('reset role; set role authenticated');
    await assert.rejects(db.query('select * from platform_private.platform_admins'), /permission denied/);
  } finally { await pg.close(); }
});
