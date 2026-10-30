import type { EnvironmentConfig } from './catalog.ts';
import type { BoundaryStyle, Door, Rect, RoomSpec } from './plans.ts';

export const cellKey = (x: number, y: number) => `${x},${y}`;
export function rectangleCells([x,y,w,h]: Rect): [number,number][] {
  const cells: [number,number][] = [];
  for (let j=y;j<y+h;j++) for (let i=x;i<x+w;i++) cells.push([i,j]);
  return cells;
}
export function roomCells(room: RoomSpec) {
  return new Set([room.core,...room.wings??[]].flatMap(rectangleCells).map(([x,y])=>cellKey(x,y)));
}
export function boundaryCells(cells: ReadonlySet<string>): [number,number][] {
  return [...cells].map(key=>key.split(',').map(Number) as [number,number]).filter(([x,y])=>[[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b])=>!cells.has(cellKey(a!,b!))));
}
export function doorway(room: RoomSpec, door: Door): Rect {
  const [x,y,w,h]=room.core;
  return door.side==='north'?[x+door.offset,y,door.width,1]:door.side==='south'?[x+door.offset,y+h-1,door.width,1]:door.side==='west'?[x,y+door.offset,1,door.width]:[x+w-1,y+door.offset,1,door.width];
}
export function doorClearance(room: RoomSpec, door: Door): Rect {
  const [x,y,w,h]=doorway(room,door);
  return door.side==='north'?[x,y-1,w,4]:door.side==='south'?[x,y-2,w,4]:door.side==='west'?[x-1,y,4,h]:[x-2,y,4,h];
}
// Include jambs and an exterior shell row in short connecting vestibules.
// Without this padding a building-edge wall could pinch the doorway approach.
export function doorVestibule(room: RoomSpec, door: Door): Rect {
  const [x,y,w,h]=doorClearance(room,door);
  return door.side==='north'?[x-1,y-1,w+2,h+1]:door.side==='south'?[x-1,y,w+2,h+1]:door.side==='west'?[x-1,y-1,w+1,h+2]:[x,y-1,w+1,h+2];
}
export function wallMaterial(style: BoundaryStyle, theme: EnvironmentConfig['theme'], vertical: boolean, rear: boolean): 'solid'|'glass'|'half' {
  if(style==='solid'||rear)return 'solid';
  if(style==='glass')return 'glass';
  if(style==='screen'&&vertical&&theme==='dark-tech')return 'glass';
  return 'half';
}
export function wallTile(material: 'solid'|'glass'|'half', x: number, y: number, cells: ReadonlySet<string>): number {
  const n=cells.has(cellKey(x,y-1)),e=cells.has(cellKey(x+1,y)),s=cells.has(cellKey(x,y+1)),w=cells.has(cellKey(x-1,y));
  const corner=!n&&e&&s&&!w?0:!n&&!e&&s&&w?1:n&&!e&&!s&&w?2:n&&e&&!s&&!w?3:-1;
  if(corner>=0)return (material==='solid'?17:material==='glass'?21:25)+corner;
  const vertical=(n||s)&&!(e||w);
  if((n&&e&&s)||(e&&s&&w)||(s&&w&&n)||(w&&n&&e))return 29;
  return material==='solid'?(vertical?10:9):material==='glass'?(vertical?14:11):(vertical?13:12);
}
