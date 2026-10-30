import { assetDefinitions, assetMaterial, type ExpandedAsset } from './assets.ts';
import { decorPacks, themes, type EnvironmentConfig } from './catalog.ts';
import { doorClearance, doorway, rectangleCells, roomCells } from './architecture.ts';
import type { FloorPlan, Rect } from './plans.ts';
import { fixtures, type Fixture } from './rooms.ts';

export type PassageRole = 'straight-wall'|'corner'|'junction'|'entrance'|'threshold';
export type PassagePlacement = { asset: Fixture; x: number; y: number; role: PassageRole; wall: boolean };
export type PassageGeometry = {
  width: number; height: number; walkable: ReadonlySet<number>; lanes: ReadonlySet<number>;
  clearance: ReadonlySet<number>; walls: readonly number[]; components: readonly number[][];
  roles: ReadonlyMap<number,PassageRole>;
};
export type PassageRecipe = { props: readonly PassagePlacement[]; runners: readonly Rect[] };
const recipes=new WeakMap<PassageGeometry,Map<string,PassageRecipe>>();
const directions=[[1,0],[-1,0],[0,1],[0,-1]] as const;
const neighbors=(index:number,width:number)=>[index-1,index+1,index-width,index+width];

// Analyze the architectural shell once, before any room furniture is added.
// Rooms and their wings are excluded, including doors; only circulation remains.
export function passageGeometry(plan:FloorPlan,floor:readonly number[],walls:readonly number[]):PassageGeometry {
  const {width,height}=plan,roomMask=new Set<number>();
  for(const room of plan.rooms)for(const key of roomCells(room)){const [x,y]=key.split(',').map(Number);roomMask.add(y!*width+x!);}
  const walkable=new Set<number>(),lanes=new Set<number>(),clearance=new Set<number>();
  for(let i=0;i<floor.length;i++)if(floor[i]&&!walls[i]&&!roomMask.has(i))walkable.add(i);
  const protect=(rect:Rect,set:Set<number>)=>{for(const [x,y]of rectangleCells(rect))if(x>=0&&y>=0&&x<width&&y<height&&walkable.has(y*width+x))set.add(y*width+x);};
  // Two central tiles stay clear wherever the existing cross section permits.
  for(const [x,y,w,h]of plan.halls) {
    if(w>=h)protect([x,y+Math.max(0,Math.floor((h-2)/2)),w,Math.min(2,h)],lanes);
    else protect([x+Math.max(0,Math.floor((w-2)/2)),y,Math.min(2,w),h],lanes);
  }
  const doorCenters:[number,number][]=[];
  for(const room of plan.rooms)for(const door of room.doors) {
    const [x,y,w,h]=doorClearance(room,door);
    // Expand protection outside and around the existing approach rectangle.
    protect([x-1,y-2,w+2,h+4],clearance);
    const [a,b,c,d]=doorway(room,door);doorCenters.push([a+c/2,b+d/2]);
  }
  const [sx,sy]=plan.spawn;protect([Math.floor(sx)-2,Math.floor(sy)-2,5,5],clearance);
  for(const i of clearance)lanes.add(i);
  // A narrow cross section gets no freestanding props, even beside its center.
  const span=(x:number,y:number,dx:number,dy:number)=>{
    let count=1;for(const sign of[-1,1])for(let step=1;step<12;step++){if(!walkable.has((y+dy*step*sign)*width+x+dx*step*sign))break;count++;}return count;
  };
  const roles=new Map<number,PassageRole>();
  for(const i of walkable) {
    const x=i%width,y=Math.floor(i/width),horizontal=span(x,y,1,0),vertical=span(x,y,0,1);
    if(Math.min(horizontal,vertical)<=2)lanes.add(i);
    const wallAt=(dx:number,dy:number)=>!!walls[(y+dy)*width+x+dx];
    const corner=(wallAt(-1,0)||wallAt(1,0))&&(wallAt(0,-1)||wallAt(0,1));
    const nearest=Math.min(...doorCenters.map(([a,b])=>Math.abs(x+.5-a)+Math.abs(y+.5-b)));
    roles.set(i,Math.abs(x+.5-sx)+Math.abs(y+.5-sy)<8?'entrance':nearest<5?'threshold':horizontal>=5&&vertical>=5?'junction':corner?'corner':'straight-wall');
  }
  const unseen=new Set(walkable),components:number[][]=[];
  while(unseen.size){const seed=unseen.values().next().value!,queue=[seed],component:number[]=[];unseen.delete(seed);while(queue.length){const i=queue.pop()!;component.push(i);for(const next of neighbors(i,width))if(unseen.delete(next))queue.push(next);}components.push(component);}
  return {width,height,walkable,lanes,clearance,walls,components,roles};
}

