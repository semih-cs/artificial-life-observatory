import type { ConnectionStatus, ConnectionState } from '../connection/observerConnection.js';
import type { FrameSummary } from '../world/frameStore.js';
import { formatInt, shortHash } from './format.js';

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: 'Connecting',
  live: 'Live',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting',
  error: 'Error',
};

export interface HudProps {
  status: ConnectionStatus;
  summary: FrameSummary | null;
  viewPaused: boolean;
}

export function Hud({ status, summary, viewPaused }: HudProps) {
  const stateLabel = CONNECTION_LABEL[status.state];
  return (
    <section className="hud" aria-label="Observatory status">
      <div className="hud-row hud-primary">
        <span className={`conn conn-${status.state}`} title={status.url}>
          <span className="conn-dot" aria-hidden="true" />
          <span className="conn-label">{stateLabel}</span>
        </span>
        <span className="stat stat-big">
          <span className="stat-label">Tick</span>
          <span className="stat-value" data-testid="hud-tick">{summary ? formatInt(summary.tick) : '—'}</span>
        </span>
        <span className="stat stat-big">
          <span className="stat-label">Population</span>
          <span className="stat-value" data-testid="hud-population">{summary ? formatInt(summary.population) : '—'}</span>
        </span>
        <span className="stat stat-big" title="Largest generationDepth among living organisms in the newest frame">
          <span className="stat-label">Generation</span>
          <span className="stat-value" data-testid="hud-generation">{summary ? formatInt(summary.maxGeneration) : '—'}</span>
        </span>
        {viewPaused ? <span className="pill pill-paused">View paused · simulation continues</span> : null}
      </div>
      <div className="hud-row hud-secondary">
        <span className="stat"><span className="stat-label">Food</span><span className="stat-value">{summary ? formatInt(summary.foodCount) : '—'}</span></span>
        <span className="stat"><span className="stat-label">Snapshot</span><span className="stat-value">{summary ? formatInt(summary.snapshotTick) : '—'}</span></span>
        <span className="stat"><span className="stat-label">Lineages</span><span className="stat-value">{summary ? formatInt(summary.lineageCount) : '—'}</span></span>
      </div>
      <div className="hud-row hud-meta mono">
        <span title="simulationVersion">{summary ? summary.simulationVersion : 'sim —'}</span>
        <span className="sep">·</span>
        <span title="rootSeed">seed {summary ? summary.rootSeed : '—'}</span>
        <span className="sep">·</span>
        <span title={summary ? `configHash ${summary.configHash}` : 'configHash'}>cfg {summary ? shortHash(summary.configHash) : '—'}</span>
        <span className="sep">·</span>
        <span title="world size">{summary ? `${summary.worldWidth}×${summary.worldHeight}` : '—'}</span>
      </div>
      {status.malformedMessages > 0 ? (
        <div className="hud-row hud-warning mono" title={status.lastError ?? undefined}>
          {status.malformedMessages} malformed frame{status.malformedMessages === 1 ? '' : 's'} ignored
          {status.lastError ? ` — ${status.lastError}` : ''}
        </div>
      ) : null}
    </section>
  );
}
