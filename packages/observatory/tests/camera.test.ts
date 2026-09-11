import { describe, expect, it } from 'vitest';
import { clampCamera, fitCamera, panBy, screenToWorld, wheelZoomFactor, worldToScreen, zoomAt } from '../src/render/camera.js';

const world = { width: 500, height: 500 };

describe('camera (presentation only)', () => {
  it('fits the whole world, centred and aspect-preserving', () => {
    const cam = fitCamera(world, { width: 1000, height: 600 });
    expect(cam.scale).toBeCloseTo((600 / 500) * 0.94, 9);
    const tl = worldToScreen(cam, 0, 0);
    const br = worldToScreen(cam, 500, 500);
    expect((tl.x + br.x) / 2).toBeCloseTo(500, 6);
    expect((tl.y + br.y) / 2).toBeCloseTo(300, 6);
    expect(br.x - tl.x).toBeCloseTo(br.y - tl.y, 6);
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(br.y).toBeLessThanOrEqual(600);
  });

  it('zooms around the cursor so the world point under it stays put', () => {
    const cam = fitCamera(world, { width: 800, height: 800 });
    const cursor = { x: 610, y: 240 };
    const before = screenToWorld(cam, cursor.x, cursor.y);
    const zoomed = zoomAt(cam, 2.5, cursor.x, cursor.y, cam.scale * 0.5, cam.scale * 40);
    const after = screenToWorld(zoomed, cursor.x, cursor.y);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomed.scale).toBeCloseTo(cam.scale * 2.5, 9);
  });

  it('respects the zoom limits', () => {
    const cam = fitCamera(world, { width: 800, height: 800 });
    expect(zoomAt(cam, 1000, 0, 0, cam.scale * 0.5, cam.scale * 40).scale).toBeCloseTo(cam.scale * 40, 9);
    expect(zoomAt(cam, 0.001, 0, 0, cam.scale * 0.5, cam.scale * 40).scale).toBeCloseTo(cam.scale * 0.5, 9);
  });

  it('pans and keeps part of the world on screen', () => {
    const viewport = { width: 800, height: 800 };
    const cam = fitCamera(world, viewport);
    const far = panBy(cam, 5000, -5000);
    const clamped = clampCamera(far, world, viewport, 80);
    expect(clamped.offsetX).toBeLessThanOrEqual(viewport.width - 80);
    expect(clamped.offsetY + world.height * cam.scale).toBeGreaterThanOrEqual(80);
  });

  it('maps wheel deltas to bounded zoom factors', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(-100000)).toBeLessThan(2);
    expect(wheelZoomFactor(100000)).toBeGreaterThan(0.5);
    expect(wheelZoomFactor(-3, 1)).toBeGreaterThan(1);
  });
});
