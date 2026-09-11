/**
 * Deterministic lineage colours — frontend only.
 *
 * The same `lineageRootId` always maps to the same colour, in every session
 * and on every client, without any state. Colours carry no meaning: they only
 * tell lineages apart on the dark world background. Nothing here is ever
 * stored in or sent to the simulation.
 */

export interface LineageColor {
  /** 0xRRGGBB */
  hex: number;
  /** CSS colour string */
  css: string;
  /** hue in degrees [0, 360) */
  hue: number;
  r: number;
  g: number;
  b: number;
}

const GOLDEN = 0.618033988749895;
const HUE_OFFSET = 0.42; // starts founder 1 in the warm range rather than on the background's blue
const LIGHTNESS_TIERS = [0.60, 0.67, 0.75] as const;

function frac(v: number): number {
  return v - Math.floor(v);
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t0: number): number => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(channel(hh + 1 / 3) * 255), Math.round(channel(hh) * 255), Math.round(channel(hh - 1 / 3) * 255)];
}

const cache = new Map<number, LineageColor>();

export function lineageColor(lineageRootId: number): LineageColor {
  const cached = cache.get(lineageRootId);
  if (cached !== undefined) return cached;

  const id = Number.isFinite(lineageRootId) ? Math.floor(lineageRootId) : 0;
  const hue = frac(id * GOLDEN + HUE_OFFSET) * 360;
  // Three lightness tiers keyed on id mod 3: ids whose golden-ratio hues land
  // close together (e.g. 1 and 9, 2 and 10) fall in different tiers, so they
  // still separate.
  let lightness = LIGHTNESS_TIERS[((id % 3) + 3) % 3]!;
  // Blues sit closest to the background; lift them slightly.
  if (hue > 195 && hue < 265) lightness += 0.05;
  const saturation = 0.74 + frac(id * 0.5698402909980532) * 0.14;
  const [r, g, b] = hslToRgb(hue, saturation, lightness);
  const hex = (r << 16) | (g << 8) | b;
  const color: LineageColor = { hex, css: `#${hex.toString(16).padStart(6, '0')}`, hue, r, g, b };
  cache.set(lineageRootId, color);
  return color;
}

/** Perceptual-ish distance between two colours (weighted RGB), for tests and tooling. */
export function colorDistance(a: LineageColor, b: LineageColor): number {
  const rm = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/** Lighten toward white by `amount` in [0, 1]. Returns 0xRRGGBB. */
export function lighten(hex: number, amount: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/** Darken toward black by `amount` in [0, 1]. Returns 0xRRGGBB. */
export function darken(hex: number, amount: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const mix = (c: number) => Math.round(c * (1 - amount));
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}
