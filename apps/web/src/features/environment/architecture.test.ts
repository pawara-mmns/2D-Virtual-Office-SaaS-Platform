import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundaryCells, cellKey, doorClearance, doorway, rectangleCells, roomCells } from '../../../../../packages/shared/src/environment/architecture.ts';
import { defaultEnvironment, decorPacks, furnitureSets, layouts, themes } from '../../../../../packages/shared/src/environment/catalog.ts';
import { composeEnvironment } from '../../../../../packages/shared/src/environment/compose.ts';
import { floorPlans } from '../../../../../packages/shared/src/environment/plans.ts';
import { fixtures } from '../../../../../packages/shared/src/environment/rooms.ts';
import { environmentAtlas } from '../../../../../packages/shared/src/environment/assets.ts';
import { blocked, mapMarkers, tileLayer, type OfficeMap } from '../../../../../packages/shared/src/map.ts';

function reachable(map: OfficeMap) {
  const spawn=mapMarkers(map).find(m=>m.type==='spawn')!,queue=[[Math.floor(spawn.x/32),Math.floor(spawn.y/32)]],seen=new Set<string>();
  while(queue.length){const [x,y]=queue.pop()!;if(seen.has(cellKey(x!,y!))||blocked(map,x!,y!))continue;seen.add(cellKey(x!,y!));queue.push([x!-1,y!],[x!+1,y!],[x!,y!-1],[x!,y!+1]);}
  return seen;
}

test('architectural props occupy distinct atlas rectangles and never overwrite existing furniture artwork',()=>{
  const occupied=new Set<string>();
  for(const [name,[x,y,w,h]]of Object.entries(fixtures)) {
    assert.ok([x,y,w,h].every(v=>Number.isInteger(v)&&v%32===0));assert.ok(x>=0&&y>=64||name==='water');assert.ok(x+w<=environmentAtlas.width&&y+h<=environmentAtlas.height);
    for(const [a,b]of rectangleCells([x/32,y/32,w/32,h/32])){assert.ok(!occupied.has(cellKey(a,b)),name+' overlaps another source sprite');occupied.add(cellKey(a,b));}
  }
});

test('architectural rooms have closed perimeters except their declared usable doorway openings',()=>{
  for(const layout of layouts) {
    const plan=floorPlans[layout.id],map=composeEnvironment({...defaultEnvironment,layout:layout.id}),architecture=tileLayer(map,'Architecture'),used=new Set<string>();
    assert.equal(new Set(plan.rooms.map(r=>r.id)).size,plan.rooms.length,'Unique module IDs');
    assert.ok(plan.rooms.some(r=>r.wings?.length),'A stepped room breaks the rectangular grid');
    for(const room of plan.rooms) {
      const cells=roomCells(room),openings=new Set(room.doors.flatMap(d=>rectangleCells(doorway(room,d))).map(([x,y])=>cellKey(x,y)));
      for(const key of cells){assert.ok(!used.has(key),'Room footprints do not overlap: '+layout.id+' '+key);used.add(key);const [x,y]=key.split(',').map(Number);assert.ok(x!>0&&y!>0&&x!<plan.width-1&&y!<plan.height-1);}
      const boundary=boundaryCells(cells),edge=new Set(boundary.map(([x,y])=>cellKey(x,y)));
      for(const key of openings)assert.ok(edge.has(key),'Door lies on actual room perimeter');
      for(const [x,y]of boundary) {
        const open=openings.has(cellKey(x,y));assert.equal(blocked(map,x,y),!open,layout.id+' '+room.id+' perimeter '+x+','+y);
        assert.equal(architecture.data[y*map.width+x]===0,open,'Architecture and collision agree at doorway');
      }
    }
  }
});

test('all decor/furniture recipes preserve complete door approaches, corridor connectivity and safe prop footprints',()=>{
  for(const layout of layouts)for(const theme of themes)for(const decor of decorPacks)for(const furniture of furnitureSets) {
    const plan=floorPlans[layout.id],map=composeEnvironment({...defaultEnvironment,layout:layout.id,theme:theme.id,decor:decor.id,furniture:furniture.id}),seen=reachable(map);
    const architecture=tileLayer(map,'Architecture'),objects=map.layers.find(l=>l.name==='Placements');
    const protectedCells=new Set<string>();
    for(const room of plan.rooms)for(const door of room.doors) {
      assert.ok(door.width>=2,'Door openings accommodate the avatar foot body');
      for(const [x,y]of rectangleCells(doorClearance(room,door))) {
        protectedCells.add(cellKey(x,y));assert.ok(seen.has(cellKey(x,y)),layout.id+' '+room.id+' clear approach '+x+','+y);
        // A 14x10 foot body fits in every approach cell, not just at its center.
        for(const px of [x*32+9,x*32+22])for(const py of [y*32+14,y*32+23])assert.ok(!blocked(map,Math.floor(px/32),Math.floor(py/32)));
      }
    }
    let corridor=0;
    for(const [i,gid]of tileLayer(map,'Floor').data.entries())if(gid===30&&!blocked(map,i%map.width,Math.floor(i/map.width))){corridor++;assert.ok(seen.has(cellKey(i%map.width,Math.floor(i/map.width))));}
    assert.ok(corridor>=60,'Usable shared circulation connects rooms');
    const occupied=new Set<string>();
    if(objects?.type==='objectgroup')for(const p of objects.objects)for(const [x,y]of rectangleCells([p.x/32,p.y/32,p.width!/32,p.height!/32])) {
      const key=cellKey(x,y);assert.ok(!occupied.has(key),'No overlapping props');occupied.add(key);
      assert.ok(!protectedCells.has(key),'Furniture cannot enter protected doorway approaches');assert.equal(architecture.data[y*map.width+x],0,'Furniture cannot cover a partition');assert.ok(blocked(map,x,y));
    }
    assert.ok(objects?.type==='objectgroup'&&objects.objects.some(p=>['printer','copier','printerStand'].includes(p.name)&&p.type==='utility'),'Purposeful print/storage module');
  }
});

test('theme-specific assets retain architectural boundaries and composed maps cannot mutate cached structures',()=>{
  for(const layout of layouts) {
    const first=composeEnvironment({...defaultEnvironment,layout:layout.id}),expected=[...tileLayer(first,'Collision').data];
    const boundary=tileLayer(first,'Architecture').data.map(Boolean);
    for(const theme of themes)assert.deepEqual(tileLayer(composeEnvironment({...defaultEnvironment,layout:layout.id,theme:theme.id}),'Architecture').data.map(Boolean),boundary);
    tileLayer(first,'Collision').data.fill(0);tileLayer(first,'Architecture').data.fill(0);tileLayer(first,'Floor').data.fill(0);
    assert.deepEqual(tileLayer(composeEnvironment({...defaultEnvironment,layout:layout.id}),'Collision').data,expected);
  }
  const warm=tileLayer(composeEnvironment(defaultEnvironment),'Architecture').data,dark=tileLayer(composeEnvironment({...defaultEnvironment,theme:'dark-tech'}),'Architecture').data;
  assert.notDeepEqual(warm,dark,'Dark technical screens use glazing where other themes use low dividers');
});
