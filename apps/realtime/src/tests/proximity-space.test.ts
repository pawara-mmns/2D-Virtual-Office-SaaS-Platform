import assert from 'node:assert/strict';
import {test} from 'node:test';
import {conversationSpace} from '../voice/space.ts';
import {createProximity} from '../voice/proximity.ts';
import {composeEnvironment} from '../../../../packages/shared/src/environment/compose.ts';
import {defaultEnvironment,layouts} from '../../../../packages/shared/src/environment/catalog.ts';
import type {OfficeMap} from '../../../../packages/shared/src/map.ts';

function partitionedMap():OfficeMap {
  const width=10,height=8,count=width*height,walls=Array<number>(count).fill(0);
  for(let y=0;y<height;y++)if(y!==4)walls[y*width+5]=9;
  return{width,height,tilewidth:32,tileheight:32,layers:[{type:'tilelayer',name:'Architecture',width,height,data:walls},{type:'tilelayer',name:'Floor',width,height,data:Array(count).fill(1)}]};
}
test('closed partitions block proximity while doorways and shared floor allow it',()=>{
  const space=conversationSpace(partitionedMap());
  assert.equal(space({x:144,y:101},{x:208,y:101}),false);
  assert.equal(space({x:144,y:133},{x:208,y:133}),true);
  assert.equal(space({x:144,y:133},{x:144,y:165}),true);
  assert.equal(space({x:NaN,y:133},{x:208,y:133}),false);
});
test('authoritative off-mic bubbles cannot form through a partition but form through its open door',()=>{
  let now=1000;const officeId='00000000-0000-4000-8000-000000000001';
  const auth=(n:number)=>({userId:String(n),officeId,organizationId:'test',token:'synthetic',checkedAt:now,expiresAt:now+60000,avatarKey:'fern' as const,displayName:'Fixture'});
  const people=[{sessionId:'a',auth:auth(1),x:144,y:101,meeting:false},{sessionId:'b',auth:auth(2),x:208,y:101,meeting:false}];
  const p=createProximity(officeId,undefined,{dwellMs:100,graceMs:100},()=>now,conversationSpace(partitionedMap()));
  const sync=()=>p.sync(people,()=>{},()=>{});sync();now+=200;sync();assert.equal(p.states().length,0);
  people.forEach(person=>person.y=133);sync();now+=110;sync();assert.equal(p.states().length,1);p.close();
});
test('every modular layout retains open-door conversation paths using actual architectural tiles',()=>{
  for(const layout of layouts){const map=composeEnvironment({...defaultEnvironment,layout:layout.id}),space=conversationSpace(map),layer=map.layers.find(l=>l.name==='Doorways');assert.ok(layer&&layer.type==='objectgroup');
    for(const d of layer.objects){const width=d.width!,height=d.height!,cx=d.x+width/2,cy=d.y+height/2;const a=width>height?{x:cx,y:d.y-16-11}:{x:d.x-16,y:cy-11};const b=width>height?{x:cx,y:d.y+height+16-11}:{x:d.x+width+16,y:cy-11};assert.equal(space(a,b),true,layout.id+' '+d.name+' doorway');}
  }
});
