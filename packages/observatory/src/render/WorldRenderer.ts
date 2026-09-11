/**
 * The world view — PixiJS.
 *
 * Everything alive is drawn here: the world floor and boundary, food, and
 * every organism as a small procedural body (lineage-coloured cell with a
 * directional nose, a forward core and an outer energy ring). React never
 * renders organisms; it only owns the shell around this canvas.
 *
 * All motion is display-only interpolation between the two newest received
 * frames. Nothing here writes to simulation state or sends anything anywhere.
 */
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import type { FrameStore } from '../world/frameStore.js';
import type { ObserverFood, ObserverFrame, ObserverOrganism } from '../protocol/observerV1.js';
import { lineageColor, lighten, darken, type LineageColor } from '../world/lineageColor.js';
import { CONTINUOUS_TICK_GAP } from '../world/sessionHistory.js';
import { displayProgress, lerp, lerpAngle } from '../world/interpolation.js';
import {
  clampCamera, fitCamera, fitScale, panBy, screenToWorld, worldToScreen, wheelZoomFactor, zoomAt,
  DEFAULT_FIT_INSETS, FIT_PADDING, MAX_ZOOM_FACTOR, MIN_ZOOM_FACTOR, NO_INSETS, type CameraState, type Size,
} from './camera.js';
import { dotTexture, floorTexture, glowTexture } from './textures.js';

export interface RendererCallbacks {
  onSelect: (id: number | null) => void;
  onCamera?: (cam: CameraState, fitted: boolean) => void;
}

const BIRTH_MS = 700;
const DEATH_MS = 450;
const FOOD_FADE_MS = 260;
const RING_STEPS = 24;
const DIM_ALPHA = 0.26;
const BIRTH_TICK_GAP = CONTINUOUS_TICK_GAP;
const FOOD_SIZE = 9;
const EMPTY_MAP: ReadonlyMap<number, ObserverOrganism> = new Map();

/** Body radius in world units from morphology.size (0.5–1.5 → ~3.1–5.3). */
export function bodyRadius(size: number): number {
  return 2.0 + 2.2 * size;
}

interface OrganismVisual {
  id: number;
  color: LineageColor;
  r: number;
  root: Container;
  body: Container;
  glow: Sprite;
  ring: Graphics;
  ringStep: number;
  phase: 'born' | 'alive' | 'dying';
  phaseStart: number;
  alpha: number;
  x: number;
  y: number;
  heading: number;
  lineageRootId: number;
}

interface FoodVisual {
  id: number;
  sprite: Sprite;
  phase: 'in' | 'stable' | 'out';
  phaseStart: number;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

export class WorldRenderer {
  private readonly store: FrameStore;
  private readonly callbacks: RendererCallbacks;
  private app: Application | null = null;
  private element: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribe: (() => void) | null = null;
  private destroyed = false;
  private mountToken = 0;

  private readonly worldLayer = new Container();
  private readonly floorLayer = new Container();
  private readonly foodLayer = new Container();
  private readonly organismLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly selectionRing = new Graphics();
  private readonly selectionLabel: Text;

  private organisms = new Map<number, OrganismVisual>();
  private foods = new Map<number, FoodVisual>();

  private viewport: Size = { width: 1, height: 1 };
  private worldSize: Size | null = null;
  private camera: CameraState = { scale: 1, offsetX: 0, offsetY: 0 };
  private fitted = true;

  // The frame being displayed: references captured from the store, so a
  // paused view stays frozen while the store keeps receiving.
  private latest: ObserverFrame | null = null;
  private latestById: ReadonlyMap<number, ObserverOrganism> = EMPTY_MAP;
  private prevById: ReadonlyMap<number, ObserverOrganism> = EMPTY_MAP;
  private latestAt = 0;
  private intervalMs = 100;
  private paused = false;

  private selectedId: number | null = null;
  private emphasisLineage: number | null = null;
  private energyScale = 100;

  private pointerDown: { x: number; y: number; id: number; moved: boolean } | null = null;
  private lastPointer: { x: number; y: number } | null = null;
  private lastFrameMs = 0;

  constructor(store: FrameStore, callbacks: RendererCallbacks) {
    this.store = store;
    this.callbacks = callbacks;
    this.selectionLabel = new Text({
      text: '',
      style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 11, fill: 0xdde6ff, fontWeight: '600' },
    });
    this.selectionLabel.resolution = 2;
    this.selectionLabel.anchor.set(0, 1);
  }

