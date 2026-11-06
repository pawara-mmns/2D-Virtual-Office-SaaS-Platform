import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {editorAssets,assetRect,parseDecoration,emptyDecoration,baseDecorationObjects,resolvedObjects,upsertDecoration,removeDecoration,createDecorationHistory,composeDecoratedEnvironment,composeOfficeEnvironment,validateDecoration,type DecorationObject} from '../../../../../packages/shared/src/environment/decoration.ts';
import {defaultEnvironment,layouts,furnitureSets,themes} from '../../../../../packages/shared/src/environment/catalog.ts';
import {tileLayer,mapMarkers} from '../../../../../packages/shared/src/map.ts';
import {mapVersion} from '../../../../../packages/shared/src/protocol.ts';
import {interactionRegistry,seatApproach} from '../../../../../packages/shared/src/interactions.ts';
import {createSeating} from '../../../../../packages/shared/src/seating.ts';
import {canStand,type MovingPosition} from '../../../../../packages/shared/src/movement.ts';
import {loadDecorationWorkspace,loadPublishedDecoration,persistDecoration} from './service.ts';
import {decorationWriterConfig} from './writer-config.ts';
import type {DecorationDatabase,DecorationWorkspace} from '../../../../../packages/shared/src/environment/decoration-database.ts';
const id='00000000-0000-4000-8000-000000000001',config=defaultEnvironment;
const object=(x:number,y:number,assetId='chairTask',orientation:DecorationObject['orientation']='down'):DecorationObject=>({id:'custom/'+id,assetId,x,y,orientation});
function free(doc=emptyDecoration(),assetId='chairTask',orientation:DecorationObject['orientation']='down',otherId='custom/'+id){
  const map=composeOfficeEnvironment(config);
  for(let y=32;y<map.height*32-64;y+=32)for(let x=32;x<map.width*32-96;x+=32){const o={...object(x,y,assetId,orientation),id:otherId};try{const next=upsertDecoration(doc,o);if(validateDecoration(config,next).ok)return{document:next,object:o};}catch{/* bounded map scan */}}
  throw Error('No free fixture placement');
}
test('editor catalog uses only real artwork and native orientation variants; strict bounded payloads reject injection',()=>{
  assert.equal(editorAssets.length,106);assert.equal(new Set(editorAssets.map(a=>a.id)).size,editorAssets.length);
  for(const a of editorAssets){assert.ok(a.width>0&&a.height>0);if(a.mode!=='floor')for(const d of a.orientations)assert.ok(assetRect(a.id,d));assert.notEqual(a.mode,'structure');}
  const migration=readFileSync(new URL('../../../../../supabase/migrations/20261105000100_office_decorations.sql',import.meta.url),'utf8'),sqlCatalog=JSON.parse(migration.match(/select '(\{.*\})'::jsonb;/)![1]!);
  assert.deepEqual(sqlCatalog,Object.fromEntries(editorAssets.map(a=>[a.id,{width:a.width,height:a.height,mode:a.mode,orientations:a.orientations}])),'SQL allowlist cannot drift from the authored catalog');
  for(const value of [null,{...emptyDecoration(),url:'https://invalid'}, {...emptyDecoration(),objects:[object(32,32,'foreign')]},{...emptyDecoration(),objects:[{...object(32,32),collision:[]}]},{...emptyDecoration(),objects:[object(33,32)]},{...emptyDecoration(),objects:[object(-32,32)]},{...emptyDecoration(),objects:[object(32,32,'deskSingle','left')]},{...emptyDecoration(),objects:[{...object(32,32),id:'custom/'+'-'.repeat(36)}]},{...emptyDecoration(),objects:Array.from({length:161},()=>object(32,32))}])assert.throws(()=>parseDecoration(value));
});
test('all 75 balanced compositions retain registered seating, navigation and deterministic maps in the customization composer',()=>{
  for(const layout of layouts)for(const furniture of furnitureSets)for(const theme of themes){const c={...config,layout:layout.id,furniture:furniture.id,theme:theme.id},base=composeOfficeEnvironment(c);assert.equal(validateDecoration(c,emptyDecoration()).ok,true);assert.equal(mapVersion(composeDecoratedEnvironment(c,emptyDecoration(),1)),mapVersion(composeDecoratedEnvironment(c,emptyDecoration(),1)));
    let added=false;for(let y=32;y<base.height*32-64&&!added;y+=32)for(let x=32;x<base.width*32-64&&!added;x+=32){const doc=upsertDecoration(emptyDecoration(),object(x,y));const result=validateDecoration(c,doc);if(result.ok){assert.ok(interactionRegistry(result.map).some(o=>o.instanceId==='custom/'+id));added=true;}}assert.ok(added,layout.id+'/'+furniture.id+'/'+theme.id+' supports an owner-placed chair');
  }
});
test('add/move/rotate/duplicate/remove and undo/redo preserve base catalog and immutable stable identities',()=>{
  const frozen=JSON.stringify(config),first=free(),history=createDecorationHistory(emptyDecoration());history.apply(first.document);
  const next=free(first.document,'chairTask','down','custom/00000000-0000-4000-8000-000000000002');history.apply(next.document);assert.equal(history.current.objects.length,2);
  const relocated=free(removeDecoration(next.document,first.object.id),'chairTask','left',first.object.id);history.apply(relocated.document);assert.equal(history.current.objects.find(o=>o.id===first.object.id)?.orientation,'left');
  const removed=removeDecoration(history.current,next.object.id);history.apply(removed);assert.equal(history.current.objects.length,1);assert.equal(history.undo().objects.length,2);assert.equal(history.redo().objects.length,1);
  const base=baseDecorationObjects(config).find(o=>o.assetId==='plant')!;assert.ok(base);const hidden=removeDecoration(history.current,base.id);assert.ok(!resolvedObjects(config,hidden).some(o=>o.id===base.id));assert.equal(JSON.stringify(config),frozen);
  assert.throws(()=>parseDecoration({...first.document,objects:[first.object,first.object]}));
});
test('shared final validation rejects architectural, doorway, spawn, corridor, unsupported wall/surface and overlap placements',()=>{
  const map=composeOfficeEnvironment(config),spawn=mapMarkers(map).find(m=>m.type==='spawn')!;
  const group=(name:string)=>{const g=map.layers.find(l=>l.name===name);assert.ok(g?.type==='objectgroup');return g.objects;};
  const doorway=group('Doorways')[0]!,lane=group('PassageLanes')[0]!,solid=tileLayer(map,'Architecture').data.findIndex(Boolean);
  for(const o of [object(0,0),object((solid%map.width)*32,Math.floor(solid/map.width)*32),object(doorway.x,doorway.y),object(lane.x,lane.y),object(Math.floor(spawn.x/32)*32,Math.floor(spawn.y/32)*32),object(32,32,'deskPlant'),object(32,32,'clock'),object(map.width*32,32)])assert.equal(validateDecoration(config,{...emptyDecoration(),objects:[o]}).ok,false);
  const first=free(),overlap={...first.object,id:'custom/00000000-0000-4000-8000-000000000002'};assert.equal(validateDecoration(config,upsertDecoration(first.document,overlap)).ok,false);
  assert.throws(()=>composeDecoratedEnvironment(config,{...emptyDecoration(),removed:['base/unknown/object/32:32']}),/Base office changed/);
});
test('moved owner chairs derive four new cardinal anchors and safe stands; old anchors disappear after reload',()=>{
  for(const direction of ['up','down','left','right'] as const){const placed=free(emptyDecoration(),'chairTask',direction),map=composeDecoratedEnvironment(config,placed.document,4),objects=interactionRegistry(map),chair=objects.find(o=>o.instanceId===placed.object.id)!;assert.ok(chair);
    const slot=chair.slots[0]!;assert.equal(slot.anchor.direction,direction);assert.equal(slot.parentObjectId,placed.object.id);const entry=slot.approaches.find(p=>seatApproach(map,chair,slot,p))!;assert.ok(entry);
    const player:MovingPosition={...entry,direction:'down',isMoving:false},occupied=new Map<string,string>(),service=createSeating(map,occupied);
    assert.equal(service.act('a',player,{action:'SIT',objectId:chair.instanceId,slotId:slot.id,seq:0}),'OK');assert.equal(service.act('b',{...entry,direction:'down',isMoving:false},{action:'SIT',objectId:chair.instanceId,slotId:slot.id,seq:0}),'OCCUPIED');
    assert.equal(service.act('a',player,{action:'STAND',objectId:chair.instanceId,slotId:slot.id,seq:1}),'OK');assert.ok(canStand(map,player.x,player.y));
    assert.equal(interactionRegistry(composeDecoratedEnvironment(config,placed.document,4)).find(o=>o.instanceId===chair.instanceId)?.slots[0]?.id,slot.id);
    assert.ok(!interactionRegistry(composeDecoratedEnvironment(config,removeDecoration(placed.document,placed.object.id),5)).some(o=>o.instanceId===chair.instanceId));
  }
});
test('rugs remain nonblocking; small surface decorations require support and walls remain immutable',()=>{
  const map=composeOfficeEnvironment(config),first=free(emptyDecoration(),'rugGrid'),decorated=composeDecoratedEnvironment(config,first.document,1);assert.deepEqual(tileLayer(map,'Collision').data,tileLayer(decorated,'Collision').data);assert.deepEqual(tileLayer(map,'Architecture').data,tileLayer(decorated,'Architecture').data);
});
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const client=(fetcher:typeof fetch)=>createClient<DecorationDatabase>('https://editor.invalid','synthetic-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetcher}});
const row=():DecorationWorkspace=>({revision:2,publishedRevision:1,baseRevision:0,draftBaseRevision:0,draft:emptyDecoration(),published:emptyDecoration(),previous:emptyDecoration(),previousBaseRevision:0,updatedAt:null,updatedBy:null});
test('editor server credentials are bound to the tenant project, independently of administrator identity credentials',()=>{
  const tenant='https://tenant.invalid',env={SUPABASE_ADMIN_URL:'https://identity.invalid',SUPABASE_SECRET_KEY:'synthetic-identity-key',PLATFORM_DATA_SUPABASE_URL:tenant,PLATFORM_DATA_SUPABASE_SECRET_KEY:'synthetic-tenant-key'};
  assert.deepEqual(decorationWriterConfig(env,tenant),{url:tenant,key:'synthetic-tenant-key'});
  assert.throws(()=>decorationWriterConfig({...env,PLATFORM_DATA_SUPABASE_URL:'https://other.invalid'},tenant),/workspace project/);
  assert.throws(()=>decorationWriterConfig({...env,OFFICE_DECORATION_SUPABASE_URL:'https://other.invalid',OFFICE_DECORATION_SUPABASE_SECRET_KEY:'synthetic-editor-key'},tenant),/workspace Supabase project/);
  assert.deepEqual(decorationWriterConfig({...env,OFFICE_DECORATION_SUPABASE_SECRET_KEY:'synthetic-editor-key'},tenant),{url:tenant,key:'synthetic-editor-key'});
});
test('server persistence authorizes owner before privileged writes, revalidates shared geometry and detects conflicts',async()=>{
  let writes=0;const owner=client(async()=>response(row())),writer=()=>client(async(url,options)=>{writes++;assert.ok(String(url).endsWith('/rpc/write_office_decoration'));const body=JSON.parse(String(options?.body));assert.equal(body.p_actor,id);assert.equal(body.p_expected_revision,2);return response({revision:3,publishedRevision:1});});
  const request={owner,writer,actor:id,officeId:id,config,revision:2,baseRevision:0,operation:'draft',document:free().document};
  assert.equal((await persistDecoration(request)).revision,3);assert.equal(writes,1);
  await assert.rejects(()=>persistDecoration({...request,revision:1}),/changed/);
  await assert.rejects(()=>persistDecoration({...request,document:upsertDecoration(emptyDecoration(),object(0,0))}));
  for(const code of ['42501','PGRST202'])await assert.rejects(()=>persistDecoration({...request,owner:client(async()=>response({code},403))}));assert.equal(writes,1);
  await assert.rejects(()=>persistDecoration({...request,writer:()=>client(async()=>response({code:'40001'},400))}),/changed/);
});
test('published-only reads distinguish missing migration, dependency failure and invalid base association',async()=>{
  assert.equal(await loadPublishedDecoration(client(async()=>response({code:'42P01'},404)),id,0),undefined);
  await assert.rejects(()=>loadPublishedDecoration(client(async()=>response({code:'503'},503)),id,0));
  await assert.rejects(()=>loadPublishedDecoration(client(async()=>response([{published:free().document,published_revision:1,base_revision:7}])),id,0),/revision/);
  assert.equal((await loadPublishedDecoration(client(async()=>response([{published:emptyDecoration(),published_revision:2,base_revision:0}])),id,0))?.revision,2);
  await assert.rejects(()=>loadDecorationWorkspace(client(async()=>response({})),id),/revision/);
});
