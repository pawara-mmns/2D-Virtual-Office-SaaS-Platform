import Phaser from "phaser";
import { avatarAnimationKey, avatarBody, avatarDirections, avatarDisplayName, avatarIdleFrame, avatarPresets, safeAvatarKey, avatarSittingFrame, avatarMotion, type AvatarAppearance, type AvatarKey } from "../../avatars/presets.ts";
import type { Direction } from "../input/movement.ts";
import type { PlayerSnapshot } from "../../../../../../packages/shared/src/protocol.ts";

export class PlayerAvatar {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly label: Phaser.GameObjects.Text;
  private key: AvatarKey;
  private fullName: string;
  private facing: Direction = "down";
  private walkingDirection: Direction | null = null;
  private idleDirection: Direction | null = null;
  private labelWidth = -1;
  private networkAppearance = "";
  private seated=false;
  constructor(private readonly scene: Phaser.Scene, x: number, y: number, appearance: AvatarAppearance) {
    this.key = safeAvatarKey(appearance.avatarKey); this.fullName = avatarDisplayName(appearance.displayName);
    for (const preset of avatarPresets) for (const direction of avatarDirections) {
      const key = avatarAnimationKey(preset.key, direction);
      if (!scene.anims.exists(key)) {
        const first = avatarIdleFrame(preset.key, direction);
        scene.anims.create({ key, frames: [first, first + 1, first, first + 2].map((frame) => ({ key: "avatar", frame })), frameRate: 7, repeat: -1 });
      }
    }
    this.sprite = scene.physics.add.sprite(x, y, "avatar", avatarIdleFrame(this.key, this.facing)).setDepth(3).setCollideWorldBounds(true);
    this.sprite.setSize(avatarBody.width, avatarBody.height).setOffset(avatarBody.offsetX, avatarBody.offsetY);
    this.label = scene.add.text(x, y - 26, this.fullName, { fontFamily: "Arial", fontSize: "10px", color: "#f7f8f1", backgroundColor: "#25363d", padding: { x: 5, y: 3 },shadow:{offsetX:0,offsetY:1,color:'#101e25',blur:0,fill:true} }).setOrigin(.5).setDepth(4);
  }
  setAppearance(appearance: AvatarAppearance) {
    this.key = safeAvatarKey(appearance.avatarKey); this.fullName = avatarDisplayName(appearance.displayName);
    this.walkingDirection = null; this.idleDirection = null; this.labelWidth = -1;
  }
  renderNetwork(state: PlayerSnapshot, delta: number, local: boolean, presented=false) {
    const identity = `${state.avatarKey}/${state.displayName}`;
    if (this.networkAppearance !== identity) {
      this.networkAppearance = identity;
      // The green local label identifies self without consuming the profile's
      // character budget or truncating its name differently from chat/voice.
      this.setAppearance({ avatarKey: state.avatarKey, displayName: state.displayName });
      if (local) this.label.setBackgroundColor("#245743");
    }
    this.sprite.setVelocity(0, 0);
    if (this.sprite.body) this.sprite.body.enable = false;
    const distance = Phaser.Math.Distance.Between(this.sprite.x, this.sprite.y, state.x, state.y);
    const factor = presented||distance > 96 || distance < .01 || this.seated!==!!state.seatId ? 1 : 1-Math.exp(-Math.min(delta,100)/32);
    this.sprite.setPosition(Phaser.Math.Linear(this.sprite.x, state.x, factor), Phaser.Math.Linear(this.sprite.y, state.y, factor));
    this.facing = state.direction;
    const pose=avatarMotion(state);this.seated=!!state.seatId;
    if(pose==='SITTING') {
      this.sprite.anims.stop();this.sprite.setFrame(avatarSittingFrame(this.key,this.facing));this.walkingDirection=null;this.idleDirection=null;
    } else if (state.isMoving && state.connected) {
      if (this.walkingDirection !== this.facing) { this.sprite.play(avatarAnimationKey(this.key, this.facing)); this.walkingDirection = this.facing; this.idleDirection = null; }
    } else if (this.idleDirection !== this.facing || this.walkingDirection) {
      this.sprite.anims.stop(); this.sprite.setFrame(avatarIdleFrame(this.key, this.facing)); this.idleDirection = this.facing; this.walkingDirection = null;
    }
    this.sprite.anims.timeScale=pose==='RUNNING'?1.6:1;
    // Tile furniture stays below avatars. A seated pose rests visibly on its cushion.
    this.sprite.setDepth(3+state.y/100000);this.label.setDepth(4+state.y/100000);
    this.sprite.setAlpha(state.connected ? 1 : .5);
    this.label.setAlpha(state.connected?1:.65);
    this.positionLabel();
    this.label.setVisible(local || this.scene.cameras.main.worldView.contains(this.sprite.x, this.sprite.y));
  }
  destroy() { this.sprite.destroy(); this.label.destroy(); }
  bubblePosition() {
    const bounds=this.sprite.getBounds();
    const footX=bounds.left+(avatarBody.offsetX+avatarBody.width/2)*this.sprite.scaleX;
    const footY=bounds.top+(avatarBody.offsetY+avatarBody.height/2)*this.sprite.scaleY;
    return{x:bounds.centerX,y:bounds.centerY,left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom,footX,footY};
  }
  private positionLabel() {
    const camera = this.scene.cameras.main;
    // Cap close-up label size without scaling or filtering the pixel avatar.
    this.label.setScale(Math.min(1,1.4/camera.zoom));
    if (camera.worldView.width <= 0 || camera.worldView.height <= 0) return;
    const available = Math.max(24, Math.floor(camera.width / camera.zoom) - 12);
    if (available !== this.labelWidth) {
      this.labelWidth = available; this.label.setText(this.fullName);
      let letters = [...this.fullName];
      while (this.label.width > available && letters.length > 1) { letters = letters.slice(0, -1); this.label.setText(letters.join("") + "…"); }
    }
    const view = camera.worldView, halfWidth = this.label.displayWidth / 2, halfHeight = this.label.displayHeight / 2;
    // At the top edge there is not enough space above the artwork: put the
    // label below, rather than clipping it or covering the character's head.
    const y = this.seated&&this.facing==='up'||this.sprite.y - 26 - halfHeight < view.top + 2 ? this.sprite.y + 26 : this.sprite.y - 26;
    this.label.setPosition(Math.round(Phaser.Math.Clamp(this.sprite.x, view.left + halfWidth + 2, view.right - halfWidth - 2)), Math.round(Phaser.Math.Clamp(y, view.top + halfHeight + 2, view.bottom - halfHeight - 2)));
  }
}
