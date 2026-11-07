import type {AssetSpec} from './assets.ts';

// One record per original design; palettes and cardinal render frames do not
// count as additional assets. Dimensions are native 32px grid footprints.
export const collectionGroups=['Reception & welcome','Developer workstations','Meeting & conference','Lounge & relaxation','Coffee & pantry','Collaboration & creative','Print, storage & IT','Corridors & greenery','Lighting & architecture','TV & recreation'] as const;
export type CollectionGroup=typeof collectionGroups[number];
export type CollectionSpec=AssetSpec&{label:string;collection:CollectionGroup;rooms:readonly string[];light?:'warm'|'screen'|'desk';future?:'display'|'game'};
const a=(group:number,label:string,category:AssetSpec['category'],kind:string,width:number,height:number,mode:AssetSpec['mode']='blocking',extra:Partial<Pick<CollectionSpec,'light'|'future'>>={}):CollectionSpec=>({label,category,kind,width,height,mode,variant:'collection',collection:collectionGroups[group]!,rooms:[['reception'],['work','private-office'],['meeting'],['lounge'],['pantry'],['collaboration','training'],['utility'],['reception','lounge','work','collaboration'],['reception','meeting','lounge','work','pantry','collaboration'],['lounge','collaboration']][group]!,...extra});
export const collectionDefinitions={
  crescentDesk:a(0,'Crescent concierge desk','reception','reception',4,2),
  conciergeDesk:a(0,'Stone executive reception desk','reception','reception',4,2),
  visitorKiosk:a(0,'Visitor check-in kiosk','reception','equipment',1,2,'blocking',{light:'screen'}),
  waitingSettee:a(0,'Channel waiting settee','reception','sofa',3,2),
  cantileverChair:a(0,'Cantilever visitor chair','seating','chair',1,1),
  brochureCarousel:a(0,'Rotating brochure carousel','reception','storage',1,2),
  welcomeTotem:a(0,'Welcome directory totem','reception','equipment',1,2,'blocking',{light:'warm'}),
  receptionCredenza:a(0,'Reception mail credenza','reception','storage',3,1),
  umbrellaStand:a(0,'Umbrella and coat stand','reception','storage',1,2),

  devUltrawideDesk:a(1,'Ultrawide developer desk','workstations','desk',3,2,'blocking',{light:'screen'}),
  devDualArmDesk:a(1,'Dual monitor arm station','workstations','desk',3,2,'blocking',{light:'screen'}),
  devCornerDesk:a(1,'L-shaped engineering desk','workstations','desk',3,2,'blocking',{light:'screen'}),
  sitStandStation:a(1,'Raised standing workstation','workstations','desk',2,2,'blocking',{light:'screen'}),
  chairErgoHeadrest:a(1,'Headrest ergonomic chair','seating','chair',1,1),
  chairDrafting:a(1,'Drafting chair with foot ring','seating','chair',1,1),
  laptopDock:a(1,'Elevated laptop and docking hub','workstations','accessory',1,1,'surface',{light:'screen'}),
  deskAcousticDivider:a(1,'Desk acoustic privacy divider','workstations','accessory',2,1,'surface'),
  rollingPedestal:a(1,'Rolling drawer pedestal','workstations','storage',1,1),

  conferenceOval4:a(2,'Four-place oval meeting table','meeting','table',3,2),
  conferenceBoat6:a(2,'Six-place boat conference table','meeting','table',4,2),
  conferenceBoardroom10:a(2,'Ten-place boardroom table','meeting','table',6,2),
  chairConferenceLeather:a(2,'Leather conference chair','seating','chair',1,1),
  smartDisplayWide:a(2,'Wide presentation smart display','meeting','wall',3,1,'wall',{light:'screen',future:'display'}),
  conferenceCameraBar:a(2,'Conference camera and sound bar','meeting','wall',2,1,'wall'),
  speakerTriangle:a(2,'Triangular conference speakerphone','meeting','accessory',1,1,'surface'),
  whiteboardRolling:a(2,'Double-sided rolling whiteboard','meeting','mobile-board',2,2),
  glassPartition:a(2,'Low framed glass divider','meeting','partition',2,1),

  sofaChaise:a(3,'Chaise sectional sofa','lounge','sofa',4,2),
  sofaLoveseat:a(3,'Scalloped two-seat loveseat','lounge','sofa',3,2),
  sofaChesterfield:a(3,'Tufted Chesterfield sofa','lounge','sofa',3,2),
  chairWingback:a(3,'Wingback lounge chair','seating','chair',1,1),
  poufKnitted:a(3,'Knitted round pouf','lounge','pouf',1,1),
  nestingTables:a(3,'Nesting coffee tables','lounge','table',2,1),
  bookcaseLadder:a(3,'Leaning ladder bookcase','lounge','storage',2,2),
  lampTripod:a(3,'Tripod floor lamp','lounge','lamp',1,2,'blocking',{light:'warm'}),
  magazineRackLow:a(3,'Wire magazine basket','lounge','storage',1,1),

  espressoBar:a(4,'Commercial espresso bar','pantry','counter',2,2,'blocking',{light:'warm'}),
  coffeeGrinder:a(4,'Burr coffee grinder','pantry','accessory',1,1,'surface'),
  refrigeratorTall:a(4,'Full-height refrigerator','pantry','appliance',1,2),
  microwaveShelf:a(4,'Microwave wall shelf','pantry','wall',2,1,'wall'),
  sinkIsland:a(4,'Sink and preparation island','pantry','counter',3,2),
  snackVending:a(4,'Glass-front snack vending machine','pantry','appliance',2,2,'blocking',{light:'screen'}),
  cafePedestal:a(4,'Round cafe pedestal table','pantry','table',2,1),
  stoolSaddle:a(4,'Saddle cafe stool','seating','chair',1,1),
  teaTrolley:a(4,'Tea service trolley','pantry','counter',2,2),

  teamIsland:a(5,'Four-person collaboration island','training','table',4,2,'blocking',{light:'screen'}),
  brainstormingHex:a(5,'Hexagonal brainstorming table','training','table',3,2),
  sofaModular:a(5,'Modular discussion sofa','training','sofa',3,2),
  chairScoop:a(5,'Scoop discussion chair','seating','chair',1,1),
  stickyWallLarge:a(5,'Planning wall with sticky notes','training','wall',3,1,'wall'),
  mobileAcousticScreen:a(5,'Mobile felt privacy screen','training','partition',2,2),
  materialsLibrary:a(5,'Creative materials sample library','training','storage',2,2),
  draftingTable:a(5,'Angled drafting table','training','table',2,2),
  digitalEasel:a(5,'Digital presentation easel','training','equipment',1,2,'blocking',{light:'screen',future:'display'}),

  printerProduction:a(6,'Production copier and finisher','storage','equipment',3,2),
  scannerFlatbed:a(6,'Open-lid flatbed scanner','storage','accessory',1,1,'surface'),
  paperOrganizer:a(6,'Paper ream organizer','storage','storage',2,2),
  filingLateral:a(6,'Lateral filing cabinet','storage','storage',3,1),
  lockerTower:a(6,'Personal locker tower','storage','storage',2,2),
  rackNetwork:a(6,'Network rack and patch panels','storage','equipment',2,2,'blocking',{light:'screen'}),
  recyclingStation:a(6,'Three-stream recycling station','storage','storage',2,1),
  supplyCart:a(6,'Utility supply cart','storage','storage',2,2),
  upsTower:a(6,'UPS battery tower','storage','equipment',1,1),

  plantMonstera:a(7,'Monstera in stone planter','decor','plant',1,2),
  plantFiddleLeaf:a(7,'Fiddle-leaf fig tree','decor','plant',1,2),
  planterTrough:a(7,'Long layered foliage trough','decor','plant',3,1),
  hangingPothos:a(7,'Hanging pothos shelf','decor','wall',2,1,'wall'),
  artTriptych:a(7,'Landscape art triptych','decor','wall',3,1,'wall'),
  clockFlip:a(7,'Split-flap office clock','decor','wall',2,1,'wall'),
  signDirectory:a(7,'Illuminated room directory','decor','wall',2,1,'wall',{light:'warm'}),
  benchSlatted:a(7,'Slatted hallway bench','seating','waiting',3,1),
  achievementCase:a(7,'Glass achievement display case','decor','storage',2,2),

  sconceTwin:a(8,'Twin-cylinder warm wall sconce','decor','wall',1,1,'wall',{light:'warm'}),
  pendantLinear:a(8,'Linear architectural pendant','decor','wall',3,1,'wall',{light:'warm'}),
  lampArchitect:a(8,'Articulated task lamp','workstations','accessory',1,1,'surface',{light:'desk'}),
  lampHalo:a(8,'Halo reading floor lamp','decor','lamp',1,2,'blocking',{light:'warm'}),
  lightCoveCorner:a(8,'Corner cove light feature','decor','wall',2,1,'wall',{light:'warm'}),
  floorLantern:a(8,'Fluted floor lantern','decor','lamp',1,1,'blocking',{light:'warm'}),
  archWoodSlats:a(8,'Freestanding oak slat screen','decor','partition',2,2),
  archGlassScreen:a(8,'Arched fluted glass screen','decor','partition',2,2),
  acousticHexTiles:a(8,'Hexagonal acoustic wall tiles','decor','wall',2,1,'wall'),

  tvMediaCredenza:a(9,'TV and media storage credenza','lounge','media',3,2,'blocking',{light:'screen',future:'display'}),
  tvMobileStand:a(9,'Mobile TV presentation stand','lounge','media',2,2,'blocking',{light:'screen',future:'display'}),
  consoleArcade:a(9,'Upright arcade cabinet','lounge','media',1,2,'blocking',{light:'screen',future:'game'}),
  chessTable:a(9,'Chess discussion table','lounge','table',2,1,'blocking',{future:'game'}),
  foosballTable:a(9,'Foosball recreation table','lounge','table',3,2,'blocking',{future:'game'}),
  pingPongTable:a(9,'Table tennis station','lounge','table',4,2,'blocking',{future:'game'}),
  boardGameShelf:a(9,'Board game library shelving','lounge','storage',2,2,'blocking',{future:'game'}),
  recordConsole:a(9,'Record player and vinyl console','lounge','media',2,1),
  aquariumCabinet:a(9,'Planted aquarium cabinet','lounge','media',2,2,'blocking',{light:'screen'}),
} as const satisfies Record<string,CollectionSpec>;
export type CollectionAsset=keyof typeof collectionDefinitions;
export const collectionSpec=(id:string):CollectionSpec|undefined=>collectionDefinitions[id as CollectionAsset];
export const collectionSofas={waitingSettee:2,sofaChaise:3,sofaLoveseat:2,sofaChesterfield:2,sofaModular:2,poufKnitted:1,benchSlatted:3} as const;
export const collectionDesks={devUltrawideDesk:96,devDualArmDesk:96,devCornerDesk:96} as const;
export const collectionChairs={cantileverChair:'visitor',chairErgoHeadrest:'mesh',chairDrafting:'drafting',chairConferenceLeather:'leather',chairWingback:'wingback',stoolSaddle:'saddle',chairScoop:'scoop'} as const;
