import { TILE_SIZE, validateOfficeMap, type OfficeMap, type Marker } from '../map.ts';
import { decorPacks, parseEnvironment, type EnvironmentConfig } from './catalog.ts';
import { boundaryCells, cellKey, doorClearance, doorVestibule, doorway, rectangleCells, roomCells, wallMaterial, wallTile } from './architecture.ts';
import { floorPlans } from './plans.ts';
import { fixtures, furnishRoom, roomModules, type Fixture } from './rooms.ts';
import { assetDefinitions, assetTile, environmentAtlas, type AssetSpec, type ExpandedAsset } from './assets.ts';
import { passageGeometry, passageLaneRects, passageRecipe } from './passages.ts';

export type ComposedMap = OfficeMap & {type:string;version:string;orientation:string;renderorder:string;infinite:boolean;tilesets:object[]};

// Content-owned geometry is prepared once per layout/theme, never per frame.
// Cached arrays/sets are private; every returned map owns its mutable layers.
const structures = new Map<string, ReturnType<typeof buildStructure>>();
function architectureVariant(gid:number,config:EnvironmentConfig,x:number,y:number) {
  const stripe=(x+y)%3===0,tech=config.theme==='dark-tech',natural=['eco-green','scandinavian','warm-wood'].includes(config.theme);
  if(gid===9)return assetTile(tech&&!stripe?'wallEdgeH':'wallPanelH');
  if(gid===10)return assetTile(tech&&!stripe?'wallEdgeV':'wallPanelV');
  if(stripe&&(gid===11||gid===14))return assetTile(gid===11?'glassFrostH':'glassFrostV');
  if((natural||stripe)&&(gid===12||gid===13))return assetTile(gid===12?'halfShelfH':'halfShelfV');
  if(gid>=17&&gid<=20)return assetTile((['innerCornerNW','innerCornerNE','innerCornerSE','innerCornerSW'] as const)[gid-17]!);
  return gid;
}
function buildStructure(config: EnvironmentConfig) {
  const plan=floorPlans[config.layout],{width,height}=plan,count=width*height;
  const floor=Array<number>(count).fill(0),walls=Array<number>(count).fill(0),collision=Array<number>(count).fill(1);
  const rooms=plan.rooms.map(spec=>({spec,cells:roomCells(spec)}));
  const vestibules=plan.rooms.flatMap(room=>room.doors.flatMap(door=>rectangleCells(doorVestibule(room,door))));
  const building=new Set([...plan.halls.flatMap(rectangleCells).map(([x,y])=>cellKey(x,y)),...vestibules.map(([x,y])=>cellKey(x,y)),...rooms.flatMap(room=>[...room.cells])]);
  const reserved=new Set<string>(),doors:Marker[]=[];
  for(const key of building){const [x,y]=key.split(',').map(Number) as [number,number];floor[y*width+x]=30;collision[y*width+x]=0;}
  const outer=boundaryCells(building),outerKeys=new Set(outer.map(([x,y])=>cellKey(x,y)));
  for(const [x,y]of outer){walls[y*width+x]=wallTile('solid',x,y,outerKeys);collision[y*width+x]=1;}
  for(const {spec,cells}of rooms) {
    const [rx,ry]=spec.core,ground=roomModules[spec.kind].floor;
    for(const key of cells){const [x,y]=key.split(',').map(Number) as [number,number];floor[y*width+x]=ground||1+(x+y)%3;}
    const boundary=boundaryCells(cells),edges=new Set(boundary.map(([x,y])=>cellKey(x,y)));
    for(const [x,y]of boundary){
      const vertical=edges.has(cellKey(x,y-1))||edges.has(cellKey(x,y+1));
      const material=wallMaterial(spec.style,config.theme,vertical,y===ry||x===rx);
      walls[y*width+x]=wallTile(material,x,y,edges);collision[y*width+x]=1;
    }
    for(const door of spec.doors) {
      const rect=doorway(spec,door),[x,y,w,h]=rect;
      doors.push({name:spec.id,type:door.side,x:x*32,y:y*32,width:w*32,height:h*32});
      for(const [a,b]of rectangleCells(rect)){walls[b*width+a]=0;floor[b*width+a]=w===1?16:15;collision[b*width+a]=0;}
      for(const [a,b]of rectangleCells(doorClearance(spec,door)))reserved.add(cellKey(a,b));
    }
  }
  for(let i=0;i<count;i++){
    if(walls[i])walls[i]=architectureVariant(walls[i]!,config,i%width,Math.floor(i/width));
    if(['corporate-hq','coworking-space'].includes(config.layout)||config.theme==='dark-tech'){
      if(floor[i]===15)floor[i]=assetTile('doorFlushH');else if(floor[i]===16)floor[i]=assetTile('doorFlushV');
    }
  }
  const passages=passageGeometry(plan,floor,walls);
  return {floor,walls,collision,rooms,reserved,doors,building,passages,laneRects:passageLaneRects(passages)};
}

