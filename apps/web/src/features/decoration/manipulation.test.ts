import assert from 'node:assert/strict';
import {test} from 'node:test';
import {objectsAt,contextPosition,editorShortcut} from './manipulation.ts';
import {attachedDecorations,baseDecorationObjects,editorAsset,emptyDecoration,moveDecoration,duplicateDecoration,deleteDecoration,resolvedObjects,createDecorationHistory,validateDecoration,type DecorationObject} from '../../../../../packages/shared/src/environment/decoration.ts';
import {defaultEnvironment} from '../../../../../packages/shared/src/environment/catalog.ts';
const id=(n:number)=>`custom/00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('hit testing respects real asset bounds, transparent pixels and rendered layer order; covered objects remain discoverable',()=>{
 const desk:DecorationObject={id:id(1),assetId:'deskSingle',x:64,y:64,orientation:'down'},mug={...desk,id:id(2),assetId:'deskMug'},rug={...desk,id:id(3),assetId:'rugGrid'};
 assert.deepEqual(objectsAt([rug,desk,mug],{x:80,y:80},()=>true).map(o=>o.id),[mug.id,desk.id,rug.id]);
 assert.deepEqual(objectsAt([desk,mug],{x:80,y:80},o=>o.id!==mug.id).map(o=>o.id),[desk.id]);
 assert.equal(objectsAt([desk],{x:63,y:80},()=>true).length,0);assert.equal(objectsAt([desk],{x:128,y:80},()=>true).length,0);
 assert.deepEqual(objectsAt([desk,mug],{x:80,y:95},()=>true).map(o=>o.id),[desk.id,mug.id],'desk foreground pixels are drawn above accessories/avatars');
});
test('contextual controls stay in desktop and mobile viewports without being placed on a central selected object',()=>{
 for(const width of [320,390,820,1440])for(const left of [-300,0,width/2,width+300])for(const top of [-200,200,900]){
  const result=contextPosition({left,top,width:64,height:64},{width,height:1000},{width:240,height:56});assert.ok(result.x>=8&&result.x+240<=width-8);assert.ok(result.y>=108&&result.y+56<=906);
 }
 const result=contextPosition({left:500,top:500,width:64,height:64},{width:1440,height:1000},{width:200,height:56});assert.ok(result.y+56<500);
});
test('editor keyboard controls support native shortcuts and never act while typing',()=>{
 for(const [event,want]of [[{code:'KeyR'},'rotate'],[{code:'Delete'},'delete'],[{code:'KeyD',ctrlKey:true},'duplicate'],[{code:'KeyZ',metaKey:true},'undo'],[{code:'KeyZ',ctrlKey:true,shiftKey:true},'redo'],[{code:'KeyY',ctrlKey:true},'redo'],[{code:'Escape'},'cancel']] as const){assert.equal(editorShortcut(event,false),want);assert.equal(editorShortcut(event,true),undefined);}
 assert.equal(editorShortcut({code:'KeyR',altKey:true},false),undefined);assert.equal(editorShortcut({code:'KeyW'},false),undefined);
});
test('moving, duplicating and deleting a generated desk includes supported accessories as one reversible override',()=>{
 const config=defaultEnvironment,base=baseDecorationObjects(config),desk=base.find(o=>editorAsset(o.assetId)!.category==='workstations'&&attachedDecorations(base,o).length>0)!;assert.ok(desk);
 const children=attachedDecorations(base,desk),initial=JSON.stringify(base),history=createDecorationHistory(emptyDecoration());let moved;
 for(const [dx,dy]of [[32,0],[-32,0],[0,32],[0,-32],[64,64],[-64,64],[128,0],[-128,0]]){try{const doc=moveDecoration(config,emptyDecoration(),{...desk,x:desk.x+dx!,y:desk.y+dy!});if(validateDecoration(config,doc).ok){moved=doc;break;}}catch{/* bounded fixture search */}}
 assert.ok(moved);history.apply(moved);const resolved=resolvedObjects(config,moved),newDesk=resolved.find(o=>o.id===desk.id)!;
 for(const child of children){const updated=resolved.find(o=>o.id===child.id)!;assert.equal(updated.x-child.x,newDesk.x-desk.x);assert.equal(updated.y-child.y,newDesk.y-desk.y);}
 const removed=deleteDecoration(config,moved,desk.id);history.apply(removed);assert.ok(!resolvedObjects(config,removed).some(o=>[desk.id,...children.map(o=>o.id)].includes(o.id)));assert.deepEqual(history.undo(),moved);assert.deepEqual(history.redo(),removed);assert.equal(JSON.stringify(base),initial);
 let serial=20;const copy=duplicateDecoration(config,emptyDecoration(),desk.id,{...desk,id:id(19),x:desk.x+160},()=>id(serial++));const copies=copy.objects.filter(o=>o.id.startsWith('custom/'));assert.equal(copies.length,children.length+1);assert.equal(new Set(copies.map(o=>o.id)).size,copies.length);assert.equal(resolvedObjects(config,copy).filter(o=>o.id===desk.id).length,1,'original template object remains intact');
});
