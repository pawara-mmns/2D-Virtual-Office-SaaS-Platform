import { polishEnvironmentAtlas } from './polish-environment-art.mjs';
// Build five small shared atlases, not a map image per combination.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { picture } from './office-pixel-art.mjs';
import { themes } from '../packages/shared/src/environment/catalog.ts';
export function generateEnvironmentAtlases(base) {
  mkdirSync(fileURLToPath(new URL('../apps/web/public/office/environments/', import.meta.url)),{recursive:true});
  const rgb=h=>h.match(/../g).map(v=>parseInt(v,16));
  for(const theme of themes){
    const art=picture(512,256);base.pixels.copy(art.pixels);
    const wood=rgb(theme.wood),fabric=rgb(theme.fabric),wall=rgb(theme.wall);
    for(let y=0;y<256;y++)for(let x=0;x<512;x++){
      const i=(y*512+x)*4,[r,g,b,a]=art.pixels.subarray(i,i+4);if(!a)continue;
      let target;
      if(r>g*1.09&&g>b*1.08)target=wood;
      else if(b>r*1.08&&g>r*1.05)target=fabric;
      else if(y<32&&x>=256&&r>150)target=wall;
      if(target){const factor=Math.min(1.25,Math.max(.48,(r*.3+g*.59+b*.11)/175));for(let c=0;c<3;c++)art.pixels[i+c]=Math.min(255,Math.round(target[c]*factor));}
    }
    const shift=(hex,delta)=>rgb(hex).map(v=>Math.min(255,Math.max(0,v+delta))).map(v=>v.toString(16).padStart(2,'0')).join('');
    for(let tile=0;tile<8;tile++){
      const color=tile<3?shift(theme.floor,(tile-1)*5):tile===3?theme.fabric:tile===5?theme.wall:shift(theme.floor,tile===7?-12:12);
      art.rect(tile*32,0,32,32,color);
      if(tile<3){for(let y=0;y<32;y+=8){art.line(tile*32,y,32,shift(color,-18));art.line(tile*32,y+1,32,shift(color,15));art.rect(tile*32+(y*3+tile*7)%30,y+1,1,7,shift(color,-14));}}
      else {for(let y=3;y<32;y+=5)for(let x=3;x<32;x+=5)art.rect(tile*32+x,y,1,1,shift(color,12));if(tile===5){art.line(tile*32,0,32,shift(color,22));art.rect(tile*32,0,1,32,shift(color,22));}}
    }
    // Same foliage, visibly different ceramic pot, reusing the original drawing.
    for(let y=0;y<64;y++)for(let x=0;x<32;x++){const a=((64+y)*512+96+x)*4,b=((64+y)*512+448+x)*4;art.pixels.copy(art.pixels,b,a,a+4);}
    art.rect(457,106,17,13,theme.fabric);art.rect(459,108,13,11,theme.wall);art.line(457,106,17,'ffffff');
    // Coffee corner: counter, machine, sink, mugs, storage and a small shadow.
    art.rect(450,165,60,55,'25313b30');art.rect(449,164,62,43,theme.wood);art.rect(450,163,60,6,theme.wall);
    art.rect(455,145+19,20,23,'344553');art.rect(458,167,14,9,'798d98');art.rect(462,178,6,6,'f6f1e5');art.line(458,184,14,'bdcad1');
    art.rect(480,169,23,11,'5f737b');art.rect(483,171,17,6,'b4c5c8');art.rect(491,166,3,7,'d3e0df');
    art.rect(454,191,23,12,shift(theme.wood,-18));art.rect(480,191,25,12,shift(theme.wood,-18));art.rect(474,194,2,5,'e9e7dd');art.rect(482,194,2,5,'e9e7dd');
    polishEnvironmentAtlas(art,theme);
    art.png('environments/'+theme.id+'.png');
  }
}
