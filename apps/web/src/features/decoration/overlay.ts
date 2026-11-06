import Phaser from 'phaser';
import {assetRect,editorAsset,resolvedObjects,composeDecoratedEnvironment,type DecorationDocument,type DecorationObject} from '../../../../../packages/shared/src/environment/decoration.ts';
import type {EnvironmentConfig} from '../../../../../packages/shared/src/environment/catalog.ts';
import {tileLayer,type OfficeMap} from '../../../../../packages/shared/src/map.ts';
import {objectsAt,type EditorCommand,type ScreenBounds} from './manipulation.ts';
import type {LiveSnapshot} from '../../../../../packages/shared/src/environment/live-decoration.ts';
export type EditorView={document:DecorationDocument;assetId:string|null;selectedId:string|null;preview:boolean;carry?:{object:DecorationObject;sourceId:string}|null;movingId?:string|null};
export type EditorEvent={type:'select';id:string|null;covered?:boolean}|{type:'place';object:DecorationObject}|{type:'error';message:string}|{type:'anchor';bounds:ScreenBounds;visible:boolean}|{type:'live';snapshot:LiveSnapshot};
export type EditorPointer={pan?:boolean;alt?:boolean;touch?:boolean};
export class DecorationOverlay{
  private state:EditorView|null=null;
  private map:OfficeMap;
  private objects:DecorationObject[]=[];
  private graphics:Phaser.GameObjects.Graphics;
  private hover:Phaser.GameObjects.Graphics;
  private ghost?:Phaser.GameObjects.Image;
  private hint:Phaser.GameObjects.Text;
  private drag?:{object:DecorationObject;dx:number;dy:number;startX:number;startY:number;moved:boolean;armed:boolean};
  private pan?:{x:number;y:number;scrollX:number;scrollY:number};
  private candidate?:DecorationObject;
  private documentKey='';
  private hoverId='';
  private selectedStack:DecorationObject[]=[];
  private alpha?:Uint8ClampedArray;
  private alphaWidth=0;
  private anchorKey='';
  private toolOrientation:DecorationObject['orientation']='down';
  private hostRect?:DOMRect;
  constructor(private scene:Phaser.Scene,private config:EnvironmentConfig,private live:OfficeMap,private draw:(map:OfficeMap)=>void,private emit:(event:EditorEvent)=>void){
    this.map=live;this.graphics=scene.add.graphics().setDepth(12);this.hover=scene.add.graphics().setDepth(10);
    this.hint=scene.add.text(0,0,'',{fontFamily:'Arial',fontSize:'11px',backgroundColor:'#233c32',color:'#ffffff',padding:{x:6,y:4}}).setDepth(13).setVisible(false);
  }
  configure(state:EditorView|null){
    const old=this.state,key=state&&JSON.stringify(state.document);
    if(state&&old&&(this.drag||this.pan)&&key===this.documentKey&&state.assetId===old.assetId&&state.preview===old.preview&&state.carry?.object.id===old.carry?.object.id&&state.movingId===old.movingId){this.state=state;return;}
    this.state=state;this.clearGesture();this.hover.clear();this.hoverId='';this.anchorKey='';
    if(!state){this.documentKey='';this.draw(this.live);this.cursor('');return;}
    if(state.assetId!==old?.assetId)this.toolOrientation=editorAsset(state.assetId??'')?.orientations[0]??'down';
    if(state.carry&&state.carry.object.id!==old?.carry?.object.id)this.toolOrientation=state.carry.object.orientation;
    if(state.movingId&&state.movingId!==old?.movingId)this.toolOrientation=this.objects.find(o=>o.id===state.movingId)?.orientation??'down';
    if(key!==this.documentKey){this.documentKey=key!;this.map=composeDecoratedEnvironment(this.config,state.document,0,false);this.objects=resolvedObjects(this.config,state.document);this.draw(this.map);}
    const selected=this.objects.find(o=>o.id===state.selectedId);if(selected&&!state.preview)this.outline(selected,true);
    this.cursor(state.preview?'grab':state.assetId||state.carry||state.movingId?'crosshair':selected?'grab':'default');this.update();
  }
  private cursor(value:string){const host=this.scene.game.canvas.parentElement;if(host)host.style.cursor=value;}
  private clearGesture(){this.drag=undefined;this.pan=undefined;this.candidate=undefined;this.ghost?.destroy();this.ghost=undefined;this.graphics.clear();this.hint.setVisible(false);}
  private position(x:number,y:number){const p=this.scene.cameras.main.getWorldPoint(x,y);return{x:p.x,y:p.y};}
  private snapped(o:DecorationObject,x:number,y:number){return{...o,x:Math.round(x/32)*32,y:Math.round(y/32)*32};}
  private opaque=(o:DecorationObject,x:number,y:number)=>{
    const a=editorAsset(o.assetId)!;if(a.mode==='floor')return true;
    if(!this.alpha){const source=this.scene.textures.get('office-tiles').getSourceImage() as HTMLImageElement,canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return false;context.drawImage(source,0,0);this.alphaWidth=canvas.width;this.alpha=context.getImageData(0,0,canvas.width,canvas.height).data;}
    const r=assetRect(o.assetId,o.orientation);return!!r&&this.alpha[((r[1]+y)*this.alphaWidth+r[0]+x)*4+3]!>16;
  };
  private quickValid(o:DecorationObject){
    const a=editorAsset(o.assetId)!;if(o.x<0||o.y<0||o.x+a.width>this.map.width*32||o.y+a.height>this.map.height*32)return false;
    const original=this.objects.find(v=>v.id===o.id),old=original&&editorAsset(original.assetId)!,architecture=tileLayer(this.map,'Architecture').data,collision=tileLayer(this.map,'Collision').data;
    for(let y=0;y<a.height;y+=32)for(let x=0;x<a.width;x+=32){const px=o.x+x,py=o.y+y,i=py/32*this.map.width+px/32,own=original&&old&&px>=original.x&&px<original.x+old.width&&py>=original.y&&py<original.y+old.height;
      if(a.mode==='wall'?!architecture[i]:architecture[i]||a.mode==='blocking'&&collision[i]&&!own)return false;
    }return true;
  }
  private outline(o:DecorationObject,valid:boolean){const a=editorAsset(o.assetId)!;this.graphics.clear().fillStyle(valid?0x329773:0xce4d46,.10).fillRect(o.x,o.y,a.width,a.height).lineStyle(2,valid?0x76e3b1:0xff8e82).strokeRect(o.x,o.y,a.width,a.height);}
  private show(o:DecorationObject){
    this.candidate=o;const a=editorAsset(o.assetId)!,valid=this.quickValid(o),rect=assetRect(o.assetId,o.orientation);
    if(rect){const key=`editor-${o.assetId}-${o.orientation}`,texture=this.scene.textures.get('office-tiles');if(!texture.has(key))texture.add(key,0,...rect);if(!this.ghost)this.ghost=this.scene.add.image(o.x,o.y,'office-tiles',key).setOrigin(0).setAlpha(.65).setDepth(11);else this.ghost.setTexture('office-tiles',key).setPosition(o.x,o.y);}else{this.ghost?.destroy();this.ghost=undefined;}
    this.ghost?.setVisible(true);this.outline(o,valid);this.hint.setPosition(o.x,o.y+a.height+3).setText(valid?(this.drag?'Release to place':'Click to place'):'Choose a clear position').setVisible(true);this.cursor(this.drag?'grabbing':'crosshair');
  }
  private tool(){
    if(this.state?.carry)return{...this.state.carry.object,orientation:this.toolOrientation};
    if(this.state?.movingId){const object=this.objects.find(o=>o.id===this.state?.movingId);return object?{...object,orientation:this.toolOrientation}:undefined;}
    const a=editorAsset(this.state?.assetId??'');return a?{id:'custom/00000000-0000-4000-8000-000000000001',assetId:a.id,x:0,y:0,orientation:this.toolOrientation}:undefined;
  }
  pointer(type:'down'|'move'|'up'|'cancel'|'leave',x:number,y:number,options:EditorPointer={}){
    if(!this.state)return;const p=this.position(x,y),camera=this.scene.cameras.main;
    if(type==='leave'){this.hover.clear();this.hoverId='';if(!this.drag){this.ghost?.setVisible(false);this.hint.setVisible(false);}return;}
    if(type==='cancel'){this.command('cancel');return;}
    if(type==='down'){
      if(this.state.preview||options.pan){this.pan={x,y,scrollX:camera.scrollX,scrollY:camera.scrollY};this.cursor('grabbing');return;}
      const tool=this.tool();if(tool){const a=editorAsset(tool.assetId)!,object={...tool,id:this.state.assetId?'custom/'+crypto.randomUUID():tool.id};this.drag={object,dx:a.width/2,dy:a.height/2,startX:p.x,startY:p.y,moved:true,armed:true};this.show(this.snapped(object,p.x-a.width/2,p.y-a.height/2));return;}
      const hits=objectsAt(this.objects,p,this.opaque),index=hits.findIndex(o=>o.id===this.state?.selectedId),found=options.alt?hits[(index+1)%hits.length]:hits[0];this.selectedStack=hits;
      const armed=!options.touch||this.state.selectedId===found?.id;this.emit({type:'select',id:found?.id??null,covered:hits.length>1});
      if(found){this.outline(found,true);this.drag={object:found,dx:p.x-found.x,dy:p.y-found.y,startX:p.x,startY:p.y,moved:false,armed};}else this.pan={x,y,scrollX:camera.scrollX,scrollY:camera.scrollY};return;
    }
    if(type==='move'){
      if(this.pan){camera.setScroll(this.pan.scrollX-(x-this.pan.x)/camera.zoom,this.pan.scrollY-(y-this.pan.y)/camera.zoom);return;}
      if(this.drag){if(this.drag.armed){this.drag.moved||=Math.hypot(p.x-this.drag.startX,p.y-this.drag.startY)>3;if(this.drag.moved)this.show(this.snapped(this.drag.object,p.x-this.drag.dx,p.y-this.drag.dy));}return;}
      if(this.state.preview)return;
      const tool=this.tool();if(tool){const a=editorAsset(tool.assetId)!;this.show(this.snapped(tool,p.x-a.width/2,p.y-a.height/2));return;}
      const found=objectsAt(this.objects,p,this.opaque)[0];this.cursor(options.pan?'grab':found?'grab':'default');
      if(this.hoverId!==(found?.id??'')){this.hoverId=found?.id??'';this.hover.clear();if(found&&found.id!==this.state.selectedId){const a=editorAsset(found.assetId)!;this.hover.lineStyle(1,0xf6fff7,.8).strokeRect(found.x,found.y,a.width,a.height);}}
      return;
    }
    const candidate=this.drag?.moved?this.candidate:undefined;this.clearGesture();if(candidate)this.emit({type:'place',object:candidate});const selected=this.objects.find(o=>o.id===this.state?.selectedId);if(selected)this.outline(selected,true);this.cursor(this.tool()?'crosshair':selected?'grab':'default');this.update();
  }
  command(command:EditorCommand){
    if(command==='cancel'){this.clearGesture();this.hover.clear();this.hoverId='';this.cursor('default');this.anchorKey='';this.update();return true;}
    if(command==='cycle'){const stack=this.selectedStack,index=stack.findIndex(o=>o.id===this.state?.selectedId),next=stack[(index+1)%stack.length];if(next){this.emit({type:'select',id:next.id,covered:stack.length>1});return true;}return false;}
    const source=this.candidate??this.tool();if(!source||(!this.drag&&!this.state?.assetId&&!this.state?.carry&&!this.state?.movingId))return false;
    const a=editorAsset(source.assetId)!;if(a.orientations.length<2){this.emit({type:'error',message:'This item keeps its drawn orientation.'});return true;}
    const orientation=a.orientations[(a.orientations.indexOf(source.orientation)+1)%a.orientations.length]!;this.toolOrientation=orientation;if(this.drag)this.drag.object.orientation=orientation;this.show({...source,orientation});return true;
  }
  update(){
    if(!this.state)return;const o=this.objects.find(o=>o.id===this.state?.selectedId),visible=!!o&&!this.drag?.moved&&!this.state.preview&&!this.state.carry&&!this.state.movingId;
    let bounds:ScreenBounds={left:0,top:0,width:0,height:0};
    if(o){const a=editorAsset(o.assetId)!,camera=this.scene.cameras.main,r=this.hostRect??=this.scene.game.canvas.getBoundingClientRect(),p=camera.getWorldPoint(0,0),q=camera.getWorldPoint(camera.width,camera.height);bounds={left:r.left+(o.x-p.x)/(q.x-p.x)*r.width,top:r.top+(o.y-p.y)/(q.y-p.y)*r.height,width:a.width/(q.x-p.x)*r.width,height:a.height/(q.y-p.y)*r.height};}
    const shown=visible&&bounds.left+bounds.width>0&&bounds.top+bounds.height>0&&bounds.left<innerWidth&&bounds.top<innerHeight,key=[o?.id,shown,...Object.values(bounds).map(Math.round)].join(':');
    if(key!==this.anchorKey){this.anchorKey=key;this.emit({type:'anchor',bounds,visible:shown});}
  }
  invalidateView(){this.hostRect=undefined;this.anchorKey='';}
  setLive(map:OfficeMap){this.live=map;if(!this.state)this.draw(map);}
  drop(assetId:string,x:number,y:number){if(!this.state||this.state.preview)return;const a=editorAsset(assetId);if(!a)return;const p=this.position(x,y);this.emit({type:'place',object:this.snapped({id:'custom/'+crypto.randomUUID(),assetId,x:0,y:0,orientation:a.orientations[0]!},p.x-a.width/2,p.y-a.height/2)});}
  destroy(){this.ghost?.destroy();this.graphics.destroy();this.hover.destroy();this.hint.destroy();this.alpha=undefined;this.cursor('');}
}
