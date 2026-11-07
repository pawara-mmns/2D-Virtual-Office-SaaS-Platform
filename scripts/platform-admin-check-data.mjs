// Read-only operator diagnostic. Never prints account/profile/tenant records or
// keys. Uses the same bounded Data API/Auth Admin transport as the console.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { platformDataConfig, createPlatformDataGateway, PlatformDataError } from '../apps/web/src/features/platform-admin/data-access.ts';
import { readPlatformTelemetry } from '../apps/web/src/features/platform-admin/telemetry.ts';
try {
  const env={...parseEnv(readFileSync(new URL('../apps/web/.env',import.meta.url),'utf8')),...parseEnv(readFileSync(new URL('../apps/web/.env.local',import.meta.url),'utf8'))};
  const config=platformDataConfig(env);if(config.mode!=='supabase')throw new Error('Select the separate Supabase reader.');
  const gateway=createPlatformDataGateway(config);
  const [orgs,users,offices,operations]=await Promise.all([
    gateway.table('organizations',{select:'id,name,status,slug,created_at',order:'created_at.desc,id.asc',limit:'25'}),gateway.users(1,25),
    gateway.table('offices',{select:'id,name,organization_id,created_at,organization:organizations(name)',order:'created_at.desc,id.asc',limit:'25'}),readPlatformTelemetry(env),
  ]);
  const profiles=users.users.length?await gateway.table('profiles',{select:'id,display_name',id:`in.(${users.users.map(u=>u.id).join(',')})`,limit:'25'}):{rows:[]};
  const environments=offices.rows.length?await gateway.table('office_environment_settings',{select:'office_id,revision,config,updated_at',office_id:`in.(${offices.rows.map(o=>o.id).join(',')})`,limit:'25'}):{rows:[]};
  const detail=users.users.length?await gateway.user(users.users[0].id):null;
  console.log(JSON.stringify({project:config.project,readOnly:true,directories:{organizations:orgs.rows.length,authAccounts:users.users.length,
    profilesOnAccountPage:profiles.rows.length,offices:offices.rows.length,distinctOfficeOrganizations:new Set(offices.rows.map(row=>row.organization_id)).size,
    environmentSettings:environments.rows.length,authAccountDetailVerified:users.users.length===0||Boolean(detail)},operations},null,2));
}catch(error){console.error(error instanceof PlatformDataError?`${error.category}: ${error.message}`:'Read-only integration diagnostic could not complete. No raw records or credentials were printed.');process.exitCode=1;}
