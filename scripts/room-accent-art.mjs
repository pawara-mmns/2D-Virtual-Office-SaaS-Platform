import {premiumDefinitions,expandedFixtures} from '../packages/shared/src/environment/assets.ts';
import {tone} from './premium-office-art.mjs';

// Original, native-size artwork for each room's purpose. This layer never moves
// a crop or changes its support/collision mode. No imported third-party art.
export function drawRoomAccents(art,theme){
  for(const [id,spec]of Object.entries(premiumDefinitions)){
    if(spec.kind!=='room-accent')continue;
    const [x,y,w,h]=expandedFixtures[id],wood=theme.wood,ink='23323c',paper='eee4d0';
    const r=(a,b,c,d,color)=>{if(![a,b,c,d].every(Number.isInteger)||a<0||b<0||a+c>w||b+d>h)throw Error('Room artwork outside '+id);art.rect(x+a,y+b,c,d,color);};
    const l=(a,b,c,color)=>r(a,b,c,1,color);
    const e=(a,b,c,d,color)=>{if(a<0||b<0||a+c>w||b+d>h)throw Error('Room ellipse outside '+id);art.ellipse(x+a,y+b,c,d,color);};
    r(0,0,w,h,'00000000');
    const frame=(color=ink)=>{r(2,3,w-4,25,tone(wood,-32));r(3,2,w-6,25,tone(wood,14));l(4,2,w-8,tone(wood,40));r(5,5,w-10,19,color);l(4,26,w-8,'12212b60');};
    if(id==='loungeArt'){
      frame('d6bfa0');e(35,7,13,12,'b17b56');r(8,18,46,5,'7a927f');
      for(let i=0;i<8;i++){r(10+i*3,16-i,3,7+i,'496d68');r(31+i*3,14+Math.floor(i/2),3,9-Math.floor(i/2),'a58467');}
      l(8,23,47,'e5d9b9');
    }else if(id==='codePanel'){
      frame('253d45');for(let a=7;a<56;a+=4)r(a,6,1,17,'30494d');
      for(let i=0;i<5;i++){r(15-i,10+i,2,2,'b6dec6');r(11+i,15+i,2,2,'b6dec6');r(43+i,10+i,2,2,'b6dec6');r(47-i,15+i,2,2,'b6dec6');}
      for(let i=0;i<10;i++)r(34-Math.floor(i/2),9+i,2,2,'e5c480');l(7,24,50,'89b59e');
    }else if(id==='presentationPanel'){
      frame('263d60');r(7,6,34,16,'3f6494');r(42,6,14,16,'172d47');
      l(10,9,23,'d4dce6');l(10,12,17,'91bccb');r(11,17,5,3,'7fa6b8');r(18,15,5,5,'a6c6d1');r(25,13,5,7,'d8bc77');
      e(46,9,6,6,'c9b49a');r(45,15,8,4,'7d91a6');l(25,28,14,'4b5f70');r(30,27,4,2,'202d38');
    }else if(id==='receptionCrest'){
      frame('273f43');for(let a=7;a<58;a+=4)r(a,6,1,17,'3a5150');
      e(24,7,16,15,'cba264');e(26,9,12,11,'273f43');r(30,10,4,9,'e9c58c');r(27,13,10,3,'e9c58c');l(9,24,46,'f4d39b');
    }else if(id==='hospitalityShelf'){
      frame(tone(wood,-27));l(6,22,52,tone(wood,36));
      for(const a of[9,21,33]){r(a,11,7,9,paper);r(a+7,13,3,5,'c3b89e');r(a+7,14,2,2,wood);l(a+1,11,5,'fff2d8');l(a+1,19,5,'c9b292');}
      r(47,10,9,12,'758a64');l(48,10,7,'c5be8b');r(49,14,5,3,paper);l(8,26,48,'ffd494');
    }else if(id==='ideaBoard'){
      frame('d4c1a2');r(7,6,16,16,'394c53');e(11,8,8,8,'f6cc71');r(13,16,4,3,'d4aa5a');l(13,20,4,'f6cc71');
      for(const [a,b,c]of[[27,7,'efd187'],[41,7,'a9c7bd'],[30,16,'c9adc3'],[45,16,'e1b591']]){r(a,b,10,7,c);l(a+2,b+2,6,tone(c,-36));r(a+4,b,1,1,'746e5d');}
    }else if(id==='supplyCubbies'){
      r(4,7,56,23,'17263038');r(2,4,58,24,tone(wood,-35));r(3,3,56,3,tone(wood,26));
      for(const [a,b]of[[6,8],[23,8],[40,8],[6,18],[23,18],[40,18]]){
        r(a,b,14,8,(a===23&&b===8)?'6b8890':'b69c73');l(a+1,b,12,'dec49b');r(a+5,b+3,5,2,'ede1c5');r(a+6,b+3,3,1,'627378');
      }
      for(const a of[21,38])r(a,6,2,21,tone(wood,5));l(3,16,56,tone(wood,16));l(3,27,56,tone(wood,16));
    }else if(id==='wayfindingLight'){
      r(3,4,26,24,tone(wood,-27));r(4,3,24,23,'304b4a');l(5,3,22,'879e93');
      r(8,13,13,3,'e7d5b1');for(let i=0;i<5;i++)r(18+i,10+i,2,2,'e7d5b1');for(let i=0;i<5;i++)r(22-i,15+i,2,2,'e7d5b1');l(6,24,20,'f0c584');l(8,25,16,'fff1bf');
    }
  }
}
