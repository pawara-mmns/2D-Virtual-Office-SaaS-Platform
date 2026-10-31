import Phaser from "phaser";
import { avatarAnimationKey, avatarBody, avatarDirections, avatarDisplayName, avatarIdleFrame, avatarPresets, safeAvatarKey, type AvatarAppearance, type AvatarKey } from "../../avatars/presets.ts";
import { animationDirection, avatarIsWalking } from "../../avatars/animation.ts";
import { movement, type Direction, type Movement } from "../input/movement.ts";
import { PLAYER_SPEED } from "../maps/map-data.ts";
import type { PlayerSnapshot } from "../../../../../../packages/shared/src/protocol.ts";

export class PlayerAvatar {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly label: Phaser.GameObjects.Text;
  private key: AvatarKey;
  private fullName: string;
  private facing: Direction = "down";
  private readonly direction: Movement = { x: 0, y: 0, facing: "down" };
  private walkingDirection: Direction | null = null;
  private idleDirection: Direction | null = null;
  private labelWidth = -1;
  private previousX: number;
  private previousY: number;
  private networkAppearance = "";
  constructor(private readonly scene: Phaser.Scene, x: number, y: number, appearance: AvatarAppearance) {
    this.key = safeAvatarKey(appearance.avatarKey); this.fullName = avatarDisplayName(appearance.displayName);
    this.previousX = x; this.previousY = y;
    for (const preset of avatarPresets) for (const direction of avatarDirections) {
      const key = avatarAnimationKey(preset.key, direction);
      if (!scene.anims.exists(key)) {
        const first = avatarIdleFrame(preset.key, direction);
        scene.anims.create({ key, frames: [first, first + 1, first, first + 2].map((frame) => ({ key: "avatar", frame })), frameRate: 7, repeat: -1 });
      }
    }
    this.sprite = scene.physics.add.sprite(x, y, "avatar", avatarIdleFrame(this.key, this.facing)).setDepth(3).setCollideWorldBounds(true);
    this.sprite.setSize(avatarBody.width, avatarBody.height).setOffset(avatarBody.offsetX, avatarBody.offsetY);
    this.label = scene.add.text(x, y - 26, this.fullName, { fontFamily: "Arial", fontSize: "10px", color: "#fff9e8", backgroundColor: "#344c48", padding: { x: 5, y: 3 } }).setOrigin(.5).setDepth(4);
  }
  setAppearance(appearance: AvatarAppearance) {
    this.key = safeAvatarKey(appearance.avatarKey); this.fullName = avatarDisplayName(appearance.displayName);
    this.walkingDirection = null; this.idleDirection = null; this.labelWidth = -1;
  }
  renderNetwork(state: PlayerSnapshot, delta: number, local: boolean) {
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
    const factor = distance > 96 ? 1 : Math.min(1, delta / 50);
    this.sprite.setPosition(Phaser.Math.Linear(this.sprite.x, state.x, factor), Phaser.Math.Linear(this.sprite.y, state.y, factor));
    this.facing = state.direction;
    if (state.isMoving && state.connected) {
      if (this.walkingDirection !== this.facing) { this.sprite.play(avatarAnimationKey(this.key, this.facing)); this.walkingDirection = this.facing; this.idleDirection = null; }
    } else if (this.idleDirection !== this.facing || this.walkingDirection) {
      this.sprite.anims.stop(); this.sprite.setFrame(avatarIdleFrame(this.key, this.facing)); this.idleDirection = this.facing; this.walkingDirection = null;
    }
    this.sprite.setAlpha(state.connected ? 1 : .5);
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
  update(pressed: ReadonlySet<string>) {
    const direction = movement(pressed, this.facing, this.direction);
    // Body deltas include attempted movement before tile separation. Compare
    // resolved sprite positions so walking stops when furniture blocks movement.
    const dx = this.sprite.x - this.previousX, dy = this.sprite.y - this.previousY;
    this.previousX = this.sprite.x; this.previousY = this.sprite.y;
    this.facing = animationDirection(direction.facing, direction.x, direction.y, dx, dy);
    this.sprite.setVelocity(direction.x * PLAYER_SPEED, direction.y * PLAYER_SPEED);
    if (avatarIsWalking(direction.x, direction.y, dx, dy)) {
      if (this.walkingDirection !== this.facing) { this.sprite.play(avatarAnimationKey(this.key, this.facing)); this.walkingDirection = this.facing; this.idleDirection = null; }
    } else {
      if (this.idleDirection !== this.facing || this.walkingDirection) { this.sprite.anims.stop(); this.sprite.setFrame(avatarIdleFrame(this.key, this.facing)); this.idleDirection = this.facing; this.walkingDirection = null; }
    }
    this.positionLabel();
  }
  private positionLabel() {
    const camera = this.scene.cameras.main;
    if (camera.worldView.width <= 0 || camera.worldView.height <= 0) return;
    const available = Math.max(24, Math.floor(camera.width / camera.zoom) - 12);
    if (available !== this.labelWidth) {
      this.labelWidth = available; this.label.setText(this.fullName);
      let letters = [...this.fullName];
      while (this.label.width > available && letters.length > 1) { letters = letters.slice(0, -1); this.label.setText(letters.join("") + "…"); }
    }
    const view = camera.worldView, halfWidth = this.label.width / 2, halfHeight = this.label.height / 2;
    // At the top edge there is not enough space above the artwork: put the
    // label below, rather than clipping it or covering the character's head.
    const y = this.sprite.y - 26 - halfHeight < view.top + 2 ? this.sprite.y + 26 : this.sprite.y - 26;
    this.label.setPosition(Math.round(Phaser.Math.Clamp(this.sprite.x, view.left + halfWidth + 2, view.right - halfWidth - 2)), Math.round(Phaser.Math.Clamp(y, view.top + halfHeight + 2, view.bottom - halfHeight - 2)));
  }
}
