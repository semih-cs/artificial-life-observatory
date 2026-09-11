import type { ConnectionStatus } from '../connection/observerConnection.js';

export interface ConnectionOverlayProps {
  status: ConnectionStatus;
  onRetry: () => void;
}

const RUN_HINT = 'npm run world -- --dir worlds/demo --ticks-per-second 10 --observe 8787';

/**
 * Connection state on top of the world. While frames have been seen the last
 * world stays visible and only a small pill appears; before the first frame
 * a centred card explains what is expected.
 */
export function ConnectionOverlay({ status, onRetry }: ConnectionOverlayProps) {
  const { state, url, everLive, retryInMs, lastError } = status;
  if (state === 'live') return null;

  if (state === 'error') {
    return (
      <div className="overlay">
        <div className="card card-error" role="alert">
          <h2>Observer stream incompatible</h2>
          <p>{lastError ?? 'The observer sent data this Observatory cannot interpret.'}</p>
          <p className="mono dim">{url}</p>
          <button type="button" className="btn" onClick={onRetry}>Retry</button>
        </div>
      </div>
    );
  }

  const retry = retryInMs !== null ? `retrying in ${Math.max(1, Math.round(retryInMs / 1000))} s` : state === 'reconnecting' ? 'reconnecting…' : 'connecting…';

  if (everLive) {
    return (
      <div className="pill-holder">
        <div className={`pill pill-${state}`} role="status">
          {state === 'disconnected' ? 'Disconnected' : 'Reconnecting'} · {retry}
          <button type="button" className="link-btn" onClick={onRetry}>retry now</button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="card" role="status">
        <h2>{state === 'connecting' ? 'Connecting to the observer stream' : 'Observer not reachable'}</h2>
        <p className="mono">{url}</p>
        {state !== 'connecting' ? (
          <>
            <p>Is a world runner serving observer frames? Start one with</p>
            <pre className="mono">{RUN_HINT}</pre>
            <p className="dim">{retry}{lastError ? ` — ${lastError}` : ''}</p>
            <button type="button" className="btn" onClick={onRetry}>Retry now</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
