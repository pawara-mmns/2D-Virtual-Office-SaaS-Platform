import { TILE_SIZE, tileLayer, type OfficeMap } from '../../../../packages/shared/src/map.ts';
type Position={x:number;y:number};

// Precompute architectural obstructions once per immutable office map. Furniture
// does not suppress conversation; physical partitions and unbuilt void do.
export function conversationSpace(map:OfficeMap) {
  const architecture=tileLayer(map,'Architecture').data,floor=tileLayer(map,'Floor').data;
  const walls=architecture.map((tile,i)=>tile!==0||floor[i]===0);
  return (a:Position,b:Position)=>{
    const x=a.x,y=a.y+11,dx=b.x-x,dy=b.y+11-y;
    if(![x,y,dx,dy].every(Number.isFinite))return false;
    const left=Math.floor(Math.min(x,b.x)/TILE_SIZE),right=Math.floor(Math.max(x,b.x)/TILE_SIZE);
    const top=Math.floor(Math.min(y,b.y+11)/TILE_SIZE),bottom=Math.floor(Math.max(y,b.y+11)/TILE_SIZE);
    for(let ty=top;ty<=bottom;ty++)for(let tx=left;tx<=right;tx++) {
      if(tx<0||ty<0||tx>=map.width||ty>=map.height)return false;
      if(!walls[ty*map.width+tx])continue;
      let enter=0,exit=1;
      for(const [origin,delta,min,max]of [[x,dx,tx*TILE_SIZE,(tx+1)*TILE_SIZE],[y,dy,ty*TILE_SIZE,(ty+1)*TILE_SIZE]]) {
        if(delta===0){if(origin!<min!||origin!>max!){enter=2;break;}}
        else{const first=(min!-origin!)/delta!,last=(max!-origin!)/delta!;enter=Math.max(enter,Math.min(first,last));exit=Math.min(exit,Math.max(first,last));}
      }
      if(enter<=exit)return false;
    }
    return true;
  };
}
