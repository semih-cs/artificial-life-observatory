/**
 * World camera — presentation only.
 *
 * screen = world * scale + offset. The camera never touches simulation data;
 * it only decides which part of the world is on screen and how large.
 */

export interface CameraState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Size {
  width: number;
  height: number;
}

export const FIT_PADDING = 0.94;
export const MIN_ZOOM_FACTOR = 0.5;   // relative to the fit scale
export const MAX_ZOOM_FACTOR = 40;    // relative to the fit scale

export function fitScale(world: Size, viewport: Size, padding = FIT_PADDING): number {
  if (world.width <= 0 || world.height <= 0 || viewport.width <= 0 || viewport.height <= 0) return 1;
  return Math.min(viewport.width / world.width, viewport.height / world.height) * padding;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Screen space reserved for the HUD row (top) and the hint bar (bottom) when fitting. */
export const DEFAULT_FIT_INSETS: Insets = { top: 124, right: 16, bottom: 36, left: 16 };

/** A camera that shows the whole world centred in the viewport (minus `insets`). */
export function fitCamera(world: Size, viewport: Size, padding = FIT_PADDING, insets: Insets = NO_INSETS): CameraState {
  const inner: Size = {
    width: Math.max(1, viewport.width - insets.left - insets.right),
    height: Math.max(1, viewport.height - insets.top - insets.bottom),
  };
  const scale = fitScale(world, inner, padding);
  return {
    scale,
    offsetX: insets.left + (inner.width - world.width * scale) / 2,
    offsetY: insets.top + (inner.height - world.height * scale) / 2,
  };
}

export function worldToScreen(cam: CameraState, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * cam.scale + cam.offsetX, y: wy * cam.scale + cam.offsetY };
}

export function screenToWorld(cam: CameraState, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - cam.offsetX) / cam.scale, y: (sy - cam.offsetY) / cam.scale };
}

/** Zoom by `factor`, keeping the world point under (cursorX, cursorY) fixed on screen. */
export function zoomAt(cam: CameraState, factor: number, cursorX: number, cursorY: number, minScale: number, maxScale: number): CameraState {
  const target = Math.min(maxScale, Math.max(minScale, cam.scale * factor));
  const ratio = target / cam.scale;
  return {
    scale: target,
    offsetX: cursorX - (cursorX - cam.offsetX) * ratio,
    offsetY: cursorY - (cursorY - cam.offsetY) * ratio,
  };
}

export function panBy(cam: CameraState, dx: number, dy: number): CameraState {
  return { scale: cam.scale, offsetX: cam.offsetX + dx, offsetY: cam.offsetY + dy };
}

/**
 * Keep the world from being pushed out of view: at least `margin` (in screen
 * pixels) of the world stays inside the viewport on each axis.
 */
export function clampCamera(cam: CameraState, world: Size, viewport: Size, margin = 80): CameraState {
  const w = world.width * cam.scale;
  const h = world.height * cam.scale;
  const minX = Math.min(margin, viewport.width) - w;
  const maxX = viewport.width - Math.min(margin, viewport.width);
  const minY = Math.min(margin, viewport.height) - h;
  const maxY = viewport.height - Math.min(margin, viewport.height);
  return {
    scale: cam.scale,
    offsetX: Math.min(maxX, Math.max(minX, cam.offsetX)),
    offsetY: Math.min(maxY, Math.max(minY, cam.offsetY)),
  };
}

/** Wheel delta → zoom factor. Negative deltaY (wheel up) zooms in. */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const clamped = Math.max(-240, Math.min(240, px));
  return Math.exp(-clamped * 0.0022);
}
