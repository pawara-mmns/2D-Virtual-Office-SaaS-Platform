import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { accents,decorPacks,defaultEnvironment,environmentCombinations,furnitureSets,layouts,parseEnvironment,planters,rugs,themes } from '../../../../../packages/shared/src/environment/catalog.ts';
import { composeEnvironment } from '../../../../../packages/shared/src/environment/compose.ts';
import { environmentPaint } from '../../../../../packages/shared/src/environment/visuals.ts';
import type { EnvironmentDatabase } from '../../../../../packages/shared/src/environment/database.ts';
import { blocked,mapMarkers,tileLayer } from '../../../../../packages/shared/src/map.ts';
import { mapVersion } from '../../../../../packages/shared/src/protocol.ts';
import { meetingZone } from '../../../../../packages/shared/src/voice.ts';
import { loadEnvironment,saveEnvironment } from './service.ts';
const id='00000000-0000-4000-8000-000000000001';
const clone=()=>structuredClone(defaultEnvironment);
const client=(fetcher:typeof fetch)=>createClient<EnvironmentDatabase>('https://fixture.invalid','synthetic-public-key',{global:{fetch:fetcher},auth:{persistSession:false,autoRefreshToken:false}});
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('all 225 core compositions have sealed bounds, connected room markers, a valid meeting zone and deterministic shared geometry',()=>{
  const fingerprints=new Set();
  for(const layout of layouts)for(const theme of themes)for(const decor of decorPacks)for(const furniture of furnitureSets){
    const config={...clone(),layout:layout.id,theme:theme.id,decor:decor.id,furniture:furniture.id},map=composeEnvironment(config),markers=mapMarkers(map),spawn=markers.find(m=>m.type==='spawn')!;
    const queue=[[Math.floor(spawn.x/32),Math.floor(spawn.y/32)]],seen=new Set<string>();
    while(queue.length){const [x,y]=queue.pop()!,key=x+','+y;if(seen.has(key)||blocked(map,x!,y!))continue;seen.add(key);queue.push([x!+1,y!],[x!-1,y!],[x!,y!+1],[x!,y!-1]);}
    for(const marker of markers)assert.ok(seen.has(Math.floor(marker.x/32)+','+Math.floor(marker.y/32)),layout.id+' '+decor.id+' '+furniture.id+' '+marker.name);
    let walkable=0;for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++)if(!blocked(map,x,y))walkable++;
    assert.equal(seen.size,walkable,layout.id+' '+decor.id+' '+furniture.id+' has no isolated walkable pockets');
    const placed=map.layers.find(l=>l.name==='Placements');
    if(placed?.type==='objectgroup')for(const p of placed.objects){const x=p.x/32,y=p.y/32,w=p.width!/32,h=p.height!/32;const neighbors:number[][]=[];for(let i=0;i<w;i++)neighbors.push([x+i,y-1],[x+i,y+h]);for(let j=0;j<h;j++)neighbors.push([x-1,y+j],[x+w,y+j]);assert.ok(neighbors.some(([a,b])=>seen.has(a+','+b)),p.name+' has a reachable approach');}

    const meeting=markers.find(m=>m.name==='MEETING ROOM')!;assert.equal(meetingZone(map,meeting.x,meeting.y),'Meeting Room');assert.equal(meetingZone(map,spawn.x,spawn.y),null);
    assert.equal(mapVersion(map),mapVersion(composeEnvironment(structuredClone(config))));fingerprints.add(mapVersion(map));
    assert.ok(tileLayer(map,'Furniture').data.filter(Boolean).length>=80,'Richness comes from usable room modules');
  }
  assert.equal(fingerprints.size,225);
});
test('10,800 finite combinations have distinct visual recipes without materializing map files',{timeout:60000},()=>{
  const recipes=new Set(),versions=new Set();const began=performance.now();
  for(const layout of layouts)for(const theme of themes)for(const decor of decorPacks)for(const furniture of furnitureSets)for(const accent of accents)for(const rug of rugs)for(const planter of planters){
    const config={...clone(),layout:layout.id,theme:theme.id,decor:decor.id,furniture:furniture.id,overrides:{...clone().overrides,accent:accent.id,rug:rug.id,planter:planter.id}};
    const map=composeEnvironment(config),paint=environmentPaint(map,config);versions.add(mapVersion(map));
    // Exclude the configuration metadata; uniqueness must come from visible
    // atlas selection, actual tile placement, rug geometry and branding accent.
    const visible={theme:config.theme,layers:map.layers.filter(l=>['Floor','Architecture','Furniture','Details','Branding'].includes(l.name)),rugs:paint.rugs,accent:paint.accent};
    recipes.add(createHash('sha256').update(JSON.stringify(visible)).digest('hex'));
  }
  assert.equal(environmentCombinations,10800);assert.equal(recipes.size,10800);assert.equal(versions.size,10800);console.info(JSON.stringify({environmentCombinations:recipes.size,totalValidationMs:Math.round(performance.now()-began),scope:'deterministic composition and visual recipes, not frame-rate benchmarking'}));
});
test('strict versioned configuration rejects unknown keys, external assets, geometry injection and invalid overrides',()=>{
  for(const value of [null,[],{...clone(),version:2},{...clone(),layout:'custom-url'},{...clone(),assetUrl:'https://invalid'},{...clone(),overrides:{...clone().overrides,x:2}},{...clone(),overrides:{...clone().overrides,branding:'<script>'}},{...clone(),overrides:{...clone().overrides,branding:'A'.repeat(33)}}])assert.throws(()=>parseEnvironment(value));
  assert.ok(parseEnvironment({...clone(),overrides:{...clone().overrides,branding:String.fromCodePoint(0x1f331).repeat(32)}}));
  const frozen=JSON.stringify(defaultEnvironment);composeEnvironment(clone());assert.equal(JSON.stringify(defaultEnvironment),frozen);
});
test('environment loading distinguishes migration rollout from outages and validates persisted rows',async()=>{
  assert.deepEqual(await loadEnvironment(client(async()=>response([])),id),{config:clone(),available:true,revision:0});
  assert.deepEqual(await loadEnvironment(client(async()=>response({code:'42P01'},404)),id),{available:false,revision:0});
  await assert.rejects(()=>loadEnvironment(client(async()=>response({code:'503'},503)),id),/could not be loaded/);
  await assert.rejects(()=>loadEnvironment(client(async()=>response([{config:{...clone(),theme:'forged'},revision:1}])),id),/could not be loaded/);
  const saved=await loadEnvironment(client(async url=>{assert.equal(new URL(String(url)).searchParams.get('office_id'),'eq.'+id);return response([{config:clone(),revision:4}]);}),id);assert.equal(saved.revision,4);
});
test('save uses only the owner RPC and expected revision; invalid options never reach persistence',async()=>{
  let calls=0;const db=client(async(url,options)=>{calls++;assert.ok(String(url).endsWith('/rpc/save_office_environment'));const body=JSON.parse(String(options?.body));assert.deepEqual(body,{p_office_id:id,p_expected_revision:2,p_config:clone()});return response({config:clone(),revision:3});});
  assert.equal((await saveEnvironment(db,id,2,clone())).revision,3);
  await assert.rejects(()=>saveEnvironment(db,id,-1,clone()));await assert.rejects(()=>saveEnvironment(db,id,2,{...clone(),layout:'wrong'}));assert.equal(calls,1);
  for(const [code,message] of [['42501',/active workspace owner/],['40001',/Another owner/],['PGRST202',/database migration/]] as const)await assert.rejects(()=>saveEnvironment(client(async()=>response({code},400)),id,0,clone()),message);
});
