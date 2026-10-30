export type BubblePoint = {
    x: number;
    y: number;
};
export type BubbleAvatar=BubblePoint&{left:number;right:number;top:number;bottom:number;footX:number;footY:number};
const cross = (o: BubblePoint, a: BubblePoint, b: BubblePoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
// Convex hull of small circular halos: a capsule for two people, a rounded
// boundary for groups. At most 160 samples for a ten-person office.
export function bubbleBoundary(members: readonly BubblePoint[], radius = 30): BubblePoint[] {
    const points = members.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).flatMap(p => Array.from({ length: 16 }, (_, i) => ({ x: p.x + Math.cos(i * Math.PI / 8) * radius, y: p.y + Math.sin(i * Math.PI / 8) * radius }))).sort((a, b) => a.x - b.x || a.y - b.y);
    if (points.length < 3)
        return [];
    const lower: BubblePoint[] = [], upper: BubblePoint[] = [];
    for (const p of points) {
        while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0)
            lower.pop();
        lower.push(p);
    }
    for (const p of points.toReversed()) {
        while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0)
            upper.pop();
        upper.push(p);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
export function bubbleTension(points: readonly BubblePoint[], stretch: number, exit: number) {
    let distance = 0;
    for (let i = 0; i < points.length; i++)
        for (let j = i + 1; j < points.length; j++)
            distance = Math.max(distance, Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y));
    return Math.max(0, Math.min(1, (distance - stretch) / (exit - stretch)));
}

function hull(points:BubblePoint[]) {
    const sorted=points.sort((a,b)=>a.x-b.x||a.y-b.y),lower:BubblePoint[]=[],upper:BubblePoint[]=[];
    for(const p of sorted){while(lower.length>1&&cross(lower.at(-2)!,lower.at(-1)!,p)<=0)lower.pop();lower.push(p);}
    for(const p of sorted.toReversed()){while(upper.length>1&&cross(upper.at(-2)!,upper.at(-1)!,p)<=0)upper.pop();upper.push(p);}
    return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
export function avatarEnvelope(members:readonly BubbleAvatar[],padding=9):BubblePoint[] {
    const points:BubblePoint[]=[];
    for(const p of members){
        if(![p.left,p.right,p.top,p.bottom,p.footX,p.footY].every(Number.isFinite))continue;
        const left=Math.min(p.left,p.footX),right=Math.max(p.right,p.footX),top=Math.min(p.top,p.footY),bottom=Math.max(p.bottom,p.footY);
        for(const [x,y,start]of [[left,top,Math.PI],[right,top,Math.PI*1.5],[right,bottom,0],[left,bottom,Math.PI*.5]])
            for(let i=0;i<=4;i++){const angle=start!+i*Math.PI/8;points.push({x:x!+Math.cos(angle)*padding,y:y!+Math.sin(angle)*padding});}
    }
    return hull(points);
}
function resample(points:readonly BubblePoint[],count=48):BubblePoint[] {
    const lengths=points.map((p,i)=>Math.hypot(p.x-points[(i+1)%points.length]!.x,p.y-points[(i+1)%points.length]!.y));
    const total=lengths.reduce((a,b)=>a+b,0);if(!total)return [];
    return Array.from({length:count},(_,i)=>{let distance=total*i/count,index=0;while(index<lengths.length-1&&distance>lengths[index]!){distance-=lengths[index]!;index++;}const a=points[index]!,b=points[(index+1)%points.length]!,t=distance/lengths[index]!;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};});
}
export function smoothEnvelope(previous:readonly BubblePoint[],target:readonly BubblePoint[],delta:number,reduced:boolean) {
    const next=resample(target);if(reduced||previous.length!==next.length)return{memory:next,boundary:[...target]};
    let shift=0,best=Infinity;
    for(let offset=0;offset<next.length;offset++){let score=0;for(let i=0;i<next.length;i++){const p=previous[i]!,q=next[(i+offset)%next.length]!;score+=(p.x-q.x)**2+(p.y-q.y)**2;}if(score<best){best=score;shift=offset;}}
    const factor=1-Math.exp(-Math.min(64,Math.max(0,delta))/70);
    const memory=previous.map((p,i)=>{const q=next[(i+shift)%next.length]!;return{x:p.x+(q.x-p.x)*factor,y:p.y+(q.y-p.y)*factor};});
    // The instantaneous target is included so smoothing can never clip a
    // moving sprite; only excess old outline retracts with easing.
    return{memory,boundary:hull([...memory,...target])};
}
