import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { fixtureId as uid, installFixture } from './platform-admin-fixture.mjs';
import { adminLogin, beginEnrollment, bootstrapAdmin, completeAdminMfa, lookupAdminSession, revokeAdminSessions, changeAdminPassword } from '../apps/web/src/features/platform-admin/auth-service.ts';
import { adminDashboard, adminDetail, adminDirectory, adminMembershipService, adminOfficesService, adminOrganizationsService, adminProfileService, adminSettingsService } from '../apps/web/src/features/platform-admin/admin-service.ts';
import { digest, randomToken, totp } from '../apps/web/src/features/platform-admin/crypto.ts';
import { defaultEnvironment } from '../packages/shared/src/environment/catalog.ts';
import { readFileSync } from 'node:fs';
import { preparePolicySql } from './test-organizations.mjs';

test('isolated PostgreSQL: admin auth, tenant administration, private grants and normal-user regression', { timeout: 120000 }, async t => {
  const pg = new PGlite(), password = randomToken(), key = randomBytes(32).toString('hex');
  const db = { query: (sql, values) => pg.query(sql, values), transaction: work => pg.transaction(tx => work(tx)) };
  let session, token, secret, ctx, org, office;
  const rid = () => randomUUID();
  try {
    await installFixture(pg);
    await pg.exec('set role platform_admin_runtime');
    await t.test('bootstrap is private, unique, hashed and MFA-gated', async () => {
      await bootstrapAdmin(db, 'admin@example.com', password);
      await assert.rejects(bootstrapAdmin(db, 'fixture.duplicate', randomToken()), /already complete/);
      const row = (await db.query('select password_hash,mfa_enrolled_at from platform_private.platform_admins')).rows[0];
      assert.notEqual(row.password_hash, password); assert.match(row.password_hash, /^\$argon2id/); assert.equal(row.mfa_enrolled_at, null);
      token = await adminLogin(db, 'admin@example.com', password, rid()); session = await lookupAdminSession(db, token, true);
      assert.equal(await lookupAdminSession(db, token), null);
      assert.equal(await lookupAdminSession(db, 'sb-ordinary-user-session'), null);
    });
    await t.test('invalid passwords are denied and successful login requires enrollment plus TOTP', async () => {
      await assert.rejects(adminLogin(db, 'admin@example.com', randomToken(), rid()), /Credentials/);
      const enrollment = await beginEnrollment(db, session, key, rid()); secret = enrollment.secret;
      assert.ok(enrollment.uri.startsWith('otpauth://'));
      await assert.rejects(completeAdminMfa(db, session, 'wrong', null, key, rid()), /Verification/);
      token = await completeAdminMfa(db, session, totp(secret, Math.floor(Date.now()/30000)), null, key, rid());
      assert.equal(await lookupAdminSession(db, token, true).then(s => s.mfa), true);
      assert.equal(await lookupAdminSession(db, session.sessionHash), null);
      session = await lookupAdminSession(db, token); ctx = { session, requestId: rid() };
      const raw = (await db.query('select token_hash from platform_private.platform_admin_sessions')).rows;
      assert.equal(raw.some(s => s.token_hash === token), false); assert.ok(raw.some(s => s.token_hash === digest(token)));
      await assert.rejects(completeAdminMfa(db, session, totp(secret, Math.floor(Date.now()/30000)), password, key, rid(), true), /Verification/);
    });
    await t.test('cross-tenant organization create/update uses existing atomic provisioning and owner constraints', async () => {
      org = (await adminOrganizationsService(db, ctx, 'create', { name: 'Synthetic workspace', ownerId: uid(1), requestId: rid() })).id;
      const another = await adminOrganizationsService(db, ctx, 'create', { name: 'Other tenant', ownerId: uid(3), requestId: rid() }); assert.notEqual(another.id, org);
      const detail = await adminDetail(db, ctx, 'organizations', org, new URLSearchParams());
      assert.equal(detail.members[0].role, 'OWNER'); assert.equal(detail.members[0].user_id, uid(1)); assert.equal(detail.offices.length, 1); office = detail.offices[0];
      await adminOrganizationsService(db, ctx, 'update', { id: org, name: 'Updated fixture' });
      assert.equal((await adminDetail(db, ctx, 'organizations', org, new URLSearchParams())).name, 'Updated fixture');
      assert.equal((await adminDirectory(db, ctx, 'organizations', new URLSearchParams())).rows.length, 2);
      await assert.rejects(adminOrganizationsService(db, ctx, 'create', { name: 'Unverified', ownerId: uid(4), requestId: rid() }));
    });
    await t.test('membership and transfer safeguards preserve at least one active owner', async () => {
      await adminMembershipService(db, ctx, { organizationId: org, userId: uid(2), role: 'MEMBER', status: 'ACTIVE', confirmation: 'Updated fixture' });
      const member = (await db.query('select id from public.organization_members where organization_id=$1 and user_id=$2', [org, uid(2)])).rows[0].id;
      await assert.rejects(adminMembershipService(db, ctx, { organizationId: org, userId: uid(1), role: 'MEMBER', status: 'INACTIVE', confirmation: 'Updated fixture' }), /Transfer ownership/);
      await assert.rejects(adminOrganizationsService(db, ctx, 'transfer', { id: org, memberId: member, confirmation: 'wrong' }), /confirm/);
      await adminOrganizationsService(db, ctx, 'transfer', { id: org, memberId: member, confirmation: 'Updated fixture' });
      const roles = (await db.query('select user_id,role from public.organization_members where organization_id=$1 order by user_id', [org])).rows;
      assert.equal(roles[0].role, 'ADMIN'); assert.equal(roles[1].role, 'OWNER');
      await assert.rejects(db.query(`update public.organization_members set status='INACTIVE' where id=$1`, [member]), /last owner/);
    });
    await t.test('organization suspension blocks RLS, realtime projection, invitations and environment workflows', async () => {
      await adminOrganizationsService(db, ctx, 'status', { id: org, status: 'SUSPENDED', confirmation: 'Updated fixture' });
      await pg.exec(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${uid(2)}","role":"authenticated"}',false)`);
      assert.equal((await db.query('select id from public.organizations where id=$1', [org])).rows.length, 0);
      assert.equal((await db.query('select public.platform_office_access($1) as access', [office.id])).rows[0].access, null);
      await assert.rejects(db.query('select public.save_office_environment($1,0,$2)', [office.id, JSON.stringify(defaultEnvironment)]));
      await pg.exec(`reset role; select set_config('request.jwt.claims','',false); set role platform_admin_runtime`);
      await adminOrganizationsService(db, ctx, 'status', { id: org, status: 'ACTIVE', confirmation: 'Updated fixture' });
    });
    await t.test('profile updates, user directory and office revision updates use safe projections', async () => {
      await adminProfileService(db, ctx, { id: uid(2), displayName: 'Synthetic person' });
      assert.equal((await adminDetail(db, ctx, 'users', uid(2), new URLSearchParams())).display_name, 'Synthetic person');
      const users = await adminDirectory(db, ctx, 'users', new URLSearchParams()); assert.equal(users.rows.length, 4);
      for (const user of users.rows) assert.equal('password_hash' in user, false);
      await adminOfficesService(db, ctx, { id: office.id, name: 'Main office', isAvailable: true, revision: 0, config: defaultEnvironment, confirmation: 'Main office' });
      assert.equal((await adminDetail(db, ctx, 'offices', office.id, new URLSearchParams())).revision, 1);
      await assert.rejects(adminOfficesService(db, ctx, { id: office.id, name: 'Main office', isAvailable: true, revision: 0, config: defaultEnvironment, confirmation: 'Main office' }), /changed/);
      await adminOfficesService(db, ctx, { id: office.id, name: 'Main office', isAvailable: false, revision: 1, config: defaultEnvironment, confirmation: 'Main office' });
      await pg.exec(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${uid(2)}","role":"authenticated"}',false)`);
      assert.equal((await db.query('select id from public.offices where id=$1', [office.id])).rows.length, 0);
      await pg.exec(`reset role; select set_config('request.jwt.claims','',false); set role platform_admin_runtime`);
    });
    await t.test('settings versioning, maintenance and registration hook are enforced', async () => {
      const settings = { version: 1, maintenance: true, registration_enabled: false, onboarding_enabled: false, voice_enabled: false, max_organizations_per_user: 5, confirmation: 'APPLY PLATFORM SETTINGS' };
      const result = await adminSettingsService(db, ctx, settings); assert.equal(result.version, 2);
      await assert.rejects(adminSettingsService(db, ctx, settings), /changed/);
      await pg.exec(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${uid(2)}","role":"authenticated"}',false)`);
      assert.equal((await db.query('select id from public.organizations')).rows.length, 0);
      await assert.rejects(db.query('select public.create_organization($1,$2)', ['Blocked', rid()]));
      await pg.exec('reset role; set role supabase_auth_admin');
      assert.equal((await db.query(`select public.platform_before_user_created('{}') as hook`)).rows[0].hook.error.http_code, 403);
      await pg.exec(`reset role; select set_config('request.jwt.claims','',false); set role platform_admin_runtime`);
      await adminSettingsService(db, ctx, { ...settings, version: 2, maintenance: false, registration_enabled: true, onboarding_enabled: true, voice_enabled: true });
    });
    await t.test('suspended identities cannot access tenants or become owners with existing tokens', async () => {
      await db.query(`insert into platform_private.user_restrictions(user_id) values($1)`, [uid(1)]);
      await pg.exec(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${uid(1)}","role":"authenticated"}',false)`);
      assert.equal((await db.query('select id from public.organizations')).rows.length, 0);
      await pg.exec(`reset role; select set_config('request.jwt.claims','',false); set role platform_admin_runtime`);
      const oldOwner = (await db.query('select id from public.organization_members where user_id=$1 and organization_id=$2', [uid(1), org])).rows[0].id;
      await assert.rejects(adminOrganizationsService(db, ctx, 'transfer', { id: org, memberId: oldOwner, confirmation: 'Updated fixture' }), /suspended/);
      await db.query('update platform_private.user_restrictions set suspended=false where user_id=$1', [uid(1)]);
    });
    await t.test('ordinary users and organization owners cannot read private admin tables, settings or audit', async () => {
      for (const role of ['anon','authenticated']) {
        await pg.exec(`set role ${role}`);
        for (const table of ['platform_admins','platform_admin_sessions','platform_admin_audit_logs','platform_settings','user_directory']) await assert.rejects(db.query(`select * from platform_private.${table}`), /permission denied/);
        await assert.rejects(db.query(`select public.platform_before_user_created('{}')`), /permission denied/);
        await pg.exec('reset role');
      }
      await pg.exec('set role platform_admin_runtime');
      await assert.rejects(db.query('select password_hash from auth.users'), /does not exist|permission denied/);
      await assert.rejects(db.query('select id,email from auth.users'), /permission denied/);
      await assert.rejects(db.query('update platform_private.platform_admin_audit_logs set action=$1', ['tampered']), /permission denied/);
      await assert.rejects(db.query('delete from platform_private.platform_admin_audit_logs'), /permission denied/);
      await assert.rejects(db.query('update platform_private.platform_admins set is_active=false'), /Root recovery/);
      const logs = await adminDirectory(db, ctx, 'audit-logs', new URLSearchParams({ q: 'organization.' })); assert.ok(logs.rows.length >= 7);
      assert.equal(JSON.stringify(logs).includes(password), false); assert.equal(JSON.stringify(logs).includes(secret), false);
      assert.ok((await adminDashboard(db, ctx)).counts.organizations >= 2);
    });
    await t.test('session expiry, revocation, credential-version changes and non-admin contexts fail closed', async () => {
      await assert.rejects(adminDashboard(db, { ...ctx, session: { ...session, sessionHash: digest(randomToken()) } }), /authentication required/);
      await db.query(`update platform_private.platform_admin_sessions set mfa_verified_at=now()-interval '6 minutes' where token_hash=$1`, [session.sessionHash]);
      await assert.rejects(adminProfileService(db, ctx, { id: uid(1), displayName: 'Blocked' }), /Reauthenticate/);
      await db.query(`update platform_private.platform_admin_sessions set mfa_verified_at=now(),expires_at=now()-interval '1 second' where token_hash=$1`, [session.sessionHash]);
      assert.equal(await lookupAdminSession(db, token), null);
      await db.query(`update platform_private.platform_admin_sessions set expires_at=now()+interval '1 hour' where token_hash=$1`, [session.sessionHash]);
      await changeAdminPassword(db, session, password, randomToken(), rid()); assert.equal(await lookupAdminSession(db, token), null);
      await revokeAdminSessions(db, session, true, rid());
    });
    await t.test('durable throttles limit nonexistent account guessing without storing submitted usernames', async () => {
      for (let n=0;n<10;n++) await assert.rejects(adminLogin(db, 'unknown-account', randomToken(), rid()), /Credentials/);
      await assert.rejects(adminLogin(db, 'unknown-account', randomToken(), rid()), /Too many/);
      const buckets = await db.query('select bucket_hash from platform_private.platform_admin_throttles'); assert.ok(buckets.rows.every(r => /^[a-f0-9]{64}$/.test(r.bucket_hash)));
    });
  } finally { await pg.close(); }
});

test('existing organization, team and profile policy suites still pass after the admin migration', { timeout: 60000 }, async () => {
  const pg = new PGlite();
  try {
    await installFixture(pg);
    for (const file of ['organization_policies.sql', 'team_invitations.sql', 'avatar_profiles.sql']) {
      const sql = preparePolicySql(readFileSync(new URL('../supabase/tests/' + file, import.meta.url), 'utf8'), [uid(1),uid(2),uid(3)]);
      const result = await pg.exec(sql);
      assert.equal(result.at(-1).rows[0].organization_test_result, 'organization-policy-tests-rolled-back', file);
    }
  } finally { await pg.close(); }
});
