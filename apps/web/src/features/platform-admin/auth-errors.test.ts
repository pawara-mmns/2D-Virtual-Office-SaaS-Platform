import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminAuthError, adminAuthStep, adminFailureDiagnostic, classifyAdminFailure } from './auth-errors.ts';
import { AdminError } from './types.ts';

test('authentication diagnostics distinguish infrastructure failures without retaining provider secrets', () => {
  for (const [code, category] of Object.entries({ ECONNREFUSED: 'database_unavailable', ENETUNREACH: 'database_unavailable', ENOTFOUND: 'database_unavailable',
    ETIMEDOUT: 'network_timeout', '57014': 'network_timeout', '28P01': 'database_credentials_invalid', '28000': 'database_credentials_invalid',
    '42P01': 'missing_admin_schema', '3F000': 'missing_admin_schema', '42703': 'missing_admin_schema', '42501': 'database_permission_denied',
    SELF_SIGNED_CERT_IN_CHAIN: 'tls_configuration_invalid', ERR_TLS_CERT_ALTNAME_INVALID: 'tls_configuration_invalid', '40001': 'database_query_failed' })) {
    const failure = classifyAdminFailure({ code, message: 'postgresql://secret:secret@private/db', query: 'private SQL', password: 'private password' }, 'admin_lookup');
    assert.ok(failure instanceof AdminAuthError); assert.equal(failure.category, category);
    const log = JSON.stringify(adminFailureDiagnostic(failure, 'request-id', 'auth/login'));
    for (const secret of ['postgresql://', 'private', 'password', 'SQL']) assert.equal(log.includes(secret), false);
    assert.equal(failure.message.includes('Auth service'), false);
  }
  assert.equal((classifyAdminFailure(new AggregateError([Object.assign(Error('private'), { code: 'ECONNREFUSED' })])) as AdminAuthError).category, 'database_unavailable');
  assert.equal((classifyAdminFailure(Error('Connection terminated due to connection timeout')) as AdminAuthError).category, 'network_timeout');
});

test('authentication steps identify session failures and preserve infrastructure categories', async () => {
  for (const [code, category] of [['23502', 'session_creation_failed'], ['ECONNREFUSED', 'database_unavailable'], ['42501', 'database_permission_denied']]) {
    await assert.rejects(adminAuthStep('session_creation', async () => { throw classifyAdminFailure({ code }, 'query'); }),
      (e: unknown) => e instanceof AdminAuthError && e.category === category && e.stage === 'session_creation');
  }
  await assert.rejects(adminAuthStep('mfa_key_decryption', async () => { throw Error('private seed'); }),
    (e: unknown) => e instanceof AdminAuthError && e.category === 'mfa_configuration_invalid' && !e.message.includes('private'));
  const denied = new AdminError(429, 'Wait before retrying.');
  assert.equal(classifyAdminFailure(denied), denied);
  assert.equal(adminFailureDiagnostic(denied, 'id', 'auth/login').category, 'rate_limited');
});

test('missing administrators and bad passwords have identical public errors with distinct sanitized diagnostics', () => {
  const absent = new AdminAuthError('administrator_not_found', 'password_verification');
  const invalid = new AdminAuthError('invalid_credentials', 'password_verification');
  assert.equal(absent.status, 401); assert.equal(absent.message, invalid.message);
  assert.notEqual(adminFailureDiagnostic(absent, 'id', 'auth/login').category, adminFailureDiagnostic(invalid, 'id', 'auth/login').category);
  const unknown = classifyAdminFailure(Error('token=cookie=secret'));
  assert.ok(unknown instanceof AdminAuthError); assert.equal(unknown.category, 'authentication_failed');
  assert.equal(JSON.stringify(adminFailureDiagnostic(unknown, 'id', 'arbitrary-secret-input')).includes('secret'), false);
});
