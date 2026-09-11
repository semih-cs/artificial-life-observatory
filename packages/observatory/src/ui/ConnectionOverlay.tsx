import type { ConnectionStatus } from '../connection/observerConnection.js';

export interface ConnectionOverlayProps {
  status: ConnectionStatus;
  onRetry: () => void;
}

const NEW_HINT = '# terminal 1 — create worlds/demo (DEMO seed) and stream it\nnpm run demo:new';
const RESUME_HINT = '# terminal 1 — worlds/demo already exists: recover the same world\nnpm run demo:resume';
const UI_HINT = '# terminal 2 — this page\nnpm run observatory';

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
      <div className="card card-welcome" role="status" data-testid="first-run">
        <p className="welcome-kicker">Artificial Life Observatory</p>
        <h2>{state === 'connecting' ? 'Looking for a local world…' : 'Waiting for a local world…'}</h2>
        <p className="dim">This page only watches a world runner on your machine (<span className="mono">{url}</span>). Nothing here can change the simulation.</p>
        {state !== 'connecting' ? (
          <>
            <p className="welcome-step">Start the demo world, then keep this page open:</p>
            <pre className="mono">{NEW_HINT}{'\n\n'}{UI_HINT}</pre>
            <p className="welcome-step">Already created it once? Resume the same world instead:</p>
            <pre className="mono">{RESUME_HINT}</pre>
            <p className="dim">{retry}{lastError ? ` — ${lastError}` : ''}</p>
            <button type="button" className="btn" onClick={onRetry}>Retry now</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
