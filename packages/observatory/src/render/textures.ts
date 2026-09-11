/**
 * Small procedurally generated textures (built once from a canvas).
 * Everything the world shows is drawn from these plus vector Graphics; there
 * are no sprite assets.
 */
import { Texture } from 'pixi.js';

function radialCanvas(size: number, stops: Array<[number, string]>): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return canvas;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

let glow: Texture | null = null;
let dot: Texture | null = null;
let floor: Texture | null = null;

/** Soft white glow, transparent at the edge. Tint it per lineage. */
export function glowTexture(): Texture {
  if (glow === null) {
    glow = Texture.from(radialCanvas(128, [
      [0, 'rgba(255,255,255,0.85)'],
      [0.25, 'rgba(255,255,255,0.35)'],
      [0.6, 'rgba(255,255,255,0.08)'],
      [1, 'rgba(255,255,255,0)'],
    ]));
  }
  return glow;
}

/** A small luminous point with a soft halo, for food. */
export function dotTexture(): Texture {
  if (dot === null) {
    dot = Texture.from(radialCanvas(64, [
      [0, 'rgba(255,255,255,1)'],
      [0.18, 'rgba(255,255,255,0.95)'],
      [0.3, 'rgba(255,255,255,0.35)'],
      [0.7, 'rgba(255,255,255,0.06)'],
      [1, 'rgba(255,255,255,0)'],
    ]));
  }
  return dot;
}

/** The world floor: a very dark navy with a faint lighter centre for depth. */
export function floorTexture(): Texture {
  if (floor === null) {
    floor = Texture.from(radialCanvas(512, [
      [0, '#142038'],
      [0.55, '#0f182c'],
      [1, '#0b1224'],
    ]));
  }
  return floor;
}
