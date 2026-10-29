import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const config={version:1,layout:'open-office',theme:'warm-wood',decor:'balanced',furniture:'standard',overrides:{accent:'ocean',rug:'runner',planter:'terracotta',branding:'TEST COMPANY'}};
test('environment migration: real PostgreSQL owner enforcement, tenant isolation, version conflicts and validation',{timeout:60000},async()=>{
  const db=new PGlite();try{
    await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
      create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'$$;
      grant usage on schema auth to anon,authenticated;insert into auth.users select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'fixture'||i||'@environment.invalid',case when i<5 then now() else null end,null from generate_series(1,5) i;`);
    for(const name of ['20261021000100_organization_foundation.sql','20261029000100_office_environments.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
    const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),role:'authenticated'})]);await db.exec('set role authenticated');};
    await as(1);const org1=(await db.query("select public.create_organization('Environment fixture A',gen_random_uuid()) as id")).rows[0].id;
    await as(2);const org2=(await db.query("select public.create_organization('Environment fixture B',gen_random_uuid()) as id")).rows[0].id;
    await db.exec('reset role');const offices=(await db.query('select id,organization_id from public.offices')).rows,office1=offices.find(o=>o.organization_id===org1).id,office2=offices.find(o=>o.organization_id===org2).id;
    await db.query("insert into public.organization_members(organization_id,user_id,role) values ($1,$2,'ADMIN'),($1,$3,'MEMBER'),($1,$4,'OWNER')",[org1,id(3),id(4),id(5)]);
    const save=(office,revision,value=config)=>db.query('select public.save_office_environment($1,$2,$3::jsonb) as value',[office,revision,JSON.stringify(value)]);
    await as(1);let saved=(await save(office1,0)).rows[0].value;assert.equal(saved.revision,1);assert.deepEqual(saved.config,config);
    assert.equal((await save(office1,1)).rows[0].value.revision,1,'idempotent same configuration');
    await assert.rejects(()=>save(office1,0),/Environment changed/);await assert.rejects(()=>save(office2,0),/Office owner required/);
    for(const invalid of [{...config,theme:'foreign-url'},{...config,overrides:{...config.overrides,branding:'<script>'}},{...config,geometry:{}},{...config,overrides:{...config.overrides,planter:null}}])await assert.rejects(()=>save(office1,1,invalid),/Invalid environment/);
    await as(3);await assert.rejects(()=>save(office1,1),/Office owner required/);assert.equal((await db.query('select config,revision from public.office_environment_settings')).rows.length,1,'member read allowed');
    await as(4);await assert.rejects(()=>save(office1,1),/Office owner required/);
    await assert.rejects(()=>db.query('update public.office_environment_settings set revision=99'),/permission denied/);
    await as(5);await assert.rejects(()=>save(office1,1),/Verified owner required/);
    await as(2);assert.equal((await db.query('select config,revision from public.office_environment_settings')).rows.length,0,'other tenant rows hidden');
    await save(office2,0,{...config,layout:'training-hub'});
    await db.exec('reset role');await db.query("update public.organizations set status='SUSPENDED' where id=$1",[org1]);await as(1);await assert.rejects(()=>save(office1,1),/Office owner required/);assert.equal((await db.query('select config from public.office_environment_settings')).rows.length,0,'suspended tenant hidden');
    await db.exec('reset role;set role anon');await assert.rejects(()=>save(office1,1),/permission denied/);
    console.info('Environment SQL assertions passed in isolated in-memory PostgreSQL. No remote migration or real user data.');
  }finally{await db.close();}
});
