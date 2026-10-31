import type Phaser from 'phaser';
import type { ProximityState, VoiceBubble } from '../../../../../../packages/shared/src/proximity.ts';
import { avatarEnvelope, smoothEnvelope, bubbleTension, type BubblePoint, type BubbleAvatar } from './bubble-geometry.ts';
export type BubbleAnchor = {
    bubbleId: string;
    x: number;
    y: number;
    visible: boolean;
};
type Visual = {
    bubble: VoiceBubble;
    alpha: number;
    points: BubbleAvatar[];
    memory:BubblePoint[];
    boundary:BubblePoint[];
};
export class VoiceBubbles {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly visuals = new Map<string, Visual>();
    constructor(private readonly scene: Phaser.Scene, private readonly anchors: (values: BubbleAnchor[]) => void) {
        this.graphics = scene.add.graphics().setDepth(2.5);
    }
    update(state: ProximityState | null | undefined, position: (id: string) => BubbleAvatar | undefined, delta: number, reduced: boolean) {
        const live = new Set<string>();
        for (const bubble of state?.bubbles ?? []) {
            if (bubble.lifecycleState === 'DISSOLVED')
                continue;
            const points = bubble.memberIds.map(position).filter((p): p is BubbleAvatar => !!p);
            if (points.length < 2)
                continue;
            live.add(bubble.bubbleId);
            const visual = this.visuals.get(bubble.bubbleId) ?? { bubble, alpha: reduced ? 1 : 0, points, memory:[], boundary:[] };
            visual.bubble = bubble;
            visual.points = points;
            this.visuals.set(bubble.bubbleId, visual);
        }
        this.graphics.clear();
        const anchors: BubbleAnchor[] = [];
        const camera = this.scene.cameras.main, step = Math.min(64, Math.max(0, delta)) / 180;
        for (const [id, visual] of this.visuals) {
            const present = live.has(id);
            visual.alpha = reduced ? (present ? 1 : 0) : Math.max(0, Math.min(1, visual.alpha + (present ? step : -step)));
            if (!visual.alpha) {
                if (!present)
                    this.visuals.delete(id);
                continue;
            }
            const tension = bubbleTension(visual.points, state?.settings.stretchDistance ?? 112, state?.settings.disconnectRadius ?? 160);
            const padding=9-tension*2;
            const geometry=smoothEnvelope(visual.memory,avatarEnvelope(visual.points,padding),delta,reduced);
            visual.memory=geometry.memory;
            const boundary=geometry.boundary,color = visual.bubble.locked ? 0xbda4ff : 0x75dcf4;
            visual.boundary=boundary;
            const alpha = visual.alpha * (visual.bubble.lifecycleState === 'DISCONNECTING' ? .45 : 1);
            this.graphics.fillStyle(color, .06 * alpha);
            this.graphics.beginPath();
            boundary.forEach((p, i) => i ? this.graphics.lineTo(p.x, p.y) : this.graphics.moveTo(p.x, p.y));
            this.graphics.closePath().fillPath();
            // A restrained dark keyline keeps the glass readable on pale floors.
            // Both strokes stay beneath avatars and add no input/physics surface.
            this.graphics.lineStyle(2.2, visual.bubble.locked ? 0x5b3a80 : 0x225c70, .22 * alpha).strokePath();
            this.graphics.lineStyle(1.1, color, (.8 + tension * .1) * alpha).strokePath();
            // A short restrained highlight, rather than a costly blur or shader.
            const first = boundary[0];
            if (first) {
                this.graphics.lineStyle(.7, 0xf3fbff, .35 * alpha);
                this.graphics.beginPath();
                this.graphics.moveTo(first.x + 3, first.y - 4);
                this.graphics.lineTo(first.x + 10, first.y - 12);
                this.graphics.strokePath();
            }
            const x = (Math.max(...visual.points.map(p => p.right)) - camera.worldView.x) * camera.zoom + camera.x + Math.max(padding * camera.zoom, 24);
            const y = (Math.min(...visual.points.map(p => p.top)) - camera.worldView.y) * camera.zoom + camera.y - Math.max(padding * camera.zoom, 24);
            anchors.push({ bubbleId: id, x, y, visible: present && x >= camera.x + 22 && x <= camera.x + camera.width - 22 && y >= camera.y + 22 && y <= camera.y + camera.height - 22 });
        }
        this.anchors(anchors);
    }
    destroy() { this.visuals.clear(); this.graphics.destroy(); this.anchors([]); }
}
