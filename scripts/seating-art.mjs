// Native directional pixel geometry: never rotate or mirror a character/chair.
export function drawDirectionalChair(art,theme,x,y,style,direction,clear=true) {
  const shade=(hex,d)=>hex.match(/../g).map(v=>Math.min(255,Math.max(0,parseInt(v,16)+d)).toString(16).padStart(2,'0')).join('');
  const ink=shade(theme.background,-18),fabric=theme.fabric,edge=shade(theme.wood,-30);
  const r=(a,b,w,h,color)=>art.rect(x+a,y+b,w,h,color),e=(a,b,w,h,color)=>art.ellipse(x+a,y+b,w,h,color);
  if(clear)r(0,0,32,32,'00000000');e(3,25,26,5,'17232a22');
  if(style==='stool'){e(4,6,24,17,edge);e(5,4,22,15,shade(theme.wood,22));r(8,20,3,10,edge);r(22,20,3,10,edge);return;}
  r(13,16,4,12,ink);r(5,27,23,2,ink);
  const lounge=style==='lounge';
  e(4,7,24,lounge?22:17,shade(fabric,-21));r(6,9,20,lounge?16:12,shade(fabric,10));
  let back;
  if(direction==='up'){back=[4,21,24,8];r(5,20,22,8,fabric);r(7,21,18,2,shade(fabric,26));r(4,10,3,13,edge);r(25,10,3,13,edge);}
  else if(direction==='left'){back=[24,5,6,22];r(23,5,7,22,fabric);r(24,6,2,19,shade(fabric,26));r(5,6,20,3,edge);r(5,23,20,3,edge);}
  else if(direction==='right'){back=[2,5,7,22];r(2,5,7,22,fabric);r(3,6,2,19,shade(fabric,26));r(8,6,19,3,edge);r(8,23,19,3,edge);}
  else{back=[5,2,22,11];r(5,2,22,11,fabric);r(7,2,18,2,shade(fabric,26));r(3,12,3,12,edge);r(26,12,3,12,edge);}
  if(style==='mesh'){const [a,b,w,h]=back;for(let j=3;j<h-1;j+=3)r(a+2,b+j,w-4,1,shade(fabric,-13));}
  if(style==='visitor'||style==='classroom'){r(6,25,3,5,edge);r(23,25,3,5,edge);}
}
