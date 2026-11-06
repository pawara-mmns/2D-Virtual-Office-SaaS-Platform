import { environmentPaint } from "../../../../../../packages/shared/src/environment/visuals.ts";
import type { EnvironmentConfig } from "../../../../../../packages/shared/src/environment/catalog.ts";
import Phaser from "phaser";
import { mapMarkers, TILE_SIZE, validateOfficeMap, type OfficeMap } from "../maps/map-data.ts";
import { clampOfficeZoom, findOfficeTeammate, fitOfficeZoom, isMapPosition, nextOfficeZoom, zoomLevels, type CameraCommand, type NavigationState, type OfficeArea } from "../engine/camera.ts";
import { avatarDisplayName } from "../../avatars/presets.ts";
import { PlayerAvatar } from "../engine/player-avatar.ts";
import type { AvatarAppearance } from "../../avatars/presets.ts";
import { mapVersion, type OfficeNetwork, type PlayerSnapshot } from "../../../../../../packages/shared/src/protocol.ts";
import { movement, runningIntent } from "../input/movement.ts";
import { VoiceBubbles, type BubbleAnchor } from '../engine/voice-bubbles.ts';
import { interactionRegistry, closestInteraction, type Interactable, type PrimaryInteraction } from '../../../../../../packages/shared/src/interactions.ts';
import { advanceMovement } from '../../../../../../packages/shared/src/movement.ts';
import { createSeating } from '../../../../../../packages/shared/src/seating.ts';
import {isChairAsset} from '../../../../../../packages/shared/src/environment/seating-metadata.ts';
import {directionalChairRects} from '../../../../../../packages/shared/src/environment/assets.ts';
import {composeOfficeEnvironment,type PublishedDecoration} from '../../../../../../packages/shared/src/environment/decoration.ts';
import {tileLayer} from '../../../../../../packages/shared/src/map.ts';
import {DecorationOverlay,type EditorView,type EditorEvent} from '../../decoration/overlay.ts';

