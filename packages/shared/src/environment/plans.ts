import type { EnvironmentConfig } from './catalog.ts';

export type Rect = readonly [x: number, y: number, width: number, height: number];
export type RoomKind = 'reception' | 'meeting' | 'pantry' | 'lounge' | 'work' | 'collaboration' | 'training' | 'private-office' | 'utility';
export type BoundaryStyle = 'solid' | 'glass' | 'screen' | 'open';
export type Door = { side: 'north' | 'east' | 'south' | 'west'; offset: number; width: number };
export type RoomSpec = { id: string; kind: RoomKind; core: Rect; wings?: readonly Rect[]; style: BoundaryStyle; doors: readonly Door[] };
export type FloorPlan = { width: number; height: number; spawn: readonly [number, number]; rooms: readonly RoomSpec[]; halls: readonly Rect[] };

const door = (side: Door['side'], offset: number, width = 3): Door => ({ side, offset, width });
const room = (kind: RoomKind, core: Rect, style: BoundaryStyle, doors: Door[], wings?: Rect[]): RoomSpec => ({ id: kind, kind, core, style, doors, wings });

// Occupied footprints, stepped/L-shaped wings and halls connecting offset doors.
export const floorPlans: Record<EnvironmentConfig['layout'], FloorPlan> = {
  'open-office': {
    width: 51, height: 40, spawn: [25, 36.25],
    halls: [[12,7,6,25],[18,16,31,3],[39,18,5,3],[23,18,4,5],[22,34,6,5]],
    rooms: [
      room('lounge',[2,2,11,11],'screen',[door('east',7)],[[13,2,4,5]]),
      room('work',[18,2,17,14],'screen',[door('south',6,5)]),
      room('meeting',[37,3,12,13],'glass',[door('south',4)]),
      room('utility',[2,15,10,6],'solid',[door('east',2,2)]),
      room('pantry',[2,23,11,12],'solid',[door('east',5)]),
      room('reception',[19,22,13,13],'screen',[door('north',4,4),door('south',4,4)]),
      room('collaboration',[35,20,14,15],'open',[door('north',4,5)]),
    ],
  },
  'corporate-hq': {
    width: 53, height: 47, spawn: [26, 43.25],
    halls: [[17,16,22,5],[18,2,4,42],[35,3,4,32],[26,14,3,3],[27,20,4,4],[23,39,8,7]],
    rooms: [
      room('work',[2,2,16,14],'solid',[door('east',7,4)]),
      room('meeting',[22,2,13,13],'glass',[door('south',4)]),
      room('private-office',[39,2,12,12],'glass',[door('west',5)]),
      room('utility',[39,16,12,7],'solid',[door('west',2,2)]),
      room('collaboration',[2,21,15,12],'solid',[door('east',5)]),
      room('lounge',[2,34,15,10],'screen',[door('east',4)],[[2,41,6,4]]),
      room('reception',[23,23,13,17],'solid',[door('north',4,4),door('south',2,5),door('east',8)]),
      room('pantry',[39,25,12,15],'solid',[door('west',6)]),
    ],
  },
  'startup-office': {
    width: 51, height: 41, spawn: [24, 38.25],
    halls: [[14,16,26,5],[24,3,4,14],[14,20,4,15],[32,20,3,15],[22,20,5,4],[21,36,6,4],[43,10,3,4]],
    rooms: [
      room('work',[2,2,22,14],'screen',[door('south',13,5)]),
      room('meeting',[28,2,11,12],'glass',[door('west',7)]),
      room('utility',[41,2,8,9],'solid',[door('south',2)]),
      room('pantry',[40,13,9,11],'screen',[door('west',4,4),door('north',3)]),
      room('lounge',[2,20,12,13],'open',[door('east',5,5)],[[2,33,6,4]]),
      room('reception',[18,23,14,14],'screen',[door('north',4,5),door('south',4,4)]),
      room('collaboration',[35,26,14,11],'open',[door('west',4,4)]),
    ],
  },
  'coworking-space': {
    width: 54, height: 47, spawn: [10, 39.25],
    halls: [[15,17,38,5],[17,17,6,22],[38,17,3,27],[10,14,5,5],[10,15,13,4],[45,15,3,3],[28,21,5,4],[7,38,6,3]],
    rooms: [
      room('collaboration',[2,2,17,13],'screen',[door('south',8,5)]),
      room('work',[23,2,16,15],'screen',[door('south',5,5)]),
      room('meeting',[42,3,10,13],'glass',[door('south',3)]),
      room('utility',[2,17,13,6],'solid',[door('east',2,2)]),
      room('reception',[2,25,15,14],'screen',[door('east',5,5),door('south',6,4)]),
      room('lounge',[23,24,15,13],'open',[door('north',5,5)],[[34,37,4,3]]),
      room('pantry',[41,22,11,13],'solid',[door('west',6)]),
      room('private-office',[41,36,11,9],'glass',[door('west',3)]),
    ],
  },
  'training-hub': {
    width: 55, height: 45, spawn: [20, 41.25],
    halls: [[10,18,33,4],[40,2,3,33],[32,14,3,5],[32,21,4,5],[18,21,4,5],[10,21,4,12],[17,39,6,5]],
    rooms: [
      room('training',[2,2,22,16],'solid',[door('south',14,4)]),
      room('meeting',[28,2,12,13],'glass',[door('south',4)]),
      room('work',[43,2,10,15],'screen',[door('west',8)]),
      room('pantry',[43,21,10,14],'solid',[door('west',6)]),
      room('lounge',[28,25,12,15],'screen',[door('north',4,4)]),
      room('reception',[14,25,12,15],'screen',[door('north',4,4),door('south',4,4)],[[2,34,12,6]]),
      room('utility',[2,23,8,9],'solid',[door('east',3)]),
    ],
  },
};
