import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseOrganismId, QuickJump } from '../src/ui/QuickJump.js';
import { HelpHint } from '../src/ui/HelpHint.js';
import { ConnectionOverlay } from '../src/ui/ConnectionOverlay.js';
import { FrameStore } from '../src/world/frameStore.js';
import { frame, organism } from './fixtures.js';

const status = (state: 'connecting' | 'live' | 'disconnected' | 'reconnecting' | 'error', everLive = false) => ({
  state, url: 'ws://127.0.0.1:8787/', attempt: 0, retryInMs: state === 'disconnected' ? 1000 : null, framesReceived: 0, malformedMessages: 0, lastError: null, everLive,
});

describe('organism quick-jump', () => {
  it('parses ids leniently and rejects anything else', () => {
    expect(parseOrganismId('208')).toBe(208);
    expect(parseOrganismId(' #208 ')).toBe(208);
    expect(parseOrganismId('')).toBeNull();
    expect(parseOrganismId('abc')).toBeNull();
    expect(parseOrganismId('12.5')).toBeNull();
    expect(parseOrganismId('-3')).toBeNull();
  });

  it('resolves against the newest frame only: alive → selected, otherwise not alive (no history, no query)', () => {
    const store = new FrameStore();
    store.push(frame({ tick: 1, organisms: [organism({ id: 208 }), organism({ id: 9 })] }), 0);
    const jump = (id: number) => (store.organism(id) === undefined ? 'not-alive' : 'selected');
    expect(jump(208)).toBe('selected');
    expect(jump(9)).toBe('selected');
    expect(jump(10)).toBe('not-alive');
    store.push(frame({ tick: 2, organisms: [organism({ id: 9 })] }), 100);
    expect(jump(208)).toBe('not-alive'); // a dead organism is not searched
    const html = renderToStaticMarkup(<QuickJump onJump={() => 'selected'} />);
    expect(html).toContain('data-testid="jump-input"');
    expect(html).toContain('placeholder="organism id"');
  });
});

describe('first-run state and help', () => {
  it('shows the demo startup and resume commands when no world is reachable, and nothing over a live world', () => {
    const html = renderToStaticMarkup(<ConnectionOverlay status={status('disconnected')} onRetry={() => {}} />);
    expect(html).toContain('Artificial Life Observatory');
    expect(html).toContain('Waiting for a local world');
    expect(html).toContain('npm run demo:new');
    expect(html).toContain('npm run demo:resume');
    expect(html).toContain('npm run observatory');
    expect(html).toContain('ws://127.0.0.1:8787/');
    expect(html).not.toMatch(/error/i);
    expect(renderToStaticMarkup(<ConnectionOverlay status={status('connecting')} onRetry={() => {}} />)).toContain('Looking for a local world');
    expect(renderToStaticMarkup(<ConnectionOverlay status={status('live', true)} onRetry={() => {}} />)).toBe('');
    // after frames were seen, a disconnect is a small pill, not the welcome card
    const pill = renderToStaticMarkup(<ConnectionOverlay status={status('reconnecting', true)} onRetry={() => {}} />);
    expect(pill).toContain('pill');
    expect(pill).not.toContain('first-run');
  });

  it('help hint lists the existing controls only when opened and uses factual language', () => {
    const closed = renderToStaticMarkup(<HelpHint />);
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain('help-pop');
  });
});