export type OfficeCallbacks = { onReady(mapVersion?: string): void; onError(): void; onNavigation?(state: NavigationState): void; onReducedEffects?(reduced: boolean): void; onBubbleAnchors?(anchors: BubbleAnchor[]): void; onInteraction?(value:PrimaryInteraction|null):void;onDecoration?(event:EditorEvent):void };
export class OfficeScene extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Sprite;
  avatar!: PlayerAvatar;
  private failed = false;
  private mapWidth = 0;
  private mapHeight = 0;
  private network?: OfficeNetwork;
  private remotes = new Map<string, PlayerAvatar>();
  private bubbles?: VoiceBubbles;
  private areas: (OfficeArea & { x: number; y: number })[] = [];
  private mode: NavigationState["mode"] = "self";
  private areaId: string | null = null;
  private teammate: string | null = null;
  private fitMode = false;
  private followZoom = 2;
  private reducedMotion = false;
  private wheelZoomTarget: number | null = null;
  private wheelDirection = 0;
  private highlight?: Phaser.GameObjects.Graphics;
  private navigationKey = "";
  private notice = "";
  private positionsUnavailable = false;
  private readonly movementInput = { x: 0, y: 0, facing: "down" as const };
  private geometry?:OfficeMap;
  private interactables:Interactable[]=[];
  private primary:PrimaryInteraction|null=null;
  private primaryKey='';
  private promptAt=0;
  private preview?:PlayerSnapshot;
  private previewSeats=new Map<string,string>();
  private previewSeating?:ReturnType<typeof createSeating>;
  private previewTime=0;
  private worldMap?:Phaser.Tilemaps.Tilemap;
  private seatingVisuals:Phaser.GameObjects.Image[]=[];
  private rugVisual?:Phaser.GameObjects.Graphics;
  private editor?:DecorationOverlay;
  private editing=false;
  constructor(private readonly pressed: ReadonlySet<string>, private readonly callbacks: OfficeCallbacks, private appearance: AvatarAppearance, private readonly multiplayer = false, private readonly officeId?: string, private readonly environment?: EnvironmentConfig,private readonly decoration?:PublishedDecoration) { super("Office"); }
  preload() {
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => { this.failed = true; this.callbacks.onError(); });
    this.load.image("office-tiles", this.environment ? `/office/environments/${this.environment.theme}.png` : "/office/office-tiles.png");
    if(!this.environment)this.load.image('seating-art','/office/environments/warm-wood.png');
    this.load.spritesheet("avatar", "/office/avatar.png", { frameWidth: 32, frameHeight: 32 });
    if (this.environment) this.cache.tilemap.add("studio", { format: Phaser.Tilemaps.Formats.TILED_JSON, data: composeOfficeEnvironment(this.environment,this.decoration) });
    else this.load.tilemapTiledJSON("studio", "/office/studio.json");
  }
  create() {
    if (this.failed) return;
    try {
      const data = validateOfficeMap(this.cache.tilemap.get("studio").data);
      this.geometry=data;this.interactables=interactionRegistry(data);
      const map = this.make.tilemap({ key: "studio" });
      this.worldMap=map;
      const tiles = map.addTilesetImage("office", "office-tiles", 32, 32, 0, 0);
      if (!tiles) throw new Error("Office tiles unavailable");
      if (!map.createLayer("Floor", tiles, 0, 0)) throw new Error("Office floor unavailable");
      if (this.environment) {
        const paint = environmentPaint(data, this.environment), graphics = this.add.graphics();this.rugVisual=graphics;
        for (const rect of paint.rugs) graphics.fillStyle(parseInt(rect.color, 16), rect.alpha).fillRect(rect.x, rect.y, rect.width, rect.height);
        this.cameras.main.setBackgroundColor("#" + paint.theme.background);
      }
      for (const name of ["Architecture", "Furniture"]) if (!map.createLayer(name, tiles, 0, 0)) throw new Error("Office layer unavailable");
      if(data.layers.some(layer=>layer.name==='Details')&&!map.createLayer('Details',tiles,0,0))throw Error('Office detail layer unavailable');
      const chairTexture=this.environment?'office-tiles':'seating-art';
      for(const object of this.interactables){
        if(isChairAsset(object.assetId)){
          const facing=object.slots[0]!.facingDirection,[sx,sy,w,h]=directionalChairRects[object.assetId][facing],key=`chair-${object.assetId}-${facing}`;
          const texture=this.textures.get(chairTexture);if(!texture.has(key))texture.add(key,0,sx,sy,w,h);
          map.getLayer('Furniture')!.tilemapLayer.removeTileAt(object.position.x/32,object.position.y/32);
          this.seatingVisuals.push(this.add.image(object.position.x,object.position.y,chairTexture,key).setOrigin(0).setDepth(.1));
        }
        for(const [index,rect]of object.foreground.entries()){
          const key=`seat-edge-${object.instanceId}-${index}`,texture=this.textures.get('office-tiles');
          if(!texture.has(key))texture.add(key,0,rect.sourceX,rect.sourceY,rect.width,rect.height);
          this.seatingVisuals.push(this.add.image(rect.x,rect.y,'office-tiles',key).setOrigin(0).setDepth(3.1).setData('seatingForeground',true));
        }
      }
      if (this.environment) {
        const paint = environmentPaint(data, this.environment), graphics = this.add.graphics();
        for (const sign of paint.signs) {
          graphics.fillStyle(parseInt(paint.theme.background,16), 1).fillRoundedRect(sign.x, sign.y, sign.width!, sign.height!, 3);
          graphics.fillStyle(parseInt(paint.accent,16), 1).fillRect(sign.x, sign.y, 4, sign.height!);
          const title = this.add.text(sign.x+10, sign.y+10, sign.name, {fontFamily:"Arial, sans-serif",fontSize:"10px",color:"#ffffff"});
          if (title.width > sign.width!-14) title.setScale((sign.width!-14)/title.width, 1);
        }
      }
      const collision = map.createLayer("Collision", tiles, 0, 0);
      if (!collision) throw new Error("Office collision unavailable");
      collision.setVisible(false).setCollisionByExclusion([-1]);
      this.mapWidth = data.width * TILE_SIZE; this.mapHeight = data.height * TILE_SIZE;
      this.areas = mapMarkers(data).filter((marker) => marker.type === "area" && isMapPosition(marker, this.mapWidth, this.mapHeight)).map((marker) => {
        const name = marker.name === "DEVELOPMENT" ? "Development area" : marker.name.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
        return { id: marker.name, name, x: marker.x, y: marker.y, description: `View the ${name} marker. Camera only; your avatar stays in place.` };
      });
      this.physics.world.setBounds(0, 0, this.mapWidth, this.mapHeight);
      const spawn = mapMarkers(data).find((marker) => marker.type === "spawn")!;
      if(!this.multiplayer){this.preview={...this.appearance,sessionId:'preview',userId:'preview',x:spawn.x,y:spawn.y,direction:'down',isMoving:false,connected:true};this.previewSeating=createSeating(data,this.previewSeats);}
      this.avatar = new PlayerAvatar(this, spawn.x, spawn.y, this.appearance);
      this.player = this.avatar.sprite;
      if (this.multiplayer) { this.player.setVisible(false); this.avatar.label.setVisible(false); this.player.body!.enable = false; }
      this.physics.add.collider(this.player, collision);
      for (const marker of mapMarkers(data).filter((marker) => marker.type === "area")) {
        this.add.text(marker.x, marker.y, marker.name, { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#344c48", backgroundColor: "#e9e5d2", padding: { x: 5, y: 3 } }).setOrigin(.5).setDepth(1);
      }
      const camera = this.cameras.main;
      this.bubbles = new VoiceBubbles(this, values=>this.callbacks.onBubbleAnchors?.(values));
      this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.bubbles?.destroy();this.previewSeating?.clear();this.publishInteraction(null);this.interactables=[];});
      camera.roundPixels = true;
      this.highlight = this.add.graphics().setDepth(2).lineStyle(3, 0xf8f9f5).strokeRect(-20, -24, 40, 48).lineStyle(1, 0x245743).strokeRect(-20, -24, 40, 48).setVisible(false);
      this.resetZoom();
      if(this.environment){this.editor=new DecorationOverlay(this,this.environment,data,map=>this.renderFurniture(map),event=>this.callbacks.onDecoration?.(event));this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>this.editor?.destroy());}
      this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.wheelZoomTarget = null; this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this); camera.stopFollow(); this.teammate = null; this.areaId = null; this.network?.close(); this.remotes.clear(); });
      this.events.once(Phaser.Scenes.Events.DESTROY, () => { this.network?.close(); this.remotes.clear(); });
      this.callbacks.onReady(mapVersion(data));
    } catch { this.failed = true; this.callbacks.onError(); }
  }
  private resize() {
    this.wheelZoomTarget = null;
    this.setZoom(this.fitMode ? fitOfficeZoom(this.scale.width, this.scale.height, this.mapWidth, this.mapHeight) : this.cameras.main.zoom);
    if (this.mode === "overview") this.cameras.main.centerOn(this.mapWidth / 2, this.mapHeight / 2);
    this.publishNavigation();
  }
  private setZoom(value: number) {
    if (!this.mapWidth) return;
    const camera = this.cameras.main;
    camera.setZoom(clampOfficeZoom(value, this.scale.width, this.scale.height, this.mapWidth, this.mapHeight));
    // Pad only an axis smaller than the viewport: centered letterboxing without
    // changing physics bounds or pretending that out-of-map space is walkable.
    const x = Math.max(0, (camera.width / camera.zoom - this.mapWidth) / 2);
    const y = Math.max(0, (camera.height / camera.zoom - this.mapHeight) / 2);
    camera.setBounds(-x, -y, this.mapWidth + x * 2, this.mapHeight + y * 2);
  }
  zoomBy(step: number) {
    if (!this.mapWidth || !Number.isFinite(step) || !step) return;
    const levels = zoomLevels(this.scale.width, this.scale.height, this.mapWidth, this.mapHeight);
    const zoom = nextOfficeZoom(this.wheelZoomTarget ?? this.cameras.main.zoom, step, levels);
    this.wheelZoomTarget = null;
    this.fitMode = false;
    this.setZoom(zoom);
    this.followZoom = Math.max(1, this.cameras.main.zoom);
    this.publishNavigation();
  }
  zoomWheel(pixels: number): boolean {
    if (!this.player || !this.mapWidth || this.failed || !Number.isFinite(pixels) || !pixels) return false;
    const direction = Math.sign(pixels);
    const current = this.wheelDirection === direction ? this.wheelZoomTarget ?? this.cameras.main.zoom : this.cameras.main.zoom;
    const requested = current * Math.exp(-Math.max(-160, Math.min(160, pixels)) * .0018);
    const target = clampOfficeZoom(requested, this.scale.width, this.scale.height, this.mapWidth, this.mapHeight);
    if (Math.abs(target - current) < 1e-8) return true;
    this.fitMode = false;
    this.wheelDirection = direction;
    this.wheelZoomTarget = target;
    this.followZoom = Math.max(1, target);
    if (this.reducedMotion) this.advanceWheelZoom(0);
    this.publishNavigation();
    return true;
  }
  private advanceWheelZoom(delta: number) {
    if (this.wheelZoomTarget === null) return;
    const target = this.wheelZoomTarget, current = this.cameras.main.zoom;
    const next = this.reducedMotion ? target : current + (target - current) * (1 - Math.exp(-Math.min(64, Math.max(0, delta)) / 65));
    if (Math.abs(target - next) < .0001) { this.setZoom(target); this.wheelZoomTarget = null; }
    else this.setZoom(next);
    if (this.mode === "overview") this.cameras.main.centerOn(this.mapWidth / 2, this.mapHeight / 2);
  }
  resetZoom() { this.followZoom = 2; this.followSelf(true); }
  setReducedMotion(value: boolean) { this.reducedMotion = value; this.cameras?.main?.setLerp(value ? 1 : .18); if (value && this.mapWidth) this.advanceWheelZoom(0); }
  private follow(target: { x: number; y: number }, immediate = false) {
    const camera = this.cameras.main, { scrollX, scrollY } = camera;
    const snap = immediate || this.reducedMotion;
    camera.startFollow(target, true, snap ? 1 : .18);
    // startFollow initializes scroll immediately; restore the old view only
    // when a short, purposeful transition is allowed by the user's preference.
    if (!snap) camera.setScroll(scrollX, scrollY);
  }
  private selfAvailable() {
    if (!this.multiplayer) return !!this.player;
    const snapshot = this.network?.snapshot(), id = this.network?.sessionId(), own = id ? snapshot?.players.get(id) : undefined;
    return !!this.officeId && snapshot?.officeId === this.officeId && !!own?.connected && isMapPosition(own, this.mapWidth, this.mapHeight);
  }
  private followSelf(immediate = false, notice = "") {
    if (!this.player) return;
    this.wheelZoomTarget = null;
    this.mode = "self"; this.areaId = null; this.teammate = null; this.fitMode = false; this.notice = notice;
    this.highlight?.setVisible(false); this.setZoom(this.followZoom); this.follow(this.player, immediate); this.publishNavigation();
  }
  navigate(command: CameraCommand): boolean {
    if (!this.player || !this.mapWidth || this.failed) return false;
    this.wheelZoomTarget = null;
    this.notice = "";
    if (command.type === "self") {
      if (!this.selfAvailable()) { this.notice = "Your avatar position is unavailable. Reconnect to return to it."; this.publishNavigation(); return false; }
      this.followSelf(); return true;
    }
    if (command.type === "overview") {
      this.mode = "overview"; this.fitMode = true; this.teammate = null; this.areaId = null; this.highlight?.setVisible(false);
      this.cameras.main.stopFollow(); this.resize(); return true;
    }
    if (command.type === "area") {
      const area = this.areas.find((area) => area.id === command.id);
      if (!area) return false;
      this.mode = "area"; this.fitMode = false; this.teammate = null; this.areaId = area.id;
      this.setZoom(this.followZoom); this.follow(area); this.highlight?.setPosition(area.x, area.y).setVisible(true); this.publishNavigation(); return true;
    }
    const person = findOfficeTeammate(this.network?.snapshot(), this.officeId, this.network?.sessionId(), command.sessionId, this.mapWidth, this.mapHeight);
    const avatar = this.remotes.get(command.sessionId);
    if (!person || !avatar) { this.notice = "That teammate's current location is unavailable. Try again when they reconnect."; this.publishNavigation(); return false; }
    this.mode = "teammate"; this.fitMode = false; this.areaId = null; this.teammate = command.sessionId;
    this.setZoom(this.followZoom); this.follow(avatar.sprite); this.highlight?.setPosition(avatar.sprite.x, avatar.sprite.y).setVisible(true); this.publishNavigation(); return true;
  }
  private location(x: number, y: number) {
    const area = this.areas.reduce<(typeof this.areas)[number] | undefined>((best, area) => !best || Math.hypot(x - area.x, y - area.y) < Math.hypot(x - best.x, y - best.y) ? area : best, undefined);
    return area ? `near ${area.name}` : "in this office";
  }
  private publishNavigation() {
    if (!this.mapWidth) return;
    const snapshot = this.network?.snapshot(), self = this.network?.sessionId();
    const findable = snapshot ? [...snapshot.players.keys()].filter((id) => this.remotes.has(id) && !!findOfficeTeammate(snapshot, this.officeId, self, id, this.mapWidth, this.mapHeight)).sort() : [];
    const person = this.teammate ? findOfficeTeammate(snapshot, this.officeId, self, this.teammate, this.mapWidth, this.mapHeight) : undefined;
    const area = this.areas.find((area) => area.id === this.areaId);
    const hint = this.notice || (this.mode === "teammate" && person ? `${avatarDisplayName(person.displayName)} · ${this.location(person.x, person.y)}. Camera only.` : area ? area.description : this.mode === "overview" ? `${this.fitMode ? "Office overview" : "Office center"}. Camera only; your avatar has not moved.` : this.selfAvailable() ? "Following your avatar." : "Your avatar position is not available yet.");
    const levels = zoomLevels(this.scale.width, this.scale.height, this.mapWidth, this.mapHeight), zoom = this.cameras.main.zoom;
    const requestedZoom = this.wheelZoomTarget ?? zoom;
    const state: NavigationState = { mode: this.mode, areaId: this.areaId, fit: this.fitMode, zoom, canZoomIn: requestedZoom < levels.at(-1)!, canZoomOut: requestedZoom > levels[0]!, canReturn: this.mode !== "self" && this.selfAvailable(), findable, hint, areas: this.areas.map(({ id, name, description }) => ({ id, name, description })) };
    // Publish gesture boundaries and eligibility changes, not interpolation frames.
    const key = JSON.stringify({ ...state, zoom: this.wheelZoomTarget === null ? zoom : "wheel" });
    if (key !== this.navigationKey) { this.navigationKey = key; this.callbacks.onNavigation?.(state); }
  }
  setAppearance(appearance: AvatarAppearance) { this.appearance = appearance; if (!this.multiplayer) {this.avatar?.setAppearance(appearance);if(this.preview)Object.assign(this.preview,appearance);} }
  setNetwork(network: OfficeNetwork) { this.network = network; }
  setEditor(view:EditorView|null){
    this.editing=!!view;this.editor?.configure(view);this.publishInteraction(null);
    if(view){this.cameras.main.stopFollow();this.highlight?.setVisible(false);this.network?.input(0,0,false);}else this.followSelf(true);
  }
  editorPointer(type:'down'|'move'|'up'|'cancel',x:number,y:number){if(this.editing)this.editor?.pointer(type,x,y);}
  editorDrop(assetId:string,x:number,y:number){if(this.editing)this.editor?.drop(assetId,x,y);}
  isEditing(){return this.editing;}
  private renderFurniture(map:OfficeMap){
    if(!this.worldMap)return;
    for(const image of this.seatingVisuals)image.destroy();this.seatingVisuals=[];
    for(const name of ['Furniture','Details']){const layer=this.worldMap.getLayer(name)?.tilemapLayer;if(!layer)continue;const data=tileLayer(map,name).data;for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){const gid=data[y*map.width+x]!;if(gid)layer.putTileAt(gid,x,y,false);else layer.removeTileAt(x,y,false,false);}}
    for(const object of interactionRegistry(map)){
      if(isChairAsset(object.assetId)){const facing=object.slots[0]!.facingDirection,[sx,sy,w,h]=directionalChairRects[object.assetId][facing],key=`chair-${object.assetId}-${facing}`,texture=this.textures.get('office-tiles');if(!texture.has(key))texture.add(key,0,sx,sy,w,h);this.worldMap.getLayer('Furniture')!.tilemapLayer.removeTileAt(object.position.x/32,object.position.y/32);this.seatingVisuals.push(this.add.image(object.position.x,object.position.y,'office-tiles',key).setOrigin(0).setDepth(.1));}
      for(const [index,rect]of object.foreground.entries()){const key=`seat-edge-${object.instanceId}-${index}`,texture=this.textures.get('office-tiles');if(!texture.has(key))texture.add(key,0,rect.sourceX,rect.sourceY,rect.width,rect.height);this.seatingVisuals.push(this.add.image(rect.x,rect.y,'office-tiles',key).setOrigin(0).setDepth(3.1).setData('seatingForeground',true));}
    }
    if(this.environment&&this.rugVisual){this.rugVisual.clear();for(const r of environmentPaint(map,this.environment).rugs)this.rugVisual.fillStyle(parseInt(r.color,16),r.alpha).fillRect(r.x,r.y,r.width,r.height);}
  }
  interact() {
    if(this.editing)return false;
    if(!this.primary||this.primary.available===false)return false;
    const {action,objectId,slotId}=this.primary;
    if(this.multiplayer)return this.network?.interact?.({action,objectId,slotId})??false;
    return !!this.preview&&this.previewSeating?.act('preview',this.preview,{action,objectId,slotId,seq:0})==='OK';
  }
  private publishInteraction(value:PrimaryInteraction|null) {
    const key=value?`${value.action}:${value.slotId}:${value.available!==false}`:'';
    this.primary=value;
    if(this.primaryKey!==key){this.primaryKey=key;this.callbacks.onInteraction?.(value);}
  }
  private updateInteraction(own:PlayerSnapshot,occupied:ReadonlyMap<string,string>,time:number) {
    if(time<this.promptAt)return;this.promptAt=time+100;
    this.publishInteraction(this.geometry&&own.connected?closestInteraction(this.geometry,this.interactables,own,occupied,own.seatId):null);
  }
  update(_time: number, delta: number) {
    if (!this.player || this.failed) return;
    this.advanceWheelZoom(delta);
    if (this.multiplayer) {
      const current = this.network?.snapshot(), sessionId = this.network?.sessionId();
      const snapshot = !this.officeId || current?.officeId === this.officeId ? current : undefined;
      const own = sessionId ? snapshot?.players.get(sessionId) : undefined;
      this.player.setVisible(isMapPosition(own, this.mapWidth, this.mapHeight)); this.avatar.label.setVisible(isMapPosition(own, this.mapWidth, this.mapHeight));
      if (!snapshot || !own || !isMapPosition(own, this.mapWidth, this.mapHeight)) {
        this.publishInteraction(null);
        this.bubbles?.update(null,()=>undefined,delta,true);
        this.positionsUnavailable = true;
        for (const avatar of this.remotes.values()) avatar.destroy();
        this.remotes.clear(); if (this.teammate) this.followSelf(true, "Teammate locations are unavailable. Reconnect to find them."); this.publishNavigation(); return;
      }
      if (this.positionsUnavailable) { this.positionsUnavailable = false; this.notice = ""; }
      const input = this.editing?Object.assign(this.movementInput,{x:0,y:0,facing:own.direction}):movement(this.pressed, own.direction, this.movementInput);
      if ((input.x || input.y) && this.mode !== "self") this.followSelf();
      this.network!.input(input.x, input.y,!this.editing&&runningIntent(this.pressed));
      this.avatar.renderNetwork(own, delta, true);
      if(!this.editing)this.updateInteraction(own,snapshot.seats??new Map(),_time);
      for (const [id, player] of snapshot.players) {
        if (id === sessionId) continue;
        if (!isMapPosition(player, this.mapWidth, this.mapHeight)) { this.remotes.get(id)?.destroy(); this.remotes.delete(id); continue; }
        let avatar = this.remotes.get(id);
        if (!avatar) { avatar = new PlayerAvatar(this, player.x, player.y, player); this.remotes.set(id, avatar); }
        avatar.renderNetwork(player, delta, false);
      }
      for (const [id, avatar] of this.remotes) if (!snapshot.players.has(id)) { avatar.destroy(); this.remotes.delete(id); }
      if (this.teammate) {
        const target = findOfficeTeammate(snapshot, this.officeId, sessionId, this.teammate, this.mapWidth, this.mapHeight);
        const avatar = this.remotes.get(this.teammate);
        if (!target || !avatar) this.followSelf(false, "Teammate location unavailable. Following your avatar.");
        else this.highlight?.setPosition(avatar.sprite.x, avatar.sprite.y);
      }
      this.bubbles?.update(this.network?.proximity?.(),id=>id===sessionId?this.avatar.bubblePosition():this.remotes.get(id)?.bubblePosition(),delta,this.reducedMotion);
      this.publishNavigation();
      return;
    }
    if (!this.editing&&this.pressed.size && this.mode !== "self") this.followSelf();
    if(this.preview&&this.geometry) {
      const input=this.editing?Object.assign(this.movementInput,{x:0,y:0,facing:this.preview.direction}):movement(this.pressed,this.preview.direction,this.movementInput);
      this.previewTime=Math.min(100,this.previewTime+delta);
      while(this.previewTime>=50){if(!this.previewSeating?.transitioning('preview'))advanceMovement(this.geometry,this.preview,{...input,run:runningIntent(this.pressed)});this.previewTime-=50;}
      this.avatar.renderNetwork(this.preview,delta,true);this.updateInteraction(this.preview,this.previewSeats,_time);
    }
    this.publishNavigation();
  }
}
