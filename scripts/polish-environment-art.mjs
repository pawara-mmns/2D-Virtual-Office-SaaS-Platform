import { drawArchitectureAtlas } from './architecture-art.mjs';
// Original, deterministic pixel drawing. Every asset keeps the shared 32px scale.
export function polishEnvironmentAtlas(art,theme) {
  const rgb=h=>h.match(/../g).map(v=>parseInt(v,16));
  const shade=(hex,d)=>rgb(hex).map(v=>Math.min(255,Math.max(0,v+d))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const r=(x,y,w,h,color)=>{if(![x,y,w,h].every(Number.isInteger))throw Error('Environment art must use integer pixels');art.rect(x,y,w,h,color);};
  const e=art.ellipse,l=(x,y,w,color)=>r(x,y,w,1,color);
  const wood=theme.wood,fabric=theme.fabric,wall=theme.wall,ink=shade(theme.background,-12),edge=shade(wood,-28);
  const light=theme.id==='minimal-light',scandi=theme.id==='scandinavian',tech=theme.id==='dark-tech',eco=theme.id==='eco-green';
  const clear=(x,y,w,h)=>r(x,y,w,h,'00000000');
  // Material families have different construction and seam geometry, not just hue.
  for(let tile=0;tile<8;tile++){
    const x=tile*32,color=shade(theme.floor,(tile%3-1)*3);r(x,0,32,32,color);
    if(tile<3){
      if(light){r(x,0,32,1,shade(color,-14));r(x,0,1,32,shade(color,-14));l(x+2,2,28,shade(color,7));r(x+7+tile*3,19,2,1,shade(color,-3));}
      else if(tech){r(x+1,1,30,30,shade(color,3));l(x,0,32,shade(color,-14));r(x,0,1,32,shade(color,-14));for(const [a,b]of[[3,3],[28,28]])r(x+a,b,1,1,shade(color,20));}
      else if(scandi){for(let y=0;y<32;y+=8)for(let xx=0;xx<32;xx+=8){const horizontal=((xx+y)/8+tile)%2===0;r(x+xx,y,8,8,shade(color,horizontal?3:-2));horizontal?l(x+xx,y,8,shade(color,-10)):r(x+xx,y,1,8,shade(color,-10));}}
      else if(eco){for(let xx=0;xx<32;xx+=8){r(x+xx,0,1,32,shade(color,-11));r(x+xx+2,0,1,32,shade(color,6));}l(x,16+(tile%2)*8,8,shade(color,-9));}
      else{for(let y=0;y<32;y+=16){l(x,y,32,shade(color,-14));l(x+1,y+1,30,shade(color,9));r(x+(tile*11+y/2)%31,y+1,1,15,shade(color,-12));l(x+4,y+7,15,shade(color,-3));}}
    }else if(tile===3){r(x,0,32,32,shade(fabric,18));for(let y=4;y<32;y+=8)for(let xx=4;xx<32;xx+=8)r(x+xx,y,1,1,shade(fabric,24));}
    else if(tile===4||tile===6){r(x,0,32,32,shade(wall,-10));l(x,0,32,shade(wall,-24));r(x,0,1,32,shade(wall,-24));l(x+1,16,31,shade(wall,-16));r(x+16,0,1,32,shade(wall,-16));}
    else if(tile===5){r(x,0,32,32,shade(theme.floor,12));l(x,31,32,shade(theme.floor,4));r(x+31,0,1,32,shade(theme.floor,4));}
    else{r(x,0,32,32,shade(theme.floor,7));for(let y=7;y<32;y+=12)l(x+3,y,26,shade(theme.floor,3));}
  }
  // Full-width architectural silhouettes make collision edges visually legible.
  for(const [x,vertical,glass]of[[256,false,false],[288,true,false],[320,false,true]]){
    clear(x,0,32,32);r(x,0,32,32,shade(theme.background,-5));
    if(vertical){r(x+3,0,26,32,wall);r(x+4,0,3,32,shade(wall,15));r(x+25,0,4,32,shade(wall,-28));if(tech)r(x+7,0,2,32,shade(fabric,10));if(eco)r(x+20,0,4,32,shade(fabric,-12));}
    else{r(x,2,32,23,glass?shade(wall,-23):wall);l(x,2,32,shade(wall,15));r(x,25,32,4,edge);l(x,29,32,shade(theme.background,-15));if(glass){r(x+2,5,2,17,shade(wall,20));r(x+28,4,3,21,shade(theme.background,-8));l(x+6,7,17,shade(wall,-3));}else if(scandi||eco){for(let xx=5;xx<32;xx+=9)r(x+xx,16,1,8,shade(wood,-7));}else if(tech){l(x,21,32,shade(fabric,6));}}
  }
  function chair(x,y){e(x+3,y+24,26,6,'18232b25');r(x+14,y+17,4,11,ink);l(x+6,y+27,20,ink);r(x+5,y+6,24,16,shade(fabric,-22));r(x+7,y+3,20,9,fabric);l(x+8,y+3,18,shade(fabric,23));r(x+7,y+13,20,10,shade(fabric,8));l(x+8,y+22,18,shade(fabric,-10));r(x+4,y+11,3,10,ink);r(x+27,y+11,3,10,ink);}
  clear(64,64,32,32);chair(64,64);
  function desk(x,y,w,executive=false){
    clear(x,y,w,64);e(x+5,y+52,w-10,9,'17232a24');r(x+7,y+29,5,18,edge);r(x+w-12,y+29,5,18,edge);
    r(x+3,y+7,w-6,29,edge);r(x+4,y+5,w-8,28,light?wall:shade(wood,16));l(x+6,y+5,w-12,shade(light?wall:wood,32));l(x+5,y+32,w-10,shade(wood,-18));
    if(scandi){r(x+4,y+5,2,2,'00000000');r(x+w-6,y+5,2,2,'00000000');}
    if(eco||scandi)for(let yy=11;yy<30;yy+=7)l(x+6,y+yy,w-12,shade(wood,9));
    const screen=(sx,sw)=>{r(sx,y+8,sw,17,ink);r(sx+2,y+10,sw-4,12,tech?'345c7f':'587782');l(sx+4,y+12,sw-9,tech?'87c7df':'c0d2c9');l(sx+4,y+16,sw-12,tech?'689bc1':'8fada9');r(sx+Math.floor(sw/2)-1,y+25,3,3,ink);l(sx+Math.floor(sw/2)-5,y+28,11,ink);};
    if(tech||executive){screen(x+10,25);screen(x+37,25);}else screen(x+w/2-14,28);
    r(x+w/2-11,y+29,23,3,shade(fabric,30));l(x+w/2-9,y+29,18,shade(wall,15));
    r(x+8,y+24,9,6,shade(fabric,-4));l(x+9,y+24,7,shade(fabric,25));e(x+w-15,y+25,6,6,wall);e(x+w-13,y+26,2,2,'775b45');
    if(eco){r(x+w-13,y+13,6,7,wall);e(x+w-15,y+7,10,9,'547851');l(x+w-12,y+8,4,'94ad7a');}
    if(executive){r(x+w-22,y+29,17,12,shade(wood,8));r(x+7,y+36,16,8,shade(wood,-8));l(x+11,y+39,6,shade(wall,-8));}
    chair(x+w/2-16,y+34);
  }
  desk(0,64,64);desk(0,192,96,true);
  // Four-seat collaboration bench, with separate movable chair tiles.
  clear(128,128,128,32);r(132,135,120,21,edge);r(133,133,118,20,light?wall:shade(wood,17));l(135,133,114,shade(wood,35));
  for(const xx of[143,203]){r(xx,131,22,12,ink);r(xx+2,133,18,8,tech?'527fa4':'708f94');l(xx+4,135,13,'c4d8d4');r(xx+5,146,19,3,shade(fabric,24));r(xx+29,144,7,5,shade(fabric,-5));}r(136,154,4,6,edge);r(244,154,4,6,edge);
  // Acoustic / glass / living dividers use the same reserved footprint.
  clear(0,128,64,32);r(5,133,54,18,edge);r(7,131,50,17,light?shade(wall,-12):fabric);l(8,131,48,shade(light?wall:fabric,22));r(7,148,3,10,edge);r(54,148,3,10,edge);
  if(light||scandi){r(10,134,44,11,shade(wall,-16)+'a8');l(15,135,30,shade(wall,12));}else if(eco){for(let xx=10;xx<54;xx+=9){e(xx,133,8,9,'608255');r(xx+3,140,2,5,'405d41');}}else if(tech){l(10,136,44,shade(fabric,14));l(10,144,44,shade(fabric,-16));}
  // Upholstery, broad arms, cushions, seams and grounded feet.
  clear(128,64,96,64);e(134,116,84,8,'17232a22');r(135,81,82,38,shade(fabric,-27));r(137,75,78,25,shade(fabric,-7));l(139,75,74,shade(fabric,18));
  const seats=scandi?2:3,seatWidth=Math.floor(70/seats);for(let i=0;i<seats;i++){r(141+i*seatWidth,94,seatWidth-2,18,shade(fabric,9));l(142+i*seatWidth,95,seatWidth-4,shade(fabric,22));l(142+i*seatWidth,111,seatWidth-4,shade(fabric,-7));}
  r(132,86,8,29,shade(fabric,-8));r(215,86,8,29,shade(fabric,-8));l(133,86,6,shade(fabric,20));l(216,86,6,shade(fabric,20));r(139,119,5,5,edge);r(209,119,5,5,edge);
  clear(224,64,64,32);e(228,85,57,8,'17232a20');r(229,74,54,15,edge);r(228,71,56,15,shade(wood,24));l(232,71,48,shade(wood,42));r(235,74,12,7,fabric);l(237,75,8,shade(fabric,31));e(269,76,6,5,wall);e(271,77,2,2,'705640');
  // Meeting table includes an inset surface, aligned pads, a speaker and cables.
  clear(320,64,128,64);e(325,112,118,10,'17232a22');r(325,75,118,42,edge);r(329,70,110,44,light?wall:shade(wood,20));l(332,70,104,shade(light?wall:wood,36));
  for(const xx of[342,404])for(const yy of[77,101]){r(xx,yy,20,7,shade(fabric,-4));l(xx+2,yy+1,16,shade(fabric,19));}
  r(379,84,12,8,ink);l(381,86,8,shade(fabric,30));r(383,94,4,3,shade(fabric,-20));
  // Reception: slatted joinery, a clean counter, monitor and visitor ledger.
  clear(160,160,96,64);e(164,211,88,10,'17232a22');r(163,174,90,39,edge);r(166,178,84,32,wood);
  for(let xx=170;xx<250;xx+=8)r(xx,181,1,26,shade(wood,-16));r(161,169,94,12,light?wall:shade(wood,38));l(163,169,90,shade(light?wall:wood,52));
  r(190,161,27,16,ink);r(192,163,23,10,shade(fabric,11));r(201,176,4,4,ink);r(173,174,11,4,fabric);e(234,172,7,5,wall);
  // Credenza shelving stays waist-height: volumes, binders and discreet handles.
  clear(0,160,96,32);r(3,163,90,26,edge);r(6,164,84,20,shade(wood,-26));
  for(let i=0;i<19;i++){const xx=9+i*4,color=[fabric,shade(wood,22),wall,shade(fabric,-17)][i%4];r(xx,166+i%2,3,15-i%2,color);l(xx,170,3,shade(color,18));}l(5,184,86,shade(wood,21));r(8,189,4,3,edge);r(84,189,4,3,edge);
  drawArchitectureAtlas(art,theme);
}
