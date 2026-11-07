import type { OfficeMap, Marker } from '../map.ts';
import { accents, themes, type EnvironmentConfig } from './catalog.ts';
import {tileLayer} from '../map.ts';
import {collectionSpec} from './collection.ts';
export type PaintRect={x:number;y:number;width:number;height:number;color:string;alpha:number};
export function environmentPaint(map:OfficeMap,config:EnvironmentConfig){
  const accent=accents.find(a=>a.id===config.overrides.accent)!.color,theme=themes.find(t=>t.id===config.theme)!;
  const objects=(name:string)=>{const l=map.layers.find(l=>l.name===name&&l.type==='objectgroup');return l?.type==='objectgroup'?l.objects:[];};
  const rugs:PaintRect[]=[];
  for(const r of objects('Rugs')){
    if(r.name==='none')continue;
    const w=r.width!,h=r.height!;
    const passage=r.type==='passage-runner';
    rugs.push({x:r.x+3,y:r.y+4,width:w,height:h,color:'15212b',alpha:.22});
    rugs.push({x:r.x,y:r.y,width:w,height:h,color:passage?theme.fabric:'c6b9a5',alpha:passage ? .50 : .94});
    for(const [x,y,width,height]of[[r.x,r.y,w,3],[r.x,r.y+h-3,w,3],[r.x,r.y,3,h],[r.x+w-3,r.y,3,h]])rugs.push({x:x!,y:y!,width:width!,height:height!,color:accent,alpha:passage ? .42 : .70});
    if(r.name==='runner'){for(let y=8;y<h-4;y+=4)rugs.push({x:r.x+5,y:r.y+y,width:w-10,height:1,color:passage?accent:'f2e1c5',alpha:.30});}
    else{for(let y=7;y<h-7;y+=16)for(let x=7;x<w-7;x+=16){rugs.push({x:r.x+x,y:r.y+y,width:9,height:9,color:accent,alpha:.35});rugs.push({x:r.x+x+2,y:r.y+y+2,width:5,height:5,color:'e9d5b9',alpha:.6});}}
  }
  const signs:Marker[]=objects('Branding');
  const brandPanels:PaintRect[]=[];
  for(const s of signs){
    brandPanels.push({x:s.x+2,y:s.y+3,width:s.width!,height:s.height!,color:'152338',alpha:.24},{x:s.x,y:s.y,width:s.width!,height:s.height!,color:theme.wood,alpha:1});
    for(let x=2;x<s.width!-2;x+=4)brandPanels.push({x:s.x+x,y:s.y+2,width:1,height:s.height!-4,color:theme.background,alpha:.36});
    brandPanels.push({x:s.x+28,y:s.y+3,width:s.width!-56,height:s.height!-6,color:theme.background,alpha:1},{x:s.x+4,y:s.y+s.height!-2,width:s.width!-8,height:1,color:'f2d29d',alpha:.9});
    for(const x of[s.x+11,s.x+s.width!-16])brandPanels.push({x,y:s.y+10,width:5,height:12,color:accent,alpha:1},{x:x+1,y:s.y+11,width:1,height:10,color:'fff0c9',alpha:.8});
  }
  return {rugs,signs,brandPanels,accent,theme};
}

