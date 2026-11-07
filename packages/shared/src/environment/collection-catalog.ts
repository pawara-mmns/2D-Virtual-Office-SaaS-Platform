import {collectionDefinitions} from './collection.ts';
import {expandedFixtures,directionalChairRects,assetRenderDepth,displaySurfaces} from './assets.ts';
import {catalogSeats,isChairAsset} from './seating-metadata.ts';
import {themes} from './catalog.ts';

// Auditable, serializable view of the same metadata consumed by composer,
// authoritative seating, Phaser and owner editing. No media/game permissions.
export const collectionCatalog=Object.entries(collectionDefinitions).map(([id,s])=>{
  const width=s.width*32,height=s.height*32,seats=catalogSeats(id,width,height);
  return{id,label:s.label,category:s.category,collection:s.collection,rooms:s.rooms,
    width,height,footprint:{width,height},mode:s.mode,collision:s.mode==='blocking'?'solid-footprint':'existing-support-only',
    orientations:isChairAsset(id)?['down','left','up','right']:['down'],
    atlas:expandedFixtures[id as keyof typeof collectionDefinitions],
    frames:isChairAsset(id)?directionalChairRects[id]:{down:expandedFixtures[id as keyof typeof collectionDefinitions]},
    render:{depth:assetRenderDepth(id),foreground:seats.length&&s.kind==='desk'?'desk-front-strip':'none',sampling:'nearest'},
    interaction:{actions:seats.length?['SIT','STAND']:[],future:'future' in s?s.future:null,enabled:seats.length>0},seats,
    display:displaySurfaces[id as keyof typeof displaySurfaces]??null,
    lighting:'light' in s?s.light:null,themes:themes.map(t=>t.id)};
});
