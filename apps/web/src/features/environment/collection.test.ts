import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectionCatalog} from '../../../../../packages/shared/src/environment/collection-catalog.ts';
import {collectionGroups,collectionDefinitions} from '../../../../../packages/shared/src/environment/collection.ts';
import {environmentAtlas,expandedFixtures,directionalChairRects} from '../../../../../packages/shared/src/environment/assets.ts';
import {defaultEnvironment} from '../../../../../packages/shared/src/environment/catalog.ts';
import {baseDecorationObjects,composeDecoratedEnvironment,editorAsset,validateDecoration,type DecorationDocument,type DecorationObject} from '../../../../../packages/shared/src/environment/decoration.ts';
import {tileLayer} from '../../../../../packages/shared/src/map.ts';
import {interactionRegistry,seatApproach,standPosition,type Interactable,type Point} from '../../../../../packages/shared/src/interactions.ts';
import {createSeating} from '../../../../../packages/shared/src/seating.ts';
import {canStand,type MovingPosition} from '../../../../../packages/shared/src/movement.ts';

test('Phase 03 has 90 named designs in ten groups, complete native render/interaction contracts and stable previous crop positions',()=>{
  assert.equal(collectionCatalog.length,90);assert.equal(new Set(collectionCatalog.map(a=>a.id)).size,90);
  for(const group of collectionGroups)assert.equal(collectionCatalog.filter(a=>a.collection===group).length,9,group);
  const rects=[...Object.values(expandedFixtures),...Object.values(directionalChairRects).flatMap(v=>Object.entries(v).filter(([d])=>d!=='down').map(([,r])=>r))];
  for(const r of rects){assert.ok(r[0]>=0&&r[1]>=0&&r[0]+r[2]<=environmentAtlas.width&&r[1]+r[3]<=environmentAtlas.height);assert.ok(r.every(n=>n%32===0));}
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i]!,b=rects[j]!;assert.ok(!(a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1]),'Atlas frames never overlap');}
  for(const a of collectionCatalog){assert.ok(editorAsset(a.id));assert.equal(a.themes.length,5);assert.equal(a.render.sampling,'nearest');assert.ok(a.rooms.length);assert.ok(a.atlas[1]>=1152);assert.ok(a.orientations.every(d=>d in a.frames));if(a.interaction.future)assert.deepEqual(a.interaction.actions,[],'Future displays/games never advertise unavailable actions');}
  assert.deepEqual(expandedFixtures.deskSingle,[0,256,64,64]);assert.equal(expandedFixtures.deskTriple[1],960);assert.ok(expandedFixtures.wayfindingLight[1]<1152);assert.ok(directionalChairRects.chair.up[1]<960);
});

test('every new design can be owner-placed on its real support; all new seat slots enforce occupancy and safe standing',()=>{
  // An owner-cleared office, retaining one original table for surface equipment.
  // This exercises actual shared placement/seat validation, not an allow-all map.
  const base=baseDecorationObjects(defaultEnvironment),support=base.find(o=>o.assetId==='tableMedium'||o.assetId==='tableLarge'||o.assetId==='tableSmall')!;
  assert.ok(support);const cleared:DecorationDocument={version:1,objects:[],removed:base.filter(o=>o.id!==support.id).map(o=>o.id)},map=composeDecoratedEnvironment(defaultEnvironment,cleared,1),collision=tileLayer(map,'Collision').data,architecture=tileLayer(map,'Architecture').data,furniture=tileLayer(map,'Furniture').data;
  let serial=1000;
  for(const asset of collectionCatalog){
    const a=editorAsset(asset.id)!;let accepted:{document:DecorationDocument;object:DecorationObject}|undefined;
    for(let y=0;y<=map.height-a.height/32&&!accepted;y++)for(let x=0;x<=map.width-a.width/32&&!accepted;x++){
      const cells=Array.from({length:a.height/32},(_,dy)=>Array.from({length:a.width/32},(_,dx)=>(y+dy)*map.width+x+dx)).flat();
      if(cells.some(i=>a.mode==='wall'?!architecture[i]:a.mode==='surface'?!furniture[i]:collision[i]))continue;
      const object:DecorationObject={id:'custom/00000000-0000-4000-8000-'+String(serial).padStart(12,'0'),assetId:a.id,x:x*32,y:y*32,orientation:'down'},document={...cleared,objects:[object]};
      if(validateDecoration(defaultEnvironment,document).ok)accepted={document,object};
    }
    assert.ok(accepted,asset.id+' has a real valid owner placement');serial++;
    for(const direction of a.orientations){
      const document={...accepted.document,objects:[{...accepted.object,orientation:direction}]},result=validateDecoration(defaultEnvironment,document);assert.ok(result.ok,a.id+' '+direction+' validates');if(!result.ok)continue;
      const seat:Interactable|undefined=interactionRegistry(result.map).find(o=>o.instanceId===accepted.object.id);
      if(!asset.seats.length){assert.equal(seat,undefined);continue;}
      assert.ok(seat);assert.equal(seat.slots.length,asset.seats.length);const occupied=new Map<string,string>(),service=createSeating(result.map,occupied);
      for(const [index,slot]of seat.slots.entries()){
        const approach:Point|undefined=slot.approaches.find(p=>seatApproach(result.map,seat,slot,p));assert.ok(approach);assert.ok(standPosition(result.map,seat,slot));
        const player:MovingPosition={...approach,direction:'down',isMoving:false};
        assert.equal(service.act('seat-'+index,player,{action:'SIT',objectId:seat.instanceId,slotId:slot.id,seq:index*2}),'OK');
        assert.equal(service.act('other-'+index,{...approach,direction:'down',isMoving:false},{action:'SIT',objectId:seat.instanceId,slotId:slot.id,seq:index*2}),'OCCUPIED');
        assert.equal(service.act('seat-'+index,player,{action:'STAND',objectId:seat.instanceId,slotId:slot.id,seq:index*2+1}),'OK');assert.ok(canStand(result.map,player.x,player.y));
      }
    }
  }
  assert.equal(Object.keys(collectionDefinitions).length,90);
});
