import {mkdirSync,writeFileSync,mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {collectionCatalog} from '../packages/shared/src/environment/collection-catalog.ts';
import {collectionGroups} from '../packages/shared/src/environment/collection.ts';
import {environmentAtlas} from '../packages/shared/src/environment/assets.ts';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'docs/assets/phase03-collection');mkdirSync(out,{recursive:true});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
async function capture(browser,profile,file,target){
  const child=spawn(browser,['--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--hide-scrollbars','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});let socket;
  try{
    let port,page;for(let i=0;i<150&&!page;i++){try{port=readFileSync(resolve(profile,'DevToolsActivePort'),'utf8').split('\n')[0];page=(await(await fetch('http://127.0.0.1:'+port+'/json')).json()).find(p=>p.type==='page');}catch{}if(!page)await delay(100);}if(!page)throw Error('Contact browser did not initialize');
    socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(done=>socket.addEventListener('open',done,{once:true}));let serial=0;const pending=new Map();socket.addEventListener('message',e=>{const result=JSON.parse(String(e.data)),entry=pending.get(result.id);if(entry){pending.delete(result.id);clearTimeout(entry.timer);result.error?entry.reject(Error(result.error.message)):entry.resolve(result.result);}});
    const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error('Contact command timed out '+method)),15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error('Contact page evaluation failed');return r.result.value;};
    await command('Page.enable');await command('Emulation.setDeviceMetricsOverride',{width:1980,height:2220,deviceScaleFactor:1,mobile:false});await command('Page.navigate',{url:pathToFileURL(file).href});
    for(let i=0;i<100&&!await evaluate("document.readyState==='complete'&&document.querySelectorAll('.asset').length===90");i++)await delay(80);
    await evaluate("new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(true);i.onerror=()=>reject(Error('Atlas failed to load'));i.src=getComputedStyle(document.querySelector('.sprite')).backgroundImage.slice(5,-2)})");
    const height=await evaluate('document.documentElement.scrollHeight');await command('Emulation.setDeviceMetricsOverride',{width:1980,height,deviceScaleFactor:1,mobile:false});await delay(100);
    writeFileSync(target,Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));
  }finally{socket?.close();child.kill();await delay(200);}
}
writeFileSync(resolve(out,'catalog.json'),JSON.stringify(collectionCatalog,null,2)+'\n');
writeFileSync(resolve(out,'catalog.md'),'# Phase 03 original asset catalog\n\n90 unique designs; cardinal frames and five theme palettes are not counted as new designs.\n\n'+collectionGroups.map(g=>'## '+g+'\n\n| Stable ID | Name | Native pixels | Placement | Seats | Orientations |\n| --- | --- | --- | --- | --- | --- |\n'+collectionCatalog.filter(a=>a.collection===g).map(a=>`| ${a.id} | ${a.label} | ${a.width}×${a.height} | ${a.mode} | ${a.seats.length} | ${a.orientations.join(', ')} |`).join('\n')).join('\n\n')+'\n');
for(const theme of ['warm-wood','dark-tech','eco-green']){
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Phase 03 · ${theme}</title><style>
  *{box-sizing:border-box}body{margin:0;padding:26px 30px;background:#182b32;color:#f2eddf;font:14px Arial;width:1980px}h1{font-size:27px;margin:0 0 8px}header p{margin:0 0 18px;color:#c5d1c9}h2{font-size:16px;margin:0;padding:9px 0;color:#e8cd98}.group{display:grid;grid-template-columns:repeat(9,1fr);gap:8px;margin-bottom:10px}.asset{height:157px;background:#e4e4da;border:1px solid #9bada9;border-radius:7px;color:#223b40;text-align:center;padding:7px}.art{height:93px;display:grid;place-items:center}.sprite{image-rendering:pixelated;flex:none}.name{font-weight:600;font-size:12px;line-height:15px;height:30px;display:grid;place-items:center}.meta{font-size:10px;color:#536963;margin-top:3px}footer{font-size:12px;color:#bbc9c4;margin-top:12px}
  </style><header><h1>Premium office collection · 90 original designs</h1><p>${theme} · native top-down pixel artwork · 10 categories × 9 designs · theme palettes and orientation frames excluded from count</p></header>${collectionGroups.map((g,i)=>`<h2>${String(i+1).padStart(2,'0')} · ${escape(g)}</h2><section class="group">${collectionCatalog.filter(a=>a.collection===g).map(a=>{const scale=Math.min(2,184/a.width,90/a.height),r=a.atlas;return`<article class="asset" data-asset="${a.id}"><div class="art"><div class="sprite" style="width:${a.width*scale}px;height:${a.height*scale}px;background-image:url('../../../apps/web/public/office/environments/${theme}.png');background-size:${environmentAtlas.width*scale}px ${environmentAtlas.height*scale}px;background-position:-${r[0]*scale}px -${r[1]*scale}px"></div></div><div class="name">${escape(a.label)}</div><div class="meta">${a.width}×${a.height} · ${a.mode}${a.seats.length?' · '+a.seats.length+' seat'+(a.seats.length===1?'':'s'):''}</div></article>`;}).join('')}</section>`).join('')}<footer>Original local artwork. Displays, check-in and recreation equipment are decorative; no unavailable service or game actions are advertised.</footer></html>`;
  const file=resolve(out,'contact-'+theme+'.html');writeFileSync(file,html);
  if(process.argv.includes('--capture')){
    const browser=process.env.OFFICE_TEST_BROWSER;if(!browser)throw Error('Set OFFICE_TEST_BROWSER to the installed Chromium browser.');
    const cache=resolve(root,'.cache');mkdirSync(cache,{recursive:true});const profile=mkdtempSync(resolve(cache,'collection-contact-'));
    try{await capture(browser,profile,file,resolve(out,'contact-'+theme+'.png'));}
    finally{if(profile.startsWith(cache+sep))try{rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{/* Browser may briefly retain its isolated profile. */}}
  }
}
console.log('Generated 90-entry catalog and three themed contact sheets'+(process.argv.includes('--capture')?' with PNG captures.':'.'));
