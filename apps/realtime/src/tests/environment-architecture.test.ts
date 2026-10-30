import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundaryCells, cellKey, doorway, rectangleCells, roomCells } from '../../../../packages/shared/src/environment/architecture.ts';
import { defaultEnvironment, decorPacks, furnitureSets, layouts, themes } from '../../../../packages/shared/src/environment/catalog.ts';
import { composeEnvironment } from '../../../../packages/shared/src/environment/compose.ts';
import { floorPlans } from '../../../../packages/shared/src/environment/plans.ts';
import { canStand, simulate, type Position } from '../movement/simulation.ts';

test('authoritative foot-body simulation crosses every architectural doorway in both directions and rejects solid room boundaries',()=>{
  for(const layout of layouts)for(const theme of themes)for(const decor of decorPacks)for(const furniture of furnitureSets) {
    const map=composeEnvironment({...defaultEnvironment,layout:layout.id,theme:theme.id,decor:decor.id,furniture:furniture.id});
    for(const room of floorPlans[layout.id].rooms) {
      const openings=new Set<string>();
      for(const door of room.doors) {
        const rect=doorway(room,door),[x,y,w,h]=rect;
        for(const [a,b]of rectangleCells(rect))openings.add(cellKey(a,b));
        const dx=door.side==='west'?1:door.side==='east'?-1:0,dy=door.side==='north'?1:door.side==='south'?-1:0;
        const cx=(x+w/2)*32,cy=(y+h/2)*32-11;
        const player:Position={x:cx-dx*32,y:cy-dy*32,direction:'down',isMoving:false};
        assert.ok(canStand(map,player.x,player.y),layout.id+' '+room.id+' approach');
        for(let i=0;i<16;i++)simulate(map,player,{x:dx,y:dy});
        assert.equal(player.x,cx+dx*64,layout.id+' '+room.id+' inward x');assert.equal(player.y,cy+dy*64,'inward y');
        for(let i=0;i<16;i++)simulate(map,player,{x:-dx,y:-dy});
        assert.equal(player.x,cx-dx*32,'outward x');assert.equal(player.y,cy-dy*32,'outward y');
      }
      for(const [x,y]of boundaryCells(roomCells(room)))if(!openings.has(cellKey(x,y)))assert.equal(canStand(map,(x+.5)*32,(y+.5)*32-11),false,'Full, glass and low partitions all block movement');
    }
  }
});

test('authoritative simulation preserves decorated passage lanes and collides with freestanding corridor props',()=>{
  for(const layout of layouts)for(const theme of themes)for(const decor of decorPacks)for(const furniture of furnitureSets) {
    const map=composeEnvironment({...defaultEnvironment,layout:layout.id,theme:theme.id,decor:decor.id,furniture:furniture.id});
    const lanes=map.layers.find(l=>l.name==='PassageLanes'),placed=map.layers.find(l=>l.name==='Placements');
    assert.ok(lanes?.type==='objectgroup'&&placed?.type==='objectgroup');
    const run=lanes.objects.find(p=>p.width!>=4*32)!;assert.ok(run,'A protected horizontal route is available');
    const start={x:run.x+16,y:run.y+5,direction:'down' as const,isMoving:false},player:Position={...start};
    for(let i=0;i<16;i++)simulate(map,player,{x:1,y:0});assert.equal(player.x,start.x+96,'Central lane remains traversable');
    for(const p of placed.objects.filter(p=>p.type==='passage')) {
      const x=p.x+16,y=p.y+5;assert.equal(canStand(map,x,y),false,'Prop footprint blocks the authoritative foot body');
      const approach=[[1,0],[-1,0],[0,1],[0,-1]].find(([dx,dy])=>canStand(map,x+dx!*32,y+dy!*32));assert.ok(approach);
      const [dx,dy]=approach,body:Position={x:x+dx!*32,y:y+dy!*32,direction:'down',isMoving:false},before={...body};
      for(let i=0;i<16;i++)simulate(map,body,{x:-dx!,y:-dy!});
      assert.ok((body.x-before.x)*-dx!+(body.y-before.y)*-dy!<32,'Movement stops against corridor prop');
    }
  }
});
