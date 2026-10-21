import Phaser from "phaser";
import { mapMarkers, PLAYER_SPEED, TILE_SIZE, validateOfficeMap } from "../maps/map-data.ts";
import { movement, type Direction } from "../input/movement.ts";
import { officeZoom } from "../engine/camera.ts";

export type OfficeCallbacks = { onReady(): void; onError(): void };
export class OfficeScene extends Phaser.Scene {
  player!: Phaser.Physics.Arcade.Sprite;
  private label!: Phaser.GameObjects.Text;
  private facing: Direction = "down";
  private failed = false;
  private mapWidth = 0;
  private mapHeight = 0;
  constructor(private readonly pressed: ReadonlySet<string>, private readonly callbacks: OfficeCallbacks) { super("Office"); }
  preload() {
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => { this.failed = true; this.callbacks.onError(); });
    this.load.image("office-tiles", "/office/office-tiles.png");
    this.load.spritesheet("avatar", "/office/avatar.png", { frameWidth: 32, frameHeight: 32 });
    this.load.tilemapTiledJSON("studio", "/office/studio.json");
  }
  create() {
    if (this.failed) return;
    try {
      const data = validateOfficeMap(this.cache.tilemap.get("studio").data);
      const map = this.make.tilemap({ key: "studio" });
      const tiles = map.addTilesetImage("office", "office-tiles", 32, 32, 0, 0);
      if (!tiles) throw new Error("Office tiles unavailable");
      for (const name of ["Floor", "Architecture", "Furniture"]) if (!map.createLayer(name, tiles, 0, 0)) throw new Error("Office layer unavailable");
      const collision = map.createLayer("Collision", tiles, 0, 0);
      if (!collision) throw new Error("Office collision unavailable");
      collision.setVisible(false).setCollisionByExclusion([-1]);
      this.mapWidth = data.width * TILE_SIZE; this.mapHeight = data.height * TILE_SIZE;
      this.physics.world.setBounds(0, 0, this.mapWidth, this.mapHeight);
      const spawn = mapMarkers(data).find((marker) => marker.type === "spawn")!;
      this.player = this.physics.add.sprite(spawn.x, spawn.y, "avatar", 0).setDepth(3).setCollideWorldBounds(true);
      this.player.setSize(14, 10).setOffset(9, 22);
      this.physics.add.collider(this.player, collision);
      for (const [row, direction] of ["down", "left", "right", "up"].entries()) {
        this.anims.create({ key: `walk-${direction}`, frames: [row * 3, row * 3 + 1, row * 3, row * 3 + 2].map((frame) => ({ key: "avatar", frame })), frameRate: 7, repeat: -1 });
      }
      for (const marker of mapMarkers(data).filter((marker) => marker.type === "area")) {
        this.add.text(marker.x, marker.y, marker.name, { fontFamily: "Courier New, monospace", fontSize: "10px", color: "#344c48", backgroundColor: "#e9e5d2", padding: { x: 5, y: 3 } }).setOrigin(.5).setDepth(1);
      }
      this.label = this.add.text(spawn.x, spawn.y - 23, "You", { fontFamily: "Arial", fontSize: "10px", color: "#fff9e8", backgroundColor: "#344c48", padding: { x: 4, y: 2 } }).setOrigin(.5).setDepth(4);
      const camera = this.cameras.main;
      camera.setBounds(0, 0, this.mapWidth, this.mapHeight).startFollow(this.player, true);
      camera.roundPixels = true;
      this.resetZoom();
      this.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this));
      this.callbacks.onReady();
    } catch { this.failed = true; this.callbacks.onError(); }
  }
  private resize() { this.setZoom(this.cameras.main.zoom); }
  private setZoom(value: number) {
    if (!this.mapWidth) return;
    this.cameras.main.setZoom(officeZoom(value, this.scale.width, this.scale.height, this.mapWidth, this.mapHeight));
  }
  zoomBy(step: number) { this.setZoom(this.cameras.main.zoom + step); }
  resetZoom() { this.setZoom(2); }
  update() {
    if (!this.player || this.failed) return;
    const direction = movement(this.pressed, this.facing);
    this.facing = direction.facing;
    this.player.setVelocity(direction.x * PLAYER_SPEED, direction.y * PLAYER_SPEED);
    if (direction.x || direction.y) this.player.play(`walk-${this.facing}`, true);
    else { this.player.anims.stop(); this.player.setFrame(["down", "left", "right", "up"].indexOf(this.facing) * 3); }
    this.label.setPosition(Math.round(this.player.x), Math.round(this.player.y - 23));
  }
}
