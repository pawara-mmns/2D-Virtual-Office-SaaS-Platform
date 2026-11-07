import {collectionDefinitions,collectionChairs} from '../packages/shared/src/environment/collection.ts';
import {expandedFixtures,directionalChairRects} from '../packages/shared/src/environment/assets.ts';
import {drawDirectionalChair} from './seating-art.mjs';
import {tone} from './premium-office-art.mjs';

// Original native pixel drawings. Shared joinery, glass and small equipment
// vocabulary keep the collection coherent; each design has an authored silhouette
// and contents. No random noise, generated recolor entries or runtime drawing.
export function drawCollectionChair(art,theme,x,y,style,direction){
  drawDirectionalChair(art,theme,x,y,style==='wingback'||style==='scoop'?'lounge':style==='saddle'?'stool':style==='drafting'?'task':style==='leather'?'task':style,direction);
  const r=(a,b,w,h,c)=>art.rect(x+a,y+b,w,h,c),e=(a,b,w,h,c)=>art.ellipse(x+a,y+b,w,h,c),f=theme.fabric,wood=theme.wood;
  if(style==='mesh'){
    if(direction==='down'){r(10,0,12,3,'34444e');r(12,0,8,1,'8196a0');}
    else if(direction==='up'){r(9,27,14,3,'34444e');r(11,27,10,1,'8196a0');}
    else r(direction==='left'?28:1,10,3,12,'34444e');
  }else if(style==='drafting'){
    e(7,21,18,9,'abb5b8');e(9,23,14,5,'354651');r(14,25,3,6,'485963');r(5,30,23,1,'71848d');
  }else if(style==='leather'){
    const a=direction==='left'?25:direction==='right'?3:8,b=direction==='up'?22:direction==='down'?4:9;
    r(a,b,direction==='left'||direction==='right'?2:16,1,'d6b693');r(a,b+3,2,1,'263641');
    r(3,16,3,6,'a58457');r(26,16,3,6,'a58457');
  }else if(style==='visitor'){
    r(5,25,2,5,'9baeb5');r(24,25,2,5,'9baeb5');r(5,29,21,2,'71858e');r(9,29,14,1,'d0d9d6');
  }else if(style==='wingback'){
    if(direction==='down'){r(2,5,4,15,tone(f,-18));r(26,5,4,15,tone(f,-18));r(4,2,24,2,tone(f,25));}
    else if(direction==='up')r(3,24,26,5,tone(f,-16));
    else r(direction==='left'?24:2,2,6,27,tone(f,-10));
    r(7,29,3,3,wood);r(23,29,3,3,wood);
  }else if(style==='saddle'){
    r(4,10,6,7,tone(wood,-20));r(22,10,6,7,tone(wood,-20));e(8,7,16,13,tone(wood,30));r(9,8,14,2,tone(wood,45));
  }else if(style==='scoop'){
    e(3,6,26,20,tone(f,-8));e(6,8,20,14,tone(f,22));r(8,26,3,5,wood);r(22,26,3,5,wood);
    if(direction==='up')r(5,23,22,5,tone(f,-22));
    else if(direction==='left')r(25,7,4,19,tone(f,-22));else if(direction==='right')r(3,7,4,19,tone(f,-22));
  }
}

