import { assetDefinitions, expandedFixtures } from '../packages/shared/src/environment/assets.ts';

// Original hand-specified silhouettes and details. One restrained palette and
// upper-left light source serve every family; no noise or random placement.
export function drawExpandedOfficeAssets(art,theme) {
  const shade=(hex,d)=>hex.match(/../g).map(v=>Math.max(0,Math.min(255,parseInt(v,16)+d)).toString(16).padStart(2,'0')).join('');
  const wood=theme.wood,wall=theme.wall,fabric=theme.fabric,ink=shade(theme.background,-18),edge=shade(wood,-30);
  const paper='eeeade',screen=theme.id==='dark-tech'?'497fa4':'7b9b9c',leaf=theme.id==='eco-green'?'50784c':'65815d';
  for(const [id,spec]of Object.entries(assetDefinitions)) {
    const [x,y,w,h]=expandedFixtures[id],v=spec.variant;
    const r=(a,b,c,d,color)=>{
      if(![a,b,c,d].every(Number.isInteger)||a<0||b<0||a+c>w||b+d>h)throw Error('Invalid pixel bounds: '+id+' '+[a,b,c,d]);
      art.rect(x+a,y+b,c,d,color);
    };
    const e=(a,b,c,d,color)=>{if(![a,b,c,d].every(Number.isInteger)||a<0||b<0||a+c>w||b+d>h)throw Error('Invalid ellipse bounds: '+id);art.ellipse(x+a,y+b,c,d,color);};
    const line=(a,b,c,color)=>r(a,b,c,1,color);
    const shadow=()=>e(4,h-10,w-8,7,'17232a22');
    const top=(a,b,c,d,color=wood)=>{r(a,b+2,c,d,edge);r(a,b,c,d-1,shade(color,17));line(a+2,b,c-4,shade(color,33));};
    const monitor=(a,b,c=24)=>{r(a,b,c,16,ink);r(a+2,b+2,c-4,11,screen);line(a+4,b+4,c-9,shade(wall,12));r(a+Math.floor(c/2)-1,b+16,3,4,ink);line(a+Math.floor(c/2)-5,b+20,11,ink);};
    const laptop=(a,b)=>{r(a,b,21,13,ink);r(a+2,b+2,17,8,screen);r(a-2,b+13,25,4,shade(wall,-15));line(a+2,b+14,17,shade(wall,10));};
    const book=(a,b,c=10,color=fabric)=>{r(a,b,c,7,color);line(a+2,b+1,c-4,shade(color,25));r(a+1,b+6,c-2,2,paper);};
    const cup=(a,b)=>{e(a,b,7,6,paper);e(a+2,b+1,3,3,'775d48');r(a+6,b+2,2,3,shade(wall,-8));};
    const taskChair=(a,b,style='task')=>{
      r(a+12,b+15,4,12,ink);line(a+5,b+26,22,ink);
      r(a+3,b+5,26,17,shade(fabric,-21));r(a+5,b+2,22,11,fabric);r(a+5,b+14,22,9,shade(fabric,10));line(a+7,b+2,18,shade(fabric,26));
      if(style==='mesh')for(let j=5;j<12;j+=3)line(a+7,b+j,18,shade(fabric,-13));
      if(style==='visitor'){r(a+5,b+23,3,6,edge);r(a+24,b+23,3,6,edge);}
      else if(style==='meeting'){r(a+1,b+11,4,10,edge);r(a+27,b+11,4,10,edge);}
    };
    r(0,0,w,h,'00000000');
    if(spec.kind==='desk') {
      shadow();const standing=v==='standing',manager=v==='manager'||v==='return';
      r(7,29,4,19,edge);r(w-12,29,4,19,edge);top(3,5,w-6,29,theme.id==='minimal-light'?wall:wood);
      if(standing){r(10,32,4,22,ink);r(w-15,32,4,22,ink);line(6,54,16,ink);line(w-22,54,16,ink);r(w-17,23,7,4,ink);}
      else taskChair(Math.floor(w/2)-16,34,v==='single'?'mesh':v==='classroom'?'visitor':'task');
      if(v==='laptop'||v==='creative')laptop(Math.floor(w/2)-10,8);
      else if(v==='dual'||manager){monitor(9,7,23);monitor(35,7,23);}
      else monitor(Math.floor(w/2)-12,7);
      if(manager){if(v==='return'){r(w-24,30,19,15,shade(wood,8));line(w-22,32,15,shade(wood,24));}else{r(8,34,w-16,6,shade(wood,-10));line(10,34,w-20,shade(wood,10));r(w-21,10,12,8,shade(fabric,-4));}r(7,36,15,10,shade(wood,-9));line(11,40,6,ink);}
      if(v==='creative'){book(8,23,10,shade(fabric,9));r(w-16,18,7,11,paper);line(w-15,20,5,shade(wood,-15));}
      else if(v==='classroom'){book(8,24,11);r(w-15,23,5,7,paper);}
      else book(7,24,9);
      if(v==='standing')line(17,31,w-34,shade(fabric,8));
    } else if(spec.kind==='bench') {
      top(3,7,w-6,20,theme.id==='minimal-light'?wall:wood);r(7,26,4,5,edge);r(w-12,26,4,5,edge);
      for(const a of[16,78]){if(v==='laptop')laptop(a,2);else monitor(a,1,22);book(a+29,17,9);}
      line(6,16,w-12,shade(wood,-5));
    } else if(spec.kind==='chair') {
      if(v==='stool'){e(4,6,24,17,edge);e(5,4,22,15,shade(wood,22));r(8,20,3,10,edge);r(22,20,3,10,edge);line(10,26,13,edge);}
      else if(v==='lounge'){e(3,6,26,24,shade(fabric,-20));e(5,4,22,22,shade(fabric,7));r(2,12,5,16,shade(fabric,-9));r(25,12,5,16,shade(fabric,-9));line(8,8,16,shade(fabric,25));}
      else if(v==='classroom'){r(4,4,24,10,shade(wood,20));r(5,15,22,9,wood);r(6,24,3,6,edge);r(23,24,3,6,edge);line(6,4,20,shade(wood,37));}
      else taskChair(0,0,v);
    } else if(spec.kind==='waiting') {
      for(const a of[3,34]){r(a,6,25,21,edge);r(a+2,3,21,13,fabric);r(a+2,17,21,8,shade(fabric,11));line(a+4,4,17,shade(fabric,25));r(a+3,27,3,4,ink);r(a+19,27,3,4,ink);}
    } else if(spec.kind==='storage') {
      shadow();
      if(v==='bin'){r(8,7,18,23,ink);r(10,9,14,18,shade(wall,-28));r(7,5,20,5,shade(wall,-12));line(11,13,11,shade(wall,-7));}
      else if(v==='brochures'||v==='magazines'){r(7,9,19,45,edge);r(9,6,15,43,shade(wall,3));for(let b=11;b<44;b+=12){r(10,b,12,8,[fabric,shade(wood,-4),paper][Math.floor(b/12)%3]);line(12,b+2,8,paper);if(v==='magazines'){r(10,b+6,13,3,shade(wood,-10));r(12,b+3,3,3,shade(wall,-23));}}r(5,54,23,5,ink);}
      else if(v==='books'||v==='cupboard'||v==='low'||v==='drawers'){
        top(3,3,w-6,h-8);r(5,8,w-10,h-13,v==='books'?shade(wood,-24):shade(wall,-6));
        if(v==='books'){for(let a=8;a<w-7;a+=5){r(a,10,3,13,[fabric,wall,shade(wood,22)][Math.floor(a/5)%3]);line(a,13,3,shade(wall,8));}}
        else if(v==='low'){r(8,10,w-16,13,shade(wood,-26));for(let a=12;a<w-12;a+=8){r(a,12,5,9,shade(fabric,12));line(a,15,5,shade(wall,8));}line(6,24,w-12,shade(wood,20));}
        else {const count=v==='drawers'?3:2;for(let i=0;i<count;i++){const a=v==='drawers'?6:6+i*Math.floor((w-12)/2),b=v==='drawers'?8+i*6:9,c=v==='drawers'?w-12:Math.floor((w-14)/2);line(a,b,c,shade(wall,-25));r(a+Math.floor(c/2)-2,b+4,5,2,ink);}}
      } else {
        r(4,5,w-8,h-11,edge);r(6,4,w-12,h-12,shade(wall,-10));line(7,4,w-14,shade(wall,16));
        if(v==='copier'||v==='printer-stand') {
          r(7,8,w-14,14,ink);r(10,10,w-23,8,screen);r(8,25,19,6,shade(fabric,2));r(w-23,26,12,3,paper);r(12,39,w-24,12,shade(wall,-27));r(16,37,w-32,9,paper);line(17,40,w-34,shade(wall,-18));
          if(v==='printer-stand'){r(7,51,w-14,6,wood);r(11,55,3,6,edge);r(w-14,55,3,6,edge);}
        } else if(v==='server') {
          r(9,9,w-18,h-22,ink);for(let b=12;b<h-15;b+=9){r(12,b,w-24,6,shade(fabric,-20));line(15,b+2,w-34,shade(fabric,7));r(w-18,b+2,2,2,'88b6a0');}
        } else if(v==='lockers') {
          for(const a of[8,Math.floor(w/2)+1]){r(a,9,Math.floor(w/2)-10,h-23,shade(wall,3));for(let b=13;b<22;b+=3)line(a+4,b,12,shade(wall,-30));r(a+Math.floor(w/2)-15,31,3,7,ink);}
        } else if(v==='files') {
          for(const a of[8,Math.floor(w/2)+1])for(let b=9;b<h-14;b+=14){r(a,b,Math.floor(w/2)-10,12,shade(wall,2));r(a+8,b+5,8,2,ink);r(a+3,b+2,5,2,paper);}
        } else {
          for(let b=11;b<h-14;b+=17){r(8,b,w-16,13,shade(wood,-22));for(let a=11;a<w-13;a+=11){r(a,b+2,8,9,v==='snacks'?[fabric,paper,shade(wood,13)][Math.floor(a/11)%3]:shade(wall,Math.floor(a/11)%2?4:-8));line(a+2,b+4,4,shade(fabric,14));}line(7,b+14,w-14,shade(wood,25));}
        }
        r(8,h-7,4,5,ink);r(w-12,h-7,4,5,ink);
      }
    } else if(spec.kind==='reception'||spec.kind==='counter') {
      shadow();const curve=v==='curve';
      r(curve?8:4,21,curve?w-16:w-8,34,edge);r(curve?10:6,24,curve?w-20:w-12,28,wood);
      for(let a=12;a<w-8;a+=8)r(a,28,1,22,shade(wood,-17));top(curve?6:2,16,curve?w-12:w-4,11,wall);
      if(spec.kind==='reception'){monitor(Math.floor(w/2)-12,5,25);book(12,20,12);cup(w-19,19);}
      else {r(9,20,23,9,shade(wall,-28));r(11,22,18,5,shade(wall,-8));r(19,16,3,10,ink);r(w-27,11,18,12,ink);r(w-25,13,14,7,screen);cup(w-17,25);}
    } else if(spec.kind==='table') {
      const small=h===32,round=v==='round'||v==='side'||v==='collaboration';shadow();
      if(round){e(3,small?6:12,w-6,small?20:36,edge);e(4,small?4:9,w-8,small?19:35,shade(wood,21));}
      else top(3,small?6:12,w-6,small?17:34,v==='presentation'?wall:wood);
      r(8,small?23:43,4,small?7:12,edge);r(w-12,small?23:43,4,small?7:12,edge);
      if(v==='projector'){r(16,3,31,17,shade(wall,4));r(35,8,8,6,ink);e(36,9,6,5,screen);line(19,6,11,shade(wall,22));}
      else if(v==='console'){r(9,23,3,7,edge);r(w-12,23,3,7,edge);book(11,11,12);r(w-21,11,9,9,wall);e(w-24,5,15,10,leaf);e(w-21,5,9,6,shade(leaf,20));}
      else if(v==='bar'){for(const a of[12,43,74])cup(a,10);}
      else if(v==='side'){book(8,10,10);}
      else if(small){book(10,10,11);cup(w-17,11);}
      else {for(const a of[14,w-32]){book(a,18,15);book(a,37,15);}r(Math.floor(w/2)-5,28,11,7,ink);line(Math.floor(w/2)-3,30,7,shade(fabric,20));}
    } else if(spec.kind==='sofa') {
      shadow();r(6,17,w-12,36,shade(fabric,-24));r(8,10,w-16,25,fabric);line(11,11,w-22,shade(fabric,25));
      const seats=v==='sectional'?4:3,sw=Math.floor((w-24)/seats);for(let i=0;i<seats;i++){r(12+i*sw,30,sw-2,18,shade(fabric,10));line(14+i*sw,31,sw-6,shade(fabric,24));}
      r(3,22,8,29,shade(fabric,-8));r(w-11,22,8,29,shade(fabric,-8));r(10,53,5,5,edge);r(w-15,53,5,5,edge);
      if(v==='sectional'){r(w-33,43,23,16,shade(fabric,6));line(w-31,45,19,shade(fabric,24));}
    } else if(spec.kind==='appliance') {
      shadow();r(6,15,20,41,edge);r(8,17,16,36,shade(wall,-6));
      if(v==='fridge'){r(8,7,16,24,shade(wall,8));r(8,32,16,21,shade(wall,2));r(21,13,2,11,ink);r(21,36,2,9,ink);line(9,8,14,shade(wall,25));}
      else if(v==='water'){r(11,3,10,17,'9bbabcbd');r(13,1,6,4,shade(fabric,-8));r(11,25,11,5,ink);r(15,31,4,6,paper);line(10,39,13,ink);}
      else{r(5,8,22,25,ink);r(7,10,18,10,screen);r(10,22,12,3,shade(wall,-5));cup(13,27);r(9,43,15,8,wood);}
    } else if(spec.kind==='lamp') {
      e(4,54,24,7,'17232a25');r(13,11,3,45,edge);r(15,9,10,3,edge);r(8,55,14,3,ink);r(18,8,11,13,shade(wall,-8));line(19,8,9,shade(wall,14));
    } else if(spec.kind==='plant') {
      shadow();const wide=v==='wide',small=h===32;
      r(wide?5:9,h-19,wide?w-10:15,14,shade(wood,-10));line(wide?5:9,h-19,wide?w-10:15,shade(wood,17));
      if(v==='corner'){r(6,20,20,8,shade(wall,-16));line(7,20,18,shade(wall,5));r(9,26,14,3,edge);}
      for(const a of wide?[14,32,48]:[16]){
        r(a-1,small?6:15,2,small?13:35,edge);
        for(const [dx,dy]of[[-8,0],[1,5],[-6,13],[3,20]]){const b=small?Math.floor(dy/3):dy;e(a+dx,small?3+b:6+b,small?9:12,small?8:14,leaf);e(a+dx+2,small?3+b:6+b,small?5:7,small?5:9,shade(leaf,22));}
      }
    } else if(spec.kind==='podium') {
      shadow();r(9,25,15,29,edge);r(11,27,11,25,wood);top(4,15,25,13);r(11,9,2,8,ink);r(12,7,9,3,ink);r(17,24,7,3,shade(fabric,11));
    } else if(spec.kind==='mobile-board') {
      r(6,5,w-12,32,edge);r(8,7,w-16,27,shade(wall,14));r(12,12,12,8,shade(fabric,18));line(25,18,23,shade(fabric,-8));line(32,25,15,shade(wood,-3));r(12,37,3,20,ink);r(w-15,37,3,20,ink);line(7,57,18,ink);line(w-25,57,18,ink);r(8,58,3,4,ink);r(w-11,58,3,4,ink);
    } else if(spec.kind==='wall') {
      if(v==='sconce'){e(7,9,18,20,'f1d99b32');r(11,8,10,14,edge);r(12,7,8,12,shade(wall,13));line(13,8,6,paper);r(13,21,6,3,shade(wood,6));}
      else if(v==='clock'){e(5,4,23,23,edge);e(7,6,19,19,paper);r(16,10,2,9,ink);line(17,17,6,ink);}
      else {const display=v==='display',glass=v==='glass-board';r(3,3,w-6,25,display?ink:edge);r(5,5,w-10,21,glass?shade(wall,-18)+'b8':display?shade(fabric,-14):paper);line(6,5,w-12,shade(wall,22));
        if(v==='direction'){r(10,13,14,3,ink);r(10,10,3,9,ink);r(13,11,3,7,ink);line(31,10,20,shade(fabric,-6));line(31,15,16,shade(fabric,-6));line(31,20,12,shade(wood,-5));}
        else if(v==='poster'){r(9,8,18,15,fabric);e(13,10,10,10,shade(wall,6));line(32,10,20,ink);line(32,15,16,shade(wood,-9));line(32,20,11,shade(fabric,-3));}
        else if(v==='certificate'){r(10,9,12,2,shade(wood,-2));line(9,14,14,shade(fabric,-5));e(13,18,6,5,shade(wood,10));}
        else if(v==='welcome'||v==='branding'){r(10,10,12,10,shade(fabric,3));line(27,11,w-38,ink);line(27,16,w-42,shade(fabric,10));}
        else if(v==='art'){r(9,9,18,12,fabric);r(33,9,21,12,shade(wood,7));e(12,11,8,8,shade(wall,6));line(37,15,12,shade(wood,-21));}
        else if(v==='pinboard'){for(let i=0;i<4;i++){r(10+i*12,9+(i%2)*4,9,11,[paper,shade(fabric,22),shade(wood,16),wall][i]);r(14+i*12,9+(i%2)*4,1,1,ink);}}
        else {r(10,10,12,8,display?screen:shade(fabric,21));line(25,12,w-36,display?shade(wall,10):ink);line(28,18,w-39,shade(fabric,-4));}
      }
    } else if(spec.kind==='accessory') {
      if(v==='lamp'){r(13,12,2,14,ink);r(15,10,9,3,ink);r(19,6,10,9,fabric);line(10,26,12,ink);}
      else if(v==='mug')cup(18,16);
      else if(v==='plant'){r(18,18,9,8,wall);e(15,9,15,13,leaf);e(18,8,9,9,shade(leaf,22));}
      else if(v==='speaker'){e(8,12,18,12,ink);e(11,14,12,7,shade(fabric,7));line(14,16,6,shade(wall,13));}
      else if(v==='microwave'){r(4,7,25,18,shade(wall,-7));r(6,9,16,12,ink);r(8,11,12,8,screen);r(25,12,2,3,ink);r(25,18,2,2,ink);}
      else if(v==='files'){for(let i=0;i<3;i++)book(16+i*2,17+i*2,10,[fabric,wood,wall][i]);}
      else if(v==='magazines'){book(6,12,17,shade(fabric,-7));book(10,8,15,shade(wood,-1));}
      else{book(7,23,12);r(4,21,2,9,shade(wood,-30));}
    } else if(spec.kind==='structure') {
      const base=v==='panel-h'||v==='edge-h'?9:v==='panel-v'||v==='edge-v'?10:v==='frost-h'?11:v==='frost-v'?14:v==='shelf-h'?12:v==='shelf-v'?13:v==='door-h'?15:v==='door-v'?16:17+['inner-nw','inner-ne','inner-se','inner-sw'].indexOf(v);
      const sx=((base-1)%16)*32,sy=Math.floor((base-1)/16)*32;
      for(let j=0;j<32;j++)art.pixels.copy(art.pixels,((y+j)*512+x)*4,((sy+j)*512+sx)*4,((sy+j)*512+sx+32)*4);
      if(v.startsWith('panel')){if(v.endsWith('h')){line(3,12,26,shade(wood,-9));line(3,20,26,shade(wood,-9));}else{r(13,2,1,28,shade(wood,-9));r(21,2,1,28,shade(wood,-9));}}
      else if(v.startsWith('frost')){if(v.endsWith('h'))r(4,13,23,7,shade(wall,8)+'b8');else r(12,3,8,26,shade(wall,8)+'b8');}
      else if(v.startsWith('shelf')){if(v.endsWith('h'))for(let a=3;a<29;a+=5)r(a,17,3,6,[wall,fabric,wood][Math.floor(a/5)%3]);else for(let b=3;b<29;b+=5)r(15,b,6,3,[wall,fabric,wood][Math.floor(b/5)%3]);}
      else if(v.startsWith('door')){if(v.endsWith('h')){r(0,1,3,30,ink);r(29,1,3,30,ink);line(4,29,24,shade(wall,15));}else{r(1,0,30,3,ink);r(1,29,30,3,ink);r(29,4,1,24,shade(wall,15));}}
      else if(v.startsWith('edge')){if(v.endsWith('h'))r(0,5,32,2,shade(fabric,10));else r(5,0,2,32,shade(fabric,10));}
      else {r(10,10,12,3,shade(wood,-5));r(10,10,3,12,shade(wood,-5));}
    } else throw Error('Missing original art family: '+id);
  }
}
