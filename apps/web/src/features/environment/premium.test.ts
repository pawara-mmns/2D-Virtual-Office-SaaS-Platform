import assert from 'node:assert/strict';
import {test} from 'node:test';
import {composeEnvironment} from '../../../../../packages/shared/src/environment/compose.ts';
import {defaultEnvironment,themes,layouts} from '../../../../../packages/shared/src/environment/catalog.ts';
import {environmentAtmosphere} from '../../../../../packages/shared/src/environment/visuals.ts';
import {tileLayer} from '../../../../../packages/shared/src/map.ts';
import {interactionRegistry} from '../../../../../packages/shared/src/interactions.ts';
import {emptyDecoration,resolvedObjects,composeDecoratedEnvironment,editorAsset} from '../../../../../packages/shared/src/environment/decoration.ts';
import {premiumDefinitions,expandedFixtures,directionalChairRects} from '../../../../../packages/shared/src/environment/assets.ts';

test('premium cosmetics stay on interior floor without changing collision, seats or map data',()=>{
  for(const theme of themes)for(const layout of layouts){
    const config={...defaultEnvironment,theme:theme.id,layout:layout.id,decor:'rich' as const},map=composeEnvironment(config),before=JSON.stringify(map),paint=environmentAtmosphere(map,config);
    assert.ok(paint.length>100&&paint.length<20000);
    for(const p of paint){assert.ok([p.x,p.y,p.width,p.height].every(Number.isInteger));const i=Math.floor(p.y/32)*map.width+Math.floor(p.x/32);assert.ok(tileLayer(map,'Floor').data[i]);assert.equal(tileLayer(map,'Architecture').data[i],0);assert.ok(p.alpha>0&&p.alpha<=1);}
    assert.equal(JSON.stringify(map),before);
    assert.deepEqual(paint,environmentAtmosphere(map,config));
  }
});
test('new original assets retain native footprints and usable seats without granting display capabilities',()=>{
  for(const id of Object.keys(premiumDefinitions)){const a=editorAsset(id)!;assert.ok(a);assert.deepEqual(a.orientations,['down']);assert.ok(expandedFixtures[id as keyof typeof premiumDefinitions][1]>=960);}
  assert.equal(expandedFixtures.deskSingle[1],256,'existing atlas positions do not shift');
  assert.ok(directionalChairRects.chair.up[1]<960);
  const config={...defaultEnvironment,decor:'rich' as const,furniture:'executive' as const},map=composeEnvironment(config),seats=interactionRegistry(map);
  for(const asset of ['beanBag','deskTriple']){const s=seats.find(s=>s.assetId===asset);assert.ok(s,asset+' is actually placed and usable');assert.deepEqual(s.actions,['SIT','STAND']);assert.ok(s.slots.every(s=>s.approaches.length>0));}
  assert.ok(!seats.some(s=>['wallDisplay','gameConsole'].includes(s.assetId)));
});
test('saved owner furniture takes priority over newly introduced optional decorations',()=>{
  const map=composeEnvironment(defaultEnvironment),p=map.layers.flatMap(l=>l.type==='objectgroup'?l.objects:[]).find(p=>p.name==='beanBag'&&p.optionalDecoration)!;
  assert.ok(p);const doc={...emptyDecoration(),objects:[{id:'custom/00000000-0000-4000-8000-000000000123',assetId:'chairLounge',x:p.x,y:p.y,orientation:'down' as const}]};
  const resolved=resolvedObjects(defaultEnvironment,doc);assert.ok(!resolved.some(o=>o.assetId==='beanBag'&&o.x===p.x&&o.y===p.y));
  const composed=composeDecoratedEnvironment(defaultEnvironment,doc);assert.ok(interactionRegistry(composed).some(o=>o.instanceId===doc.objects[0]!.id));
  assert.deepEqual(resolvedObjects(defaultEnvironment,emptyDecoration()).filter(o=>o.assetId==='beanBag').length,1,'new decor returns only after owner removes the competing override');
});
