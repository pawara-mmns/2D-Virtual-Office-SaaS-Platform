import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {avatarCatalog,defaultCustomization,parseCustomization} from '../packages/shared/src/avatar-customization.ts';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('isolated PostgreSQL: catalog parity, save/reload, self-only RLS, anonymous denial and legacy preservation',{timeout:60000},async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
   create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'$$;
   grant usage on schema auth to anon,authenticated;
   insert into auth.users(id,email_confirmed_at) values('${id(1)}',now()),('${id(2)}',now());`);
  for(const name of ['20261021000100_organization_foundation.sql','20261110000100_modular_avatar_appearance.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  const valid=async value=>(await db.query('select private.valid_avatar_appearance($1::jsonb) as ok',[JSON.stringify(value)])).rows[0].ok;
  for(const[key,options]of Object.entries(avatarCatalog))for(const option of options){
   const config={...defaultCustomization,[key]:option,...(key==='top'&&option==='dress'?{bottom:'none'}:{})};
   assert.equal(await valid(config),(()=>{try{parseCustomization(config);return true}catch{return false}})(),key+'/'+option);
  }
  for(const bad of [null,[],{}, {...defaultCustomization,version:'1'},{...defaultCustomization,version:2},{...defaultCustomization,hair:'remote.png'},{...defaultCustomization,extra:true},{...defaultCustomization,top:'dress'},{...defaultCustomization,skinColor:'#fff'}])assert.equal(await valid(bad),false);
  const as=async n=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),role:'authenticated'})]);await db.exec('set role authenticated');};
  await as(1);await db.query('insert into public.profiles(id,display_name,avatar_key) values($1,$2,$3)',[id(1),'Taylor','plum']);
  assert.equal((await db.query('select avatar_appearance from public.profiles')).rows[0].avatar_appearance,null,'migration does not overwrite presets');
  await db.query('update public.profiles set avatar_appearance=$1::jsonb where id=$2',[JSON.stringify(defaultCustomization),id(1)]);
  assert.deepEqual((await db.query('select avatar_appearance from public.profiles')).rows[0].avatar_appearance,defaultCustomization);
  await as(2);assert.equal((await db.query('select * from public.profiles')).rows.length,0);
  assert.equal((await db.query('update public.profiles set avatar_appearance=null where id=$1 returning id',[id(1)])).rows.length,0);
  await assert.rejects(()=>db.query('insert into public.profiles(id,avatar_appearance) values($1,$2::jsonb)',[id(1),JSON.stringify(defaultCustomization)]),/row-level security/);
  await db.query('insert into public.profiles(id,avatar_key,avatar_appearance) values($1,$2,$3::jsonb)',[id(2),'harbor',JSON.stringify(defaultCustomization)]);
  for(const bad of [{...defaultCustomization,version:3},{...defaultCustomization,body:'../file'},{...defaultCustomization,shoeColor:'red'}])await assert.rejects(()=>db.query('update public.profiles set avatar_appearance=$1::jsonb',[JSON.stringify(bad)]),/check constraint/);
  await assert.rejects(()=>db.query('update public.profiles set id=$1',[id(1)]),/permission denied/);
  await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select avatar_appearance from public.profiles'),/permission denied/);await assert.rejects(()=>db.query('update public.profiles set avatar_appearance=null'),/permission denied/);
  await as(1);assert.equal((await db.query('select avatar_key from public.profiles')).rows[0].avatar_key,'plum');await db.query('update public.profiles set avatar_appearance=null');
  assert.equal((await db.query('select avatar_appearance from public.profiles')).rows[0].avatar_appearance,null);
 }finally{await db.close();}
});
