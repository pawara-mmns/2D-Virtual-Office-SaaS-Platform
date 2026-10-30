// Browser-fixture-only probe. Exercise the real Arcade collider and avatar foot
// body against the composed map; no application/auth/network behavior is mocked
// by this helper (the enclosing harness supplies its own synthetic transport).
import { avatarBody } from '../packages/shared/src/avatars.ts';
import { doorway, boundaryCells, roomCells, cellKey, rectangleCells } from '../packages/shared/src/environment/architecture.ts';
import { floorPlans } from '../packages/shared/src/environment/plans.ts';
import { blocked } from '../packages/shared/src/map.ts';
import { assetMaterial, environmentAtlas } from '../packages/shared/src/environment/assets.ts';

export function probeArchitecture(scene,config) {
  const map=scene.cache.tilemap.get('studio').data;
  const collision=scene.children.list.find(child=>child.type==='TilemapLayer'&&child.layer.name==='Collision');
  if(!collision)throw Error('Missing actual Phaser collision layer');
  const sprite=scene.physics.add.sprite(0,0,'avatar',0).setVisible(false);
  sprite.setSize(avatarBody.width,avatarBody.height).setOffset(avatarBody.offsetX,avatarBody.offsetY);
  const collider=scene.physics.add.collider(sprite,collision),world=scene.physics.world;
  const assert=(value,message)=>{if(!value)throw Error(config.layout+': '+message);};
  const travel=(x,y,dx,dy,steps=48)=>{sprite.body.reset(x,y);sprite.setVelocity(dx*120,dy*120);for(let i=0;i<steps;i++)world.singleStep();return{x:sprite.x,y:sprite.y};};
  let doors=0,walls=0;const materials=new Set();
  try {
    const image=scene.textures.get('office-tiles').getSourceImage();
    assert(image.width===environmentAtlas.width&&image.height===environmentAtlas.height,'Expanded atlas loads at native dimensions');
    const detailLayer=scene.children.list.find(child=>child.type==='TilemapLayer'&&child.layer.name==='Details');
    const detailTiles=map.layers.find(layer=>layer.name==='Details').data.filter(Boolean).length;
    assert(detailTiles>0&&detailLayer?.getTilesWithin().filter(tile=>tile&&tile.index>0).length===detailTiles,'Actual Phaser detail tiles match the shared preview recipe');
    for(const room of floorPlans[config.layout].rooms) {
      const openings=new Set();
      for(const door of room.doors) {
        const [x,y,w,h]=doorway(room,door);for(const [a,b]of rectangleCells([x,y,w,h]))openings.add(cellKey(a,b));
        const dx=door.side==='west'?1:door.side==='east'?-1:0,dy=door.side==='north'?1:door.side==='south'?-1:0,cx=(x+w/2)*32,cy=(y+h/2)*32-11;
        const inside=travel(cx-dx*32,cy-dy*32,dx,dy);
        assert(Math.abs(inside.x-cx-dx*64)<3&&Math.abs(inside.y-cy-dy*64)<3,room.id+' inward doorway traversal');
        const outside=travel(cx+dx*64,cy+dy*64,-dx,-dy);
        assert(Math.abs(outside.x-cx+dx*32)<3&&Math.abs(outside.y-cy+dy*32)<3,room.id+' outward doorway traversal');doors++;
      }
      const cells=roomCells(room),checked=new Set();
      for(const [x,y]of boundaryCells(cells)) {
        if(openings.has(cellKey(x,y)))continue;
        const gid=map.layers.find(layer=>layer.name==='Architecture').data[y*map.width+x];
        const material=assetMaterial(gid);
        if(checked.has(material))continue;
        const inward=[[1,0],[-1,0],[0,1],[0,-1]].find(([dx,dy])=>cells.has(cellKey(x+dx,y+dy))&&!blocked(map,x+dx,y+dy));
        if(!inward)continue;
        const [dx,dy]=inward,sx=(x+.5+dx)*32,sy=(y+.5+dy)*32-11,result=travel(sx,sy,-dx,-dy);
        assert((result.x-sx)*-dx+(result.y-sy)*-dy<32,room.id+' '+material+' partition blocks actual Arcade body');walls++;checked.add(material);materials.add(material);
      }
    }
    assert(['solid','glass','half'].every(m=>materials.has(m)),'Each layout probes all three partition materials');
    const laneObjects=map.layers.find(layer=>layer.name==='PassageLanes').objects,lanes=new Set();
    for(const p of laneObjects)for(const [x,y]of rectangleCells([p.x/32,p.y/32,p.width/32,p.height/32])){assert(!blocked(map,x,y),'Protected corridor lane stays clear');lanes.add(y*map.width+x);}
    const routes=[];
    for(const i of lanes)for(const [dx,dy]of[[1,0],[0,1]]) {
      const x=i%map.width,y=Math.floor(i/map.width);if(lanes.has((y-dy)*map.width+x-dx))continue;
      let length=0;while(length<8&&lanes.has((y+dy*length)*map.width+x+dx*length))length++;
      if(length>=3)routes.push({x,y,dx,dy,length});
    }
    const chosen=[];for(const dx of[1,0])chosen.push(...routes.filter(r=>r.dx===dx).sort((a,b)=>b.length-a.length).slice(0,3));
    for(const r of chosen){const x=(r.x+.5)*32,y=(r.y+.5)*32-11,result=travel(x,y,r.dx,r.dy,16*(r.length-1));assert(Math.abs(result.x-x-r.dx*(r.length-1)*32)<3&&Math.abs(result.y-y-r.dy*(r.length-1)*32)<3,'Actual Arcade foot body traverses decorated corridor lane');}
    assert(chosen.length>=2,'Both narrow and wider passage lane runs are exercised');
    const placed=map.layers.find(layer=>layer.name==='Placements').objects.filter(p=>p.type==='passage');assert(placed.length>0,'Freestanding passage props render');
    for(const p of placed.slice(0,2)) {
      const [x,y]=[p.x/32,p.y/32],inward=[[1,0],[-1,0],[0,1],[0,-1]].find(([dx,dy])=>!blocked(map,x+dx,y+dy));if(!inward)continue;
      const [dx,dy]=inward,sx=(x+.5+dx)*32,sy=(y+.5+dy)*32-11,result=travel(sx,sy,-dx,-dy);
      assert((result.x-sx)*-dx+(result.y-sy)*-dy<32,'Passage prop uses actual Arcade collision');
    }
    return {layout:config.layout,doors,walls,materials:[...materials],body:[sprite.body.width,sprite.body.height],detailTiles,atlas:[image.width,image.height],passageRoutes:chosen.length,passageProps:placed.length};
  } finally {collider.destroy();sprite.destroy();world.postUpdate();}
}
