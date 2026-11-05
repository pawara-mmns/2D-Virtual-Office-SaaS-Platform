// Run from the repository root with Node 22.18+; no credentials in argv/env.
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { bootstrapAdmin } from '../apps/web/src/features/platform-admin/auth-service.ts';
import { hashPassword } from '../apps/web/src/features/platform-admin/crypto.ts';
import { audit } from '../apps/web/src/features/platform-admin/types.ts';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { Pool } = require('pg');
function secret(prompt) {
  process.stdout.write(prompt); emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let answer = '';
    function keypress(chunk, key) {
      if (key?.ctrl && key.name === 'c') { finish(); reject(new Error('Cancelled')); }
      else if (key?.name === 'return') { finish(); resolve(answer); answer = ''; }
      else if (key?.name === 'backspace') answer = answer.slice(0, -1);
      else if (chunk && !key?.ctrl && !key?.meta && !/[\u0000-\u001f\u007f]/u.test(chunk)) answer += chunk;
    }
    function finish() { process.stdin.off('keypress', keypress); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); }
    process.stdin.on('keypress', keypress);
  });
}
let pool;
try {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.slice(2).some(a => a !== '--recover')) throw new Error('Use an interactive terminal. Only --recover is supported.');
  if (!process.env.PLATFORM_ADMIN_DATABASE_URL) throw new Error('Configure PLATFORM_ADMIN_DATABASE_URL for the restricted runtime login. For an isolated local Supabase database, run pnpm.cmd admin:setup:local first.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const username = (await rl.question('Administrator username: ')).trim().toLowerCase();
  const recovery = process.argv.includes('--recover');
  if (recovery && await rl.question('Offline recovery revokes every session and resets MFA. Type RECOVER ROOT: ') !== 'RECOVER ROOT') throw new Error('Recovery cancelled.');
  rl.close();
  let password = await secret(recovery ? 'New password (hidden): ' : 'Password (hidden): ');
  let repeated = await secret('Repeat password (hidden): ');
  if (password !== repeated) throw new Error('Passwords did not match.'); repeated = '';
  pool = new Pool({ connectionString: process.env.PLATFORM_ADMIN_DATABASE_URL, max: 1, connectionTimeoutMillis: 4000 });
  const client = await pool.connect();
  try {
    const check = await client.query(`select rolsuper,rolbypassrls,pg_has_role(current_user,'platform_admin_runtime','member') as allowed from pg_roles where rolname=current_user`);
    if (!check.rows[0]?.allowed || check.rows[0].rolsuper || check.rows[0].rolbypassrls) throw new Error('Use the dedicated platform runtime login.');
    const db = { query: (sql, values) => client.query(sql, values), async transaction(work) {
      await client.query('begin'); try { const result = await work(this); await client.query('commit'); return result; }
      catch (error) { await client.query('rollback'); throw error; }
    } };
    if (!recovery) await bootstrapAdmin(db, username, password);
    else {
      const encoded = await hashPassword(password);
      await db.transaction(async tx => {
        await tx.query('select pg_advisory_xact_lock(90311003)');
        const { rows } = await tx.query(`update platform_private.platform_admins set password_hash=$2,credential_version=credential_version+1,
          mfa_secret_encrypted=null,mfa_enrolled_at=null,last_totp_step=-1,failed_attempts=0,locked_until=null,updated_at=now()
          where username=$1 and is_root and is_active returning id`, [username, encoded]);
        if (!rows[0]) throw new Error('Active root account not found.');
        await tx.query('update platform_private.platform_admin_sessions set revoked_at=now() where admin_id=$1', [rows[0].id]);
        await audit(tx, rows[0].id, 'admin.offline_recovery', 'administrator', rows[0].id, 'success', randomUUID());
      });
    }
    password = '';
    console.info('Administrator setup saved. Sign in at /superadmin/login and enroll MFA before accessing platform data.');
  } finally { client.release(); }
} catch (error) {
  // Never echo DB errors, arguments, hashes, passwords, secrets, or connection URLs.
  const known = error instanceof Error && !('code' in error) ? error.message : 'Setup failed. Check the private database configuration.';
  console.error(known.startsWith('connect ') || known.includes('postgres://') || known.includes('postgresql://') ? 'Setup failed. Check the private database configuration.' : known);
  process.exitCode = 1;
} finally { await pool?.end(); }