export function drawCollectionOffice(art,theme){
  for(const [id,spec]of Object.entries(collectionDefinitions)){
    const [ox,oy,w,h]=expandedFixtures[id],wood=theme.wood,ivory=theme.wall,fabric=theme.fabric,ink='273944',metal='758b94',brass='c7a467',paper='f3ebd8',leaf='42785b',screen='426f91';
    const r=(x,y,ww,hh,c)=>{if(![x,y,ww,hh].every(Number.isInteger)||ww<=0||hh<=0||x<0||y<0||x+ww>w||y+hh>h)throw Error('Collection bounds '+id+' '+[x,y,ww,hh]);art.rect(ox+x,oy+y,ww,hh,c);};
    const e=(x,y,ww,hh,c)=>{if(![x,y,ww,hh].every(Number.isInteger)||ww<=0||hh<=0||x<0||y<0||x+ww>w||y+hh>h)throw Error('Collection ellipse '+id+' '+[x,y,ww,hh]);art.ellipse(ox+x,oy+y,ww,hh,c);};
    const l=(x,y,ww,c)=>r(x,y,ww,1,c);
    const poly=(points,c)=>{for(let y=Math.min(...points.map(p=>p[1]));y<=Math.max(...points.map(p=>p[1]));y++){const xs=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(a[1]<=y&&b[1]>y||b[1]<=y&&a[1]>y)xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2){const x=Math.ceil(xs[i]),right=Math.floor(xs[i+1]);if(right>=x)r(x,y,right-x+1,1,c);}}};
    const shadow=()=>e(3,h-9,w-6,7,'172b3836');
    const slab=(x,y,ww,hh,c=wood)=>{r(x,y+3,ww,hh,tone(c,-26));r(x,y,ww,hh,c);l(x+1,y,ww-2,tone(c,34));l(x+2,y+hh-1,ww-4,tone(c,-12));};
    const grain=(x,y,ww,hh)=>{for(let i=3;i<hh;i+=5)l(x+2+(i%3),y+i,ww-8,tone(wood,i%2?-9:10));};
    const legs=(x,y,ww)=>{r(x,y,4,7,ink);r(x+ww-4,y,4,7,ink);l(x,y,4,metal);l(x+ww-4,y,4,metal);};
    const cup=(x,y)=>{e(x,y+6,9,3,'27394424');r(x,y,7,7,paper);l(x+1,y,5,'baa080');r(x+7,y+2,2,3,'d6c5aa');l(x+1,y+6,5,'c4b498');};
    const book=(x,y,ww=13,c=fabric)=>{r(x,y+1,ww,7,tone(c,-30));r(x,y,ww,5,c);l(x+2,y+5,ww-3,paper);r(x+1,y,1,5,tone(c,30));};
    const monitor=(x,y,ww=25,variant=0)=>{
      r(x,y,ww,17,'1d2f3c');r(x+1,y+1,ww-2,13,metal);r(x+2,y+2,ww-4,11,screen);l(x+3,y+2,ww-6,'8db8c9');
      if(variant===0){r(x+4,y+5,Math.max(4,Math.floor(ww/3)),6,'253d5b');for(let j=0;j<3;j++)l(x+5,y+6+j*2,Math.max(3,Math.floor(ww/3)-3),['8ebcaa','e0c380','98b2d4'][j]);}
      else {for(let j=0;j<3;j++)r(x+4+j*5,y+9-j*2,3,3+j*2,['88b3c1','accbcc','d7bb76'][j]);}
      r(x+Math.floor(ww/2)-1,y+17,3,4,ink);l(x+Math.floor(ww/2)-6,y+21,13,metal);r(x+ww-4,y+15,1,1,'a5d6b4');
    };
    const keyboard=(x,y,ww=20)=>{r(x,y,ww,5,'354851');l(x+1,y,ww-2,'a5b4b7');for(let j=2;j<ww-1;j+=3)r(x+j,y+2,1,1,'9faeb4');l(x+4,y+4,ww-8,'c3cbc7');};
    const pot=(x,y)=>{r(x+3,y+13,12,8,ivory);l(x+2,y+12,14,tone(ivory,22));r(x+5,y+20,8,2,tone(ivory,-33));for(const [dx,dy]of[[0,2],[7,0],[4,7]]){e(x+dx,y+dy,12,10,leaf);e(x+dx+2,y+dy+1,7,6,'78a465');}};
    const shelf=(rows=3,back=wood)=>{shadow();r(4,5,w-8,h-12,tone(back,-26));r(6,7,w-12,h-17,tone(back,-44));l(4,4,w-8,tone(back,28));for(let j=1;j<=rows;j++){const yy=8+Math.floor(j*(h-22)/rows);slab(5,yy,w-10,3,back);}legs(8,h-9,w-16);};
    const cabinet=(c=ivory)=>{shadow();slab(4,8,w-8,h-20,c);legs(8,h-10,w-16);};
    const frame=(c=paper)=>{r(2,3,w-4,h-7,tone(wood,-34));r(3,2,w-6,h-7,wood);l(4,2,w-8,tone(wood,35));r(6,5,w-12,h-13,c);};
    const upholstered=(style)=>{
      shadow();const count=style==='chaise'?3:2,sw=Math.floor((w-24)/count);
      r(6,17,w-12,37,tone(fabric,-29));r(8,8,w-16,21,tone(fabric,-5));l(12,8,w-24,tone(fabric,36));
      for(let i=0;i<count;i++){r(12+i*sw,29,sw-2,20,tone(fabric,13));l(14+i*sw,30,sw-6,tone(fabric,34));l(14+i*sw,47,sw-6,tone(fabric,-9));}
      r(3,20,8,31,fabric);r(w-11,20,8,31,fabric);legs(10,54,w-20);
      if(style==='chaise'){r(w-35,31,24,28,tone(fabric,13));l(w-33,33,20,tone(fabric,36));}
      if(style==='tufted')for(let y=13;y<25;y+=6)for(let x=16;x<w-12;x+=10){r(x,y,2,2,tone(fabric,-32));r(x+2,y+2,1,1,tone(fabric,25));}
      if(style==='scallop')for(let x=12;x<w-11;x+=12){e(x,5,11,14,fabric);l(x+3,6,5,tone(fabric,38));}
      if(style==='channel')for(let x=13;x<w-12;x+=8)r(x,11,1,15,tone(fabric,-25));
      if(style==='modular'){r(2,15,10,35,tone(fabric,13));r(w-12,15,10,35,tone(fabric,13));book(w-28,35,13,'c2a376');}
      else{r(14,19,11,13,'e6be70');l(15,20,9,'f3d59a');r(w-29,20,12,11,tone(ivory,-9));l(w-28,21,10,paper);}
    };
    r(0,0,w,h,'00000000');
    if(Object.hasOwn(collectionChairs,id)){for(const direction of ['down','up','left','right']){const [x,y]=directionalChairRects[id][direction];drawCollectionChair(art,theme,x,y,collectionChairs[id],direction);}continue;}
    switch(id){
      case 'crescentDesk':{
        shadow();poly([[5,26],[16,17],[w-17,17],[w-6,26],[w-6,51],[w-17,58],[16,58],[5,51]],tone(wood,-22));
        poly([[3,19],[16,10],[w-17,10],[w-4,19],[w-4,31],[w-18,38],[17,38],[3,31]],ivory);l(18,10,w-36,tone(ivory,30));
        for(let x=18;x<w-15;x+=5)r(x,40,1,12,tone(wood,18));l(17,55,w-34,'e9c47f');monitor(49,5,26);cup(23,23);pot(w-28,6);break;}
      case 'conciergeDesk':
        shadow();slab(4,22,w-8,31,wood);for(let x=9;x<w-7;x+=4)r(x,27,1,22,tone(wood,-26));slab(2,15,w-4,12,ivory);r(8,19,30,3,tone(ivory,-17));l(10,56,w-20,'f2d697');monitor(65,3,27);book(18,20,18);break;
      case 'visitorKiosk':
        shadow();e(5,54,22,6,ink);r(13,24,6,32,metal);r(6,3,21,28,ink);r(8,5,17,23,'63949e');r(10,8,13,4,paper);r(10,15,13,1,'b7d4d6');r(12,20,9,5,'416851');r(14,21,5,1,'c4e7b6');l(8,3,17,'b0c3c7');break;
      case 'waitingSettee':upholstered('channel');break;
      case 'brochureCarousel':
        shadow();r(14,8,4,45,metal);e(4,52,24,8,ink);for(const y of[6,22,38]){poly([[5,y],[26,y],[24,y+12],[7,y+12]],'71828b');for(let x=7;x<25;x+=7){r(x,y+2,6,8,[paper,fabric,'c7a270'][(x-7)/7]);l(x+1,y+4,4,'536b77');}}break;
      case 'welcomeTotem':
        shadow();slab(4,4,24,51,wood);r(8,7,16,41,'2c4449');e(12,10,8,8,brass);for(let y=22;y<43;y+=7){l(10,y,12,paper);l(10,y+2,8,'8aa5a1');}l(7,53,18,'f6d699');break;
      case 'receptionCredenza':
        cabinet(wood);for(let x=8;x<w-8;x+=27){r(x,12,24,9,tone(wood,-14));l(x+8,15,8,brass);}book(9,1,17);pot(w-26,0);r(41,11,16,10,ivory);l(44,14,10,ink);break;
      case 'umbrellaStand':
        shadow();e(5,39,22,19,metal);e(7,37,18,8,ink);r(15,8,2,34,wood);r(9,14,14,2,wood);r(10,13,2,5,brass);r(21,13,2,5,brass);for(const [x,c]of[[8,fabric],[19,'bc8b68']]){r(x,25,4,24,c);r(x+1,20,2,7,ink);r(x+1,19,5,2,ink);}break;
      case 'devUltrawideDesk':case 'devDualArmDesk':case 'devCornerDesk':case 'sitStandStation':{
        shadow();const standing=id==='sitStandStation';
        if(!standing)drawDirectionalChair(art,theme,ox+w/2-16,oy+32,'mesh','up',false);
        legs(8,35,w-16);slab(3,13,w-6,21,wood);grain(3,13,w-6,20);
        if(id==='devUltrawideDesk'){monitor(17,2,61);keyboard(29,25,30);}
        if(id==='devDualArmDesk'){r(46,6,3,16,metal);l(20,10,56,metal);monitor(8,1,34);monitor(53,1,34,1);keyboard(34,25,27);}
        if(id==='devCornerDesk'){slab(3,29,22,19,wood);monitor(32,3,38);r(6,21,15,12,'b3c0b9');r(8,22,11,8,screen);keyboard(40,26,26);}
        if(standing){monitor(13,1,38);keyboard(20,25,25);r(7,39,4,15,metal);r(w-11,39,4,15,metal);l(3,54,17,ink);l(w-20,54,17,ink);r(w-15,33,8,3,ink);}
        else l(3,33,w-6,tone(wood,-38));cup(w-16,23);break;}
      case 'laptopDock':
        e(4,24,25,5,'172b3836');r(10,15,3,9,metal);r(5,22,22,3,metal);r(5,3,23,15,ink);r(7,5,19,10,screen);l(8,6,17,'a1c5d1');r(4,18,25,3,'bac6c7');l(9,19,15,'667f8c');r(23,24,7,4,ink);r(25,25,2,1,'87c8aa');break;
      case 'deskAcousticDivider':
        r(4,6,56,16,tone(fabric,-28));r(6,5,52,15,fabric);for(let x=9;x<55;x+=4)r(x,7,1,11,tone(fabric,16));r(9,22,3,7,metal);r(51,22,3,7,metal);l(5,28,13,metal);l(46,28,13,metal);break;
      case 'rollingPedestal':
        cabinet();for(let y=13;y<25;y+=6){l(6,y,20,tone(ivory,-24));l(13,y+2,7,ink);}r(7,28,4,4,ink);r(23,28,4,4,ink);break;
      case 'conferenceOval4':case 'conferenceBoat6':case 'conferenceBoardroom10':{
        shadow();legs(13,49,w-26);
        if(id==='conferenceOval4'){e(3,12,w-6,39,tone(wood,-32));e(3,9,w-6,39,wood);e(6,11,w-12,33,tone(wood,18));}
        else {poly([[12,10],[w-13,10],[w-4,19],[w-4,40],[w-13,49],[12,49],[3,40],[3,19]],tone(wood,-29));poly([[12,7],[w-13,7],[w-4,16],[w-4,37],[w-13,46],[12,46],[3,37],[3,16]],wood);grain(9,12,w-18,30);}
        const n=id==='conferenceBoardroom10'?4:id==='conferenceBoat6'?3:2;
        for(let i=0;i<n;i++){const x=13+Math.floor(i*(w-41)/(n-1));book(x,15,14,'aebdbd');book(x,35,14,'aebdbd');}
        e(w/2-7,26,14,10,ink);e(w/2-4,28,8,4,metal);r(w/2-1,29,2,1,'88c6ad');break;}
      case 'smartDisplayWide':
        frame(ink);r(8,6,w-16,17,'365c81');r(11,8,40,12,'477b9f');for(let i=0;i<4;i++)r(15+i*8,16-i*2,5,3+i*2,['74a8be','91c4c4','cfb66c','e2cf94'][i]);r(w-35,8,23,13,'263c59');e(w-28,9,9,7,'cfb99d');r(w-29,16,12,5,'6f9fae');l(38,28,20,metal);break;
      case 'conferenceCameraBar':
        r(4,10,56,14,ink);l(6,10,52,metal);for(let x=7;x<25;x+=3)r(x,14,1,6,'566d77');for(let x=40;x<57;x+=3)r(x,14,1,6,'566d77');e(26,10,13,13,'111e2a');e(29,13,7,7,'486980');r(31,14,2,2,'a5d1dd');r(36,11,1,1,'b1e5ab');break;
      case 'speakerTriangle':
        poly([[16,5],[29,24],[3,24]],ink);poly([[16,8],[25,22],[7,22]],metal);for(let y=13;y<22;y+=3)l(13,y,7,'425a66');e(14,17,5,4,'93c2af');break;
      case 'whiteboardRolling':
        r(6,5,52,34,metal);r(8,7,48,29,paper);for(let y=12;y<29;y+=6){l(13,y,17,screen);l(36,y,13,'b89d6a');}r(17,40,3,17,metal);r(45,40,3,17,metal);l(9,57,46,metal);for(const x of[9,50])r(x,58,5,4,ink);r(11,35,42,3,ink);r(38,35,7,2,'92799e');break;
      case 'glassPartition':
        r(3,4,58,20,'6d939b70');l(4,3,56,'c4dcd5');r(3,4,2,22,metal);r(59,4,2,22,metal);r(6,7,50,11,'c5dddc50');r(10,8,3,10,'e2eee670');r(31,4,2,20,metal);legs(5,24,54);break;
      case 'sofaChaise':upholstered('chaise');break;
      case 'sofaLoveseat':upholstered('scallop');break;
      case 'sofaChesterfield':upholstered('tufted');break;
      case 'sofaModular':upholstered('modular');break;
      case 'poufKnitted':
        shadow();e(3,8,26,22,tone(fabric,-24));e(4,5,24,20,fabric);for(let y=8;y<24;y+=4)for(let x=7+(y%8?2:0);x<26;x+=4){r(x,y,1,3,tone(fabric,24));r(x+1,y+2,1,1,tone(fabric,-19));}e(12,11,8,6,tone(fabric,9));break;
      case 'nestingTables':
        shadow();e(6,5,34,20,tone(wood,-22));e(5,3,34,19,tone(wood,18));e(29,13,30,16,'d1c7b2');l(34,14,20,paper);legs(9,23,26);legs(34,24,20);book(14,9,13);break;
      case 'bookcaseLadder':
        shadow();poly([[13,3],[17,3],[9,58],[5,58]],wood);poly([[47,3],[51,3],[59,58],[55,58]],wood);for(let y=13;y<54;y+=13){slab(11-Math.floor(y/15),y,42+2*Math.floor(y/15),3,wood);for(let x=16;x<47;x+=8){r(x,y-9,5,9,[fabric,'b2916c','7e9c81','c4b9a3'][x/8%4|0]);l(x+1,y-7,3,paper);}}break;
      case 'lampTripod':
        shadow();poly([[15,20],[18,20],[26,59],[23,59]],wood);poly([[15,20],[18,20],[7,59],[4,59]],wood);r(15,21,3,38,tone(wood,-18));poly([[10,3],[23,3],[29,22],[3,22]],'d6c29e');l(11,3,11,paper);e(4,19,24,6,'f3dcac');r(15,23,3,3,brass);break;
      case 'magazineRackLow':
        shadow();r(4,9,24,17,metal);r(6,10,20,12,ink);book(8,6,14,'c4b195');book(12,10,13,fabric);for(let x=6;x<28;x+=4)r(x,18,1,8,'a2b0b0');legs(6,25,20);break;
      case 'espressoBar':
        cabinet(wood);slab(3,27,58,6,ivory);r(9,5,42,22,ink);r(12,7,36,11,metal);e(16,9,7,6,'b3c7c8');e(37,9,7,6,'b3c7c8');r(18,19,3,7,metal);r(38,19,3,7,metal);cup(16,23);cup(36,23);l(12,28,36,'c0d2ce');for(let x=9;x<56;x+=6)r(x,37,1,13,tone(wood,-25));break;
      case 'coffeeGrinder':
        e(4,25,24,5,'172b3836');r(8,16,16,12,metal);e(8,4,16,15,'8f9d9e');e(10,5,12,11,'735943');r(11,2,10,3,ink);r(16,14,9,4,ink);r(21,18,3,6,metal);cup(20,23);l(8,27,16,ink);break;
      case 'refrigeratorTall':
        shadow();slab(5,3,22,53,metal);r(7,5,18,17,tone(ivory,10));r(7,24,18,29,ivory);r(21,10,2,8,ink);r(21,28,2,13,ink);l(8,5,15,paper);r(9,28,6,8,'a9baaa');r(10,29,4,3,paper);break;
      case 'microwaveShelf':
        frame(tone(wood,-32));slab(4,25,56,3,wood);r(9,6,40,18,metal);r(11,8,27,13,ink);r(14,10,21,8,'6c8e96');r(42,10,4,3,'c5e2d2');r(43,17,2,3,ink);l(12,7,24,'b7c7ca');break;
      case 'sinkIsland':
        cabinet(wood);slab(2,16,92,19,ivory);e(13,20,37,12,metal);e(17,21,29,8,'425a65');r(29,11,3,14,metal);r(30,9,12,3,metal);r(39,11,3,4,metal);r(62,19,23,9,wood);for(let x=65;x<84;x+=4)l(x,21,2,tone(wood,28));r(62,37,1,15,tone(wood,-25));l(15,41,10,brass);l(71,41,10,brass);break;
      case 'snackVending':
        cabinet(ink);r(8,6,35,39,metal);r(10,8,31,35,'223e4a');for(let y=12;y<39;y+=9)for(let x=13;x<38;x+=8){r(x,y,5,7,[fabric,'d2ae65','8fa87d'][x%3]);l(x+1,y+2,3,paper);}r(46,13,10,7,'7eae9d');r(48,24,6,2,metal);r(47,33,8,6,ink);r(12,48,29,6,'101f2a');l(10,8,2,'b8d9d270');break;
      case 'cafePedestal':
        shadow();r(29,14,6,14,metal);e(16,24,33,6,ink);e(4,4,56,21,tone(wood,-31));e(4,2,56,20,tone(wood,20));l(17,4,30,tone(wood,41));cup(23,7);book(38,9,12);break;
      case 'teaTrolley':
        shadow();r(7,14,3,40,metal);r(54,14,3,40,metal);slab(5,19,54,5,wood);slab(5,43,54,5,wood);r(7,7,50,3,metal);r(7,7,3,12,metal);r(54,7,3,12,metal);for(const x of[8,50])r(x,53,6,7,ink);e(13,8,17,12,paper);r(26,11,6,6,paper);cup(38,13);r(14,32,16,11,'9aab87');r(35,34,14,9,'cfba8d');break;
      case 'teamIsland':
        shadow();legs(8,45,w-16);slab(3,13,w-6,32,wood);r(w/2-1,14,2,29,metal);monitor(10,4,26);monitor(w-37,4,26,1);keyboard(17,31,22);keyboard(w-42,31,22);pot(w/2-10,16);break;
      case 'brainstormingHex':
        shadow();legs(20,48,56);poly([[24,9],[71,9],[91,29],[71,49],[24,49],[4,29]],tone(wood,-32));poly([[24,6],[71,6],[91,26],[71,46],[24,46],[4,26]],wood);l(27,8,41,tone(wood,34));r(30,15,36,22,paper);for(let i=0;i<4;i++)r(34+i*7,19+(i%2)*8,5,5,['c7b5c6','8facaa','d6b769','91a9bb'][i]);cup(72,23);break;
      case 'stickyWallLarge':
        frame('c1b195');for(let x=11;x<84;x+=15){l(x,8,11,ink);for(let j=0;j<2;j++){r(x+1,12+j*8,9,6,['e3be75','aac2b1','b9a9c0'][(x+j)%3]);r(x+4,12+j*8,1,1,'6c6860');}}break;
      case 'mobileAcousticScreen':
        shadow();r(7,5,50,43,ink);r(9,7,46,38,fabric);for(let y=10;y<44;y+=4)l(12,y,40,tone(fabric,13));r(31,8,1,36,tone(fabric,-25));r(12,48,3,9,metal);r(49,48,3,9,metal);l(6,57,16,metal);l(43,57,16,metal);r(7,58,4,4,ink);r(54,58,4,4,ink);break;
      case 'materialsLibrary':
        shelf(3);for(let y=10;y<45;y+=14)for(let x=11;x<52;x+=10){r(x,y,7,9,['bc9873','87a8a0','afa0b4','d7c49b'][x/10%4|0]);l(x+1,y+1,5,'e6dcc6');r(x+2,y+6,3,1,ink);}break;
      case 'draftingTable':
        shadow();r(10,24,5,33,wood);r(48,24,5,33,wood);poly([[7,7],[53,7],[59,36],[3,36]],tone(wood,-28));poly([[8,4],[52,4],[57,31],[5,31]],wood);r(14,9,34,19,paper);l(18,15,22,screen);r(20,13,1,10,screen);r(29,12,12,9,'d6d4c3');l(11,28,42,metal);r(42,8,2,18,wood);break;
      case 'digitalEasel':
        shadow();r(14,28,4,29,metal);r(5,55,23,3,metal);r(3,3,26,40,ink);r(5,5,22,35,'537f9b');r(7,8,18,8,'a2c2c5');for(let j=0;j<3;j++){r(8,21+j*5,4,3,['dfc27d','c0aaca','93b59f'][j]);l(15,22+j*5,9,paper);}break;
      case 'printerProduction':
        cabinet();r(6,7,54,22,metal);r(8,9,48,15,'b5c0bb');r(12,10,39,11,'49636d');l(14,11,35,'8ea7ad');r(60,18,28,31,tone(ivory,-14));r(64,22,21,4,ink);r(65,26,20,3,paper);r(14,35,30,6,ink);r(16,35,26,3,paper);r(48,30,9,6,'6b9c91');for(let j=0;j<2;j++)l(14,47+j*4,42,tone(ivory,-28));break;
      case 'scannerFlatbed':
        shadow();slab(3,15,26,10,metal);r(6,16,20,6,'7caca9');poly([[4,14],[7,1],[26,1],[29,14]],ivory);r(9,4,15,8,ink);r(25,23,2,1,'9edbb8');break;
      case 'paperOrganizer':
        shelf(3,ivory);for(let y=9;y<48;y+=14)for(const x of[10,34]){r(x,y,20,10,'cebc9c');r(x+1,y,18,4,paper);for(let j=1;j<4;j++)l(x+2,y+j,15,'d2c9b5');r(x+6,y+6,8,2,'8aa5a4');}break;
      case 'filingLateral':
        cabinet(metal);for(const x of[8,50]){r(x,12,38,12,tone(ivory,-3));l(x+12,15,14,ink);r(x+5,19,7,3,paper);}break;
      case 'lockerTower':
        cabinet(metal);for(const x of[8,33])for(const y of[11,32]){r(x,y,22,19,ivory);for(let j=0;j<3;j++)l(x+4,y+3+j*2,12,tone(ivory,-29));r(x+16,y+12,2,4,ink);r(x+3,y+13,7,3,'a6b7a2');}break;
      case 'rackNetwork':
        cabinet(ink);r(8,6,48,46,'263a46');for(let y=10;y<48;y+=9){r(11,y,42,7,metal);for(let x=15;x<45;x+=6)r(x,y+2,3,2,ink);r(48,y+2,2,2,'8cce9e');}for(let j=0;j<4;j++){r(18+j*8,16+j*4,2,9,['689cac','c7ad74','9db78a','a79cbb'][j]);}l(8,7,2,'91b6c060');break;
      case 'recyclingStation':
        shadow();slab(3,9,58,17,ivory);for(let i=0;i<3;i++){const x=6+i*18,c=['668f96','8ca675','c5a76d'][i];r(x,9,15,16,c);e(x+2,10,11,4,ink);r(x+5,18,5,3,paper);}l(5,27,54,tone(ivory,-30));break;
      case 'supplyCart':
        shadow();r(5,8,3,46,metal);r(56,8,3,46,metal);l(5,7,54,metal);slab(6,24,52,4,metal);slab(6,48,52,4,metal);for(const [x,y]of[[10,11],[34,10],[12,34],[36,35]]){r(x,y,18,12,'bd9c70');l(x+1,y,16,'dcc5a0');r(x+7,y,3,11,'e5d7b9');r(x+3,y+6,6,3,paper);}for(const x of[7,51])r(x,54,6,7,ink);break;
      case 'upsTower':
        shadow();slab(7,5,19,22,ink);r(10,8,13,6,'5e8b88');r(12,10,8,2,'aed3b4');for(let y=18;y<26;y+=3)l(10,y,13,metal);break;
      case 'plantMonstera':case 'plantFiddleLeaf':{
        shadow();slab(9,46,15,12,ivory);r(15,12,2,36,'776b4c');
        const leaves=id==='plantMonstera'?[[3,10,15,13],[15,5,14,16],[1,27,17,13],[15,24,15,14],[7,34,17,11]]:[[7,4,18,12],[1,15,16,13],[14,21,16,13],[3,31,18,12]];
        for(const [x,y,ww,hh]of leaves){e(x,y,ww,hh,leaf);e(x+2,y+1,ww-5,hh-4,'6f9d60');r(x+Math.floor(ww/2),y+3,1,hh-5,'a0b87d');if(id==='plantMonstera'){r(x,y+5,4,2,'00000000');r(x+ww-4,y+hh-6,4,2,'00000000');}}
        l(9,46,15,paper);break;}
      case 'planterTrough':
        shadow();slab(4,17,88,11,ivory);for(let x=10;x<85;x+=14){e(x-4,3+(x%3),17,13,leaf);e(x,1+(x%3),10,10,'7fa56a');r(x+3,9,1,9,'a5bc7f');}l(6,18,84,paper);r(9,28,78,2,tone(ivory,-31));break;
      case 'hangingPothos':
        slab(3,5,58,3,wood);for(const x of[8,28,48]){r(x,2,9,7,ivory);for(let j=0;j<4;j++){const yy=9+j*5,xx=x+(j%2?2:-2);r(xx+4,yy,1,5,leaf);e(xx,yy,9,6,leaf);e(xx+2,yy,5,3,'82aa67');}}break;
      case 'artTriptych':
        for(let i=0;i<3;i++){const x=3+i*31;r(x,3,28,25,wood);r(x+2,5,24,21,'cbbf9b');e(x+13,7,9,8,'bd8f60');poly([[x+3,24],[x+3,19-i*2],[x+12,12+i*2],[x+24,23]],['688c81','547974','88a17d'][i]);l(x+3,25,22,paper);}break;
      case 'clockFlip':
        frame(ink);for(let i=0;i<4;i++){const x=9+i*12;r(x,7,10,15,'3f525d');l(x+1,14,8,ink);r(x+3,9,4,10,paper);r(x+4,11,2,6,'3f525d');}r(31,11,2,2,brass);r(31,18,2,2,brass);break;
      case 'signDirectory':
        frame('304b50');for(let i=0;i<3;i++){const y=8+i*6;l(10,y,26,paper);l(10,y+2,19,'8faeab');r(44,y,10,2,brass);r(51,y-1,2,4,brass);}l(7,26,50,'f4d39b');break;
      case 'benchSlatted':
        shadow();for(let y=6;y<23;y+=4)slab(4,y,88,2,wood);legs(10,23,76);r(10,27,3,5,ink);r(82,27,3,5,ink);break;
      case 'achievementCase':
        cabinet(wood);r(7,8,50,38,'628c8e90');l(8,7,48,'c3d6ca');for(const x of[14,36]){e(x,16,13,11,brass);r(x+5,26,3,9,brass);slab(x+1,35,12,3,wood);r(x+4,19,5,5,'ead4a1');}r(31,9,2,35,wood);l(7,45,50,tone(wood,28));r(12,10,2,30,'d6e7dc50');break;
      case 'sconceTwin':
        r(8,9,16,14,ink);r(14,6,4,21,brass);e(8,3,16,8,'efd29a');r(8,6,16,17,brass);l(9,7,14,'f6dca7');e(8,20,16,8,'fbe4b1');r(14,9,2,11,'967342');break;
      case 'pendantLinear':
        r(18,1,1,11,metal);r(77,1,1,11,metal);slab(3,12,90,6,ink);r(5,18,86,4,'edca8a');l(7,20,82,'fff0c7');break;
      case 'lampArchitect':
        shadow();e(5,25,21,5,metal);r(14,18,3,8,ink);poly([[14,20],[12,18],[23,6],[25,8]],metal);poly([[22,8],[23,6],[13,2],[12,4]],metal);poly([[6,4],[14,4],[18,12],[3,12]],fabric);l(5,12,11,'f5dca7');e(12,16,5,5,brass);break;
      case 'lampHalo':
        shadow();r(15,21,3,36,brass);e(6,53,23,7,ink);e(3,3,26,25,brass);e(6,6,20,19,'f0d7a2');e(8,8,16,15,'00000000');r(16,23,1,32,'e7ce96');break;
      case 'lightCoveCorner':
        r(4,4,56,23,wood);r(8,7,50,17,'344e53');r(8,7,3,17,'eccc90');r(9,22,48,3,'f4dfac');l(12,25,45,'b79458');break;
      case 'floorLantern':
        shadow();e(5,7,23,21,tone(wood,-28));r(6,7,21,17,'e4c58d');for(let x=7;x<27;x+=4)r(x,8,1,15,'94734d');e(6,3,21,8,wood);e(9,5,15,4,'fae3b2');r(13,0,7,4,metal);e(6,24,21,5,tone(wood,-22));break;
      case 'archWoodSlats':
        shadow();slab(4,52,56,5,wood);for(let x=8;x<58;x+=8){r(x,5,4,48,wood);r(x,5,1,47,tone(wood,33));r(x+3,7,1,44,tone(wood,-28));}l(6,4,52,tone(wood,23));break;
      case 'archGlassScreen':
        shadow();poly([[8,53],[8,18],[15,6],[24,2],[40,2],[49,6],[56,18],[56,53]],brass);poly([[11,51],[11,19],[17,9],[25,5],[39,5],[47,9],[53,19],[53,51]],'91b5b078');for(let x=15;x<52;x+=5)r(x,17,1,33,'d9e7d145');slab(6,53,52,4,wood);break;
      case 'acousticHexTiles':
        for(const [x,y,c]of[[4,6,fabric],[22,3,tone(fabric,25)],[40,6,tone(fabric,-16)],[22,18,'bba77e']])poly([[x+5,y],[x+14,y],[x+19,y+5],[x+14,y+11],[x+5,y+11],[x,y+5]],c);break;
      case 'tvMediaCredenza':
        cabinet(wood);r(10,2,76,32,ink);r(12,4,72,27,'304e77');r(29,10,39,14,'3f6fa3');poly([[44,13],[44,21],[53,17]],'9bd4d8');l(13,4,70,'92b4bb');r(25,35,4,7,metal);r(68,35,4,7,metal);r(8,44,27,7,'304452');r(61,44,27,7,'304452');for(let x=39;x<56;x+=5)r(x,42,3,11,[paper,fabric,'bc9c70'][x%3]);break;
      case 'tvMobileStand':
        shadow();r(29,21,5,34,metal);l(9,55,46,metal);for(const x of[9,49])r(x,56,5,6,ink);r(3,4,58,33,ink);r(5,6,54,27,'315a80');r(10,10,27,19,'5086a2');for(let j=0;j<3;j++)l(13,14+j*4,21,paper);e(43,12,10,10,'96b9ac');r(17,43,30,4,wood);break;
      case 'consoleArcade':
        shadow();poly([[5,3],[26,3],[28,12],[25,28],[29,39],[26,58],[5,58],[3,36],[7,27],[4,13]],ink);r(7,4,18,5,fabric);l(9,6,14,'edc88b');r(8,14,16,17,screen);r(10,16,12,12,'334557');for(const [x,y]of[[12,19],[17,22],[13,26]])r(x,y,3,2,'a7c8ac');slab(5,33,22,6,metal);r(10,30,2,6,'cb8e6b');r(21,34,2,2,'e5bd67');r(10,44,12,8,fabric);r(15,46,3,1,ink);break;
      case 'chessTable':
        shadow();legs(9,23,46);slab(3,5,58,18,wood);for(let y=0;y<6;y++)for(let x=0;x<6;x++)r(18+x*5,6+y*2,5,2,(x+y)%2?paper:'5c746b');for(const x of[19,29,39]){r(x,4,3,5,'d4c6a4');r(x+5,15,3,5,ink);}break;
      case 'foosballTable':
        shadow();legs(15,47,66);slab(8,10,80,36,wood);r(14,13,68,28,'487c69');l(15,14,66,'bfd1b3');l(15,38,66,'bfd1b3');r(47,14,1,25,'b8d0b1');for(let x=23;x<80;x+=17){r(x,8,2,41,metal);for(const y of[20,30])r(x-2,y,6,5,x%2?'c8ae6e':'7b9fae');r(x-2,5,6,5,ink);}r(8,22,6,12,ink);r(82,22,6,12,ink);break;
      case 'pingPongTable':
        shadow();legs(13,45,102);slab(3,9,122,35,'527e85');l(6,10,116,paper);l(6,41,116,paper);r(5,11,1,30,paper);r(122,11,1,30,paper);l(6,26,116,'a4c7c1');r(62,6,3,39,ink);for(let y=8;y<42;y+=3)r(63,y,1,1,paper);e(17,21,9,6,'b97c69');r(23,26,7,2,wood);e(94,29,9,6,fabric);r(90,34,7,2,wood);e(91,18,3,3,paper);break;
      case 'boardGameShelf':
        shelf(3);for(let y=9;y<47;y+=14)for(let x=10;x<51;x+=13){r(x,y,11,10,['ac866b','7d9c83','6b8b9c','b8a478'][x%4]);r(x+3,y+3,5,4,paper);r(x+5,y+4,1,2,ink);}break;
      case 'recordConsole':
        shadow();slab(3,10,58,16,wood);r(7,12,15,12,ink);r(42,12,15,12,ink);for(let x=10;x<21;x+=3)r(x,14,1,8,metal);for(let x=45;x<56;x+=3)r(x,14,1,8,metal);e(25,3,15,11,ink);e(30,6,5,4,brass);r(40,3,2,10,metal);l(35,12,7,metal);legs(7,25,50);break;
      case 'aquariumCabinet':
        cabinet(wood);r(6,4,52,32,metal);r(8,6,48,28,'437f8a');r(9,8,46,22,'629a9a');r(9,29,46,4,'c2b28b');for(const x of[13,23,45]){r(x,17,2,13,leaf);r(x-2,20,7,2,'7ca36d');r(x-2,25,7,2,'7ca36d');}e(30,17,9,4,'dfbd78');poly([[38,19],[43,16],[43,21]],'dfbd78');r(12,7,2,19,'cee4d355');l(9,6,46,'b8d9cf');break;
      default:throw Error('Missing authored collection design '+id);
    }
  }
}
