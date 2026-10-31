// Original integer-pixel architectural kit in the preserved first 128 tiles.
import { fixtures } from '../packages/shared/src/environment/rooms.ts';
export function drawArchitectureAtlas(art,theme) {
  const shade=(hex,d)=>hex.match(/../g).map(v=>Math.max(0,Math.min(255,parseInt(v,16)+d)).toString(16).padStart(2,'0')).join('');
  const r=(x,y,w,h,color)=>{if(![x,y,w,h].every(Number.isInteger))throw Error('Architecture art needs integer pixels');art.rect(x,y,w,h,color);};
  const e=art.ellipse,clear=(x,y,w,h)=>r(x,y,w,h,'00000000');
  const wall=theme.wall,wood=theme.wood,fabric=theme.fabric,ink=shade(theme.background,-15),trim=shade(wood,-30);
  const eco=theme.id==='eco-green',tech=theme.id==='dark-tech',light=theme.id==='minimal-light';
  function tile(id,draw){const x=((id-1)%16)*32,y=Math.floor((id-1)/16)*32;clear(x,y,32,32);draw(x,y);}
  function segment(x,y,vertical,material){
    if(material==='glass') {
      r(x+3,y+3,26,26,shade(wall,-15)+'80');
      if(vertical){r(x+3,y,4,32,ink);r(x+25,y,4,32,trim);r(x+8,y+2,2,28,shade(wall,30)+'c8');r(x+21,y+8,1,15,shade(wall,25)+'aa');}
      else{r(x,y+2,32,4,ink);r(x,y+26,32,4,trim);r(x+2,y+7,2,17,shade(wall,30)+'d0');r(x+26,y+6,2,20,trim);r(x+7,y+8,15,1,shade(wall,20)+'d8');}
    } else if(material==='half') {
      if(vertical){r(x+8,y,16,32,trim);r(x+9,y,12,32,eco?wood:fabric);r(x+9,y,3,32,shade(eco?wood:fabric,25));}
      else{r(x,y+13,32,15,trim);r(x,y+11,32,13,eco?wood:fabric);r(x,y+10,32,4,shade(eco?wood:fabric,26));}
      if(eco)for(let i=4;i<32;i+=9){const a=vertical?x+12:x+i,b=vertical?y+i:y+10;e(a-2,b-3,9,8,'55784e');e(a,b-3,6,5,'86a36d');}
      else if(light){if(vertical)r(x+13,y+3,6,26,shade(wall,-8)+'b0');else r(x+3,y+16,26,6,shade(wall,-8)+'b0');}
      else if(tech){if(vertical)r(x+12,y,1,32,shade(fabric,25));else r(x,y+17,32,1,shade(fabric,25));}
    } else {
      if(vertical){r(x+3,y,26,32,wall);r(x+4,y,4,32,shade(wall,20));r(x+24,y,5,32,shade(wall,-25));r(x+28,y,3,32,ink);}
      else{r(x,y+2,32,24,wall);r(x,y,32,6,shade(wall,16));r(x,y+23,32,5,trim);r(x,y+28,32,3,ink);}
      if(eco){if(vertical)r(x+20,y,2,32,shade(wood,-7));else for(let i=5;i<32;i+=8)r(x+i,y+12,1,11,shade(wood,-6));}
      if(tech&&!vertical)r(x,y+18,32,2,shade(fabric,7));
    }
  }
  for(const [id,vertical,material]of[[9,false,'solid'],[10,true,'solid'],[11,false,'glass'],[12,false,'half'],[13,true,'half'],[14,true,'glass']])tile(id,(x,y)=>segment(x,y,vertical,material));
  for(const [base,material]of[[17,'solid'],[21,'glass'],[25,'half']])for(let corner=0;corner<4;corner++)tile(base+corner,(x,y)=>{
    if(material==='solid') {
      r(x+3,y+2,29,26,wall);r(x+3,y+2,26,30,wall);r(x+3,y+2,29,5,shade(wall,16));r(x+3,y+2,5,30,shade(wall,16));r(x+25,y+25,7,4,trim);r(x+25,y+25,4,7,trim);
    } else if(material==='glass') {
      r(x+3,y+3,29,26,shade(wall,-15)+'80');r(x+3,y+3,26,29,shade(wall,-15)+'80');r(x+3,y+3,29,4,ink);r(x+3,y+3,4,29,ink);r(x+25,y+25,7,4,trim);r(x+25,y+25,4,7,trim);r(x+9,y+9,18,1,shade(wall,30));
    } else {
      r(x+8,y+12,24,14,trim);r(x+8,y+12,16,20,trim);r(x+9,y+12,23,10,eco?wood:fabric);r(x+9,y+12,11,20,eco?wood:fabric);r(x+8,y+10,24,4,shade(eco?wood:fabric,25));r(x+8,y+10,4,22,shade(eco?wood:fabric,25));
    }
    // Rotate one original mitre into all four orientations, on integer pixels.
    const pixels=Buffer.alloc(32*32*4);
    for(let j=0;j<32;j++)for(let i=0;i<32;i++){let a=i,b=j;for(let turn=0;turn<corner;turn++)[a,b]=[31-b,a];art.pixels.copy(pixels,(b*32+a)*4,((y+j)*512+x+i)*4,((y+j)*512+x+i)*4+4);}
    for(let j=0;j<32;j++)pixels.copy(art.pixels,((y+j)*512+x)*4,j*32*4,(j+1)*32*4);
  });
  tile(29,(x,y)=>{r(x+3,y,26,32,wall);r(x,y+3,32,25,wall);r(x+4,y+1,24,5,shade(wall,18));r(x+25,y+6,4,24,shade(wall,-23));});
  for(const [id,vertical]of[[15,false],[16,true]])tile(id,(x,y)=>{
    r(x,y,32,32,shade(theme.floor,12));
    if(vertical){r(x+2,y,2,32,trim);r(x+28,y,2,32,shade(wall,14));for(let yy=6;yy<32;yy+=6)r(x+8,y+yy,16,1,shade(theme.floor,5));}
    else{r(x,y+2,32,2,trim);r(x,y+28,32,2,shade(wall,14));for(let xx=6;xx<32;xx+=6)r(x+xx,y+8,1,16,shade(theme.floor,5));}
  });
  tile(30,(x,y)=>{r(x,y,32,32,shade(theme.floor,10));r(x,y+31,32,1,shade(theme.floor,-5));r(x+31,y,1,32,shade(theme.floor,-5));r(x+2,y+2,28,1,shade(theme.floor,16));});
  // Draw new props in a scratch region, then pack them into confirmed free
  // atlas slots. Restore the original furnishings before stamping each crop.
  const furnishingBase=Buffer.from(art.pixels);
  // Bottle dispenser with tap, cup ledge and cabinet.
  clear(96,192,32,64);e(101,247,24,7,'17232a25');r(103,211,19,37,trim);r(105,214,15,31,wall);r(107,197,11,17,'9ebdbcc0');r(110,194,5,4,shade(fabric,15));r(108,201,9,1,'d9e8e0');r(108,219,9,4,ink);r(111,223,4,5,'d4ddce');r(108,230,10,2,trim);r(108,236,9,7,shade(wall,-16));
  // Multifunction printer, paper tray, scanner glass and control panel.
  clear(128,192,64,64);e(132,247,56,7,'17232a24');r(133,211,54,37,trim);r(135,207,50,37,shade(wall,-5));r(136,199,47,13,ink);r(139,200,39,8,shade(fabric,14));r(139,217,18,7,ink);r(141,219,13,2,'9abbb2');r(165,216,15,4,shade(wall,20));r(140,230,36,9,shade(wall,-28));r(144,228,28,8,'f4f0e5');r(144,234,28,2,shade(wall,-30));
  clear(192,192,64,64);r(195,197,58,53,trim);r(197,196,54,51,shade(wall,-10));for(const xx of[199,225])for(let yy=200;yy<246;yy+=15){r(xx,yy,23,13,shade(wall,1));r(xx+8,yy+6,8,2,ink);r(xx+3,yy+3,6,2,'e8dfbf');}r(198,249,5,4,ink);r(245,249,5,4,ink);
  clear(256,192,64,32);r(260,194,56,27,trim);r(263,197,50,21,wall);r(269,201,12,12,shade(fabric,-7));r(285,201,21,3,shade(wood,-15));r(285,207,17,2,shade(fabric,7));r(285,211,10,2,shade(fabric,7));
  clear(320,192,32,32);e(323,216,26,6,'17232a20');r(326,209,4,12,trim);r(342,209,4,12,trim);r(323,200,26,12,shade(wood,18));r(324,199,24,3,shade(wood,37));r(330,202,10,6,fabric);r(332,203,6,1,shade(fabric,25));
  clear(352,192,64,32);for(const xx of[356,387]){r(xx,200,24,22,trim);r(xx+2,195,20,13,fabric);r(xx+2,208,20,10,shade(fabric,10));r(xx+2,195,20,2,shade(fabric,25));r(xx+3,221,3,3,ink);r(xx+18,221,3,3,ink);}
  // Espresso counter with grinder, cups and slatted base.
  clear(416,192,64,64);r(419,219,58,31,trim);r(421,223,54,24,wood);for(let xx=425;xx<474;xx+=8)r(xx,226,1,19,shade(wood,-19));r(418,215,60,8,shade(wall,12));r(424,196,28,25,ink);r(426,198,24,9,shade(fabric,12));r(431,209,15,4,shade(wall,-8));r(435,213,7,6,wall);r(459,202,9,15,trim);e(459,195,9,9,'a3998466');r(458,217,13,3,ink);r(463,212,5,5,wall);
  clear(480,192,32,64);r(483,196,26,55,trim);r(486,199,20,48,shade(wood,-14));for(let yy=201;yy<246;yy+=15){r(487,yy,8,11,shade(wall,-6));r(497,yy+3,7,8,shade(fabric,9));r(485,yy+12,22,2,shade(wood,14));}
  const crops=Object.entries({water:[96,192,32,64],printer:[128,192,64,64],filing:[192,192,64,64],frame:[256,192,64,32],sideTable:[320,192,32,32],waiting:[352,192,64,32],coffeeStation:[416,192,64,64],utilityShelf:[480,192,32,64]}).map(([name,[x,y,w,h]])=>{
    const pixels=Buffer.alloc(w*h*4);for(let j=0;j<h;j++)art.pixels.copy(pixels,j*w*4,((y+j)*512+x)*4,((y+j)*512+x+w)*4);return {name,pixels,w,h};
  });
  furnishingBase.copy(art.pixels);
  for(const {name,pixels,w,h}of crops){const [x,y]=fixtures[name];for(let j=0;j<h;j++)pixels.copy(art.pixels,((y+j)*512+x)*4,j*w*4,(j+1)*w*4);}
}
