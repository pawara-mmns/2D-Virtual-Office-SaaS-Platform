import { TILE_SIZE, validateOfficeMap, type OfficeMap, type Marker } from '../map.ts';
import { decorPacks, layouts, parseEnvironment, type EnvironmentConfig } from './catalog.ts';
import { floorPlans } from './plans.ts';
const sprites = { desk:[0,64,64,64],executiveDesk:[0,192,96,64],bench:[128,128,128,32],divider:[0,128,64,32],chair:[64,64,32,32],plant:[96,64,32,64],ceramic:[448,64,32,64],sofa:[128,64,96,64],coffee:[224,64,64,32],armchair:[288,64,32,32],meeting:[320,64,128,64],books:[0,160,96,32],board:[96,160,64,32],reception:[160,160,96,64],cabinet:[256,160,64,32],lamp:[320,160,32,64],notice:[352,160,64,32],pantry:[448,160,64,64] } as const;
export type ComposedMap = OfficeMap & {type:string;version:string;orientation:string;renderorder:string;infinite:boolean;tilesets:object[]};
export function composeEnvironment(input:EnvironmentConfig):ComposedMap {
  const config=parseEnvironment(input),layout=layouts.find(l=>l.id===config.layout)!,plan=floorPlans[config.layout];
  const {width,height}=plan,count=width*height;
  const floor=Array.from({length:count},(_,i)=>1+(i%width+Math.floor(i/width))%3);
  const walls=Array<number>(count).fill(0),furniture=Array<number>(count).fill(0),collision=Array<number>(count).fill(0);
  const markers:Marker[]=[{name:'Entrance',type:'spawn',x:Math.floor(width/2)*32,y:(height-1.8)*32}];
  const rugs:Marker[]=[],branding:Marker[]=[],voices:Marker[]=[],placements:Marker[]=[];
  const put=(layer:number[],x:number,y:number,gid:number)=>{layer[y*width+x]=gid;};
  const wall=(x:number,y:number,gid=9)=>{put(walls,x,y,gid);put(collision,x,y,1);};
  for(let x=0;x<width;x++){wall(x,0);wall(x,height-1);}
  for(let y=1;y<height-1;y++){wall(0,y,10);wall(width-1,y,10);}
  const density=decorPacks.find(d=>d.id===config.decor)!.density;
  layout.rooms.forEach((kind,index)=>{
    const [x,y,w,h]=plan.rooms[index]!,center=Math.floor(w/2),door=center-1;
    const ground=kind==='lounge'?4:kind==='meeting'?5:kind==='reception'?6:kind==='pantry'?7:kind==='collaboration'?8:0;
    if(ground)for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)put(floor,i,j,ground);
    if(plan.enclosed.includes(kind)){
      for(let i=0;i<w;i++)if(i<door||i>door+2){wall(x+i,y,11);wall(x+i,y+h-1,11);}
      for(let j=1;j<h-1;j++){wall(x,y+j,10);wall(x+w-1,y+j,10);}
    }
    const at=(name:keyof typeof sprites,dx:number,dy:number)=>{
      const [sx,sy,pw,ph]=sprites[name],px=x+dx,py=y+dy;
      if(dx<1||dy<1||dx+pw/32>w-1||dy+ph/32>h-1)return false;
      for(let j=0;j<ph/32;j++)for(let i=0;i<pw/32;i++)if(collision[(py+j)*width+px+i])return false;
      for(let j=0;j<ph/32;j++)for(let i=0;i<pw/32;i++){put(furniture,px+i,py+j,1+(sy/32+j)*16+sx/32+i);put(collision,px+i,py+j,1);}
      placements.push({name,type:'fixture',x:px*32,y:py*32,width:pw,height:ph});return true;
    };
    const desks=(training=false)=>{
      at('board',center-1,1);
      if(training&&w>=16)at('notice',w-4,1);
      if(config.furniture==='executive'){
        at('executiveDesk',2,3);at('executiveDesk',w-5,h-5);at('armchair',2,h-5);at('books',w-5,1);
      }else if(config.furniture==='collaborative'){
        const columns=w>=14?[2,w-6]:[center-2];
        for(const row of [3,h>=13?7:6])for(const col of columns){at('bench',col,row);for(const dx of [0,2])at('chair',col+dx,row+1);}
      }else{
        const columns=w>=14?[2,center-1,w-4]:[1,w-3];
        for(const row of [3,h>=13?8:6])for(const col of columns)at('desk',col,row);
      }
      if(density>0&&!training&&config.furniture!=='executive')for(const col of [1,w-3])at('divider',col,2);
    };
    if(kind==='work'||kind==='collaboration')desks(kind==='collaboration'&&layout.id==='training-hub');
    else if(kind==='meeting'){
      const tx=center-2,ty=Math.floor(h/2)-1;at('meeting',tx,ty);at('board',center-1,1);
      for(const dx of [0,2]){at('chair',tx+dx,ty-1);at('chair',tx+dx,ty+2);}at('chair',tx-1,ty+1);at('chair',tx+4,ty+1);
      voices.push({name:'Meeting Room',type:'voice',x:(x+1)*32,y:(y+1)*32,width:(w-2)*32,height:(h-2)*32});
    }else if(kind==='lounge'){
      at('sofa',1,3);if(w>=12)at('sofa',w-4,3);at('coffee',center-1,6);at('armchair',2,h-4);at('armchair',w-3,h-4);at('books',w-4,1);
    }else if(kind==='pantry'){
      at('pantry',1,2);at('cabinet',w-4,2);at('notice',center-1,1);at('coffee',center-1,h-5);at('chair',center-2,h-5);at('chair',center+1,h-5);
    }else if(kind==='reception'){
      at('reception',center-1,3);at('sofa',1,h-5);at('armchair',w-3,h-5);
      branding.push({name:config.overrides.branding||'YOUR TEAM',type:'branding',x:(x+1)*32,y:(y+1)*32,width:(w-2)*32,height:32});
    }
    // Fabric islands sit in the social/visitor spaces; desks and coffee areas
    // retain their own material. They never become additional collision tiles.
    if(['lounge','reception','collaboration'].includes(kind))rugs.push({name:config.overrides.rug,type:'rug',x:(x+center-2)*32,y:(y+h-5)*32,width:4*32,height:2*32});
    const plant=config.overrides.planter==='ceramic'?'ceramic':'plant';
    if(density>0||index%2===0)at(plant,1,kind==='reception'?3:1);
    if(density>0){at('lamp',w-2,h-5);at('cabinet',w-3,h-3);}
    if(density>1){at(plant,w-2,3);at('books',1,h-3);}
    const name=kind==='work'?'DEVELOPMENT':kind==='meeting'?'MEETING ROOM':kind==='collaboration'?(layout.id==='training-hub'?'TRAINING':'COLLABORATION'):kind.toUpperCase();
    markers.push({name,type:'area',x:(x+center+.5)*32,y:(y+h-2+.25)*32});
  });
  const layer=(id:number,name:string,data:number[],visible=true)=>({id,type:'tilelayer' as const,name,width,height,x:0,y:0,opacity:1,visible,data});
  const objects=(id:number,name:string,values:Marker[],visible=true)=>({id,type:'objectgroup' as const,name,x:0,y:0,opacity:1,visible,objects:values.map((m,i)=>({id:id*1000+i,rotation:0,visible,point:!m.width,...m}))});
  const map={type:'map',version:'1.10',tiledversion:'1.11.2',orientation:'orthogonal',renderorder:'right-down',infinite:false,width,height,tilewidth:TILE_SIZE,tileheight:TILE_SIZE,nextlayerid:11,nextobjectid:12000,
    layers:[layer(1,'Floor',floor),layer(2,'Architecture',walls),layer(3,'Furniture',furniture),layer(4,'Collision',collision,false),objects(5,'Markers',markers),objects(6,'VoiceZones',voices,false),objects(7,'Rugs',rugs,false),objects(8,'Branding',branding,false),objects(9,'Environment',[{name:JSON.stringify(config),type:'configuration',x:0,y:0}],false),objects(10,'Placements',placements,false)],
    tilesets:[{firstgid:1,name:'office',tilewidth:32,tileheight:32,tilecount:128,columns:16,spacing:0,margin:0,image:config.theme+'.png',imagewidth:512,imageheight:256}]};
  validateOfficeMap(map);return map;
}
