import {editorAsset,type DecorationObject} from '../../../../../packages/shared/src/environment/decoration.ts';
import {isChairAsset,embeddedWorkstationAssets} from '../../../../../packages/shared/src/environment/seating-metadata.ts';
export type Point={x:number;y:number};
export type ScreenBounds={left:number;top:number;width:number;height:number};
export type PixelHit=(object:DecorationObject,x:number,y:number)=>boolean;
export function objectsAt(objects:readonly DecorationObject[],point:Point,opaque:PixelHit){
  return objects.filter(o=>{const a=editorAsset(o.assetId)!;return point.x>=o.x&&point.y>=o.y&&point.x<o.x+a.width&&point.y<o.y+a.height&&opaque(o,Math.floor(point.x-o.x),Math.floor(point.y-o.y));})
    .sort((a,b)=>rank(b,point)-rank(a,point)||((a.id.startsWith('custom/')&&b.id.startsWith('custom/'))?b.id.localeCompare(a.id):objects.indexOf(b)-objects.indexOf(a)));
}
function rank(o:DecorationObject,p:Point){
  const a=editorAsset(o.assetId)!;
  if(embeddedWorkstationAssets.includes(o.assetId)&&p.y-o.y>=30&&p.y-o.y<35&&p.x-o.x>=3&&p.x-o.x<a.width-3)return 3;
  return a.mode==='floor'?-1:isChairAsset(o.assetId)?2:a.mode==='wall'||a.mode==='surface'?1:0;
}
export function contextPosition(bounds:ScreenBounds,viewport:{width:number;height:number},size:{width:number;height:number}){
  const minTop=viewport.width<640?154:108,bottom=viewport.width<380?142:94,maxTop=Math.max(minTop,viewport.height-size.height-bottom);
  const above=bounds.top-size.height-12,preferred=above>=minTop?above:bounds.top+bounds.height+36;
  return{x:Math.round(Math.max(8,Math.min(viewport.width-size.width-8,bounds.left+bounds.width/2-size.width/2))),y:Math.round(Math.max(minTop,Math.min(maxTop,preferred)))};
}
export type EditorCommand='cancel'|'rotate'|'cycle';
export function editorShortcut(event:{code:string;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;shiftKey?:boolean},typing:boolean){
  if(typing||event.altKey)return;
  const modifier=event.ctrlKey||event.metaKey;
  if(modifier&&event.code==='KeyZ')return event.shiftKey?'redo':'undo';
  if(modifier&&event.code==='KeyY')return'redo';
  if(modifier&&event.code==='KeyD')return'duplicate';
  if(!modifier&&event.code==='KeyR')return'rotate';
  if(!modifier&&(event.code==='Delete'||event.code==='Backspace'))return'delete';
  if(event.code==='Escape')return'cancel';
}