export function composeEnvironment(input: EnvironmentConfig): ComposedMap {
  const config=parseEnvironment(input),plan=floorPlans[config.layout],{width,height}=plan,key=config.layout+':'+config.theme;
  let structure=structures.get(key);if(!structure){structure=buildStructure(config);structures.set(key,structure);}
  const floor=[...structure.floor],walls=[...structure.walls],collision=[...structure.collision],furniture=Array<number>(width*height).fill(0),details=Array<number>(width*height).fill(0);
  const markers:Marker[]=[{name:'Entrance',type:'spawn',x:plan.spawn[0]*32,y:plan.spawn[1]*32}];
  const rugs:Marker[]=[],branding:Marker[]=[],voices:Marker[]=[],placements:Marker[]=[],decorations:Marker[]=[],passageDecor:Marker[]=[];
  const density=decorPacks.find(d=>d.id===config.decor)!.density;
  for(const {spec,cells}of structure.rooms) {
    const [x,y,w,h]=spec.core,center=Math.floor(w/2);
    const at=(name:Fixture,dx:number,dy:number)=>{
      const [sx,sy,pw,ph]=fixtures[name],px=x+dx,py=y+dy;
      const definition=assetDefinitions[name as ExpandedAsset] as AssetSpec|undefined,mode=definition?.mode??'blocking',decorative=mode==='wall'||mode==='surface';
      if(mode==='structure')return false;
      for(let j=0;j<ph/32;j++)for(let i=0;i<pw/32;i++){
        const index=(py+j)*width+px+i;
        if(!cells.has(cellKey(px+i,py+j))||structure.reserved.has(cellKey(px+i,py+j)))return false;
        if(mode==='wall'?!walls[index]||details[index]:mode==='surface'?!furniture[index]||details[index]:!!collision[index])return false;
      }
      for(let j=0;j<ph/32;j++)for(let i=0;i<pw/32;i++){
        const index=(py+j)*width+px+i,gid=1+(sy/32+j)*16+sx/32+i;
        if(decorative)details[index]=gid;else{furniture[index]=gid;collision[index]=1;}
      }
      (decorative?decorations:placements).push({name,type:spec.id,x:px*32,y:py*32,width:pw,height:ph});return true;
    };
    furnishRoom(spec,config,density,at);
    if(spec.kind==='meeting')voices.push({name:'Meeting Room',type:'voice',x:(x+1)*32,y:(y+1)*32,width:(w-2)*32,height:(h-2)*32});
    if(spec.kind==='reception')branding.push({name:config.overrides.branding||'YOUR TEAM',type:'branding',x:(x+2)*32,y:(y+3)*32,width:(w-4)*32,height:32});
    if(['lounge','reception','collaboration'].includes(spec.kind))rugs.push({name:config.overrides.rug,type:'rug',x:(x+center-2)*32,y:(y+h-5)*32,width:4*32,height:2*32});
    // Keep labels on real free floor; do not place them behind furniture/walls.
    const candidates=rectangleCells([x+1,y+1,w-2,h-2]).filter(([a,b])=>!collision[b*width+a]).sort((a,b)=>Math.abs(a[0]-x-center)+Math.abs(a[1]-y-h+2)-Math.abs(b[0]-x-center)-Math.abs(b[1]-y-h+2));
    if(!candidates.length)throw Error('Room has no usable floor: '+spec.id);
    const [mx,my]=candidates[0]!;markers.push({name:roomModules[spec.kind].label,type:'area',x:(mx+.5)*32,y:(my+.25)*32});
  }
  const passage=passageRecipe(structure.passages,config);
  for(const prop of passage.props) {
    const [sx,sy,pw,ph]=fixtures[prop.asset],indices=rectangleCells([prop.x,prop.y,pw/32,ph/32]).map(([x,y])=>y*width+x);
    // Room-mounted details retain ownership if they share a corridor wall.
    if(indices.some(i=>prop.wall?!!details[i]:!!collision[i]))continue;
    for(let j=0;j<ph/32;j++)for(let i=0;i<pw/32;i++){
      const index=(prop.y+j)*width+prop.x+i,gid=1+(sy/32+j)*16+sx/32+i;
      if(prop.wall)details[index]=gid;else{furniture[index]=gid;collision[index]=1;}
    }
    const marker={name:prop.asset,type:'passage',x:prop.x*32,y:prop.y*32,width:pw,height:ph};
    (prop.wall?decorations:placements).push(marker);passageDecor.push({...marker,type:prop.role});
  }
  if(config.overrides.rug!=='none')for(const [x,y,w,h]of passage.runners)rugs.push({name:config.overrides.rug,type:'passage-runner',x:x*32+4,y:y*32+4,width:w*32-8,height:h*32-8});
  const layer=(id:number,name:string,data:number[],visible=true)=>({id,type:'tilelayer' as const,name,width,height,x:0,y:0,opacity:1,visible,data});
  const objects=(id:number,name:string,values:Marker[],visible=true)=>({id,type:'objectgroup' as const,name,x:0,y:0,opacity:1,visible,objects:values.map((m,i)=>({id:id*1000+i,rotation:0,visible,point:!m.width,...m}))});
  const rectMarker=(name:string,type:string,[x,y,w,h]:readonly number[]):Marker=>({name,type,x:x!*32,y:y!*32,width:w!*32,height:h!*32});
  const map={type:'map',version:'1.10',tiledversion:'1.11.2',orientation:'orthogonal',renderorder:'right-down',infinite:false,width,height,tilewidth:TILE_SIZE,tileheight:TILE_SIZE,nextlayerid:19,nextobjectid:19000,
    layers:[layer(1,'Floor',floor),layer(2,'Architecture',walls),layer(3,'Furniture',furniture),layer(4,'Collision',collision,false),objects(5,'Markers',markers),objects(6,'VoiceZones',voices,false),objects(7,'Rugs',rugs,false),objects(8,'Branding',branding,false),objects(9,'Environment',[{name:JSON.stringify(config),type:'configuration',x:0,y:0}],false),objects(10,'Placements',placements,false),objects(11,'Rooms',plan.rooms.map(r=>rectMarker(r.id,r.style,r.core)),false),objects(12,'Doorways',structure.doors,false),objects(13,'Corridors',plan.halls.map((r,i)=>rectMarker('Hall '+i,'circulation',r)),false),objects(14,'RoomWings',plan.rooms.flatMap(r=>(r.wings??[]).map(wing=>rectMarker(r.id,r.style,wing))),false)],
    tilesets:[{firstgid:1,name:'office',tilewidth:32,tileheight:32,tilecount:environmentAtlas.tileCount,columns:environmentAtlas.columns,spacing:0,margin:0,image:config.theme+'.png',imagewidth:environmentAtlas.width,imageheight:environmentAtlas.height}]};
  map.layers.push(layer(15,'Details',details),objects(16,'Decorations',decorations,false));
  map.layers.push(objects(17,'PassageLanes',structure.laneRects.map((r,i)=>rectMarker('Clear lane '+i,'circulation',r)),false),objects(18,'PassageDecor',passageDecor,false));
  validateOfficeMap(map);return map;
}
