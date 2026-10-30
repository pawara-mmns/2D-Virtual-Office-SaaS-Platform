import { layouts, themes, type EnvironmentConfig } from './catalog.ts';
import type { RoomSpec } from './plans.ts';
import { expandedFixtures } from './assets.ts';

export const fixtures = {
  desk:[0,64,64,64],executiveDesk:[0,192,96,64],bench:[128,128,128,32],divider:[0,128,64,32],chair:[64,64,32,32],plant:[96,64,32,64],ceramic:[448,64,32,64],sofa:[128,64,96,64],coffee:[224,64,64,32],armchair:[288,64,32,32],meeting:[320,64,128,64],books:[0,160,96,32],board:[96,160,64,32],reception:[160,160,96,64],cabinet:[256,160,64,32],lamp:[320,160,32,64],notice:[352,160,64,32],pantry:[448,160,64,64],
  water:[480,32,32,64],printer:[256,96,64,64],filing:[256,192,64,64],frame:[416,128,64,32],sideTable:[64,128,32,32],waiting:[128,224,64,32],coffeeStation:[352,192,64,64],utilityShelf:[416,160,32,64],
  ...expandedFixtures,
} as const;
export type Fixture = keyof typeof fixtures;
export type PlaceFixture = (name: Fixture, dx: number, dy: number) => boolean;
export const roomModules = {
  reception:{label:'RECEPTION',floor:6},meeting:{label:'MEETING ROOM',floor:5},pantry:{label:'COFFEE & PANTRY',floor:7},lounge:{label:'LOUNGE',floor:4},work:{label:'WORKSTATIONS',floor:0},collaboration:{label:'COLLABORATION',floor:8},training:{label:'TRAINING',floor:8},'private-office':{label:'PRIVATE OFFICE',floor:5},utility:{label:'PRINT & STORAGE',floor:7},
} as const;

