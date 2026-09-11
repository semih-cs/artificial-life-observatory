/**
 * The selected organism's vision cone — display geometry only (V2.1).
 *
 * Derived solely from fields every observer-v1 frame already carries for an
 * organism: its position, heading and the two inherited vision genes,
 * `visionRange` and `visionAngle`. It is the organism's geometric field of
 * vision: the region whose points satisfy distance <= visionRange and
 * |bearing - heading| <= visionAngle / 2 — the same geometry the simulation
 * uses to decide what food (and, in model 0A.3.0, what other organisms) the
 * organism can see.
 *
 * It is NOT a claim about what the organism sensed. The frontend has no
 * sensing algorithm, the frame carries no sensed target, and nothing here
 * selects, ranks or labels another organism. Pure functions: no state, no I/O,
 * nothing sent anywhere; the input is never modified.
 */

/** The only organism fields the cone reads. */
export interface VisionConeSource {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly visionRange: number;
  readonly visionAngle: number;
}

export interface VisionCone {
  /** Apex = the organism's position (world units). */
  cx: number;
  cy: number;
  /** = visionRange (world units). */
  radius: number;
  /** Half-width of the cone in radians: visionAngle / 2, clamped to [0, π]. */
  halfAngle: number;
  /** heading − halfAngle and heading + halfAngle (radians, same convention as heading: +x = 0, clockwise on screen). */
  startAngle: number;
  endAngle: number;
}

/**
 * Cone geometry for one organism, or null when the frame values cannot form a
 * cone (non-finite, or a non-positive range). Position and heading may be
 * passed separately (the display's interpolated values); range and angle
 * always come from the received frame.
 */
export function visionCone(
  source: VisionConeSource,
  displayed: { x: number; y: number; heading: number } = source
): VisionCone | null {
  const { visionRange, visionAngle } = source;
  const { x, y, heading } = displayed;
  if (![x, y, heading, visionRange, visionAngle].every(Number.isFinite)) return null;
  if (visionRange <= 0) return null;
  const halfAngle = Math.max(0, Math.min(Math.PI, visionAngle / 2));
  return { cx: x, cy: y, radius: visionRange, halfAngle, startAngle: heading - halfAngle, endAngle: heading + halfAngle };
}

/**
 * Closed outline of the cone as a flat point list [x0, y0, x1, y1, …]: the
 * apex, then `segments + 1` points along the arc from startAngle to endAngle.
 * This is exactly what the renderer fills and strokes.
 */
export function visionConeOutline(cone: VisionCone, segments = 40): number[] {
  const n = Math.max(1, Math.floor(segments));
  const points: number[] = [cone.cx, cone.cy];
  const span = cone.endAngle - cone.startAngle;
  for (let i = 0; i <= n; i++) {
    const a = cone.startAngle + (span * i) / n;
    points.push(cone.cx + Math.cos(a) * cone.radius, cone.cy + Math.sin(a) * cone.radius);
  }
  return points;
}
