import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultEnvironment, layouts, themes, decorPacks, furnitureSets } from '../../../../../packages/shared/src/environment/catalog.ts';
import { composeEnvironment } from '../../../../../packages/shared/src/environment/compose.ts';
import { passageGeometry } from '../../../../../packages/shared/src/environment/passages.ts';
import { floorPlans } from '../../../../../packages/shared/src/environment/plans.ts';
import { rectangleCells, roomCells } from '../../../../../packages/shared/src/environment/architecture.ts';
import { assetDefinitions, type ExpandedAsset } from '../../../../../packages/shared/src/environment/assets.ts';
import { environmentPaint } from '../../../../../packages/shared/src/environment/visuals.ts';
import { blocked, tileLayer, type OfficeMap } from '../../../../../packages/shared/src/map.ts';

const objects=(map:OfficeMap,name:string)=>{const layer=map.layers.find(l=>l.name===name);return layer?.type==='objectgroup'?layer.objects:[];};
const cells=(p:{x:number;y:number;width?:number;height?:number})=>rectangleCells([p.x/32,p.y/32,p.width!/32,p.height!/32]);

test('all corridor recipes preserve central lanes, door approaches, room boundaries and every passage component',()=>{
  for(const layout of layouts)for(const theme of themes)for(const decor of decorPacks)for(const furniture of furnitureSets) {
    const config={...defaultEnvironment,layout:layout.id,theme:theme.id,decor:decor.id,furniture:furniture.id},map=composeEnvironment(config),plan=floorPlans[layout.id];
    const floor=tileLayer(map,'Floor').data,architecture=tileLayer(map,'Architecture').data,geometry=passageGeometry(plan,floor,architecture),collision=tileLayer(map,'Collision').data;
    for(const i of geometry.lanes)assert.equal(collision[i],0,layout.id+' central/door/spawn lane '+i);
    for(const p of objects(map,'PassageLanes'))for(const [x,y]of cells(p))assert.equal(blocked(map,x,y),false,'Published lane metadata stays usable');
    for(const component of geometry.components) {
      const remaining=component.filter(i=>!collision[i]),seen=new Set<number>(),queue=[remaining[0]!];
      while(queue.length){const i=queue.pop()!;if(seen.has(i)||collision[i]||!geometry.walkable.has(i))continue;seen.add(i);queue.push(i-1,i+1,i-map.width,i+map.width);}
      assert.equal(seen.size,remaining.length,layout.id+' every remaining corridor tile stays connected');
    }
    const roomMask=new Set(plan.rooms.flatMap(r=>[...roomCells(r)]));
    const props=objects(map,'Placements').filter(p=>p.type==='passage');assert.ok(props.length>=1&&props.length<=6);
    for(const p of props) {
      assert.ok(p.width!*p.height!<=2*32*32,'Circulation uses compact props');
      assert.ok(!['serverRack','copier','filesTall','lockerBank','fridgeMini'].includes(p.name),'Passages are not storage zones');
      let touchesWall=false;
      for(const [x,y]of cells(p)) {
        const i=y*map.width+x;assert.ok(geometry.walkable.has(i)&&!geometry.lanes.has(i)&&!geometry.clearance.has(i));
        assert.ok(!roomMask.has(x+','+y));assert.equal(collision[i],1);
        if([i-1,i+1,i-map.width,i+map.width].some(n=>!!architecture[n]))touchesWall=true;
      }
      assert.ok(touchesWall,'Floor props stay beside architectural edges');
    }
  }
});

test('passage profiles cover straight walls, corners, junctions, entrances and thresholds without duplicate clutter',()=>{
  const roles=new Set<string>(),assets=new Set<string>(),profiles=new Set<string>();
  for(const layout of layouts)for(const theme of themes) {
    let previous=0;
    for(const decor of decorPacks) {
      const map=composeEnvironment({...defaultEnvironment,layout:layout.id,theme:theme.id,decor:decor.id}),props=objects(map,'PassageDecor');
      const blocking=objects(map,'Placements').filter(p=>p.type==='passage');assert.ok(blocking.length>=previous,'Decor levels keep a bounded progression');previous=blocking.length;
      assert.ok(props.length>=3&&props.length<=15,'Tasteful bounded decoration budget');
      for(const p of props){roles.add(p.type);assets.add(p.name);}
      if(decor.id==='rich')profiles.add(JSON.stringify(props.map(p=>[p.name,p.type,p.x,p.y])));
      for(const asset of ['directionalSign','wallSconce','clock'])assert.ok(props.filter(p=>p.name===asset).length<=2,'Repeated wall details are capped');
    }
  }
  assert.deepEqual([...roles].sort(),['corner','entrance','junction','straight-wall','threshold']);
  for(const name of ['directionalSign','companyPoster','wallSconce','consoleTable','magazineStand','cornerPlanter','benchWaiting'])assert.ok(assets.has(name),name+' is used');
  assert.ok(profiles.size>=20,'Layout/theme profiles vary their actual corridor content');
});

test('passage wall details have solid supports, runners respect owner choices and recipes cannot leak mutations',()=>{
  for(const layout of layouts) {
    const config={...defaultEnvironment,layout:layout.id,decor:'rich' as const},map=composeEnvironment(config),baseline=composeEnvironment(structuredClone(config));
    const architecture=tileLayer(map,'Architecture').data;
    for(const p of objects(map,'Decorations').filter(p=>p.type==='passage')) {
      assert.equal(assetDefinitions[p.name as ExpandedAsset].mode,'wall');for(const [x,y]of cells(p))assert.ok(architecture[y*map.width+x]);
    }
    const runners=objects(map,'Rugs').filter(p=>p.type==='passage-runner');assert.ok(runners.length>=1&&runners.length<=2);
    for(const p of runners)assert.ok(p.width!>0&&p.height!>0);
    const bare=composeEnvironment({...config,overrides:{...config.overrides,rug:'none'}});assert.equal(objects(bare,'Rugs').filter(p=>p.type==='passage-runner').length,0);
    assert.deepEqual(tileLayer(bare,'Collision').data,tileLayer(map,'Collision').data,'Runners never add collision');assert.equal(environmentPaint(bare,{...config,overrides:{...config.overrides,rug:'none'}}).rugs.length,0);
    for(const p of objects(map,'PassageDecor'))p.x=-1000;
    tileLayer(map,'Details').data.fill(0);assert.deepEqual(composeEnvironment(config),baseline,'Returned map cannot mutate a cached passage recipe');
  }
});
