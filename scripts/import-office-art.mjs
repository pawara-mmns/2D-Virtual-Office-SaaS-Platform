import {readFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {fixtures} from '../packages/shared/src/environment/rooms.ts';
import {directionalChairRects} from '../packages/shared/src/environment/assets.ts';

// Offline, exact-size RGBA PNG import. Repack art only; metadata/collision never
// comes from an image or downloaded manifest. No resampling and no runtime URLs.
export function decodeArtwork(png,w,h){
  if(png.length>2_000_000||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Expected a bounded PNG');
  if(png.readUInt32BE(16)!==w||png.readUInt32BE(20)!==h||png[24]!==8||png[25]!==6||png[26]||png[27]||png[28])throw Error('Artwork must be exact-size non-interlaced RGBA8');
  const chunks=[];for(let p=8;p<png.length;){const n=png.readUInt32BE(p),kind=png.toString('ascii',p+4,p+8);if(p+n+12>png.length)throw Error('Truncated artwork');if(kind==='IDAT')chunks.push(png.subarray(p+8,p+8+n));p+=n+12;}
  const stride=w*4,raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:(stride+1)*h}),pixels=Buffer.alloc(stride*h);
  if(raw.length!==(stride+1)*h)throw Error('Invalid artwork scanline count');
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<h;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('Unsupported PNG filter');for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-stride]:0,c=y&&x>=4?pixels[i-stride-4]:0;pixels[i]=(raw[y*(stride+1)+x+1]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}}
  return pixels;
}
export function importOfficeArtwork(art,theme,manifest=fileURLToPath(new URL('../assets/office/imports/manifest.json',import.meta.url))){
  if(!existsSync(manifest))return 0;
  const entries=JSON.parse(readFileSync(manifest,'utf8'));if(!Array.isArray(entries)||entries.length>512)throw Error('Invalid office artwork manifest');
  const root=realpathSync(dirname(manifest)),seen=new Set();let count=0;
  for(const entry of entries){
    if(!entry||!['original','CC0','licensed'].includes(entry.license)||typeof entry.author!=='string'||!entry.author.trim()||typeof entry.source!=='string'||!entry.source.trim()||typeof entry.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(entry.sha256))throw Error('Artwork needs provenance, license and SHA256');
    if(entry.theme!==theme)continue;
    const rect=entry.facing?directionalChairRects[entry.assetId]?.[entry.facing]:fixtures[entry.assetId];
    if(!rect||typeof entry.file!=='string'||!entry.file.endsWith('.png'))throw Error('Unknown artwork target');
    const key=entry.assetId+':'+(entry.facing??'base');if(seen.has(key))throw Error('Duplicate artwork target');seen.add(key);
    const file=realpathSync(resolve(root,entry.file));if(!file.startsWith(root+sep))throw Error('Artwork path escapes import directory');
    const png=readFileSync(file);if(createHash('sha256').update(png).digest('hex')!==entry.sha256)throw Error('Artwork hash mismatch');
    const [x,y,w,h]=rect,pixels=decodeArtwork(png,w,h);
    for(let row=0;row<h;row++)pixels.copy(art.pixels,((y+row)*512+x)*4,row*w*4,(row+1)*w*4);
    count++;
  }
  return count;
}