// Every recipe is a bounded, repeatable choice, not a random prop scatter.
// Programs preserve protected door approaches; failed slots do not move into halls.
export function furnishRoom(room: RoomSpec, config: EnvironmentConfig, density: number, at: PlaceFixture) {
  const [, ,w,h]=room.core,center=Math.floor(w/2),kind=room.kind;
  const theme=themes.findIndex(t=>t.id===config.theme),layout=layouts.findIndex(l=>l.id===config.layout);
  const seed=layout*11+theme*5+density*2+Object.keys(roomModules).indexOf(kind)*3+(['standard','executive','collaborative'].indexOf(config.furniture));
  const pick=(values:readonly Fixture[],offset=0)=>values[(seed+offset)%values.length]!;
  const formal=config.layout==='corporate-hq',tech=config.theme==='dark-tech',natural=['warm-wood','scandinavian','eco-green'].includes(config.theme);
  const chair=pick(tech?['chairMesh','chairTask']:natural?['chairTask','chairVisitor']:['chairMesh','chairTask']);
  const cabinet=pick(['cupboard','storageLow','cabinet']);
  const plant=config.overrides.planter==='ceramic'?'ceramic':'plant';
  const deskDetail=(desk:Fixture,col:number,row:number,index:number)=>{
    if(density===0)return;
    const detail=pick(desk==='deskDual'||desk==='deskManager'||desk==='deskReturn'?['deskNotebook','deskMug','deskFiles']:['deskNotebook','deskLamp','deskMug','deskFiles'],index);
    at(detail,col+(detail==='deskNotebook'?0:1),row);
  };
  if(['work','collaboration','training'].includes(kind)) {
    at(kind==='training'?'wallDisplay':pick(tech?['glassBoard','wallDisplay']:['whiteboard','glassBoard']),center-1,0);
    if(kind==='training'){at('podium',1,3);at('projectorTable',center-1,1);if(density>0)at('mobileBoard',w-3,1);}
    if(config.furniture==='executive') {
      const manager=pick(['deskReturn','deskManager']);
      for(const [col,row]of[[2,3],[w>=14?center-1:w-5,h-5]])if(at(manager,col!,row!))deskDetail(manager,col!,row!,1);
      at('chairVisitor',2,h-5);at('bookcase',w-5,1);
    } else if(config.furniture==='collaborative') {
      if(kind==='collaboration'&&w>=14&&seed%3===0) {
        const tx=center-1,ty=4;at('collaborationRound',tx,ty);for(const [a,b]of[[tx-1,ty+1],[tx+3,ty+1],[tx,ty+2],[tx+2,ty+2]])at('chairVisitor',a!,b!);
        at('mobileBoard',1,1);
      } else {
        const columns=w>=20?[2,center-2,w-6]:w>=14?[2,w-6]:[center-2];
        const rows=kind==='training'&&h>=16?[3,7,11]:[3,h>=13?7:6];
        for(const [index,row]of rows.entries())for(const col of columns){const bench=pick(['benchShared','benchLaptop'],index+col);if(at(bench,col,row))for(const dx of[0,2])at(kind==='training'?'chairClassroom':chair,col+dx,row+1);}
      }
    } else {
      const columns=w>=14?[2,center-1,w-4]:[1,w-3];
      const choices:readonly Fixture[]=kind==='training'?['classroomDesk']:tech?['deskDual','deskStanding','deskSingle']:natural?['deskSingle','deskLaptop','deskCreative','deskStanding']:['deskSingle','deskDual','deskLaptop','deskStanding'];
      for(const [index,row]of[3,h>=13?8:6].entries())for(const col of columns){const desk=pick(choices,index+col);if(at(desk,col,row))deskDetail(desk,col,row,index+col);}
    }
    if(density>0)at(pick(['copier','printerStand']),1,h-4);
    if(density>1){at('drawerUnit',1,h-2);at('trashBin',w-2,h-2);}
  } else if(kind==='private-office') {
    const desk=pick(['deskReturn','deskManager']);if(at(desk,center-2,3))deskDetail(desk,center-2,3,0);
    at('bookcase',1,1);at('certificate',w-3,0);at('artDiptych',center-1,0);at('chairVisitor',w-3,h-4);at('sideRound',w-4,h-4);
  } else if(kind==='meeting') {
    const table:Fixture=w<=10?'tableSmall':formal||seed%3===0?'tableLarge':'tableMedium',tw=fixtures[table][2]/32,tx=Math.floor((w-tw)/2),ty=Math.floor(h/2)-1;
    if(at(table,tx,ty))at('conferenceDevice',tx+Math.floor(tw/2),ty);
    at(pick(tech?['wallDisplay','glassBoard']:['whiteboard','glassBoard','wallDisplay']),center-1,0);
    const seat=pick(['chairMeeting','chairVisitor']);
    for(const dx of[0,tw-1]){at(seat,tx+dx,ty-1);at(seat,tx+dx,ty+2);}at(seat,tx-1,ty+1);at(seat,tx+tw,ty+1);
    if(density>0)at('waterDispenser',w-2,1);
    if(density>1)at('presentationDesk',1,h-3);
  } else if(kind==='lounge') {
    const sofa=pick(w>=12?['sofaCompact','sofaSectional','sofa']:['sofaCompact','sofa']);at(sofa,1,3);
    if(w>=12){const other=pick(['sofaCompact','sofaSectional'],1);at(other,w-1-fixtures[other][2]/32,3);}
    const coffee=pick(['coffeeRound','coffee']);if(at(coffee,center-1,6)&&density>0)at('magazineStack',center-1,6);
    at('chairLounge',2,h-4);at('chairLounge',w-3,h-4);at('bookcase',w-4,1);at('sideRound',1,h-4);at('artDiptych',center-1,0);
  } else if(kind==='pantry') {
    const counter=pick(['pantryCounter','pantry']);if(at(counter,1,2)||(counter!=='pantry'&&at('pantry',1,2)))at('microwave',2,2);
    const service=pick(['coffeeStation','espressoMachine','snackShelf']);at(service,w-1-fixtures[service][2]/32,2);
    at('pinboard',center-1,0);at('fridgeMini',1,h-4);
    const table=pick(['diningTable','barTable']),tw=fixtures[table][2]/32,tx=Math.floor((w-tw)/2);at(table,tx,h-5);at(table==='barTable'?'stool':'chairVisitor',tx-1,h-5);at(table==='barTable'?'stool':'chairVisitor',tx+tw,h-5);
    if(density>0)at('waterDispenser',w-2,h-4);
  } else if(kind==='reception') {
    const counter=formal?'receptionFormal':pick(['receptionCurve','receptionFormal','reception']);
    if(at(counter,center-1,4)){at('deskLamp',center+1,4);if(density>0)at('deskPlant',center-1,4);}
    at('benchWaiting',1,h-5);at(pick(['benchWaiting','waiting']),w-3,h-5);at(density>0?'brandingFeature':'artDiptych',w-4,0);at('sideRound',center,h-4);
    at('brochureStand',w-2,6);at('welcomeSign',1,0);
  } else if(kind==='utility') {
    at(pick(['copier','printerStand','printer']),center-1,1);
    const storage=tech?'serverRack':pick(['filesTall','lockerBank','shelfOpen']);at(storage,w-3,1);
    at('utilityShelf',1,h-3);if(w>=10)at(cabinet,center-1,h-2);
    at('certificate',1,0);at('trashBin',w-2,h-2);
  }
  if(kind!=='utility') {
    // One principal planter always reflects the owner's planter override.
    if(density>0||kind==='reception'||kind==='lounge')at(plant,1,kind==='reception'?3:1);
    if(density>0){if(['lounge','reception','private-office'].includes(kind))at(pick(['lampArc','lamp']),w-2,h-5);at(cabinet,w-3,h-3);}
    if(density>1){at(config.theme==='eco-green'?'tallPalm':pick(['tallPalm',plant]),w-2,3);if(['work','training','collaboration'].includes(kind))at('bookcase',w-5,1);else at('bookcase',1,h-3);}
    if(density>0&&['lounge','collaboration','reception'].includes(kind))at(pick(natural?['planterWide','plantSmall']:['plantSmall']),w-4,1);
  }
  if(density>0)at('clock',w-2,0);
  for(const [wx,wy,ww,wh]of room.wings??[]) {
    const dx=wx-room.core[0],dy=wy-room.core[1];
    if(ww>=5&&wh>=4){at('benchWaiting',dx+1,dy+1);at('sideRound',dx+ww-2,dy+1);}
    else if(ww>=4&&wh>=4)at(plant,dx+1,dy+1);
  }
}
