import { describe, expect, it } from 'vitest';
import { colorDistance, lineageColor, hslToRgb } from '../src/world/lineageColor.js';

describe('deterministic lineage colour', () => {
  it('gives the same colour for the same lineageRootId, every time', () => {
    const a = lineageColor(17);
    const b = lineageColor(17);
    expect(a.hex).toBe(b.hex);
    expect(a.css).toBe(b.css);
    expect(lineageColor(17).css).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('is a pure function of the id (independent of call order)', () => {
    const first = [5, 1, 9].map((id) => lineageColor(id).hex);
    const second = [9, 5, 1].map((id) => lineageColor(id).hex);
    expect(first[0]).toBe(second[1]);
    expect(first[1]).toBe(second[2]);
    expect(first[2]).toBe(second[0]);
  });

  it('keeps representative founder ids visually distinguishable', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const colors = ids.map((id) => lineageColor(id));
    let minDistance = Infinity;
    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        minDistance = Math.min(minDistance, colorDistance(colors[i]!, colors[j]!));
      }
    }
    // weighted-RGB distance; ~60 is a clearly different hue at this lightness
    expect(minDistance).toBeGreaterThan(60);
  });

  it('never produces dark colours that vanish on the navy background', () => {
    for (let id = 1; id <= 200; id++) {
      const c = lineageColor(id);
      const luma = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(luma).toBeGreaterThan(90);
    }
  });

  it('converts hsl to rgb', () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 1, 0.5)).toEqual([0, 255, 0]);
    expect(hslToRgb(240, 1, 0.5)).toEqual([0, 0, 255]);
    expect(hslToRgb(0, 0, 0.5)).toEqual([128, 128, 128]);
  });
});