const separated=(a:Rect,b:Rect,gap:number)=>Math.max(a[0]-b[0]-b[2],b[0]-a[0]-a[2],0)+Math.max(a[1]-b[1]-b[3],b[1]-a[1]-a[3],0)>=gap;

// Bounded recipes are cached per shell/theme/decor/planter; furniture selection
// cannot alter corridor footprints. Connectivity work never runs on game frames.
export function passageRecipe(geometry:PassageGeometry,config:EnvironmentConfig):PassageRecipe {
  let cache=recipes.get(geometry);if(!cache){cache=new Map();recipes.set(geometry,cache);}
  const key=[config.layout,config.theme,config.decor,config.overrides.planter].join(':');
  const cached=cache.get(key);if(cached)return cached;
  const density=decorPacks.find(d=>d.id===config.decor)!.density,theme=themes.findIndex(t=>t.id===config.theme);
  const {width,walkable,lanes,clearance,walls}=geometry,props:PassagePlacement[]=[],occupied=new Set<number>(),wallOccupied=new Set<number>(),floorRects:Rect[]=[],wallRects:Rect[]=[];
  const natural=['warm-wood','scandinavian','eco-green'].includes(config.theme),formal=config.layout==='corporate-hq',training=config.layout==='training-hub';
  const planter:Fixture=config.overrides.planter==='ceramic'?'ceramic':'plant';
  const counts=new Map<Fixture,number>();
  const rank:Record<PassageRole,number>={junction:0,corner:1,entrance:1,threshold:2,'straight-wall':3};
  const candidates=[...walkable].filter(i=>neighbors(i,width).some(n=>!!walls[n])).sort((a,b)=>rank[geometry.roles.get(a)!]-rank[geometry.roles.get(b)!]||((a%width)*17+Math.floor(a/width)*31+theme*7)%47-((b%width)*17+Math.floor(b/width)*31+theme*7)%47||a-b);
  const remainsConnected=(removed:Set<number>)=>{
    const component=geometry.components.find(c=>c.some(i=>removed.has(i)))!;
    const expected=component.filter(i=>!occupied.has(i)&&!removed.has(i)),seen=new Set<number>(),queue=[expected[0]!];
    while(queue.length){const i=queue.pop()!;if(seen.has(i)||!walkable.has(i)||occupied.has(i)||removed.has(i))continue;seen.add(i);for(const next of neighbors(i,width))queue.push(next);}
    return seen.size===expected.length;
  };
  for(const i of candidates) {
    if(floorRects.length>=[1,4,6][density]!)break;
    const x=i%width,y=Math.floor(i/width),role=geometry.roles.get(i)!;
    const pool:readonly Fixture[]=role==='junction'?(training?['benchWaiting','waterDispenser','cornerPlanter']:formal?['benchWaiting','consoleTable','planterWide']:['consoleTable','magazineStand','benchWaiting','planterWide']):role==='corner'?['cornerPlanter','plantSmall']:role==='entrance'?['cornerPlanter','brochureStand']:role==='threshold'?['plantSmall','cornerPlanter']:natural?[planter,'plantSmall','tallPalm']:['plantSmall','sideRound','lampArc'];
    const offset=role==='junction'?(training?0:theme%pool.length):(theme+x+y+density)%pool.length;
    for(let n=0;n<pool.length;n++) {
      const asset=pool[(n+offset)%pool.length]!,[, ,pw,ph]=fixtures[asset],w=pw/32,h=ph/32,rect:Rect=[x,y,w,h];
      if((counts.get(asset)??0)>=(asset==='plantSmall'||asset==='cornerPlanter'?2:1)||!floorRects.every(other=>separated(rect,other,3)))continue;
      const indices=rectangleCells(rect).map(([a,b])=>b*width+a);
      if(indices.some(index=>!walkable.has(index)||lanes.has(index)||clearance.has(index)||occupied.has(index)))continue;
      if(!remainsConnected(new Set(indices)))continue;
      for(const index of indices)occupied.add(index);
      props.push({asset,x,y,role,wall:false});floorRects.push(rect);counts.set(asset,(counts.get(asset)??0)+1);break;
    }
  }
  // Mounted details can enrich a narrow corridor without using any floor area.
  const wallCandidates=new Set<number>();for(const i of walkable)for(const next of neighbors(i,width))if(walls[next]&&assetMaterial(walls[next]!)==='solid')wallCandidates.add(next);
  for(const i of [...wallCandidates].sort((a,b)=>((a*13+theme*19)%71)-((b*13+theme*19)%71)||a-b)) {
    if(wallRects.length>=[3,6,9][density]!)break;
    const x=i%width,y=Math.floor(i/width),adjacent=neighbors(i,width).find(next=>walkable.has(next))!,role=geometry.roles.get(adjacent)!;
    const pool:readonly ExpandedAsset[]=role==='threshold'||role==='junction'?['directionalSign','wallSconce']:role==='entrance'?['companyPoster','wallSconce']:role==='corner'?['wallSconce','clock']:training?['pinboard','directionalSign','clock']:formal?['artDiptych','clock','wallSconce']:config.layout==='startup-office'?['companyPoster','pinboard','wallSconce']:['artDiptych','companyPoster','wallSconce'];
    for(let n=0;n<pool.length;n++) {
      const asset=pool[(theme+n+x+y)%pool.length]!,spec=assetDefinitions[asset],rect:Rect=[x,y,spec.width,spec.height];
      if((counts.get(asset)??0)>=2||!wallRects.every(other=>separated(rect,other,4)))continue;
      const indices=rectangleCells(rect).map(([a,b])=>b*width+a);
      if(indices.some(index=>!walls[index]||assetMaterial(walls[index]!)!=='solid'||wallOccupied.has(index)||!neighbors(index,width).some(next=>walkable.has(next))))continue;
      props.push({asset,x,y,role,wall:true});wallRects.push(rect);for(const index of indices)wallOccupied.add(index);counts.set(asset,(counts.get(asset)??0)+1);break;
    }
  }
  // Pick short straight runs on the protected lane. Rugs are paint, not props;
  // they never change collision, thresholds or the owner's Bare floor setting.
  const runners:Rect[]=[];
  for(const i of [...lanes].sort((a,b)=>a-b)) {
    if(runners.length>=(density===2?2:1))break;
    if(clearance.has(i))continue;
    const x=i%width,y=Math.floor(i/width);
    for(const [dx,dy]of [[1,0],[0,1]] as const) {
      let length=0;while(length<8&&lanes.has((y+dy*length)*width+x+dx*length)&&!clearance.has((y+dy*length)*width+x+dx*length)&&!occupied.has((y+dy*length)*width+x+dx*length))length++;
      if(length<4)continue;
      const rect:Rect=[x,y,dx?length:1,dy?length:1];
      if(!runners.every(other=>separated(rect,other,4)))continue;
      runners.push(rect);break;
    }
  }
  const result={props,runners};cache.set(key,result);return result;
}

// Compact audit metadata: contiguous horizontal lane runs, not per-tile objects.
export function passageLaneRects(geometry:PassageGeometry):Rect[] {
  const {width,height,lanes}=geometry,result:Rect[]=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(lanes.has(y*width+x)){const start=x;while(x+1<width&&lanes.has(y*width+x+1))x++;result.push([start,y,x-start+1,1]);}
  return result;
}
