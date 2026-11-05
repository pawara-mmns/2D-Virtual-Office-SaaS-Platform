import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { createTotpSecret, decryptSecret, digest, encryptSecret, hashPassword, passwordPolicy, randomToken, totp, verifyPassword, verifyTotp } from './crypto.ts';
import { boundedBody, checkAdminMutation } from './http-security.ts';
import { pagination, settingsInput } from './admin-service.ts';
import { requireRecentAdminMfa, type AdminSession } from './types.ts';

test('Argon2id uses independent salts, strong parameters, and rejects invalid passwords', async () => {
  const password = randomToken(), first = await hashPassword(password), second = await hashPassword(password);
  assert.match(first, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/); assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, password), true); assert.equal(await verifyPassword(first, 'incorrect'), false);
  assert.equal(await verifyPassword(first, 'x'.repeat(1000)), false); assert.equal(await verifyPassword('corrupt', password), false);
  for (const weak of ['short', 'password-123456789', 'aaaaaaaaaaaaaaaaaaaa', 'abcdefghi\n123456789', 'x'.repeat(129)]) assert.throws(() => passwordPolicy(weak));
});
test('TOTP matches RFC 6238 SHA1 vector, accepts narrow clock skew, and rejects replay', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totp(secret, 1, 8), '94287082');
  const now = 60000, code = totp(secret, 2);
  assert.equal(verifyTotp(secret, code, -1, now), 2); assert.equal(verifyTotp(secret, code, 2, now), null);
  assert.equal(verifyTotp(secret, totp(secret, 1), -1, now), 1); assert.equal(verifyTotp(secret, totp(secret, 0), -1, now), null);
  assert.equal(verifyTotp(secret, '00000', -1, now), null); assert.match(createTotpSecret(), /^[A-Z2-7]{32}$/);
});
test('MFA encryption authenticates ciphertext and administrator binding; sessions are opaque', () => {
  const key = randomBytes(32).toString('hex'), secret = createTotpSecret(), encoded = encryptSecret(secret, key, 'admin-a');
  assert.equal(encoded.includes(secret), false); assert.equal(decryptSecret(encoded, key, 'admin-a'), secret);
  assert.throws(() => decryptSecret(encoded, key, 'admin-b')); assert.throws(() => decryptSecret(encoded, randomBytes(32).toString('hex'), 'admin-a'));
  const token = randomToken(); assert.match(token, /^[A-Za-z0-9_-]{43}$/); assert.match(digest(token), /^[a-f0-9]{64}$/); assert.notEqual(token, digest(token));
});
test('mutations reject missing, cross-origin, forged, and simple-form CSRF requests', async () => {
  const csrf = randomToken(), env = { PLATFORM_ADMIN_ORIGIN: 'https://admin.example.test' };
  function request(headers: Record<string,string>) { return new Request('https://admin.example.test/api/superadmin/system/update', { method: 'POST', headers }); }
  const valid = { origin: env.PLATFORM_ADMIN_ORIGIN, 'content-type': 'application/json', 'x-admin-csrf': csrf };
  assert.doesNotThrow(() => checkAdminMutation(request(valid), csrf, env));
  for (const patch of [{ origin: 'https://evil.example' }, { origin: '' }, { 'x-admin-csrf': randomToken() }, { 'content-type': 'text/plain' }, { 'sec-fetch-site': 'cross-site' }] as Record<string,string>[])
    assert.throws(() => checkAdminMutation(request({ ...valid, ...patch }), csrf, env));
  assert.throws(() => checkAdminMutation(request(valid), undefined, env));
  await assert.rejects(boundedBody(new Request('https://test.invalid', { method:'POST', body: 'x'.repeat(17000) })), /large/);
  await assert.rejects(boundedBody(new Request('https://test.invalid', { method:'POST', body: '[]' })), /Invalid/);
});
test('step-up, pagination and strict settings validation fail closed', () => {
  const session: AdminSession = { adminId: 'a', username: 'admin', sessionHash: 'hash', credentialVersion: 1, mfa: true, mfaAt: 1000 };
  assert.doesNotThrow(() => requireRecentAdminMfa(session, 2000)); assert.throws(() => requireRecentAdminMfa(session, 301001));
  assert.throws(() => requireRecentAdminMfa({ ...session, mfa: false }, 2000));
  for (const page of ['-1','0','1.2','NaN','10001']) assert.throws(() => pagination(new URLSearchParams({page})));
  const valid = { version: 1, maintenance: false, registration_enabled: true, onboarding_enabled: true, voice_enabled: true, max_organizations_per_user: 10, confirmation: 'APPLY PLATFORM SETTINGS' };
  assert.doesNotThrow(() => settingsInput(valid));
  for (const patch of [{ maintenance: 'false' }, { unknown: true }, { max_organizations_per_user: 0 }, { max_organizations_per_user: 101 }, { confirmation: '' }]) assert.throws(() => settingsInput({ ...valid, ...patch }));
});
