import {chairFamilies,type ChairAsset} from './seating-metadata.ts';
import type {AvatarDirection} from '../avatars.ts';
// Content-owned atlas contract. The first 128 tiles retain their existing art;
// a deterministic shelf packer assigns new assets below those legacy rows.
export const environmentAtlas = { width: 512, height: 1024, columns: 16, tileCount: 512 } as const;
export type AssetCategory = 'workstations'|'seating'|'storage'|'reception'|'meeting'|'pantry'|'lounge'|'decor'|'training'|'structure';
export type AssetMode = 'blocking'|'wall'|'surface'|'structure';
export type AssetSpec = { category: AssetCategory; kind: string; width: number; height: number; variant: string; mode: AssetMode; material?: 'solid'|'glass'|'half'|'threshold' };
const asset=(category:AssetCategory,kind:string,width:number,height:number,variant:string,mode:AssetMode='blocking'):AssetSpec=>({category,kind,width,height,variant,mode});
const structure=(variant:string,material:NonNullable<AssetSpec['material']>)=>({...asset('structure','structure',1,1,variant,'structure'),material});
// Packed after the existing directional frames: saved GIDs and sprite crops stay stable.
export const premiumDefinitions={
  deskTriple:asset('workstations','desk',3,2,'triple'),
  beanBag:asset('lounge','beanbag',1,1,'canvas'),
  livingWall:asset('decor','living-wall',3,1,'vines','wall'),
  gameConsole:asset('lounge','media',2,1,'console','wall'),
  trophyShelf:asset('decor','trophies',2,1,'awards','wall'),
  sculpture:asset('reception','sculpture',1,1,'loop'),
  windowPanel:asset('decor','window',2,1,'daylight','wall'),
} as const;
// Local artwork coordinates reserved for a future display renderer. This is
// geometry only: there is no SHARE_SCREEN action, media subscription or permission.
export const displaySurfaces={
  wallDisplay:{x:6,y:6,width:84,height:19,interactive:false},
  gameConsole:{x:6,y:6,width:52,height:19,interactive:false},
} as const;
export const assetDefinitions = {
  deskSingle:asset('workstations','desk',2,2,'single'),deskDual:asset('workstations','desk',2,2,'dual'),deskLaptop:asset('workstations','desk',2,2,'laptop'),deskStanding:asset('workstations','desk',2,2,'standing'),deskCreative:asset('workstations','desk',2,2,'creative'),deskReturn:asset('workstations','desk',3,2,'return'),deskManager:asset('workstations','desk',3,2,'manager'),benchShared:asset('workstations','bench',4,1,'shared'),benchLaptop:asset('workstations','bench',4,1,'laptop'),
  deskNotebook:asset('workstations','accessory',1,1,'notebook','surface'),deskLamp:asset('workstations','accessory',1,1,'lamp','surface'),deskMug:asset('workstations','accessory',1,1,'mug','surface'),deskFiles:asset('workstations','accessory',1,1,'files','surface'),
  chairMesh:asset('seating','chair',1,1,'mesh'),chairTask:asset('seating','chair',1,1,'task'),chairVisitor:asset('seating','chair',1,1,'visitor'),chairMeeting:asset('seating','chair',1,1,'meeting'),chairLounge:asset('seating','chair',1,1,'lounge'),chairClassroom:asset('seating','chair',1,1,'classroom'),benchWaiting:asset('seating','waiting',2,1,'linked'),stool:asset('seating','chair',1,1,'stool'),
  filesTall:asset('storage','storage',2,2,'files'),drawerUnit:asset('storage','storage',1,1,'drawers'),bookcase:asset('storage','storage',3,1,'books'),shelfOpen:asset('storage','storage',2,2,'open'),lockerBank:asset('storage','storage',2,2,'lockers'),cupboard:asset('storage','storage',2,1,'cupboard'),printerStand:asset('storage','storage',2,2,'printer-stand'),copier:asset('storage','storage',2,2,'copier'),serverRack:asset('storage','storage',2,2,'server'),storageLow:asset('storage','storage',2,1,'low'),
  receptionFormal:asset('reception','reception',3,2,'formal'),receptionCurve:asset('reception','reception',3,2,'curve'),brochureStand:asset('reception','storage',1,2,'brochures'),welcomeSign:asset('reception','wall',2,1,'welcome','wall'),brandingFeature:asset('reception','wall',3,1,'branding','wall'),
  tableSmall:asset('meeting','table',3,2,'small'),tableMedium:asset('meeting','table',4,2,'medium'),tableLarge:asset('meeting','table',5,2,'large'),whiteboard:asset('meeting','wall',2,1,'whiteboard','wall'),glassBoard:asset('meeting','wall',2,1,'glass-board','wall'),wallDisplay:asset('meeting','wall',3,1,'display','wall'),presentationDesk:asset('meeting','table',2,1,'presentation'),conferenceDevice:asset('meeting','accessory',1,1,'speaker','surface'),
  espressoMachine:asset('pantry','appliance',1,2,'espresso'),waterDispenser:asset('pantry','appliance',1,2,'water'),fridgeMini:asset('pantry','appliance',1,2,'fridge'),microwave:asset('pantry','accessory',1,1,'microwave','surface'),snackShelf:asset('pantry','storage',2,2,'snacks'),diningTable:asset('pantry','table',2,1,'dining'),barTable:asset('pantry','table',3,1,'bar'),pantryCounter:asset('pantry','counter',3,2,'pantry'),
  sofaCompact:asset('lounge','sofa',3,2,'compact'),sofaSectional:asset('lounge','sofa',4,2,'sectional'),coffeeRound:asset('lounge','table',2,1,'round'),sideRound:asset('lounge','table',1,1,'side'),lampArc:asset('lounge','lamp',1,2,'arc'),magazineStack:asset('lounge','accessory',1,1,'magazines','surface'),
  artDiptych:asset('decor','wall',2,1,'art','wall'),certificate:asset('decor','wall',1,1,'certificate','wall'),clock:asset('decor','wall',1,1,'clock','wall'),pinboard:asset('decor','wall',2,1,'pinboard','wall'),trashBin:asset('decor','storage',1,1,'bin'),tallPalm:asset('decor','plant',1,2,'palm'),plantSmall:asset('decor','plant',1,1,'small'),planterWide:asset('decor','plant',2,1,'wide'),deskPlant:asset('decor','accessory',1,1,'plant','surface'),
  classroomDesk:asset('training','desk',2,2,'classroom'),podium:asset('training','podium',1,2,'lectern'),projectorTable:asset('training','table',2,1,'projector'),collaborationRound:asset('training','table',3,2,'collaboration'),mobileBoard:asset('training','mobile-board',2,2,'mobile'),
  wallPanelH:structure('panel-h','solid'),wallPanelV:structure('panel-v','solid'),glassFrostH:structure('frost-h','glass'),glassFrostV:structure('frost-v','glass'),halfShelfH:structure('shelf-h','half'),halfShelfV:structure('shelf-v','half'),doorFlushH:structure('door-h','threshold'),doorFlushV:structure('door-v','threshold'),innerCornerNW:structure('inner-nw','solid'),innerCornerNE:structure('inner-ne','solid'),innerCornerSE:structure('inner-se','solid'),innerCornerSW:structure('inner-sw','solid'),wallEdgeH:structure('edge-h','solid'),wallEdgeV:structure('edge-v','solid'),
  directionalSign:asset('decor','wall',2,1,'direction','wall'),companyPoster:asset('decor','wall',2,1,'poster','wall'),wallSconce:asset('decor','wall',1,1,'sconce','wall'),consoleTable:asset('lounge','table',2,1,'console'),magazineStand:asset('reception','storage',1,2,'magazines'),cornerPlanter:asset('decor','plant',1,1,'corner'),
  ...premiumDefinitions,
} as const satisfies Record<string,AssetSpec>;
export type ExpandedAsset = keyof typeof assetDefinitions;
export type AtlasRect = readonly [x:number,y:number,width:number,height:number];
const packed:Partial<Record<ExpandedAsset,AtlasRect>>={};
let x=0,y=256,rowHeight=0;
for(const [id,definition]of Object.entries(assetDefinitions)) {
  if(Object.hasOwn(premiumDefinitions,id))continue;
  const w=definition.width*32,h=definition.height*32;
  if(x+w>environmentAtlas.width){x=0;y+=rowHeight;rowHeight=0;}
  if(y+h>environmentAtlas.height)throw Error('Office asset atlas capacity exceeded');
  packed[id as ExpandedAsset]=[x,y,w,h];x+=w;rowHeight=Math.max(rowHeight,h);
}
export const expandedFixtures=packed as Record<ExpandedAsset,AtlasRect>;
// Directional artwork is a render variant of the same catalog object, not a
// second furniture item. Append it after existing atlas rectangles to retain IDs.
export const directionalChairRects={} as Record<ChairAsset,Record<AvatarDirection,AtlasRect>>;
for(const id of Object.keys(chairFamilies) as ChairAsset[]){
  const base=id==='chair'?[64,64,32,32] as const:id==='armchair'?[288,64,32,32] as const:expandedFixtures[id as ExpandedAsset];
  const variants={down:base} as Record<AvatarDirection,AtlasRect>;
  for(const direction of ['up','left','right'] as const){
    if(x+32>environmentAtlas.width){x=0;y+=rowHeight;rowHeight=0;}
    if(y+32>environmentAtlas.height)throw Error('Directional chair atlas capacity exceeded');
    variants[direction]=[x,y,32,32];x+=32;rowHeight=Math.max(rowHeight,32);
  }
  directionalChairRects[id]=variants;
}
// Reserve a clean shelf after all original frames (currently y=960).
x=0;y+=rowHeight;rowHeight=0;
for(const [id,spec]of Object.entries(premiumDefinitions)){
  const w=spec.width*32,h=spec.height*32;
  if(x+w>environmentAtlas.width){x=0;y+=rowHeight;rowHeight=0;}
  if(y+h>environmentAtlas.height)throw Error('Premium atlas capacity exceeded');
  packed[id as ExpandedAsset]=[x,y,w,h];x+=w;rowHeight=Math.max(rowHeight,h);
}
export const assetTile=(id:ExpandedAsset)=>{const [x,y]=expandedFixtures[id];return 1+y/32*environmentAtlas.columns+x/32;};
export function assetMaterial(gid:number):AssetSpec['material'] {
  for(const [id,spec]of Object.entries(assetDefinitions))if(spec.mode==='structure'&&assetTile(id as ExpandedAsset)===gid)return spec.material;
  return [11,14,21,22,23,24].includes(gid)?'glass':[12,13,25,26,27,28].includes(gid)?'half':'solid';
}
