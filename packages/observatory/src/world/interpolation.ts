/**
 * Display-only interpolation helpers.
 *
 * Frames arrive at up to ~10 per second; the screen refreshes at 60+. Between
 * two received states the renderer draws organisms part-way along the line
 * from the previous received position to the newest one. Nothing here ever
 * extrapolates past the newest frame, and nothing is written back anywhere.
 */

export const TWO_PI = Math.PI * 2;

export function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

export function lerp(a: number, b: number, t: number): number {
  const u = clamp01(t);
  return a + (b - a) * u;
}

/** Normalise an angle to [0, 2π). */
export function wrapAngle(a: number): number {
  let r = a % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}

/** Signed shortest difference b − a in (−π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = wrapAngle(b) - wrapAngle(a);
  if (d > Math.PI) d -= TWO_PI;
  else if (d <= -Math.PI) d += TWO_PI;
  return d;
}

/** Interpolate along the shortest arc from a to b. Result in [0, 2π). */
export function lerpAngle(a: number, b: number, t: number): number {
  return wrapAngle(a + angleDelta(a, b) * clamp01(t));
}

/**
 * How far to draw between the previous and the newest frame, in [0, 1].
 * `elapsedMs` is the time since the newest frame arrived, `intervalMs` the
 * expected spacing between frames. Saturates at 1: when frames stop arriving
 * the display converges on the newest known state and stays there.
 */
export function displayProgress(elapsedMs: number, intervalMs: number): number {
  if (!(intervalMs > 0)) return 1;
  return clamp01(elapsedMs / intervalMs);
}

/** Bounds for the running estimate of the frame interval. */
export const MIN_FRAME_INTERVAL_MS = 40;
export const MAX_FRAME_INTERVAL_MS = 1000;

/** Exponential moving average of the frame arrival interval, kept within sane bounds. */
export function updateIntervalEstimate(previous: number, observedMs: number, alpha = 0.25): number {
  const bounded = Math.min(MAX_FRAME_INTERVAL_MS, Math.max(MIN_FRAME_INTERVAL_MS, observedMs));
  return previous + (bounded - previous) * alpha;
}
