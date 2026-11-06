import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {decodeArtwork,importOfficeArtwork} from './import-office-art.mjs';
import {fixtures} from '../packages/shared/src/environment/rooms.ts';

// Encode real PNG rows with each filter to test artist exports, not just the
// generator's unfiltered output. CRCs are valid despite not used by our decoder.
function png(w,h,filter=0){
  const pixels=Buffer.from(Array.from({length:w*h*4},(_,i)=>(i*7+Math.floor(i/13))%256)),rows=Buffer.alloc((w*4+1)*h);
  const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
  for(let y=0;y<h;y++){rows[y*(w*4+1)]=filter;for(let x=0;x<w*4;x++){const i=y*w*4+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-w*4]:0,c=y&&x>=4?pixels[i-w*4-4]:0;rows[y*(w*4+1)+1+x]=(pixels[i]-[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
  const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(data.length+12);let crc=0xffffffff;for(const b of body){crc^=b;for(let n=0;n<8;n++)crc=crc>>>1^((crc&1)?0xedb88320:0);}out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;};
  const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;
  return{pixels,bytes:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])};
}
test('artist PNG import decodes all native RGBA filters and rejects incompatible dimensions/formats',()=>{
  for(let f=0;f<=4;f++){const source=png(64,32,f);assert.deepEqual(decodeArtwork(source.bytes,64,32),source.pixels);assert.throws(()=>decodeArtwork(source.bytes,32,64),/exact-size/);}
  const source=png(64,32).bytes;source[25]=2;assert.throws(()=>decodeArtwork(source,64,32),/RGBA8/);assert.throws(()=>decodeArtwork(Buffer.alloc(2_000_001),1,1),/bounded PNG/);
});
test('offline artwork manifest enforces provenance, digest and exact crop without modifying adjacent sprites',()=>{
  const cache=resolve('.cache');mkdirSync(cache,{recursive:true});const root=mkdtempSync(resolve(cache,'art-import-'));
  try{
    const source=png(64,32,4),file=resolve(root,'art.png'),manifest=resolve(root,'manifest.json');writeFileSync(file,source.bytes);
    const entry={assetId:'windowPanel',theme:'warm-wood',file:'art.png',license:'original',author:'Local synthetic test',source:'Generated within this test',sha256:createHash('sha256').update(source.bytes).digest('hex')};
    const art={pixels:Buffer.alloc(512*1024*4,17)};writeFileSync(manifest,JSON.stringify([entry]));assert.equal(importOfficeArtwork(art,'warm-wood',manifest),1);
    const[x,y]=fixtures.windowPanel;assert.deepEqual(art.pixels.subarray((y*512+x)*4,(y*512+x+64)*4),source.pixels.subarray(0,64*4));assert.equal(art.pixels[0],17);
    writeFileSync(manifest,JSON.stringify([{...entry,sha256:'0'.repeat(64)}]));assert.throws(()=>importOfficeArtwork(art,'warm-wood',manifest),/hash/);
    writeFileSync(manifest,JSON.stringify([{...entry,author:''}]));assert.throws(()=>importOfficeArtwork(art,'warm-wood',manifest),/provenance/);
    writeFileSync(manifest,JSON.stringify([entry,entry]));assert.throws(()=>importOfficeArtwork(art,'warm-wood',manifest),/Duplicate/);
  }finally{const checked=resolve(root);if(!checked.startsWith(cache+sep))throw Error('Unsafe temporary path');rmSync(checked,{recursive:true,force:true});}
});
