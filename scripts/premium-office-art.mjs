import {fixtures} from '../packages/shared/src/environment/rooms.ts';
import {assetDefinitions,expandedFixtures} from '../packages/shared/src/environment/assets.ts';
import {drawDirectionalChair} from './seating-art.mjs';

// Original hand-authored pixel motifs. No photos, copied reference pixels or
// interpolated scaling. Every brush operation is bounded by the asset crop.
export const tone=(hex,d)=>hex.match(/../g).map(v=>Math.max(0,Math.min(255,parseInt(v,16)+d)).toString(16).padStart(2,'0')).join('');
export function drawPremiumOffice(art,theme){
  const wood=theme.wood,fabric=theme.fabric,wall=theme.wall,ink='182634',gold='d8a750';
  const legacy={desk:'desk',executiveDesk:'desk',bench:'bench',sofa:'sofa',plant:'plant',ceramic:'plant',books:'storage',meeting:'table',reception:'reception',coffee:'table',pantry:'counter',coffeeStation:'counter',lamp:'lamp'};
  for(const [id,[ox,oy,w,h]]of Object.entries(fixtures)){
    const spec=assetDefinitions[id],kind=spec?.kind??legacy[id];
    const r=(x,y,a,b,c)=>{if(![x,y,a,b].every(Number.isInteger)||x<0||y<0||a<0||b<0||x+a>w||y+b>h)throw Error('Premium pixel outside '+id+': '+[x,y,a,b]);art.rect(ox+x,oy+y,a,b,c);};
    const e=(x,y,a,b,c)=>{if(x<0||y<0||x+a>w||y+b>h)throw Error('Premium ellipse outside '+id);art.ellipse(ox+x,oy+y,a,b,c);};
    const l=(x,y,a,c)=>r(x,y,a,1,c),clear=()=>r(0,0,w,h,'00000000');
    const shadow=()=>{e(3,h-9,w-6,8,'101f3040');e(6,h-8,w-12,5,'101b3030');};
    const leaf=(cx,cy,size,variant=0)=>{
      const colors=theme.id==='eco-green'?['294d35','407b39','6fa546','acc864']:['294a2d','487b36','7d9e3d','b0c45f'];
      e(cx,cy,size,Math.max(4,size-2),colors[0]);e(cx+1,cy,Math.max(2,size-2),Math.max(3,size-4),colors[1+variant%2]);
      l(cx+2,cy+1,Math.max(1,size-5),colors[3]);
    };
    const monitor=(x,y,mw=24)=>{
      r(x,y,mw,17,'111c2b');r(x+1,y+1,mw-2,14,'28375d');
      for(let row=0;row<11;row++)r(x+2,y+2+row,mw-4,1,tone('354f87',12-row*2));
      r(x+3,y+3,3,9,'263751');
      for(let row=0;row<3;row++){l(x+8,y+4+row*3,mw-12-row*2,['8eb5d3','b8a3d6','6baab2'][row]);r(x+7,y+4+row*3,1,1,gold);}
      l(x+2,y+14,mw-4,'42576b');r(x+Math.floor(mw/2)-1,y+17,3,3,'253341');l(x+Math.floor(mw/2)-5,y+20,11,'647583');
    };
    if(kind==='desk'){
      clear();shadow();const standing=spec?.variant==='standing';
      r(7,29,4,21,ink);r(w-11,29,4,21,ink);l(5,50,11,'8e9da2');l(w-14,50,11,'8e9da2');
      r(2,7,w-4,28,tone(wood,-32));r(3,5,w-6,28,tone(wood,13));l(5,5,w-10,tone(wood,55));l(4,32,w-8,tone(wood,-7));
      for(let yy=10;yy<30;yy+=6){l(6,yy,w-12,tone(wood,6));l(10+(yy%3),yy+1,Math.floor(w/3),tone(wood,19));}
      r(8,26,w-16,5,tone(fabric,-9));
      if(id==='deskTriple'){monitor(6,7,26);monitor(35,5,26);monitor(64,7,26);}
      else if(['deskDual','deskManager','deskReturn','executiveDesk'].includes(id)){monitor(7,7,23);monitor(w-30,7,23);}
      else if(['deskLaptop','deskCreative','classroomDesk'].includes(id)){
        r(Math.floor(w/2)-11,8,23,15,ink);r(Math.floor(w/2)-9,10,19,10,'517997');l(Math.floor(w/2)-7,12,10,'aad3d9');r(Math.floor(w/2)-13,23,27,5,'b4bcc1');l(Math.floor(w/2)-10,24,21,'48566a');
      }else monitor(Math.floor(w/2)-13,6,26);
      for(let key=0;key<9;key++)r(Math.floor(w/2)-11+key*2,28,1,2,'bbc7cb');r(w-17,28,3,3,'e0dacb');
      r(6,22,9,6,'d9c1a6');l(7,23,7,'f6e5c8');r(7,24,1,3,'b27965');
      e(w-11,21,6,6,'f5e8c9');e(w-10,22,4,3,'704631');r(w-5,23,2,2,'f5e8c9');
      if(!standing)drawDirectionalChair(art,theme,ox+Math.floor(w/2)-16,oy+32,'mesh','up',false);
      else{r(w-15,32,6,3,'687880');r(w-14,33,2,1,'83d1c4');}
      if(id==='deskCreative'){r(5,15,12,9,'e5d7bb');l(6,17,9,'bf786b');l(6,20,7,'567f88');}
      if(id==='classroomDesk'){r(5,16,13,8,'779aa3');l(6,17,10,'d8e0cf');r(19,18,1,7,'d3a250');}
      if(id==='deskManager'){r(6,36,18,11,tone(wood,-9));l(9,39,10,'e2bb79');l(9,44,10,'e2bb79');}
      if(id==='deskReturn'){r(w-23,33,19,13,wood);l(w-22,33,17,tone(wood,40));l(w-20,38,13,tone(wood,-8));}
    }else if(kind==='sofa'){
      clear();shadow();const linen=theme.id==='warm-wood'?'d3c6b9':tone(fabric,30),dark=tone(linen,-48);
      r(8,16,w-16,37,dark);r(8,10,w-16,23,linen);l(11,10,w-22,tone(linen,30));
      const count=id==='sofaSectional'?4:3,sw=Math.floor((w-24)/count);
      for(let n=0;n<count;n++){const x=12+n*sw;r(x,13,sw-2,15,tone(linen,-6));l(x+2,14,sw-6,tone(linen,15));r(x,30,sw-2,18,linen);l(x+2,31,sw-6,tone(linen,24));l(x+2,46,sw-6,tone(linen,-22));}
      for(const x of[3,w-11]){r(x,21,8,30,dark);r(x+1,20,6,27,linen);l(x+2,21,4,tone(linen,28));}
      for(const [x,c]of[[15,gold],[w-30,fabric]]){r(x,23,13,13,tone(c,-22));r(x+1,22,11,11,c);l(x+2,23,8,tone(c,26));r(x+8,28,2,2,tone(c,-10));}
      r(11,53,4,5,ink);r(w-15,53,4,5,ink);
      if(id==='sofaSectional'){r(w-31,43,20,15,tone(linen,-15));l(w-29,44,16,tone(linen,18));}
    }else if(kind==='plant'){
      clear();shadow();const wide=spec?.variant==='wide',small=h===32;
      const px=wide?4:9,pw=wide?w-8:15,py=h-16;
      r(px,py,pw,12,tone(wall,-38));r(px+1,py+1,pw-3,10,id==='ceramic'?tone(wall,7):tone(wood,12));l(px,py,pw,'f8dfb5');l(px+2,py+10,pw-5,tone(wood,-20));r(px+2,py+2,2,7,tone(wall,18));
      for(const cx of wide?[12,29,46]:[15]){
        r(cx,small?9:12,2,small?12:37,'6e6140');
        const leaves=small?[[0,0,10],[-7,3,10],[7,4,9],[-3,8,10]]:[[-3,0,14],[-11,4,14],[4,6,14],[-5,10,15],[-11,16,14],[5,17,13],[-3,24,15],[-10,29,12],[6,30,12]];
        for(const [dx,dy,s]of leaves)leaf(Math.max(1,Math.min(w-s-1,cx+dx-3)),(small?2:4)+dy,s,dy%2);
      }
      if(id==='cornerPlanter'){r(5,21,22,7,tone(wall,-18));l(5,21,22,tone(wall,14));r(7,27,18,2,tone(wood,-18));}
    }else if(kind==='storage'&&['books','bookcase','shelfOpen','utilityShelf','snackShelf'].includes(id)){
      clear();shadow();r(3,3,w-6,h-8,tone(wood,-37));r(4,3,w-8,3,tone(wood,36));r(4,5,3,h-11,tone(wood,12));r(w-7,5,3,h-11,tone(wood,-1));
      for(let yy=8;yy<h-10;yy+=18){
        for(let xx=9;xx<w-9;xx+=5){const c=['bd7750','577d83','d7ae55','9c5060','74835b','c9c6b5'][Math.floor(xx/5+yy)%6],bh=9+(xx%4);r(xx,yy+13-bh,3,bh,c);l(xx,yy+14-bh,2,tone(c,36));r(xx+1,yy+8,1,2,'e9d9ac');}
        l(7,Math.min(h-5,yy+14),w-14,tone(wood,32));l(7,Math.min(h-4,yy+15),w-14,tone(wood,-5));
      }
      if(id==='snackShelf'){for(const x of[11,29,45]){r(x,10,8,11,['ba6651','d9b76a','69926b'][Math.floor(x/15)%3]);l(x+2,13,4,'f3e5c5');}}
    }else if(kind==='table'&&h===64){
      // Preserve each table silhouette and pad positions, add joinery and inlays.
      l(9,15,w-18,tone(wood,43));l(10,41,w-20,tone(wood,-16));
      for(let x=17;x<w-15;x+=17){r(x,25,1,13,tone(wood,6));}
      e(Math.floor(w/2)-6,25,12,10,'ddd6b9');leaf(Math.floor(w/2)-6,20,11);r(Math.floor(w/2)+2,26,2,2,'c8d485');
    }else if(kind==='reception'||kind==='counter'){
      // Existing framed cabinetry gains oak grain, brass channels and warm toe-kick.
      for(let x=12;x<w-9;x+=5){r(x,29,1,20,tone(wood,-28));r(x+1,29,1,20,tone(wood,16));}
      l(9,52,w-18,'eeb767');l(10,53,w-20,'fff0bc');
      if(kind==='reception'){l(10,18,w-20,tone(wall,22));r(w-16,11,7,8,'e4d7b8');leaf(w-20,4,12);}
    }else if(kind==='wall'&&spec.variant==='display'||id==='gameConsole'){
      clear();r(3,3,w-6,25,'121d30');r(4,4,w-8,23,'66768a');
      for(let yy=0;yy<19;yy++)r(6,6+yy,w-12,1,tone(id==='gameConsole'?'5e388d':'294d88',18-yy));
      const cx=Math.floor(w/2);r(cx-8,11,13,9,'72c5ee');r(cx+6,13,4,5,'72c5ee');r(cx+10,12,2,7,'72c5ee');l(8,25,w-16,'9b93c6');r(cx,27,2,1,'92e7cb');
      if(id==='gameConsole'){r(cx-11,11,22,10,'cab5ed');r(cx-7,10,14,12,'cab5ed');r(cx-8,13,6,2,'664593');r(cx-6,11,2,6,'664593');r(cx+5,13,2,2,'664593');}
    }else if(kind==='beanbag'){
      clear();shadow();e(2,5,28,25,'9e682f');e(3,3,26,25,'d6a43f');e(5,2,21,20,'efc35d');e(8,5,16,15,'e3b244');e(10,7,12,10,'c38e32');r(7,19,1,5,'f6ce70');r(24,12,1,8,'b6822d');l(11,26,10,'edbd58');
    }else if(kind==='living-wall'){
      clear();r(2,2,w-4,28,'3b4b31');r(3,3,w-6,2,'b09662');
      for(let x=4;x<w-9;x+=10)for(let y=5;y<22;y+=8)leaf(x,y,10,(x+y)%3);
      for(let x=8;x<w-9;x+=21){r(x,21,1,10,'6c8847');leaf(x-2,23,6);}
    }else if(kind==='trophies'){
      clear();r(2,5,w-4,22,tone(wood,-32));l(3,5,w-6,tone(wood,30));l(3,26,w-6,tone(wood,20));
      for(const x of[10,29,48]){r(x,11,9,7,'d4a350');r(x+1,11,7,3,'f6d77d');r(x+3,18,3,5,'d4a350');l(x+1,23,7,'efc76c');r(x-2,12,2,4,'b68139');r(x+9,12,2,4,'b68139');}
    }else if(kind==='sculpture'){
      clear();shadow();r(8,23,17,6,'9c9fa4');l(8,23,17,'e8d9ba');e(8,2,17,22,'b88242');e(9,2,14,20,'ecc47e');e(12,5,8,13,'00000000');r(15,22,4,2,'bf9652');
    }else if(kind==='window'){
      clear();r(1,2,w-2,28,'374f64');r(3,4,w-6,22,'7ca6b1');
      for(let yy=0;yy<18;yy++)r(5,5+yy,w-10,1,tone('8cbbc5',13-yy));
      for(let xx=8;xx<w-9;xx+=8)r(xx,17-(xx%3),5,8+(xx%3),'627d8a');
      r(29,4,3,24,'ead9be');l(2,27,w-4,'fcdfaf');r(5,5,2,17,'d6ece6');l(9,8,16,'c5e0df');
    }
  }
  // Corridor limestone: subtle cut seams and mineral pixels instead of blank bands.
  const tx=13*32,ty=32;
  art.rect(tx,ty,32,32,tone(theme.floor,8));
  art.line(tx,ty,32,tone(theme.floor,-17));art.rect(tx,ty,1,32,tone(theme.floor,-17));
  art.line(tx+1,ty+1,30,tone(theme.floor,23));art.rect(tx+1,ty+1,1,30,tone(theme.floor,18));
  for(const [x,y]of[[6,9],[17,23],[26,13],[11,28]])art.rect(tx+x,ty+y,2,1,tone(theme.floor,4));
  // Wall-mounted sconces are actual emissive artwork, not yellow dots on the map.
  const [x,y]=expandedFixtures.wallSconce;
  art.rect(x,y,32,32,'00000000');art.rect(x+11,y+5,10,22,'6c4b31');
  art.rect(x+12,y+6,8,20,'d6a160');art.rect(x+14,y+7,4,18,'fff0bc');art.rect(x+15,y+8,2,16,'fffbe5');
}
