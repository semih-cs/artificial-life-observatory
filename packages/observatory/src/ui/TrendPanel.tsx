import { useMemo } from 'react';
import type { TrendPoint } from '../world/sessionHistory.js';
import { Sparkline } from './Sparkline.js';
import { formatInt } from './format.js';

export interface TrendPanelProps {
  trend: readonly TrendPoint[];
}

interface Series { key: string; label: string; values: number[]; color: string; big: boolean }

/** Population and maximum living generation first; lineages and food smaller. Session-only samples. */
export function TrendPanel({ trend }: TrendPanelProps) {
  const series = useMemo<Series[]>(() => [
    { key: 'population', label: 'Population', values: trend.map((p) => p.population), color: '#9fbbff', big: true },
    { key: 'generation', label: 'Max generation', values: trend.map((p) => p.maxGeneration), color: '#d9b8ff', big: true },
    { key: 'lineages', label: 'Lineages', values: trend.map((p) => p.lineageCount), color: '#8fd8c8', big: false },
    { key: 'food', label: 'Food', values: trend.map((p) => p.foodCount), color: '#f0d590', big: false },
  ], [trend]);
  const first = trend[0];
  const last = trend[trend.length - 1];
  return (
    <section className="trends" aria-label="Session trends">
      <div className="trend-grid">
        {series.map((s) => (
          <div className={`trend${s.big ? ' trend-big' : ''}`} key={s.key} data-testid={`trend-${s.key}`}>
            <div className="trend-head">
              <span className="trend-label">{s.label}</span>
              <span className="trend-value" style={{ color: s.color }}>{s.values.length > 0 ? formatInt(s.values[s.values.length - 1]!) : '—'}</span>
            </div>
            <Sparkline values={s.values} color={s.color} width={s.big ? 260 : 120} height={s.big ? 34 : 24} className="trend-spark" title={`${s.label} over this session`} />
          </div>
        ))}
      </div>
      <p className="trend-foot">
        {first !== undefined && last !== undefined && trend.length > 1
          ? <>session · ticks {formatInt(first.tick)} – {formatInt(last.tick)} · {trend.length} samples</>
          : <>session · sampling…</>}
      </p>
    </section>
  );
}
