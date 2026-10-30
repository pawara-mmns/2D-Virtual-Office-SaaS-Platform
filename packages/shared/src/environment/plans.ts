import type { EnvironmentConfig } from './catalog.ts';
export type RoomFootprint = readonly [x:number,y:number,width:number,height:number];
export type FloorPlan = { width:number;height:number;rooms:readonly RoomFootprint[];enclosed:readonly string[] };
// Each plan retains six reusable zone programs, but gives them a deliberate
// architectural footprint and circulation pattern instead of permuting boxes.
export const floorPlans: Record<EnvironmentConfig['layout'],FloorPlan> = {
  'open-office': {width:44,height:32,enclosed:['meeting'],rooms:[[2,2,10,12],[14,2,14,12],[30,2,12,12],[2,18,10,12],[14,18,12,12],[28,18,14,12]]},
  'corporate-hq': {width:44,height:34,enclosed:['work','meeting','collaboration','pantry'],rooms:[[2,2,16,13],[20,2,10,13],[32,2,10,13],[2,19,12,12],[16,19,14,12],[32,19,10,12]]},
  'startup-office': {width:42,height:34,enclosed:['meeting'],rooms:[[2,2,10,12],[14,2,14,14],[30,2,10,12],[2,18,12,13],[16,20,12,11],[30,18,10,13]]},
  'coworking-space': {width:46,height:34,enclosed:['meeting','work'],rooms:[[2,2,14,13],[18,2,12,13],[32,2,12,13],[2,19,14,12],[18,19,10,12],[30,19,14,12]]},
  'training-hub': {width:48,height:36,enclosed:['meeting','collaboration'],rooms:[[2,2,18,14],[22,2,12,14],[36,2,10,14],[2,20,14,13],[18,20,12,13],[32,20,14,13]]},
};
