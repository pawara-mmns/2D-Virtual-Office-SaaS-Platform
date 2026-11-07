import { randomUUID } from 'node:crypto';
import { createTotpSecret, decryptSecret, digest, encryptSecret, hashPassword, randomToken, verifyPassword, verifyTotp } from './crypto.ts';
import { AdminError, audit, input, type AdminDatabase, type Connection, type AdminSession, type Row } from './types.ts';
import { AdminAuthError, adminAuthStep } from './auth-errors.ts';

type Admin = Row & { id: string; username: string; password_hash: string; is_active: boolean; credential_version: number;
  mfa_secret_encrypted: string | null; mfa_enrolled_at: Date | null; last_totp_step: string; locked_until: Date | null };
const millis = (value: unknown) => value ? new Date(String(value)).getTime() : 0;
let dummy: Promise<string> | undefined;
export async function throttle(db: Connection, bucket: string, limit: number, seconds = 900) {
  const { rows } = await db.query(`insert into platform_private.platform_admin_throttles(bucket_hash,window_at,attempts)
    values($1,now(),1) on conflict(bucket_hash) do update set
    attempts=case when platform_admin_throttles.window_at<now()-($2*interval '1 second') then 1 else platform_admin_throttles.attempts+1 end,
    window_at=case when platform_admin_throttles.window_at<now()-($2*interval '1 second') then now() else platform_admin_throttles.window_at end
    returning attempts`, [digest(bucket), seconds]);
  return Number(rows[0]!.attempts) <= limit;
}
async function failure(db: Connection, admin: Admin) {
  await db.query(`update platform_private.platform_admins set failed_attempts=failed_attempts+1,
    locked_until=case when failed_attempts+1>=5 then now()+interval '15 minutes' else locked_until end where id=$1`, [admin.id]);
}
async function makeSession(db: Connection, admin: Admin, mfa: boolean, previous?: string) {
  const token = randomToken();
  if (previous) await db.query('update platform_private.platform_admin_sessions set revoked_at=now() where token_hash=$1', [previous]);
  await adminAuthStep('session_creation', () => db.query(`insert into platform_private.platform_admin_sessions(token_hash,admin_id,credential_version,expires_at,mfa_verified_at)
    values($1,$2,$3,now()+($4*interval '1 second'),case when $5 then now() else null end)`,
  [digest(token), admin.id, admin.credential_version, mfa ? 28800 : 600, mfa]));
  return token;
}
export async function lookupAdminSession(db: Connection, token: unknown, allowPending = false): Promise<AdminSession | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { rows } = await db.query(`select a.id,a.username,a.credential_version,s.token_hash,s.mfa_verified_at,a.mfa_enrolled_at
    from platform_private.platform_admin_sessions s join platform_private.platform_admins a on a.id=s.admin_id
    where s.token_hash=$1 and s.revoked_at is null and s.expires_at>now() and s.last_seen_at>now()-interval '30 minutes'
      and a.is_active and a.credential_version=s.credential_version`, [digest(token)]);
  const row = rows[0]; if (!row) return null;
  const mfa = !!row.mfa_verified_at && !!row.mfa_enrolled_at;
  if (!mfa && !allowPending) return null;
  await db.query(`update platform_private.platform_admin_sessions set last_seen_at=now() where token_hash=$1 and last_seen_at<now()-interval '1 minute'`, [digest(token)]);
  return { adminId: String(row.id), username: String(row.username), sessionHash: String(row.token_hash),
    mfa, mfaAt: millis(row.mfa_verified_at), credentialVersion: Number(row.credential_version) };
}
export async function bootstrapAdmin(db: AdminDatabase, username: string, password: string, requestId = randomUUID()) {
  input(/^[a-z0-9][a-z0-9._@+-]{2,63}$/.test(username), 'Use a lowercase login name of 3–64 characters; email-style names are supported.');
  const encoded = await hashPassword(password);
  return db.transaction(async tx => {
    await tx.query('select pg_advisory_xact_lock(90311003)');
    const existing = await tx.query('select id from platform_private.platform_admins limit 1');
    if (existing.rows.length) throw new AdminError(409, 'Bootstrap is already complete. Use offline recovery for a lost administrator.');
    const { rows } = await tx.query(`insert into platform_private.platform_admins(username,password_hash,is_root) values($1,$2,true) returning id`, [username, encoded]);
    await audit(tx, String(rows[0]!.id), 'admin.bootstrap', 'administrator', String(rows[0]!.id), 'success', requestId);
  });
}
export async function adminLogin(db: AdminDatabase, username: unknown, password: unknown, requestId: string) {
  const name = typeof username === 'string' ? username.trim().toLowerCase().slice(0, 64) : '';
  const globalOk = await adminAuthStep('login_rate_limit', () => throttle(db, 'login:global', 60, 60));
  const accountOk = globalOk && await adminAuthStep('login_rate_limit', () => throttle(db, `login:${name}`, 10));
  if (!globalOk || !accountOk) {
    await audit(db, null, 'admin.login', 'administrator', null, 'denied', requestId, { reason: 'throttled' });
    throw new AdminError(429, 'Too many attempts. Wait fifteen minutes before retrying.');
  }
  let denial: 'administrator_not_found' | 'invalid_credentials' = 'invalid_credentials';
  const token = await db.transaction(async tx => {
    const { rows } = await adminAuthStep('admin_lookup', () => tx.query<Admin>('select * from platform_private.platform_admins where username=$1 for update', [name]));
    const admin = rows[0];
    dummy ??= hashPassword(randomToken());
    const encoded = admin?.password_hash ?? await dummy;
    const valid = await adminAuthStep('password_verification', () => verifyPassword(encoded, password));
    if (!admin || !valid || !admin.is_active || millis(admin.locked_until) > Date.now()) {
      denial = admin ? 'invalid_credentials' : 'administrator_not_found';
      if (admin) await failure(tx, admin);
      await audit(tx, admin?.id ?? null, 'admin.login', 'administrator', admin?.id ?? null, 'denied', requestId);
      return null;
    }
    await audit(tx, admin.id, 'admin.password_verified', 'administrator', admin.id, 'success', requestId);
    return makeSession(tx, admin, false);
  });
  if (!token) throw new AdminAuthError(denial, 'password_verification');
  return token;
}
export async function beginEnrollment(db: AdminDatabase, session: AdminSession, key: string, requestId: string) {
  return db.transaction(async tx => {
    const { rows } = await tx.query<Admin>('select * from platform_private.platform_admins where id=$1 for update', [session.adminId]);
    const admin = rows[0]!;
    const live = await tx.query(`select token_hash from platform_private.platform_admin_sessions where token_hash=$1 and admin_id=$2
      and revoked_at is null and expires_at>now() and credential_version=$3 and last_seen_at>now()-interval '30 minutes'`, [session.sessionHash, admin.id, admin.credential_version]);
    if (!admin.is_active || !live.rows.length) throw new AdminError(401, 'Administrator authentication required.');
    if (admin.mfa_enrolled_at || session.mfa) throw new AdminError(409, 'MFA is already enrolled.');
    const secret = admin.mfa_secret_encrypted ? await adminAuthStep('mfa_key_decryption', async () => decryptSecret(admin.mfa_secret_encrypted!, key, admin.id)) : createTotpSecret();
    if (!admin.mfa_secret_encrypted) {
      await tx.query('update platform_private.platform_admins set mfa_secret_encrypted=$2 where id=$1', [admin.id, encryptSecret(secret, key, admin.id)]);
      await audit(tx, admin.id, 'admin.mfa_enrollment_started', 'administrator', admin.id, 'success', requestId);
    }
    return { secret, uri: `otpauth://totp/Virtual%20Office:${encodeURIComponent(admin.username)}?secret=${secret}&issuer=Virtual%20Office&algorithm=SHA1&digits=6&period=30` };
  });
}
export async function completeAdminMfa(db: AdminDatabase, session: AdminSession, code: unknown, password: unknown,
  key: string, requestId: string, reauth = false) {
  if (!await throttle(db, `mfa:${session.adminId}`, 10)) {
    await audit(db, session.adminId, 'admin.mfa', 'administrator', session.adminId, 'denied', requestId, { reason: 'throttled' });
    throw new AdminError(429, 'Too many attempts. Wait fifteen minutes.');
  }
  const token = await db.transaction(async tx => {
    const { rows } = await tx.query<Admin>('select * from platform_private.platform_admins where id=$1 for update', [session.adminId]);
    const admin = rows[0]!;
    const freshSession = await tx.query(`select token_hash from platform_private.platform_admin_sessions where token_hash=$1
      and revoked_at is null and expires_at>now() and last_seen_at>now()-interval '30 minutes' and credential_version=$2`, [session.sessionHash, admin.credential_version]);
    const secret = admin.mfa_secret_encrypted ? await adminAuthStep('mfa_key_decryption', async () => decryptSecret(admin.mfa_secret_encrypted!, key, admin.id)) : null;
    const step = secret ? verifyTotp(secret, code, Number(admin.last_totp_step)) : null;
    if (!admin.is_active || !freshSession.rows.length || millis(admin.locked_until) > Date.now() || step === null
      || reauth && !await verifyPassword(admin.password_hash, password)) {
      await failure(tx, admin); await audit(tx, admin.id, 'admin.mfa', 'administrator', admin.id, 'denied', requestId); return null;
    }
    await tx.query(`update platform_private.platform_admins set mfa_enrolled_at=coalesce(mfa_enrolled_at,now()),last_totp_step=$2,
      failed_attempts=0,locked_until=null,last_login_at=now(),updated_at=now() where id=$1`, [admin.id, step]);
    await audit(tx, admin.id, reauth ? 'admin.reauthenticated' : 'admin.login', 'administrator', admin.id, 'success', requestId);
    return makeSession(tx, admin, true, session.sessionHash);
  });
  if (!token) throw new AdminAuthError('mfa_verification_failed', 'mfa_verification');
  return token;
}
export async function revokeAdminSessions(db: AdminDatabase, session: AdminSession, all: boolean, requestId: string) {
  await db.transaction(async tx => {
    await tx.query('select id from platform_private.platform_admins where id=$1 for update', [session.adminId]);
    await tx.query(`update platform_private.platform_admin_sessions set revoked_at=now() where admin_id=$1 and ($2 or token_hash=$3)`, [session.adminId, all, session.sessionHash]);
    await audit(tx, session.adminId, all ? 'admin.logout_all' : 'admin.logout', 'administrator', session.adminId, 'success', requestId);
  });
}
export async function changeAdminPassword(db: AdminDatabase, session: AdminSession, current: unknown, next: unknown, requestId: string) {
  if (!await throttle(db, `password:${session.adminId}`, 5)) {
    await audit(db, session.adminId, 'admin.password_changed', 'administrator', session.adminId, 'denied', requestId, { reason: 'throttled' });
    throw new AdminError(429, 'Too many password change attempts. Wait fifteen minutes.');
  }
  input(typeof next === 'string');
  const encoded = await hashPassword(next);
  const changed = await db.transaction(async tx => {
    await tx.query('select id from platform_private.platform_admins where id=$1 for update', [session.adminId]);
    const fresh = await tx.query(`select s.mfa_verified_at from platform_private.platform_admin_sessions s
      join platform_private.platform_admins a on a.id=s.admin_id where s.token_hash=$1 and a.id=$2 and a.is_active
      and s.revoked_at is null and s.expires_at>now() and s.last_seen_at>now()-interval '30 minutes'
      and s.credential_version=a.credential_version and s.mfa_verified_at>now()-interval '5 minutes' for update of s,a`, [session.sessionHash, session.adminId]);
    if (!fresh.rows.length) throw new AdminError(403, 'Reauthenticate before changing your password.');
    const { rows } = await tx.query<Admin>('select * from platform_private.platform_admins where id=$1 for update', [session.adminId]);
    if (!await verifyPassword(rows[0]!.password_hash, current) || await verifyPassword(rows[0]!.password_hash, next)) return false;
    await tx.query('update platform_private.platform_admins set password_hash=$2,credential_version=credential_version+1,updated_at=now() where id=$1', [session.adminId, encoded]);
    await tx.query('update platform_private.platform_admin_sessions set revoked_at=now() where admin_id=$1', [session.adminId]);
    await audit(tx, session.adminId, 'admin.password_changed', 'administrator', session.adminId, 'success', requestId); return true;
  });
  if (!changed) { await audit(db, session.adminId, 'admin.password_changed', 'administrator', session.adminId, 'denied', requestId); throw new AdminError(400, 'Check the current password and choose a different new password.'); }
}
