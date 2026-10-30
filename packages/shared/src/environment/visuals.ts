import type { OfficeMap, Marker } from '../map.ts';
import { accents, themes, type EnvironmentConfig } from './catalog.ts';
export type PaintRect={x:number;y:number;width:number;height:number;color:string;alpha:number};
export function environmentPaint(map:OfficeMap,config:EnvironmentConfig){
  const accent=accents.find(a=>a.id===config.overrides.accent)!.color,theme=themes.find(t=>t.id===config.theme)!;
  const objects=(name:string)=>{const l=map.layers.find(l=>l.name===name&&l.type==='objectgroup');return l?.type==='objectgroup'?l.objects:[];};
  const rugs:PaintRect[]=[];
  for(const r of objects('Rugs')){
    if(r.name==='none')continue;
    const w=r.width!,h=r.height!;
    const passage=r.type==='passage-runner';
    rugs.push({x:r.x,y:r.y,width:w,height:h,color:accent,alpha:passage ? .14 : .24});
    for(const [x,y,width,height]of[[r.x,r.y,w,3],[r.x,r.y+h-3,w,3],[r.x,r.y,3,h],[r.x+w-3,r.y,3,h]])rugs.push({x:x!,y:y!,width:width!,height:height!,color:accent,alpha:passage ? .42 : .70});
    if(r.name==='runner'){for(let y=8;y<h-4;y+=8)rugs.push({x:r.x+5,y:r.y+y,width:w-10,height:1,color:accent,alpha:.36});}
    else{for(let y=7;y<h-7;y+=16)for(let x=7;x<w-7;x+=16)rugs.push({x:r.x+x,y:r.y+y,width:9,height:9,color:accent,alpha:.44});}
  }
  const signs:Marker[]=objects('Branding');
  return {rugs,signs,accent,theme};
}
