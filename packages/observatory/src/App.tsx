import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ObserverConnection, type ConnectionStatus } from './connection/observerConnection.js';
import { FrameStore } from './world/frameStore.js';
import { SessionHistory } from './world/sessionHistory.js';
import { resolveSelection, type SelectionView } from './world/selection.js';
import { toggleLineageFocus } from './world/lineages.js';
import { observerWsUrl } from './config.js';
import type { CameraState } from './render/camera.js';
import { WorldView, type WorldViewHandle } from './ui/WorldView.js';
import { Hud } from './ui/Hud.js';
import { Inspector } from './ui/Inspector.js';
import { Controls } from './ui/Controls.js';
import { ConnectionOverlay } from './ui/ConnectionOverlay.js';
import { SidePanel, type SideTab } from './ui/SidePanel.js';
import { EvolutionPanel } from './ui/EvolutionPanel.js';

const initialStatus = (url: string): ConnectionStatus => ({
  state: 'connecting', url, attempt: 0, retryInMs: null, framesReceived: 0, malformedMessages: 0, lastError: null, everLive: false,
});

export function App() {
  const url = useMemo(() => observerWsUrl(), []);
  const storeRef = useRef<FrameStore | null>(null);
  if (storeRef.current === null) storeRef.current = new FrameStore();
  const store = storeRef.current;
  const historyRef = useRef<SessionHistory | null>(null);
  if (historyRef.current === null) historyRef.current = new SessionHistory();
  const history = historyRef.current;

  const [status, setStatus] = useState<ConnectionStatus>(() => initialStatus(url));
  const connectionRef = useRef<ObserverConnection | null>(null);

  useEffect(() => {
    const connection = new ObserverConnection({
      url,
      onFrame: (frame) => {
        store.push(frame, performance.now());
        // Session-only history, derived from the same frame; reuses the store's id map.
        history.push(frame, store.latestOrganisms());
      },
      onStatus: setStatus,
    });
    connectionRef.current = connection;
    connection.start();
    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, [store, history, url]);

  const summary = useSyncExternalStore(
    useCallback((cb: () => void) => store.subscribe(cb), [store]),
    () => store.summary(),
    () => null,
  );
  const historySnapshot = useSyncExternalStore(
    useCallback((cb: () => void) => history.subscribe(cb), [history]),
    () => history.snapshot(),
    () => history.snapshot(),
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
  const [hoverLineage, setHoverLineage] = useState<number | null>(null);
  const [viewPaused, setViewPaused] = useState(false);
  const [camera, setCamera] = useState<{ cam: CameraState; fitted: boolean } | null>(null);
  const [fitScaleValue, setFitScaleValue] = useState<number | null>(null);
  const worldRef = useRef<WorldViewHandle | null>(null);

  // Side panel: the organism tab opens on selection; deselecting returns to evolution.
  const [tab, setTab] = useState<SideTab>('evolution');
  const hasSelection = selection !== null;
  const prevHasSelection = useRef(false);
  useEffect(() => {
    if (hasSelection && !prevHasSelection.current) setTab('organism');
    if (!hasSelection) setTab('evolution');
    prevHasSelection.current = hasSelection;
  }, [hasSelection, selectedId]);

  const selectedLineage = selection !== null ? selection.organism.lineageRootId : null;
  const emphasisLineage = hoverLineage ?? focusLineage ?? selectedLineage;

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
  const onToggleFocus = useCallback((lineageRootId: number) => setFocusLineage((f) => toggleLineageFocus(f, lineageRootId)), []);
  const onSelectFromFeed = useCallback((id: number) => {
    // Only an organism still present in the newest frame can be selected from the feed.
    if (store.organism(id) !== undefined) setSelectedId(id);
  }, [store]);

  return (
    <div className="app app-with-side">
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
      <SidePanel tab={tab} hasSelection={hasSelection} onTab={setTab}>
        {tab === 'organism' && selection !== null ? (
          <Inspector
            selection={selection}
            energyScale={energyScale}
            lineageFocused={focusLineage === selection.organism.lineageRootId}
            onToggleLineageFocus={() => onToggleFocus(selection.organism.lineageRootId)}
            onDeselect={() => setSelectedId(null)}
          />
        ) : (
          <EvolutionPanel
            history={historySnapshot}
            focusLineage={focusLineage}
            selectedLineage={selectedLineage}
            onToggleFocus={onToggleFocus}
            onHoverLineage={setHoverLineage}
            onSelectOrganism={onSelectFromFeed}
          />
        )}
      </SidePanel>
    </div>
  );
}
