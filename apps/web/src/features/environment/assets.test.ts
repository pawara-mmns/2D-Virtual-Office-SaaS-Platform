import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { assetDefinitions, assetTile, environmentAtlas, expandedFixtures, type AssetSpec, type ExpandedAsset } from '../../../../../packages/shared/src/environment/assets.ts';
import { defaultEnvironment, layouts, themes, decorPacks, furnitureSets } from '../../../../../packages/shared/src/environment/catalog.ts';
import { composeEnvironment } from '../../../../../packages/shared/src/environment/compose.ts';
import { rectangleCells } from '../../../../../packages/shared/src/environment/architecture.ts';
import { tileLayer, validateOfficeMap, type OfficeMap } from '../../../../../packages/shared/src/map.ts';

const objects=(map:OfficeMap,name:string)=>{const layer=map.layers.find(l=>l.name===name);return layer?.type==='objectgroup'?layer.objects:[];};

test('all expanded assets are integrated into room recipes or architectural tiles, with ten populated content categories',()=>{
  const used=new Set<string>(),categories=new Set(Object.values(assetDefinitions).map(a=>a.category));
  assert.ok(Object.keys(assetDefinitions).length>=80);assert.equal(categories.size,10);
  for(const layout of layouts)for(const theme of themes)for(const decor of decorPacks)for(const furniture of furnitureSets) {
    const map=composeEnvironment({...defaultEnvironment,layout:layout.id,theme:theme.id,decor:decor.id,furniture:furniture.id});
    const placed=objects(map,'Placements');
    for(const [room,required]of Object.entries({pantry:['pantryCounter','pantry'],reception:['receptionFormal','receptionCurve','reception'],meeting:['tableSmall','tableMedium','tableLarge'],utility:['copier','printerStand','printer']}))assert.ok(placed.some(p=>p.type===room&&required.includes(p.name)),layout.id+' '+theme.id+' '+room+' retains its essential fixture');
    for(const p of [...objects(map,'Placements'),...objects(map,'Decorations')]) {
      used.add(p.name);
      if(p.name==='serverRack'){assert.equal(p.type,'utility');assert.equal(theme.id,'dark-tech');}
      if(p.name==='brochureStand')assert.ok(['reception','passage'].includes(p.type));
      if(p.name==='brandingFeature')assert.equal(p.type,'reception');
      if(p.name==='conferenceDevice')assert.equal(p.type,'meeting');
      if(p.name==='podium'||p.name==='projectorTable'||p.name==='classroomDesk')assert.equal(p.type,'training');
    }
    const visible=new Set([...tileLayer(map,'Floor').data,...tileLayer(map,'Architecture').data]);
    for(const [id,definition]of Object.entries(assetDefinitions))if(definition.mode==='structure'&&visible.has(assetTile(id as ExpandedAsset)))used.add(id);
  }
  assert.deepEqual(Object.keys(assetDefinitions).filter(id=>!used.has(id)),[],'No unused expansion sprites');
});

test('wall and desktop details render only on their valid supports and never introduce collision tiles',()=>{
  for(const layout of layouts)for(const theme of themes) {
    const map=composeEnvironment({...defaultEnvironment,layout:layout.id,theme:theme.id,decor:'rich'}),decorations=objects(map,'Decorations');
    assert.ok(decorations.length>=15,'Detailed rooms use meaningful mounted/surface props');
    for(const p of decorations) {
      const definition=assetDefinitions[p.name as ExpandedAsset] as AssetSpec;assert.ok(['wall','surface'].includes(definition.mode));
      const support=tileLayer(map,definition.mode==='wall'?'Architecture':'Furniture').data;
      for(const [x,y]of rectangleCells([p.x/32,p.y/32,p.width!/32,p.height!/32])) {
        const i=y*map.width+x;assert.ok(support[i]);assert.equal(tileLayer(map,'Collision').data[i],1,'Collision belongs to the existing support');assert.ok(tileLayer(map,'Details').data[i]);
      }
    }
    for(const [i,gid]of tileLayer(map,'Details').data.entries())if(gid)assert.ok(tileLayer(map,'Architecture').data[i]||tileLayer(map,'Furniture').data[i],'Detail alone cannot create an obstacle');
  }
});

test('controlled theme and furniture choices produce repeatable, visibly different workstation recipes',()=>{
  const recipes=new Set<string>();
  for(const theme of themes) {
    const config={...defaultEnvironment,theme:theme.id,decor:'rich' as const};
    const map=composeEnvironment(config),names=objects(map,'Placements').filter(p=>p.type==='work').map(p=>p.name);
    recipes.add(JSON.stringify(names));assert.deepEqual(map,composeEnvironment(structuredClone(config)));
  }
  assert.ok(recipes.size>=3);
  const sets=new Set(furnitureSets.map(f=>JSON.stringify(objects(composeEnvironment({...defaultEnvironment,furniture:f.id}),'Placements').filter(p=>p.type==='work').map(p=>p.name))));assert.equal(sets.size,3);
});

test('expanded atlas bounds are explicit while the legacy map retains its original tile limit',()=>{
  const legacy=JSON.parse(readFileSync(new URL('../../../public/office/studio.json',import.meta.url),'utf8')) as OfficeMap;validateOfficeMap(legacy);
  tileLayer(legacy,'Furniture').data[100]=129;assert.throws(()=>validateOfficeMap(legacy),/tiles/);
  const map=composeEnvironment(defaultEnvironment);assert.equal(map.tilesets[0]!.tilecount,environmentAtlas.tileCount);
  tileLayer(map,'Details').data[100]=environmentAtlas.tileCount+1;assert.throws(()=>validateOfficeMap(map),/tiles/);
  const bad=composeEnvironment(defaultEnvironment);bad.tilesets[0]!.imageheight=256;assert.throws(()=>validateOfficeMap(bad),/atlas/);
});

// The local PNG encoder emits RGBA8 scanlines with filter zero. Decode the real
// generated files to catch blank, duplicated, missing or clipped atlas entries.
test('all five generated atlases contain distinct original artwork for every expanded asset',()=>{
  for(const theme of themes) {
    const png=readFileSync(new URL('../../../public/office/environments/'+theme.id+'.png',import.meta.url));
    assert.equal(png.readUInt32BE(16),environmentAtlas.width);assert.equal(png.readUInt32BE(20),environmentAtlas.height);assert.equal(png[24],8);assert.equal(png[25],6);
    const chunks:Buffer[]=[];for(let offset=8;offset<png.length;){const size=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);if(type==='IDAT')chunks.push(png.subarray(offset+8,offset+8+size));offset+=size+12;}
    const raw=inflateSync(Buffer.concat(chunks)),stride=environmentAtlas.width*4+1,hashes=new Map<string,string>();
    for(let row=0;row<environmentAtlas.height;row++)assert.equal(raw[row*stride],0);
    for(const [id,[x,y,w,h]]of Object.entries(expandedFixtures)) {
      const crop=Buffer.alloc(w*h*4);for(let row=0;row<h;row++)raw.copy(crop,row*w*4,(y+row)*stride+1+x*4,(y+row)*stride+1+(x+w)*4);
      let visible=0;for(let i=3;i<crop.length;i+=4)if(crop[i])visible++;assert.ok(visible>8,theme.id+' '+id+' has visible art');
      const hash=createHash('sha256').update(w+','+h+':').update(crop).digest('hex');assert.ok(!hashes.has(hash),id+' duplicates '+hashes.get(hash));hashes.set(hash,id);
    }
  }
});
