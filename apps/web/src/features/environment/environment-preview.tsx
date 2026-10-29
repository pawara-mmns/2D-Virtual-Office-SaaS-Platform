"use client";
import { useEffect, useRef, useState } from 'react';
import { composeEnvironment } from '../../../../../packages/shared/src/environment/compose';
import { environmentPaint } from '../../../../../packages/shared/src/environment/visuals';
import { mapMarkers, tileLayer } from '../../../../../packages/shared/src/map';
import type { EnvironmentConfig } from '../../../../../packages/shared/src/environment/catalog';
const images=new Map<string,Promise<HTMLImageElement>>();
function atlas(theme:string){let image=images.get(theme);if(!image){image=new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{images.delete(theme);reject(Error('Artwork unavailable'));};img.src='/office/environments/'+theme+'.png';});images.set(theme,image);}return image;}
// Static preview uses the very same map, atlas and paint rules as Phaser. It
// creates no game, sockets, auth request, microphone capture or animation loop.
export function EnvironmentPreview({config}:{config:EnvironmentConfig}){
  const canvas=useRef<HTMLCanvasElement>(null),key=JSON.stringify(config);
  const [result,setResult]=useState<{key:string;status:"ready"|"error"}|null>(null);
  const error=result?.key===key&&result.status==="error",ready=result?.key===key&&result.status==="ready";
  useEffect(()=>{let cancelled=false;void atlas(config.theme).then(image=>{
    if(cancelled||!canvas.current)return;const map=composeEnvironment({...config,overrides:{...config.overrides,branding:config.overrides.branding.trim()}}),context=canvas.current.getContext('2d');if(!context)throw Error();
    canvas.current.width=map.width*32;canvas.current.height=map.height*32;context.imageSmoothingEnabled=false;
    const paint=environmentPaint(map,config);context.fillStyle='#'+paint.theme.background;context.fillRect(0,0,canvas.current.width,canvas.current.height);
    const layer=(name:string)=>tileLayer(map,name).data.forEach((gid,index)=>{if(gid)context.drawImage(image,((gid-1)%16)*32,Math.floor((gid-1)/16)*32,32,32,(index%map.width)*32,Math.floor(index/map.width)*32,32,32);});
    layer('Floor');for(const r of paint.rugs){context.globalAlpha=r.alpha;context.fillStyle='#'+r.color;context.fillRect(r.x,r.y,r.width,r.height);}context.globalAlpha=1;layer('Architecture');layer('Furniture');
    for(const sign of paint.signs){context.fillStyle='#'+paint.theme.background;context.fillRect(sign.x,sign.y,sign.width!,sign.height!);context.fillStyle='#'+paint.accent;context.fillRect(sign.x,sign.y,4,sign.height!);context.fillStyle='white';context.font='10px Arial';context.fillText(sign.name,sign.x+10,sign.y+20,sign.width!-14);}
    for(const m of mapMarkers(map).filter(m=>m.type==='area')){context.font='10px monospace';context.textAlign='center';context.fillStyle='#e9e5d2';const width=context.measureText(m.name).width+10;context.fillRect(m.x-width/2,m.y-8,width,18);context.fillStyle='#344c48';context.fillText(m.name,m.x,m.y+4);}context.textAlign='left';setResult({key,status:"ready"});
  }).catch(()=>{if(!cancelled)setResult({key,status:"error"});});return()=>{cancelled=true;};},[config,key]);
  return <figure className="environment-preview"><canvas ref={canvas} role="img" aria-label="Office preview showing reception, workstations, meeting room, lounge, pantry and collaboration space" /><figcaption>{error?<span role="alert">Preview artwork could not load. Check your connection and try another theme.</span>:!ready?<span role="status">Preparing office preview...</span>:<span role="status">Preview ready. All rooms share a connected circulation path. This preview does not join your office.</span>}</figcaption></figure>;
}
