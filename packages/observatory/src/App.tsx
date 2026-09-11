import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ObserverConnection, type ConnectionStatus } from './connection/observerConnection.js';
import { FrameStore } from './world/frameStore.js';
import { resolveSelection, type SelectionView } from './world/selection.js';
import { observerWsUrl } from './config.js';
import type { CameraState } from './render/camera.js';
import { WorldView, type WorldViewHandle } from './ui/WorldView.js';
import { Hud } from './ui/Hud.js';
import { Inspector } from './ui/Inspector.js';
import { Controls } from './ui/Controls.js';
import { ConnectionOverlay } from './ui/ConnectionOverlay.js';

const initialStatus = (url: string): ConnectionStatus => ({
  state: 'connecting', url, attempt: 0, retryInMs: null, framesReceived: 0, malformedMessages: 0, lastError: null, everLive: false,
});

export function App() {
  const url = useMemo(() => observerWsUrl(), []);
  const storeRef = useRef<FrameStore | null>(null);
  if (storeRef.current === null) storeRef.current = new FrameStore();
  const store = storeRef.current;

  const [status, setStatus] = useState<ConnectionStatus>(() => initialStatus(url));
  const connectionRef = useRef<ObserverConnection | null>(null);

  useEffect(() => {
    const connection = new ObserverConnection({
      url,
      onFrame: (frame) => store.push(frame, performance.now()),
      onStatus: setStatus,
    });
    connectionRef.current = connection;
    connection.start();
    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, [store, url]);

  const summary = useSyncExternalStore(
    useCallback((cb: () => void) => store.subscribe(cb), [store]),
    () => store.summary(),
    () => null,
  );

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectionRef = useRef<SelectionView | null>(null);
  const selection = useMemo(() => {
    const next = resolveSelection(selectionRef.current, selectedId, store.latest(), (id) => store.organism(id));
    selectionRef.current = next;
    return next;
    // `summary` changes with every frame and is the trigger for re-resolving.
  }, [selectedId, summary, store]);

  const [focusLineage, setFocusLineage] = useState<number | null>(null);
  const [viewPaused, setViewPaused] = useState(false);
  const [camera, setCamera] = useState<{ cam: CameraState; fitted: boolean } | null>(null);
  const [fitScaleValue, setFitScaleValue] = useState<number | null>(null);
  const worldRef = useRef<WorldViewHandle | null>(null);

  const emphasisLineage = focusLineage ?? (selection !== null ? selection.organism.lineageRootId : null);

  const onCamera = useCallback((cam: CameraState, fitted: boolean) => {
    setCamera({ cam, fitted });
    if (fitted) setFitScaleValue(cam.scale);
  }, []);

  const zoomPercent = camera !== null && fitScaleValue !== null && fitScaleValue > 0
    ? Math.round((camera.cam.scale / fitScaleValue) * 100)
    : null;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (ev.key === 'Escape') { setSelectedId(null); }
      else if (ev.key === 'f' || ev.key === 'F') { worldRef.current?.fitWorld(); }
      else if (ev.key === ' ') { ev.preventDefault(); setViewPaused((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const energyScale = Math.max(100, summary?.maxEnergy ?? 0);

  return (
    <div className={`app${selection !== null ? ' app-with-inspector' : ''}`}>
      <main className="stage">
        <WorldView
          ref={worldRef}
          store={store}
          selectedId={selectedId}
          emphasisLineage={emphasisLineage}
          viewPaused={viewPaused}
          onSelect={setSelectedId}
          onCamera={onCamera}
        />
        <Hud status={status} summary={summary} viewPaused={viewPaused} />
        <Controls
          viewPaused={viewPaused}
          zoomPercent={zoomPercent}
          focusLineage={focusLineage}
          onFit={() => worldRef.current?.fitWorld()}
          onZoomIn={() => worldRef.current?.zoomBy(1.4)}
          onZoomOut={() => worldRef.current?.zoomBy(1 / 1.4)}
          onTogglePause={() => setViewPaused((p) => !p)}
          onClearFocus={() => setFocusLineage(null)}
        />
        <p className="hint-bar">scroll to zoom · drag to pan · click an organism · F fit · Esc deselect</p>
        <ConnectionOverlay status={status} onRetry={() => connectionRef.current?.retryNow()} />
      </main>
      {selection !== null ? (
        <Inspector
          selection={selection}
          energyScale={energyScale}
          lineageFocused={focusLineage === selection.organism.lineageRootId}
          onToggleLineageFocus={() => setFocusLineage((f) => (f === selection.organism.lineageRootId ? null : selection.organism.lineageRootId))}
          onDeselect={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}
