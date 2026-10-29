import { TILE_SIZE, validateOfficeMap, type OfficeMap, type Marker } from "../map.ts";
import { decorPacks, layouts, parseEnvironment, type EnvironmentConfig } from "./catalog.ts";
const sprites = { desk: [0,64,64,64], chair: [64,64,32,32], plant: [96,64,32,64], ceramic: [448,64,32,64], sofa: [128,64,96,64], coffee: [224,64,64,32], armchair: [288,64,32,32], meeting: [320,64,128,64], books: [0,160,96,32], board: [96,160,64,32], reception: [160,160,96,64], cabinet: [256,160,64,32], lamp: [320,160,32,64], notice: [352,160,64,32], pantry: [448,160,64,64] } as const;
export type ComposedMap = OfficeMap & { type: string; version: string; orientation: string; renderorder: string; infinite: boolean; tilesets: object[] };
export function composeEnvironment(input: EnvironmentConfig): ComposedMap {
  const config = parseEnvironment(input), layout = layouts.find(item => item.id === config.layout)!;
  const width = 38, height = 30, count = width * height;
  const floor = Array.from({ length: count }, (_,i) => 1 + (i % width + Math.floor(i/width)) % 3);
  const walls = Array<number>(count).fill(0), furniture = Array<number>(count).fill(0), collision = Array<number>(count).fill(0);
  const markers: Marker[] = [{ name: "Entrance", type: "spawn", x: 19*TILE_SIZE, y: 27.2*TILE_SIZE }];
  const rugs: Marker[] = [], branding: Marker[] = [], voices: Marker[] = [];
  const put = (layer: number[],x: number,y: number,gid: number) => { layer[y*width+x] = gid; };
  const wall = (x: number,y: number,gid=9) => { put(walls,x,y,gid);put(collision,x,y,1); };
  for(let x=0;x<width;x++){wall(x,0);wall(x,height-1);}
  for(let y=1;y<height-1;y++){wall(0,y,10);wall(width-1,y,10);}
  function stamp(name: keyof typeof sprites,x: number,y: number) {
    const [sx,sy,w,h] = sprites[name];
    // Placement rules reject overlap and never replace architecture or doors.
    for(let j=0;j<h/32;j++)for(let i=0;i<w/32;i++)if(collision[(y+j)*width+x+i])return;
    for(let j=0;j<h/32;j++)for(let i=0;i<w/32;i++){put(furniture,x+i,y+j,1+(sy/32+j)*16+sx/32+i);put(collision,x+i,y+j,1);}
  }
  const density=decorPacks.find(item=>item.id===config.decor)!.density;
  layout.rooms.forEach((kind,index)=>{
    const x=2+(index%3)*12,y=index<3?2:15,w=10,h=index<3?10:11;
    const ground=kind==='lounge'?4:kind==='meeting'?5:kind==='reception'?6:kind==='pantry'?7:kind==='collaboration'?8:0;
    if(ground)for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)put(floor,i,j,ground);
    if(layout.enclosed||kind==='meeting'){
      for(let i=0;i<w;i++)if(i<4||i>6){wall(x+i,y,11);wall(x+i,y+h-1,11);}
      for(let j=1;j<h-1;j++){wall(x,y+j,10);wall(x+w-1,y+j,10);}
    }
    const at=(name:keyof typeof sprites,dx:number,dy:number)=>stamp(name,x+dx,y+dy);
    if(kind==='work'){
      const positions=config.furniture==='executive'?[[1,2],[6,5]]:config.furniture==='collaborative'?[[1,2],[3,2],[1,5],[3,5]]:[[1,2],[6,2],[1,5],[6,5]];
      positions.forEach(([dx,dy])=>at('desk',dx!,dy!));
      if(config.furniture==='executive'){at('books',5,1);at('armchair',1,6);}
      if(config.furniture==='collaborative'){at('chair',7,5);at('chair',7,7);}
      at('board',3,1);
    } else if(kind==='meeting'){
      at('meeting',3,3);[[3,2],[5,2],[3,5],[5,5]].forEach(([a,b])=>at('chair',a!,b!));at('board',6,1);
      voices.push({name:'Meeting Room',type:'voice',x:(x+1)*32,y:(y+1)*32,width:(w-2)*32,height:(h-2)*32});
    } else if(kind==='lounge'){
      at('sofa',1,2);at('coffee',2,5);at('armchair',6,4);at('books',6,1);
      if(config.furniture!=='standard')at('armchair',7,6);
    } else if(kind==='pantry'){
      at('pantry',1,1);at('cabinet',5,1);at('coffee',4,4);at('armchair',7,5);at('notice',6,2);
    } else if(kind==='reception'){
      at('reception',3,3);at('sofa',1,6);at('notice',6,1);
      branding.push({name:config.overrides.branding||'YOUR TEAM',type:'branding',x:(x+3)*32,y:(y+1)*32,width:6*32,height:32});
    } else {
      at('board',3,1);at('desk',1,3);at('desk',6,3);at('books',1,7);
      if(config.furniture==='collaborative'){at('chair',3,6);at('chair',6,6);}
      if(config.furniture==='executive')at('cabinet',6,7);
    }
    // Nonblocking rugs are a paint layer, not collision or interactive objects.
    rugs.push({name:config.overrides.rug,type:'rug',x:(x+4)*32,y:(y+6)*32,width:3*32,height:2*32});
    const plant=config.overrides.planter==='ceramic'?'ceramic':'plant';
    if(density>0||index%2===0)at(plant,1,1);
    if(density>0){at('lamp',8,6);at('cabinet',6,8);}
    if(density>1){at(plant,8,3);at('books',1,8);at('cabinet',6,6);}
    const name=kind==='work'?'DEVELOPMENT':kind==='meeting'?'MEETING ROOM':kind==='collaboration'?(layout.id==='training-hub'?'TRAINING':'COLLABORATION'):kind.toUpperCase();
    markers.push({name,type:'area',x:(x+5.5)*32,y:(y+h-2+(kind==='meeting'?.25:.5))*32});
  });
  const layer=(id:number,name:string,data:number[],visible=true)=>({id,type:'tilelayer' as const,name,width,height,x:0,y:0,opacity:1,visible,data});
  const objects=(id:number,name:string,values:Marker[],visible=true)=>({id,type:'objectgroup' as const,name,x:0,y:0,opacity:1,visible,objects:values.map((m,i)=>({id:id*100+i,rotation:0,visible,point:!m.width,...m}))});
  const map={type:'map',version:'1.10',tiledversion:'1.11.2',orientation:'orthogonal',renderorder:'right-down',infinite:false,width,height,tilewidth:32,tileheight:32,nextlayerid:10,nextobjectid:1000,
    layers:[layer(1,'Floor',floor),layer(2,'Architecture',walls),layer(3,'Furniture',furniture),layer(4,'Collision',collision,false),objects(5,'Markers',markers),objects(6,'VoiceZones',voices,false),objects(7,'Rugs',rugs,false),objects(8,'Branding',branding,false),objects(9,'Environment',[{name:JSON.stringify(config),type:'configuration',x:0,y:0}],false)],
    tilesets:[{firstgid:1,name:'office',tilewidth:32,tileheight:32,tilecount:128,columns:16,spacing:0,margin:0,image:config.theme+'.png',imagewidth:512,imageheight:256}]};
  validateOfficeMap(map);
  return map;
}
