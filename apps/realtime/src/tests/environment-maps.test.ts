import assert from 'node:assert/strict';
import{test}from'node:test';import{readFileSync}from'node:fs';
import{supabaseEnvironmentMaps}from'../environment/maps.ts';import type{Authorization}from'../auth/authorize.ts';
import{defaultEnvironment,type EnvironmentConfig}from'../../../../packages/shared/src/environment/catalog.ts';
import{mapVersion}from'../../../../packages/shared/src/protocol.ts';import{composeEnvironment}from'../../../../packages/shared/src/environment/compose.ts';import{validateOfficeMap}from'../../../../packages/shared/src/map.ts';
test('environment map adapter binds the caller bearer and office, caches per tenant and refreshes admission configuration',async()=>{
  const original=globalThis.fetch,id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const auth=(n:number):Authorization=>({officeId:id(n),organizationId:id(n+100),userId:id(n+200),token:'synthetic-'+n,expiresAt:Date.now()+60000,checkedAt:Date.now(),avatarKey:'fern',displayName:'Fixture'});
  const legacy=validateOfficeMap(JSON.parse(readFileSync(new URL('../../../web/public/office/studio.json',import.meta.url),'utf8')));
  let count=0,mode='ok';const records=new Map<string,EnvironmentConfig>([[id(1),structuredClone(defaultEnvironment)],[id(2),{...defaultEnvironment,theme:'dark-tech'}]]);
  globalThis.fetch=async(url,options)=>{count++;const parsed=new URL(String(url)),office=parsed.searchParams.get('office_id')!.slice(3);assert.equal(parsed.origin,'https://environment.invalid');assert.equal(new Headers(options?.headers).get('authorization'),'Bearer synthetic-'+(office===id(1)?1:2));
    if(mode==='migration')return new Response(JSON.stringify({code:'42P01'}),{status:404,headers:{'Content-Type':'application/json'}});
    if(mode==='denied')return new Response(JSON.stringify({code:'42501'}),{status:400,headers:{'Content-Type':'application/json'}});
    return new Response(JSON.stringify(mode==='empty'?[]:[{config:mode==='invalid'?{...defaultEnvironment,layout:'forged'}:records.get(office),revision:1}]),{headers:{'Content-Type':'application/json'}});};
  try{const load=supabaseEnvironmentMaps('https://environment.invalid','synthetic-public-key',legacy);
    const first=await load(auth(1));assert.equal(mapVersion(first),mapVersion(composeEnvironment(defaultEnvironment)));await load(auth(1));assert.equal(count,1);
    const second=await load(auth(2));assert.notEqual(mapVersion(first),mapVersion(second));assert.equal(count,2);
    records.set(id(1),{...defaultEnvironment,layout:'training-hub'});assert.equal(mapVersion(await load(auth(1))),mapVersion(first));assert.notEqual(mapVersion(await load(auth(1),true)),mapVersion(first));assert.equal(count,3);
    mode='migration';assert.equal(await load(auth(1),true),legacy);mode='denied';await assert.rejects(()=>load(auth(1),true),/unavailable/);mode='invalid';await assert.rejects(()=>load(auth(1),true));mode='empty';assert.equal(mapVersion(await load(auth(1),true)),mapVersion(composeEnvironment(defaultEnvironment)));
  }finally{globalThis.fetch=original;}
});
