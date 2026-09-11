import type { HistorySnapshot } from '../world/sessionHistory.js';
import { TrendPanel } from './TrendPanel.js';
import { LineagePanel } from './LineagePanel.js';
import { EventFeed } from './EventFeed.js';

export interface EvolutionPanelProps {
  history: HistorySnapshot;
  focusLineage: number | null;
  selectedLineage: number | null;
  onToggleFocus: (lineageRootId: number) => void;
  onHoverLineage: (lineageRootId: number | null) => void;
  onSelectOrganism: (id: number) => void;
}

/** Evolution visibility: trends, living lineages, and the birth/death feed — all session-only and display-only. */
export function EvolutionPanel({ history, focusLineage, selectedLineage, onToggleFocus, onHoverLineage, onSelectOrganism }: EvolutionPanelProps) {
  const agg = history.lineages;
  return (
    <div className="evolution" data-testid="evolution-panel">
      <div className="evolution-summary">
        <span className="stat stat-big">
          <span className="stat-label">Max generation</span>
          <span className="stat-value" data-testid="evo-max-gen">{agg ? agg.maxGeneration : '—'}</span>
        </span>
        <span className="stat">
          <span className="stat-label">Mean gen</span>
          <span className="stat-value">{agg ? agg.meanGeneration.toFixed(1) : '—'}</span>
        </span>
        <span className="stat">
          <span className="stat-label">Lineages</span>
          <span className="stat-value">{agg ? agg.lineages.length : '—'}</span>
        </span>
      </div>
      <TrendPanel trend={history.trend} />
      <LineagePanel
        lineages={agg}
        recentlyExtinct={history.recentlyExtinct}
        trend={history.trend}
        focusLineage={focusLineage}
        selectedLineage={selectedLineage}
        onToggleFocus={onToggleFocus}
        onHover={onHoverLineage}
      />
      <EventFeed events={history.events} focusLineage={focusLineage} onSelectOrganism={onSelectOrganism} />
      <p className="panel-foot dim">
        Session-only observation: derived in this browser from received frames, never stored or sent.
        {history.resets > 0 ? ` Cleared ${history.resets}× when a different world identity arrived.` : ''}
      </p>
    </div>
  );
}
