import {assetDefinitions,directionalChairRects,isSurfaceSupport,type AssetCategory,type AssetMode,type AtlasRect,type ExpandedAsset} from './assets.ts';
import {fixtures,type Fixture} from './rooms.ts';
import {isChairAsset,catalogSeats} from './seating-metadata.ts';
import {composeEnvironment} from './compose.ts';
import {floorPlans} from './plans.ts';
import {doorClearance,rectangleCells} from './architecture.ts';
import {tileLayer,mapMarkers,validateOfficeMap,type OfficeMap,type Marker} from '../map.ts';
import {interactionRegistry,seatApproach,standPosition} from '../interactions.ts';
import {canStand} from '../movement.ts';
import type {EnvironmentConfig} from './catalog.ts';
import type {AvatarDirection} from '../avatars.ts';
import {collectionSpec} from './collection.ts';

export const OBJECT_BUDGET=160, HISTORY_LIMIT=60;
export type DecorationObject={id:string;assetId:string;x:number;y:number;orientation:AvatarDirection};
export type DecorationDocument={version:1;objects:DecorationObject[];removed:string[]};
export type PublishedDecoration={revision:number;baseRevision:number;document:DecorationDocument};
export const emptyDecoration=():DecorationDocument=>({version:1,objects:[],removed:[]});
export type EditorAsset={id:string;label:string;category:AssetCategory|'floor';mode:AssetMode|'floor';width:number;height:number;orientations:readonly AvatarDirection[]};
const label=(id:string)=>id.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,s=>s.toUpperCase());
export const editorAssets:EditorAsset[]=[
  ...Object.entries(fixtures).flatMap(([id,rect])=>{
    const def=assetDefinitions[id as ExpandedAsset];
    if(def?.mode==='structure')return[];
    // Every entry references existing authored atlas artwork; architecture is immutable.
    const category=def?.category??(isChairAsset(id)||['sofa','waiting'].includes(id)?'seating':'decor');
    return[{id,label:collectionSpec(id)?.label??label(id),category,mode:def?.mode??'blocking',width:rect[2],height:rect[3],orientations:isChairAsset(id)?['down','left','up','right'] as const:['down'] as const}];
  }),
  {id:'rugRunner',label:'Runner rug',category:'floor',mode:'floor',width:128,height:64,orientations:['down']},
  {id:'rugGrid',label:'Grid rug',category:'floor',mode:'floor',width:96,height:64,orientations:['down']},
];
export const editorAsset=(id:string)=>editorAssets.find(a=>a.id===id);
export function assetRect(id:string,orientation:AvatarDirection):AtlasRect|undefined{return isChairAsset(id)?directionalChairRects[id][orientation]:fixtures[id as Fixture];}
export class PlacementError extends Error{}
const fail=(message:string):never=>{throw new PlacementError(message);};
export function parseDecoration(value:unknown):DecorationDocument{
  if(!value||typeof value!=='object'||Array.isArray(value))return fail('Invalid decoration document.');
  const v=value as DecorationDocument;
  if(Object.keys(v).sort().join()!=='objects,removed,version'||v.version!==1||!Array.isArray(v.objects)||!Array.isArray(v.removed)||v.objects.length>OBJECT_BUDGET||v.removed.length>512)return fail('Office object budget exceeded or document malformed.');
  const ids=new Set<string>();
  const objects=v.objects.map(o=>{
    if(!o||typeof o!=='object'||Object.keys(o).sort().join()!=='assetId,id,orientation,x,y'||typeof o.id!=='string'||!/^(custom\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|base\/[a-zA-Z0-9_/:.-]{1,140})$/.test(o.id)||ids.has(o.id))return fail('Invalid or duplicate object identity.');
    const asset=editorAsset(o.assetId);
    if(!asset||!asset.orientations.includes(o.orientation)||![o.x,o.y].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=4096&&n%32===0))return fail('Choose a supported asset, orientation and grid position.');
    ids.add(o.id);return{id:o.id,assetId:o.assetId,x:o.x,y:o.y,orientation:o.orientation};
  });
  if(v.removed.some(id=>typeof id!=='string'||!/^base\/[a-zA-Z0-9_/:.-]{1,140}$/.test(id))||new Set(v.removed).size!==v.removed.length||v.removed.some(id=>ids.has(id)))return fail('Invalid removed object identity.');
  return{version:1,objects,removed:[...v.removed]};
}
const group=(map:OfficeMap,name:string)=>{const l=map.layers.find(l=>l.name===name);return l?.type==='objectgroup'?l.objects:[];};
const baseId=(p:Marker)=>`base/${p.type}/${p.name}/${p.x}:${p.y}`;
export function baseDecorationObjects(config:EnvironmentConfig):DecorationObject[]{
  const map=composeEnvironment(config);
  return[...group(map,'Placements'),...group(map,'Decorations')].filter(p=>editorAsset(p.name)).map(p=>({id:baseId(p),assetId:p.name,x:p.x,y:p.y,orientation:p.facing??'down'}));
}
export function resolvedObjects(config:EnvironmentConfig,document:DecorationDocument){
  const base=baseDecorationObjects(config),known=new Set(base.map(o=>o.id));
  for(const id of [...document.removed,...document.objects.filter(o=>o.id.startsWith('base/')).map(o=>o.id)])if(!known.has(id))fail('Base office changed. Reload and review the draft.');
  const changes=new Map(document.objects.map(o=>[o.id,o]));
  const map=composeEnvironment(config),optional=new Set([...group(map,'Placements'),...group(map,'Decorations')].filter(p=>p.optionalDecoration).map(baseId));
  // Owner-authored objects win over new optional styling introduced by an art
  // upgrade. Never move an existing saved object to make room for new decor.
  const intersects=(a:DecorationObject,b:DecorationObject)=>{const aa=editorAsset(a.assetId)!,bb=editorAsset(b.assetId)!;return aa.mode!=='floor'&&bb.mode!=='floor'&&aa.mode===bb.mode&&a.x<b.x+bb.width&&a.x+aa.width>b.x&&a.y<b.y+bb.height&&a.y+aa.height>b.y;};
  const result=[...base.filter(o=>!document.removed.includes(o.id)&&!(optional.has(o.id)&&!changes.has(o.id)&&document.objects.some(other=>other.id!==o.id&&intersects(o,other)))).map(o=>changes.get(o.id)??o),...document.objects.filter(o=>o.id.startsWith('custom/'))];
  // An optional accessory follows its optional support when an owner override
  // suppresses that furniture. Never silently drop an owner-authored accessory.
  return result.filter(o=>editorAsset(o.assetId)!.mode!=='surface'||!optional.has(o.id)||changes.has(o.id)||result.some(p=>{const size=editorAsset(p.assetId)!;return isSurfaceSupport(p.assetId)&&o.x>=p.x&&o.y>=p.y&&o.x+editorAsset(o.assetId)!.width<=p.x+size.width&&o.y+editorAsset(o.assetId)!.height<=p.y+Math.min(size.height,32);}));
}
export function upsertDecoration(document:DecorationDocument,object:DecorationObject):DecorationDocument{
  return parseDecoration({...document,objects:[...document.objects.filter(o=>o.id!==object.id),object],removed:document.removed.filter(id=>id!==object.id)});
}
export function removeDecoration(document:DecorationDocument,id:string):DecorationDocument{return parseDecoration({...document,objects:document.objects.filter(o=>o.id!==id),removed:id.startsWith('base/')?[...new Set([...document.removed,id])]:document.removed});}
export function attachedDecorations(objects:readonly DecorationObject[],parent:DecorationObject){
  const size=editorAsset(parent.assetId)!;if(size.mode!=='blocking')return[];
  return objects.filter(o=>{const a=editorAsset(o.assetId)!;return a.mode==='surface'&&o.x>=parent.x&&o.y>=parent.y&&o.x+a.width<=parent.x+size.width&&o.y+a.height<=parent.y+Math.min(size.height,32);});
}
export function moveDecoration(config:EnvironmentConfig,document:DecorationDocument,next:DecorationObject){
  const objects=resolvedObjects(config,document),old=objects.find(o=>o.id===next.id);let result=upsertDecoration(document,next);
  if(old)for(const child of attachedDecorations(objects,old))result=upsertDecoration(result,{...child,x:child.x+next.x-old.x,y:child.y+next.y-old.y});
  return result;
}
export function duplicateDecoration(config:EnvironmentConfig,document:DecorationDocument,sourceId:string,next:DecorationObject,makeId:()=>string=()=>`custom/${crypto.randomUUID()}`){
  const objects=resolvedObjects(config,document),source=objects.find(o=>o.id===sourceId);if(!source)throw new PlacementError('Select furniture to duplicate.');
  let result=upsertDecoration(document,next);
  for(const child of attachedDecorations(objects,source))result=upsertDecoration(result,{...child,id:makeId(),x:child.x+next.x-source.x,y:child.y+next.y-source.y});
  return result;
}
export function deleteDecoration(config:EnvironmentConfig,document:DecorationDocument,id:string){
  const objects=resolvedObjects(config,document),source=objects.find(o=>o.id===id);let result=removeDecoration(document,id);
  if(source)for(const child of attachedDecorations(objects,source))result=removeDecoration(result,child.id);
  return result;
}
export function createDecorationHistory(initial:DecorationDocument){
  let current=parseDecoration(initial);const undo:DecorationDocument[]=[],redo:DecorationDocument[]=[];
  return{get current(){return structuredClone(current);},get canUndo(){return undo.length>0;},get canRedo(){return redo.length>0;},
    apply(next:DecorationDocument){const parsed=parseDecoration(next);if(JSON.stringify(parsed)===JSON.stringify(current))return;undo.push(current);if(undo.length>HISTORY_LIMIT)undo.shift();current=parsed;redo.length=0;},
    undo(){if(undo.length){redo.push(current);current=undo.pop()!;}return this.current;},redo(){if(redo.length){undo.push(current);current=redo.pop()!;}return this.current;}};
}
function objectMarker(o:DecorationObject):Marker{const a=editorAsset(o.assetId)!;return{name:o.assetId,type:'decoration',instanceId:o.id,x:o.x,y:o.y,width:a.width,height:a.height,facing:o.orientation};}
function indices(map:OfficeMap,o:DecorationObject){const a=editorAsset(o.assetId)!;return rectangleCells([o.x/32,o.y/32,a.width/32,a.height/32]).map(([x,y])=>y*map.width+x);}
export function composeDecoratedEnvironment(config:EnvironmentConfig,input:unknown=emptyDecoration(),revision=0,strict=true):OfficeMap{
  const doc=parseDecoration(input),map=composeEnvironment(config),base=baseDecorationObjects(config),all=resolvedObjects(config,doc),active=new Set(all.map(o=>o.id)),changed=new Set([...doc.removed,...doc.objects.map(o=>o.id),...base.filter(o=>!active.has(o.id)).map(o=>o.id)]);
  if(!revision&&!doc.objects.length&&!doc.removed.length&&!strict)return map;
  const furniture=tileLayer(map,'Furniture').data,details=tileLayer(map,'Details').data,collision=tileLayer(map,'Collision').data,architecture=tileLayer(map,'Architecture').data;
  for(const o of base.filter(o=>changed.has(o.id))){const mode=editorAsset(o.assetId)!.mode;for(const i of indices(map,o)){if(mode==='wall'||mode==='surface')details[i]=0;else{furniture[i]=0;collision[i]=architecture[i]?1:0;}}}
  for(const name of ['Placements','Decorations']){const l=map.layers.find(l=>l.name===name);if(l?.type==='objectgroup')l.objects=l.objects.filter(p=>!changed.has(baseId(p))).map(p=>({...p,instanceId:baseId(p)}));}
  // Clear surface accessories whose support was removed/moved; publishing must
  // explicitly move/delete them too rather than leaving floating desk items.
  const protectedCells=new Set<string>();const plan=floorPlans[config.layout];
  for(const room of plan.rooms)for(const door of room.doors)for(const [x,y]of rectangleCells(doorClearance(room,door)))protectedCells.add(`${x}:${y}`);
  for(const lane of group(map,'PassageLanes'))for(const [x,y]of rectangleCells([lane.x/32,lane.y/32,lane.width!/32,lane.height!/32]))protectedCells.add(`${x}:${y}`);
  const added=[...doc.objects].sort((a,b)=>Number(['wall','surface','floor'].includes(editorAsset(a.assetId)!.mode))-Number(['wall','surface','floor'].includes(editorAsset(b.assetId)!.mode))||a.id.localeCompare(b.id));
  const supports=all.filter(o=>isSurfaceSupport(o.assetId));
  const supported=(o:DecorationObject)=>{const a=editorAsset(o.assetId)!;return supports.some(s=>{const surface=editorAsset(s.assetId)!;return o.x>=s.x&&o.y>=s.y&&o.x+a.width<=s.x+surface.width&&o.y+a.height<=s.y+Math.min(surface.height,32);});};
  const occupiedDetails=new Set<number>();
  for(const o of added){
    const a=editorAsset(o.assetId)!,cells=indices(map,o);
    if(o.x+a.width>map.width*32||o.y+a.height>map.height*32)fail('Keep objects within the office boundary.');
    if(strict){
      if(a.mode==='blocking'&&cells.some(i=>collision[i]||protectedCells.has(`${i%map.width}:${Math.floor(i/map.width)}`)))fail('Furniture overlaps an object, wall, doorway or protected corridor.');
      if(a.mode==='wall'&&cells.some(i=>!architecture[i]||details[i]||occupiedDetails.has(i)))fail('Wall decorations need a clear architectural wall.');
      if(a.mode==='surface'&&(!supported(o)||cells.some(i=>!furniture[i]||details[i]||occupiedDetails.has(i))))fail('Small accessories need a clear desk, table or counter surface.');
      if(a.mode==='floor'&&cells.some(i=>architecture[i]||tileLayer(map,'Floor').data[i]===0))fail('Rugs must remain on interior floor.');
    }
    if(a.mode==='floor'){group(map,'Rugs').push({...objectMarker(o),name:o.assetId==='rugRunner'?'runner':'grid'});continue;}
    const rect=assetRect(o.assetId,o.orientation)!;
    for(let y=0;y<a.height/32;y++)for(let x=0;x<a.width/32;x++){const i=(o.y/32+y)*map.width+o.x/32+x,gid=1+(rect[1]/32+y)*16+rect[0]/32+x;
      if(a.mode==='wall'||a.mode==='surface'){details[i]=gid;occupiedDetails.add(i);}else{furniture[i]=gid;collision[i]=1;}}
    group(map,a.mode==='wall'||a.mode==='surface'?'Decorations':'Placements').push(objectMarker(o));
  }
  if(strict){
    validateOfficeMap(map);
    const spawn=mapMarkers(map).find(m=>m.type==='spawn')!,seen=new Set<number>(),queue=[Math.floor((spawn.y+11)/32)*map.width+Math.floor(spawn.x/32)];
    while(queue.length){const i=queue.pop()!;if(seen.has(i)||i<0||i>=collision.length||collision[i])continue;seen.add(i);for(const n of [i-map.width,i+map.width,i-1,i+1])if(n>=0&&n<collision.length&&Math.abs(n%map.width-i%map.width)<=1)queue.push(n);}
    for(let i=0;i<collision.length;i++)if(!collision[i]&&!seen.has(i))fail('Keep all rooms and walkable floor connected to the entrance.');
    for(const marker of mapMarkers(map))if(!canStand(map,marker.x,marker.y))fail('Keep spawn and room access markers clear.');
    for(const zone of group(map,'VoiceZones'))if(![...seen].some(i=>{const x=(i%map.width)*32+16,y=Math.floor(i/map.width)*32+16;return x>=zone.x&&x<zone.x+zone.width!&&y>=zone.y&&y<zone.y+zone.height!;}))fail('Meeting voice zones must remain reachable.');
    for(const o of all){const a=editorAsset(o.assetId)!;
      if(a.mode==='surface'&&(!supported(o)||indices(map,o).some(i=>!furniture[i])))fail('Move or remove accessories left without desk, table or counter support.');
      if(a.mode==='blocking'){const r=objectMarker(o);const around=rectangleCells([r.x/32-1,r.y/32-1,r.width!/32+2,r.height!/32+2]);if(!around.some(([x,y])=>seen.has(y*map.width+x)))fail('Every furniture object needs a reachable approach.');}
    }
    const seats=interactionRegistry(map);
    for(const o of all){const a=editorAsset(o.assetId)!,definitions=catalogSeats(o.assetId,a.width,a.height,o.orientation);if(!definitions.length)continue;
      const registered=seats.find(s=>s.instanceId===o.id);if(!registered||registered.slots.length!==definitions.length||registered.slots.some(s=>!standPosition(map,registered,s)||!s.approaches.some(p=>seen.has(Math.floor((p.y+11)/32)*map.width+Math.floor(p.x/32))&&seatApproach(map,registered,s,p))))fail('Leave a reachable approach and safe standing space for every seat.');
    }
  }
  if(revision||doc.objects.length||doc.removed.length)map.layers.push({type:'objectgroup',name:'Customization',objects:[{name:String(revision),type:'revision',x:0,y:0}]});
  return map;
}
export function validateDecoration(config:EnvironmentConfig,document:unknown):{ok:true;map:OfficeMap}|{ok:false;message:string}{try{return{ok:true,map:composeDecoratedEnvironment(config,document)};}catch(error){return{ok:false,message:error instanceof PlacementError||error instanceof Error?error.message:'Invalid office placement.'};}}
export function composeOfficeEnvironment(config:EnvironmentConfig,published?:PublishedDecoration){return published?.revision?composeDecoratedEnvironment(config,published.document,published.revision):composeEnvironment(config);}
