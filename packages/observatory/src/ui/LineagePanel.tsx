import { useEffect, useMemo } from 'react';
import type { LineageAggregate } from '../world/lineages.js';
import { lineageTrend, type ExtinctLineage, type TrendPoint } from '../world/sessionHistory.js';
import { lineageColor } from '../world/lineageColor.js';
import { Sparkline } from './Sparkline.js';
import { formatInt } from './format.js';

export interface LineagePanelProps {
  lineages: LineageAggregate | null;
  recentlyExtinct: readonly ExtinctLineage[];
  trend: readonly TrendPoint[];
  /** The lineage kept emphasised by the user (display only). */
  focusLineage: number | null;
  /** Lineage of the selected organism, if any. */
  selectedLineage: number | null;
  onToggleFocus: (lineageRootId: number) => void;
  onHover: (lineageRootId: number | null) => void;
}

const pct = (fraction: number) => `${(fraction * 100).toFixed(fraction < 0.095 ? 1 : 0)}%`;

/**
 * Living lineages of the newest frame, most numerous first. Rows are buttons
 * that toggle the frontend-only lineage emphasis; nothing is sent anywhere.
 */
export function LineagePanel({ lineages, recentlyExtinct, trend, focusLineage, selectedLineage, onToggleFocus, onHover }: LineagePanelProps) {
  const rows = lineages?.lineages ?? [];
  // Hover emphasis is transient: never outlive the panel (e.g. when the organism tab replaces it).
  useEffect(() => () => onHover(null), [onHover]);
  const focusedTrend = useMemo(
    () => (focusLineage === null ? null : lineageTrend(trend, focusLineage)),
    [trend, focusLineage],
  );
  return (
    <section className="lineages" aria-label="Living lineages" onMouseLeave={() => onHover(null)}>
      <div className="panel-section-head">
        <h3 className="panel-section-title">Lineages</h3>
        <span className="panel-section-meta">
          {lineages ? <>{rows.length} living · mean gen {lineages.meanGeneration.toFixed(1)}</> : '—'}
        </span>
      </div>
      {rows.length === 0 ? <p className="panel-empty">no living organisms in the newest frame</p> : null}
      <ul className="lineage-list">
        {rows.map((l) => {
          const color = lineageColor(l.lineageRootId);
          const focused = focusLineage === l.lineageRootId;
          const selected = selectedLineage === l.lineageRootId;
          return (
            <li key={l.lineageRootId} className={`lineage-row${focused ? ' lineage-focused' : ''}${selected ? ' lineage-selected' : ''}`} data-testid={`lineage-${l.lineageRootId}`}>
              <button
                type="button"
                className="lineage-btn"
                onClick={() => onToggleFocus(l.lineageRootId)}
                onMouseEnter={() => onHover(l.lineageRootId)}
                onFocus={() => onHover(l.lineageRootId)}
                onBlur={() => onHover(null)}
                aria-pressed={focused}
                title={focused ? 'Clear lineage focus (display only)' : `Focus lineage #${l.lineageRootId} in the world (display only)`}
              >
                <span className="swatch swatch-sm" style={{ background: color.css, color: color.css }} aria-hidden="true" />
                <span className="lineage-id mono">#{l.lineageRootId}</span>
                <span className="lineage-bar" aria-hidden="true">
                  <span className="lineage-bar-fill" style={{ width: `${Math.max(2, Math.round(l.fraction * 100))}%`, background: color.css }} />
                </span>
                <span className="lineage-count">{formatInt(l.count)} alive</span>
                <span className="lineage-pct dim">{pct(l.fraction)}</span>
                <span className="lineage-gen">gen {l.maxGeneration}</span>
                {selected ? <span className="lineage-tag" title="lineage of the selected organism">selected</span> : null}
              </button>
              {focused && focusedTrend !== null ? (
                <div className="lineage-trend">
                  <Sparkline values={focusedTrend} color={color.css} width={240} height={26} title={`Living count of lineage #${l.lineageRootId} over this session`} />
                  <span className="lineage-trend-note dim">living count · this session</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {recentlyExtinct.length > 0 ? (
        <div className="extinct">
          <h4 className="panel-subtitle">No longer living · this session</h4>
          <ul className="extinct-list">
            {recentlyExtinct.map((e) => {
              const color = lineageColor(e.lineageRootId);
              return (
                <li key={e.lineageRootId} className="extinct-row" data-testid={`extinct-${e.lineageRootId}`}>
                  <span className="swatch swatch-sm swatch-dead" style={{ background: color.css }} aria-hidden="true" />
                  <span className="lineage-id mono">#{e.lineageRootId}</span>
                  <span className="dim">last seen at tick {formatInt(e.lastSeenTick)} · {e.lastCount} alive · gen {e.lastMaxGeneration}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