// Cosmetic only. Identical paint list for Phaser and Canvas preview; never adds
// map layers, collision, network state, render textures or per-frame work.
export function environmentAtmosphere(map:OfficeMap,config:EnvironmentConfig):PaintRect[]{
  const result:PaintRect[]=[],floor=tileLayer(map,'Floor').data,walls=tileLayer(map,'Architecture').data;
  const objects=(name:string)=>map.layers.flatMap(l=>l.type==='objectgroup'&&l.name===name?l.objects:[]);
  const put=(x:number,y:number,width:number,height:number,color:string,alpha:number)=>result.push({x,y,width,height,color,alpha});
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const i=y*map.width+x;if(!floor[i]||walls[i])continue;
    if(y&&walls[i-map.width])for(const [dy,h,a]of[[0,3,.20],[3,4,.11],[7,5,.045]])put(x*32,y*32+dy!,32,h!,'152338',a!);
    if(x&&walls[i-1]){put(x*32,y*32,3,32,'152338',.16);put(x*32+3,y*32,4,32,'152338',.06);}
  }
  const sources:{x:number;y:number;radius:number;color:string;strength:number}[]=[];
  const add=(x:number,y:number,radius:number,color='ffbf63',strength=.22)=>sources.push({x,y,radius,color,strength});
  for(const p of [...objects('Decorations'),...objects('Placements')]){
    const collection=collectionSpec(p.name);
    if(collection?.light)add(p.x+(p.width??32)/2,p.y+(collection.mode==='wall'?32:Math.min(p.height??32,38)),collection.light==='screen'?36:44,collection.light==='screen'?'a4c8df':'f2cd91',collection.light==='desk'?.24:collection.light==='screen'?.14:.30);
    else if(['wallSconce','lamp','lampArc','deskLamp'].includes(p.name))add(p.x+16,p.y+(p.name==='wallSconce'?36:28),52,'ffc16b',.65);
    else if(['wallDisplay','gameConsole'].includes(p.name))add(p.x+(p.width??64)/2,p.y+32,40,'92b9ff',.13);
    else if(p.name.startsWith('reception'))add(p.x+(p.width??96)/2,p.y+60,48,'ffd58a',.38);
    else if(['desk','deskSingle','deskDual','deskTriple','deskManager'].includes(p.name))add(p.x+(p.width??64)/2,p.y+27,24,'8aa9ee',.08);
    else if(p.name==='presentationPanel')add(p.x+32,p.y+32,48,'9abce5',.22);
    else if(p.name==='codePanel')add(p.x+32,p.y+32,32,'a2d3b5',.12);
    else if(p.name==='ideaBoard')add(p.x+16,p.y+32,28,'ffd899',.20);
    else if(p.name==='hospitalityShelf')add(p.x+32,p.y+32,48,'ffd198',.32);
    else if(p.name==='receptionCrest')add(p.x+32,p.y+32,40,'edcc91',.24);
    else if(p.name==='wayfindingLight')add(p.x+16,p.y+30,28,'ffdc9c',.28);
    else if(['pantryCounter','pantry','coffeeStation','espressoMachine'].includes(p.name))add(p.x+(p.width??64)/2,p.y+40,36,'f3c69d',.16);
  }
  // Doorway toe-lights follow authored openings, never random floor positions.
  for(const p of objects('Branding'))for(const x of[p.x+20,p.x+p.width!-20])add(x,p.y+32,32,'efc997',.18);
  for(const p of objects('Doorways'))add(p.x+(p.width??32)/2,p.y+(p.height??32)/2,32,'ffc176',config.theme==='dark-tech'?.44:.36);
  // Low corridor markers sit only on existing floor edges, clear of doorways.
  // Sparse short runs read as architectural trim, not a continuous glowing grid.
  const corridors=objects('Corridors');
  for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const i=y*map.width+x;if(!floor[i]||walls[i]||(x+y)%5!==0||!corridors.some(c=>x*32>=c.x&&x*32<c.x+c.width!&&y*32>=c.y&&y*32<c.y+c.height!))continue;
    if(y&&walls[i-map.width])put(x*32+8,y*32,16,4,'f7d49a',.36);
    else if(x&&walls[i-1])put(x*32,y*32+8,4,16,'f7d49a',.36);
  }
  for(const s of sources.slice(0,96)){
    const step=4;
    for(let y=Math.floor((s.y-s.radius)/step)*step;y<s.y+s.radius;y+=step)for(let x=Math.floor((s.x-s.radius)/step)*step;x<s.x+s.radius;x+=step){
      const tx=Math.floor(x/32),ty=Math.floor(y/32),i=ty*map.width+tx;
      if(tx<0||ty<0||tx>=map.width||ty>=map.height||!floor[i]||walls[i])continue;
      const distance=Math.hypot(x+step/2-s.x,y+step/2-s.y)/s.radius;
      if(distance<1)put(x,y,step,step,s.color,Math.round((1-distance)**2*s.strength*64)/64);
    }
  }
  return result.filter(r=>r.alpha>0).map(r=>({...r,x:Math.round(r.x/4)*4,y:Math.round(r.y/4)*4,width:Math.max(4,Math.round(r.width/4)*4),height:Math.max(4,Math.round(r.height/4)*4)}));
}