  /** Create the Pixi application inside `element`. A renderer instance mounts once; create a new one to re-mount. */
  async mount(element: HTMLElement): Promise<void> {
    const token = ++this.mountToken;
    const app = new Application();
    await app.init({
      antialias: true,
      backgroundAlpha: 0,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      width: Math.max(1, element.clientWidth),
      height: Math.max(1, element.clientHeight),
    });
    if (this.destroyed || this.app !== null || token !== this.mountToken) { app.destroy(true); return; }
    this.app = app;
    this.element = element;
    app.stage.eventMode = 'none';
    app.canvas.style.display = 'block';
    app.canvas.style.touchAction = 'none';
    element.appendChild(app.canvas);

    this.worldLayer.addChild(this.floorLayer, this.foodLayer, this.organismLayer);
    this.overlayLayer.addChild(this.selectionRing, this.selectionLabel);
    app.stage.addChild(this.worldLayer, this.overlayLayer);

    this.viewport = { width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) };
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(element);

    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('pointerleave', this.onPointerLeave);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('dblclick', this.onDoubleClick);

    this.unsubscribe = this.store.subscribe(() => this.onStoreFrame());
    this.onStoreFrame();
    this.lastFrameMs = performance.now();
    app.ticker.add(this.tick);
  }

  destroy(): void {
    this.destroyed = true;
    this.mountToken++;
    const el = this.element;
    if (el !== null) {
      el.removeEventListener('pointerdown', this.onPointerDown);
      el.removeEventListener('pointermove', this.onPointerMove);
      el.removeEventListener('pointerup', this.onPointerUp);
      el.removeEventListener('pointercancel', this.onPointerUp);
      el.removeEventListener('pointerleave', this.onPointerLeave);
      el.removeEventListener('wheel', this.onWheel);
      el.removeEventListener('dblclick', this.onDoubleClick);
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.app !== null) {
      this.app.ticker.remove(this.tick);
      this.app.destroy(true, { children: true });
    }
    this.app = null;
    this.element = null;
    this.organisms.clear();
    this.foods.clear();
  }

  // ---- public controls (presentation only) ---------------------------------

  setSelection(id: number | null): void {
    this.selectedId = id;
  }

  setEmphasisLineage(lineageRootId: number | null): void {
    this.emphasisLineage = lineageRootId;
  }

  /** Pause only the browser's view. The store keeps receiving; on resume the view jumps to the newest frame. */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (!paused) {
      this.store.collapseToLatest();
      this.syncFromStore(true);
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  fitWorld(): void {
    if (this.worldSize === null) return;
    // Small viewports get the whole area; otherwise keep the world clear of the HUD row.
    const insets = this.viewport.height < 520 || this.viewport.width < 520 ? NO_INSETS : DEFAULT_FIT_INSETS;
    this.camera = fitCamera(this.worldSize, this.viewport, FIT_PADDING, insets);
    this.fitted = true;
    this.applyCamera();
  }

  zoomBy(factor: number): void {
    this.zoomAtScreen(factor, this.viewport.width / 2, this.viewport.height / 2);
  }

  cameraState(): CameraState {
    return this.camera;
  }

  /** Pan (no zoom change) so the organism's newest known position sits at the viewport centre. Display only. */
  centerOnOrganism(id: number): boolean {
    const o = this.store.organism(id);
    if (o === undefined || this.worldSize === null) return false;
    const cam: CameraState = {
      scale: this.camera.scale,
      offsetX: this.viewport.width / 2 - o.x * this.camera.scale,
      offsetY: this.viewport.height / 2 - o.y * this.camera.scale,
    };
    this.camera = clampCamera(cam, this.worldSize, this.viewport);
    this.fitted = false;
    this.applyCamera();
    return true;
  }

  /** Number of organism visuals currently on screen (including ones fading out). */
  visualCount(): number {
    return this.organisms.size;
  }

  // ---- frames --------------------------------------------------------------

  private onStoreFrame(): void {
    if (this.paused) return;
    this.syncFromStore(false);
  }

  private syncFromStore(jump: boolean): void {
    const frame = this.store.latest();
    if (frame === null) return;
    const now = performance.now();
    const previous = this.latest;
    this.latest = frame;
    this.latestById = this.store.latestOrganisms();
    this.prevById = jump || previous === null ? EMPTY_MAP : this.store.previousOrganisms();
    this.latestAt = this.store.latestReceivedAt();
    this.intervalMs = this.store.frameIntervalMs();
    const summary = this.store.summary();
    this.energyScale = Math.max(100, summary?.maxEnergy ?? 0);

    if (this.worldSize === null || this.worldSize.width !== frame.world.width || this.worldSize.height !== frame.world.height) {
      this.worldSize = { width: frame.world.width, height: frame.world.height };
      this.drawFloor(this.worldSize);
      this.fitWorld();
    }

    // Births: a small forward tick gap and an id that was not in the previous frame.
    const birthsVisible = previous !== null && !jump && frame.tick > previous.tick && frame.tick - previous.tick <= BIRTH_TICK_GAP;
    for (const o of frame.organisms) {
      const v = this.organisms.get(o.id);
      if (v === undefined) {
        this.createOrganism(o, birthsVisible && !this.prevById.has(o.id) ? 'born' : 'alive', now);
      } else if (v.phase === 'dying') {
        v.phase = 'alive'; // seen again (e.g. after a reconnect): cancel the fade
        v.root.scale.set(1);
      }
    }
    for (const v of this.organisms.values()) {
      if (v.phase !== 'dying' && !this.latestById.has(v.id)) {
        v.phase = 'dying';
        v.phaseStart = now;
      }
    }

    const foodIds = new Set<number>();
    for (const f of frame.food) {
      foodIds.add(f.id);
      const existing = this.foods.get(f.id);
      if (existing === undefined) this.createFood(f, previous !== null && !jump ? 'in' : 'stable', now);
      else if (existing.phase === 'out') { existing.phase = 'stable'; existing.sprite.alpha = 1; existing.sprite.width = existing.sprite.height = FOOD_SIZE; }
    }
    for (const fv of this.foods.values()) {
      if (fv.phase !== 'out' && !foodIds.has(fv.id)) { fv.phase = 'out'; fv.phaseStart = now; }
    }
  }

  private createOrganism(o: ObserverOrganism, phase: 'born' | 'alive', now: number): void {
    const color = lineageColor(o.lineageRootId);
    const r = bodyRadius(o.size);
    const root = new Container();

    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.width = glow.height = r * 6.5;
    glow.tint = color.hex;
    glow.alpha = 0.16;
    glow.blendMode = 'add';

    const body = new Container();
    const shape = new Graphics();
    // body with a darker rim
    shape.circle(0, 0, r).fill({ color: color.hex }).stroke({ width: r * 0.22, color: darken(color.hex, 0.45), alpha: 0.9 });
    // directional nose along +x; the body container rotates by heading
    shape.moveTo(r * 0.45, -r * 0.62).lineTo(r * 1.62, 0).lineTo(r * 0.45, r * 0.62).closePath().fill({ color: lighten(color.hex, 0.38) });
    // forward-offset core keeps orientation readable at small sizes
    shape.circle(r * 0.18, 0, r * 0.34).fill({ color: lighten(color.hex, 0.62), alpha: 0.95 });
    body.addChild(shape);

    const ring = new Graphics();
    root.addChild(glow, ring, body);
    root.position.set(o.x, o.y);
    body.rotation = o.heading;
    if (phase === 'born') root.scale.set(0.25);
    this.organismLayer.addChild(root);

    const v: OrganismVisual = {
      id: o.id, color, r, root, body, glow, ring, ringStep: -1,
      phase, phaseStart: now, alpha: 1, x: o.x, y: o.y, heading: o.heading, lineageRootId: o.lineageRootId,
    };
    this.drawRing(v, o.energy);
    this.organisms.set(o.id, v);
  }

  private drawRing(v: OrganismVisual, energy: number): void {
    const frac = Math.max(0, Math.min(1, energy / this.energyScale));
    const step = Math.round(frac * RING_STEPS);
    if (step === v.ringStep) return;
    v.ringStep = step;
    v.ring.clear();
    if (step <= 0) return;
    const radius = v.r * 1.5;
    const start = -Math.PI / 2;
    const end = start + (step / RING_STEPS) * Math.PI * 2;
    v.ring.moveTo(Math.cos(start) * radius, Math.sin(start) * radius)
      .arc(0, 0, radius, start, end)
      .stroke({ width: v.r * 0.17, color: lighten(v.color.hex, 0.55), alpha: 0.85, cap: 'round' });
  }

  private createFood(f: ObserverFood, phase: 'in' | 'stable', now: number): void {
    const sprite = new Sprite(dotTexture());
    sprite.anchor.set(0.5);
    sprite.width = sprite.height = FOOD_SIZE;
    sprite.tint = 0xf2dfa6;
    sprite.alpha = phase === 'in' ? 0 : 1;
    sprite.blendMode = 'add';
    sprite.position.set(f.x, f.y);
    this.foodLayer.addChild(sprite);
    this.foods.set(f.id, { id: f.id, sprite, phase, phaseStart: now });
  }

  private drawFloor(world: Size): void {
    for (const c of this.floorLayer.removeChildren()) c.destroy({ children: true });
    const floor = new Sprite(floorTexture());
    floor.width = world.width;
    floor.height = world.height;
    this.floorLayer.addChild(floor);

    const grid = new Graphics();
    const step = 50;
    for (let x = step; x < world.width; x += step) grid.moveTo(x, 0).lineTo(x, world.height);
    for (let y = step; y < world.height; y += step) grid.moveTo(0, y).lineTo(world.width, y);
    grid.stroke({ width: 0.6, color: 0x9fb4ff, alpha: 0.055 });
    this.floorLayer.addChild(grid);

    const boundary = new Graphics();
    boundary.rect(0, 0, world.width, world.height).stroke({ width: 5, color: 0x7f9dff, alpha: 0.06 });
    boundary.rect(0, 0, world.width, world.height).stroke({ width: 2.4, color: 0x7f9dff, alpha: 0.12 });
    boundary.rect(0, 0, world.width, world.height).stroke({ width: 0.9, color: 0xb9c9ff, alpha: 0.55 });
    this.floorLayer.addChild(boundary);
  }

  // ---- per animation frame -------------------------------------------------

  private readonly tick = (): void => {
    const now = performance.now();
    const dt = Math.min(100, now - this.lastFrameMs);
    this.lastFrameMs = now;
    if (this.latest === null) { this.selectionRing.clear(); this.selectionLabel.text = ''; return; }

    const t = this.paused ? 1 : displayProgress(now - this.latestAt, this.intervalMs);
    const emphasis = this.emphasisLineage;
    const alphaRate = Math.min(1, dt / 120);

    for (const v of this.organisms.values()) {
      if (v.phase === 'dying') {
        const age = now - v.phaseStart;
        if (age >= DEATH_MS) {
          v.root.destroy({ children: true });
          this.organisms.delete(v.id);
          continue;
        }
        const k = age / DEATH_MS;
        v.root.alpha = v.alpha * (1 - k);
        v.root.scale.set(1 - 0.45 * k);
        continue;
      }
      const o = this.latestById.get(v.id);
      if (o === undefined) continue;
      const p = this.prevById.get(v.id);
      if (p !== undefined) {
        v.x = lerp(p.x, o.x, t);
        v.y = lerp(p.y, o.y, t);
        v.heading = lerpAngle(p.heading, o.heading, t);
      } else {
        v.x = o.x; v.y = o.y; v.heading = o.heading;
      }
      v.root.position.set(v.x, v.y);
      v.body.rotation = v.heading;

      const energyFrac = Math.max(0, Math.min(1, o.energy / this.energyScale));
      this.drawRing(v, o.energy);

      const emphasised = emphasis === null || o.lineageRootId === emphasis;
      const target = emphasised ? 1 : DIM_ALPHA;
      v.alpha += (target - v.alpha) * alphaRate;
      let glowAlpha = (0.08 + 0.24 * energyFrac) * (emphasised ? 1 : 0.35);

      if (v.phase === 'born') {
        const age = now - v.phaseStart;
        if (age >= BIRTH_MS) {
          v.phase = 'alive';
          v.root.scale.set(1);
        } else {
          const k = age / BIRTH_MS;
          v.root.scale.set(0.25 + 0.75 * easeOutBack(k));
          glowAlpha += 0.5 * (1 - k);
        }
      }
      v.glow.alpha = glowAlpha;
      v.root.alpha = v.alpha;
    }

    for (const fv of this.foods.values()) {
      if (fv.phase === 'stable') continue;
      const k = Math.min(1, (now - fv.phaseStart) / FOOD_FADE_MS);
      if (fv.phase === 'in') {
        fv.sprite.alpha = k;
        if (k >= 1) fv.phase = 'stable';
      } else {
        fv.sprite.alpha = 1 - k;
        fv.sprite.width = fv.sprite.height = FOOD_SIZE * (1 + 0.8 * k);
        if (k >= 1) { fv.sprite.destroy(); this.foods.delete(fv.id); }
      }
    }

    this.drawSelection(now);
  };

  private drawSelection(now: number): void {
    const g = this.selectionRing;
    g.clear();
    const id = this.selectedId;
    const v = id === null ? undefined : this.organisms.get(id);
    if (v === undefined) { this.selectionLabel.text = ''; return; }
    const s = worldToScreen(this.camera, v.x, v.y);
    const base = v.r * 2.1 * this.camera.scale + 5;
    const pulse = 1 + 0.06 * Math.sin(now / 260);
    const radius = base * pulse;
    const spin = (now / 1400) % (Math.PI * 2);
    const c = v.color.hex;
    g.circle(s.x, s.y, radius + 3).stroke({ width: 6, color: c, alpha: 0.10 });
    g.circle(s.x, s.y, radius).stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
    for (let i = 0; i < 3; i++) {
      const a0 = spin + i * (Math.PI * 2 / 3);
      g.moveTo(s.x + Math.cos(a0) * radius, s.y + Math.sin(a0) * radius)
        .arc(s.x, s.y, radius, a0, a0 + 1.15)
        .stroke({ width: 2, color: lighten(c, 0.35), alpha: 0.95, cap: 'round' });
    }
    this.selectionLabel.text = `#${v.id}`;
    this.selectionLabel.position.set(s.x + radius * 0.72 + 4, s.y - radius * 0.72 - 2);
  }

  // ---- camera / input ------------------------------------------------------

  private handleResize(): void {
    const el = this.element;
    const app = this.app;
    if (el === null || app === null) return;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    if (w === this.viewport.width && h === this.viewport.height) return;
    this.viewport = { width: w, height: h };
    app.renderer.resize(w, h);
    if (this.fitted) this.fitWorld();
    else this.applyCamera();
  }

  private applyCamera(): void {
    if (this.worldSize !== null && !this.fitted) this.camera = clampCamera(this.camera, this.worldSize, this.viewport);
    this.worldLayer.position.set(this.camera.offsetX, this.camera.offsetY);
    this.worldLayer.scale.set(this.camera.scale);
    this.callbacks.onCamera?.(this.camera, this.fitted);
  }

  private zoomAtScreen(factor: number, sx: number, sy: number): void {
    if (this.worldSize === null) return;
    const fit = fitScale(this.worldSize, this.viewport);
    this.camera = zoomAt(this.camera, factor, sx, sy, fit * MIN_ZOOM_FACTOR, fit * MAX_ZOOM_FACTOR);
    this.fitted = false;
    this.applyCamera();
  }

  private localPoint(ev: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.element?.getBoundingClientRect();
    return { x: ev.clientX - (rect?.left ?? 0), y: ev.clientY - (rect?.top ?? 0) };
  }

  private readonly onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    const p = this.localPoint(ev);
    this.zoomAtScreen(wheelZoomFactor(ev.deltaY, ev.deltaMode), p.x, p.y);
  };

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const p = this.localPoint(ev);
    this.pointerDown = { x: p.x, y: p.y, id: ev.pointerId, moved: false };
    this.lastPointer = p;
    try { this.element?.setPointerCapture(ev.pointerId); } catch { /* unsupported */ }
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    const down = this.pointerDown;
    if (down === null || down.id !== ev.pointerId) return;
    const p = this.localPoint(ev);
    const last = this.lastPointer ?? p;
    if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) > 4) down.moved = true;
    if (down.moved) {
      this.camera = panBy(this.camera, p.x - last.x, p.y - last.y);
      this.fitted = false;
      this.applyCamera();
    }
    this.lastPointer = p;
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    const down = this.pointerDown;
    if (down === null || down.id !== ev.pointerId) return;
    this.pointerDown = null;
    try { this.element?.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (down.moved || ev.type === 'pointercancel') return;
    const p = this.localPoint(ev);
    this.callbacks.onSelect(this.pick(p.x, p.y));
  };

  private readonly onPointerLeave = (): void => {
    this.lastPointer = null;
  };

  private readonly onDoubleClick = (ev: MouseEvent): void => {
    ev.preventDefault();
    const p = this.localPoint(ev);
    this.zoomAtScreen(1.8, p.x, p.y);
  };

  /** Nearest displayed organism within a comfortable click radius, or null. */
  pick(sx: number, sy: number): number | null {
    const w = screenToWorld(this.camera, sx, sy);
    const minWorld = 9 / this.camera.scale;
    let best: number | null = null;
    let bestDist = Infinity;
    for (const v of this.organisms.values()) {
      if (v.phase === 'dying') continue;
      const d = Math.hypot(v.x - w.x, v.y - w.y);
      const limit = Math.max(v.r * 1.7, minWorld);
      if (d <= limit && d < bestDist) { best = v.id; bestDist = d; }
    }
    return best;
  }
}
