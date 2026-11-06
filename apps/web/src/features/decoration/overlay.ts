import Phaser from 'phaser';
import {assetRect,editorAsset,resolvedObjects,composeDecoratedEnvironment,type DecorationDocument,type DecorationObject} from '../../../../../packages/shared/src/environment/decoration.ts';
import type {EnvironmentConfig} from '../../../../../packages/shared/src/environment/catalog.ts';
import {tileLayer,type OfficeMap} from '../../../../../packages/shared/src/map.ts';
export type EditorView={document:DecorationDocument;assetId:string|null;selectedId:string|null;preview:boolean};
export type EditorEvent={type:'select';id:string|null}|{type:'place';object:DecorationObject}|{type:'error';message:string};
// Pointer-frame work stays imperative in the existing scene. Whole-map/shared
// validation runs only at a committed edit, never for every drag sample.
export class DecorationOverlay{
  private state:EditorView|null=null;
  private map:OfficeMap;
  private objects:DecorationObject[]=[];
  private graphics:Phaser.GameObjects.Graphics;
  private ghost?:Phaser.GameObjects.Image;
  private hint:Phaser.GameObjects.Text;
  private drag?:{object:DecorationObject;dx:number;dy:number;startX:number;startY:number;moved:boolean};
  private pan?:{x:number;y:number;scrollX:number;scrollY:number};
  private candidate?:DecorationObject;
  private documentKey='';
  constructor(private scene:Phaser.Scene,private config:EnvironmentConfig,private live:OfficeMap,private draw:(map:OfficeMap)=>void,private emit:(event:EditorEvent)=>void){
    this.map=live;this.graphics=scene.add.graphics().setDepth(12);this.hint=scene.add.text(0,0,'',{fontFamily:'Arial',fontSize:'11px',backgroundColor:'#233c32',color:'#ffffff',padding:{x:6,y:4}}).setDepth(13).setVisible(false);
  }
  configure(state:EditorView|null){
    if(state&&this.state&&this.drag&&JSON.stringify(state.document)===this.documentKey&&state.assetId===this.state.assetId&&state.preview===this.state.preview){this.state=state;return;}
    this.state=state;this.drag=undefined;this.pan=undefined;this.candidate=undefined;this.ghost?.destroy();this.ghost=undefined;this.graphics.clear();this.hint.setVisible(false);
    if(!state){this.documentKey='';this.draw(this.live);return;}
    const key=JSON.stringify(state.document);
    if(key!==this.documentKey){this.documentKey=key;this.map=composeDecoratedEnvironment(this.config,state.document,0,false);this.objects=resolvedObjects(this.config,state.document);this.draw(this.map);}
    if(!state.preview){const o=this.objects.find(o=>o.id===state.selectedId);if(o)this.outline(o,true);}
  }
  private position(x:number,y:number){const p=this.scene.cameras.main.getWorldPoint(x,y);return{x:p.x,y:p.y};}
  private snapped(o:DecorationObject,x:number,y:number){return{...o,x:Math.round(x/32)*32,y:Math.round(y/32)*32};}
  private quickValid(o:DecorationObject){
    const a=editorAsset(o.assetId)!;if(o.x<0||o.y<0||o.x+a.width>this.map.width*32||o.y+a.height>this.map.height*32)return false;
    const original=this.objects.find(v=>v.id===o.id),old=original&&editorAsset(original.assetId)!,architecture=tileLayer(this.map,'Architecture').data,collision=tileLayer(this.map,'Collision').data;
    for(let y=0;y<a.height;y+=32)for(let x=0;x<a.width;x+=32){const px=o.x+x,py=o.y+y,i=py/32*this.map.width+px/32,own=original&&old&&px>=original.x&&px<original.x+old.width&&py>=original.y&&py<original.y+old.height;
      if(a.mode==='wall'?!architecture[i]:architecture[i]||a.mode==='blocking'&&collision[i]&&!own)return false;
    }return true;
  }
  private outline(o:DecorationObject,valid:boolean){const a=editorAsset(o.assetId)!;this.graphics.clear().fillStyle(valid?0x329773:0xce4d46,.18).fillRect(o.x,o.y,a.width,a.height).lineStyle(2,valid?0x76e3b1:0xff8e82).strokeRect(o.x,o.y,a.width,a.height);}
  private show(o:DecorationObject){
    this.candidate=o;const a=editorAsset(o.assetId)!,valid=this.quickValid(o),rect=assetRect(o.assetId,o.orientation);
    if(rect){const key=`editor-${o.assetId}-${o.orientation}`,texture=this.scene.textures.get('office-tiles');if(!texture.has(key))texture.add(key,0,...rect);if(!this.ghost)this.ghost=this.scene.add.image(o.x,o.y,'office-tiles',key).setOrigin(0).setAlpha(.65).setDepth(11);else this.ghost.setTexture('office-tiles',key).setPosition(o.x,o.y);}else{this.ghost?.destroy();this.ghost=undefined;}
    this.outline(o,valid);this.hint.setPosition(o.x,o.y+a.height+3).setText(valid?'Release to validate placement':'Invalid: wall, object or boundary').setVisible(true);
  }
  pointer(type:'down'|'move'|'up'|'cancel',x:number,y:number){
    if(!this.state)return;const p=this.position(x,y),camera=this.scene.cameras.main;
    if(type==='cancel'){this.configure(this.state);return;}
    if(type==='down'){
      if(this.state.preview){this.pan={x,y,scrollX:camera.scrollX,scrollY:camera.scrollY};return;}
      const asset=this.state.assetId&&editorAsset(this.state.assetId);
      if(asset){const object={id:'custom/'+crypto.randomUUID(),assetId:asset.id,x:0,y:0,orientation:asset.orientations[0]!};this.drag={object,dx:asset.width/2,dy:asset.height/2,startX:p.x,startY:p.y,moved:true};this.show(this.snapped(object,p.x-asset.width/2,p.y-asset.height/2));return;}
      const found=[...this.objects].reverse().find(o=>{const a=editorAsset(o.assetId)!;return p.x>=o.x&&p.y>=o.y&&p.x<o.x+a.width&&p.y<o.y+a.height;});
      this.emit({type:'select',id:found?.id??null});
      if(found)this.drag={object:found,dx:p.x-found.x,dy:p.y-found.y,startX:p.x,startY:p.y,moved:false};else this.pan={x,y,scrollX:camera.scrollX,scrollY:camera.scrollY};return;
    }
    if(type==='move'){
      if(this.pan){camera.setScroll(this.pan.scrollX-(x-this.pan.x)/camera.zoom,this.pan.scrollY-(y-this.pan.y)/camera.zoom);return;}
      if(this.drag){this.drag.moved||=Math.hypot(p.x-this.drag.startX,p.y-this.drag.startY)>3;this.show(this.snapped(this.drag.object,p.x-this.drag.dx,p.y-this.drag.dy));}
      else if(this.state.assetId){const a=editorAsset(this.state.assetId)!;this.show(this.snapped({id:'custom/00000000-0000-4000-8000-000000000001',assetId:a.id,x:0,y:0,orientation:a.orientations[0]!},p.x-a.width/2,p.y-a.height/2));}
      return;
    }
    if(this.drag?.moved&&this.candidate)this.emit({type:'place',object:this.candidate});
    this.drag=undefined;this.pan=undefined;this.ghost?.destroy();this.ghost=undefined;this.hint.setVisible(false);this.graphics.clear();
  }
  drop(assetId:string,x:number,y:number){if(!this.state||this.state.preview)return;const a=editorAsset(assetId);if(!a)return;const p=this.position(x,y);this.emit({type:'place',object:this.snapped({id:'custom/'+crypto.randomUUID(),assetId,x:0,y:0,orientation:a.orientations[0]!},p.x-a.width/2,p.y-a.height/2)});}
  destroy(){this.ghost?.destroy();this.graphics.destroy();this.hint.destroy();}
}
