import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseObserverMessage } from '../src/protocol/observerV1.js';

/**
 * V2.6: the observer protocol is unchanged (v1), so the frozen frontend
 * validator must accept a REAL frame captured from a live `0A.8.0` world
 * without any frontend change — and that frame must carry no controller
 * internals. The fixture was captured from `npm run world --model 0A.8.0
 * --observe` (coverage seed 8, not a canonical reference).
 */
const fixture = path.resolve(__dirname, 'fixtures/observer-frame-0A.8.0.json');

describe('observer protocol v1 accepts a live 0A.8.0 frame unchanged', () => {
  it('parses a captured 0A.8.0 frame and exposes no recurrent or plastic internals', () => {
    const text = fs.readFileSync(fixture, 'utf8');
    const result = parseObserverMessage(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const frame = result.frame;
    expect(frame.simulationVersion).toBe('0A.8.0');
    expect(frame.observerProtocolVersion).toBe(1);
    expect(frame.organisms.length).toBeGreaterThan(0);
    expect(frame.organisms.some((o) => o.parentId !== null)).toBe(true);
    for (const forbidden of ['hiddenState', 'recurrentHiddenWeights', 'recurrentInitSigma', 'Offsets', 'Eligibility', 'handlingProgress', 'holderId']) {
      expect(text).not.toContain(forbidden);
    }
  });
});
