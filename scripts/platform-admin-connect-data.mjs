// Read-only hosted data integration. No SQL, migrations, user/tenant mutations,
// or administrator credential/session changes are performed by this command.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { createPlatformDataGateway, platformDataConfig, PlatformDataError } from '../apps/web/src/features/platform-admin/data-access.ts';
const root = resolve(import.meta.dirname, '..');
const readEnv = path => existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
const localPath = resolve(root, 'apps/web/.env.local'), app = { ...readEnv(resolve(root, 'apps/web/.env')), ...readEnv(localPath) };
try {
  if (process.argv.length > 2) throw new Error('No credentials or project arguments are accepted. The existing application URL selects the project.');
  const url = new URL(app.NEXT_PUBLIC_SUPABASE_URL || '');
  const ref = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1];
  if (!ref || url.protocol !== 'https:') throw new Error('The application must identify an existing hosted Supabase project.');
  const linkedPath = resolve(root, 'supabase/.temp/project-ref');
  if (existsSync(linkedPath) && readFileSync(linkedPath, 'utf8').trim() !== ref) throw new Error('The linked project and application project differ. Existing settings were preserved.');
  let key = app.PLATFORM_DATA_SUPABASE_SECRET_KEY;
  if (!key) {
    const result = spawnSync(process.execPath, [resolve(root, 'node_modules/supabase/dist/supabase.js'), 'projects', 'api-keys', '--project-ref', ref, '--output', 'json', '--reveal'],
      { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30000 });
    if (result.status !== 0) throw new Error('The connected CLI could not read this project’s server key. Configure PLATFORM_DATA_SUPABASE_SECRET_KEY privately; no CLI output or key was printed.');
    const response = JSON.parse(result.stdout), keys = Array.isArray(response) ? response : response.keys;
    key = keys?.find(k => k.name === 'service_role')?.api_key || keys?.find(k => k.type === 'secret')?.api_key;
    if (!key) throw new Error('No usable server-only project key was returned.');
  }
  const values = { PLATFORM_DATA_MODE: 'supabase', PLATFORM_DATA_PROJECT_REF: ref, PLATFORM_DATA_SUPABASE_URL: url.origin,
    PLATFORM_DATA_SUPABASE_SECRET_KEY: key };
  const config = platformDataConfig({ ...app, ...values });
  if (config.mode !== 'supabase') throw new Error('Invalid data mode.');
  const gateway = createPlatformDataGateway(config);
  const count = async (table, filters={}) => (await gateway.table(table, { select:'id', ...filters }, true)).total;
  const [organizations,active,suspended,users,profiles,memberships,activeMemberships,offices] = await Promise.all([
    count('organizations'),count('organizations',{status:'eq.ACTIVE'}),count('organizations',{status:'eq.SUSPENDED'}),
    gateway.users(1,1),count('profiles'),count('organization_members'),count('organization_members',{status:'eq.ACTIVE'}),count('offices'),
  ]);
  const realtime = readEnv(resolve(root, 'apps/realtime/.env'));
  if (!app.PLATFORM_OPERATIONS_KEY && realtime.PLATFORM_OPERATIONS_KEY?.length >= 43) values.PLATFORM_OPERATIONS_KEY = realtime.PLATFORM_OPERATIONS_KEY;
  let contents = existsSync(localPath) ? readFileSync(localPath,'utf8') : '# Server-only local administration settings. Do not share.\n';
  for (const [name,value] of Object.entries(values)) {
    const line = `${name}=${JSON.stringify(value)}`, expression = new RegExp(`^${name}=.*$`,'m');
    contents = expression.test(contents) ? contents.replace(expression,()=>line) : contents.replace(/\s*$/,'\n')+line+'\n';
  }
  writeFileSync(localPath,contents,{mode:0o600});
  console.log(JSON.stringify({ project:ref, verifiedReadOnly:true, organizations,activeOrganizations:active,suspendedOrganizations:suspended,
    authAccounts:users.total,profiles,organizationMemberships:memberships,activeMemberships,offices,
    operationsKeyConfigured:Boolean(values.PLATFORM_OPERATIONS_KEY||app.PLATFORM_OPERATIONS_KEY) },null,2));
  console.info('Hosted data reads configured in ignored apps/web/.env.local. Administrator identity/MFA settings and normal-user Auth settings were preserved. Restart the web app if it is already running.');
} catch (error) {
  console.error(error instanceof PlatformDataError ? `${error.category}: ${error.message}` : 'Hosted read-only data setup could not complete. Check the intended project and connected CLI access. No raw provider errors or credentials were printed.');
  process.exitCode=1;
}
