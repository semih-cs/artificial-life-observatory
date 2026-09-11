import type { SelectionView } from '../world/selection.js';
import { MORPHOLOGY_GENES, formatDelta, formatGene, inheritanceSummary, type GeneDelta, type InheritanceView } from '../world/inheritance.js';
import type { LineageColor } from '../world/lineageColor.js';
import { formatInt } from './format.js';

export interface InheritanceProps {
  selection: SelectionView;
  view: InheritanceView;
  color: LineageColor;
  onSelectOrganism: (id: number) => void;
}

/** Relative change shown by the tiny bar, clipped at ±25 % of the parent value. */
const BAR_CLIP = 0.25;

function deltaClass(d: GeneDelta): string {
  if (!d.changed) return 'gene-same';
  return d.delta > 0 ? 'gene-up' : 'gene-down';
}

const degrees = (rad: number) => `${(rad * 180 / Math.PI).toFixed(1)}°`;

/**
 * Inherited morphology: the five protocol-v1 genes of the selected organism
 * next to its parent's, with exact deltas. Differences are morphology
 * mutations at that birth (see `world/inheritance.ts`); nothing here says
 * whether a change is good or bad.
 */
export function Inheritance({ selection, view, color, onSelectOrganism }: InheritanceProps) {
  const o = selection.organism;
  const summary = inheritanceSummary(view);
  const comparison = view.comparison;
  const parent = view.parent;
  return (
    <section className={`inspector-group inheritance inheritance-${parent.kind}`} aria-label="Inherited morphology" data-testid="inheritance">
      <h3 className="inspector-group-title">Inherited morphology</h3>
      <p className={`inheritance-summary${comparison !== null && comparison.changedCount > 0 ? ' inheritance-summary-changed' : ''}`} data-testid="inheritance-summary">
        {summary}
      </p>
      <div className="parent-line" data-testid="parent-status">
        {parent.kind === 'founder' ? (
          <span className="dim">Founder · generation {o.generationDepth} · lineage <span className="mono">#{o.lineageRootId}</span></span>
        ) : parent.kind === 'unavailable' ? (
          <span className="dim">Parent <span className="mono">#{parent.parentId}</span> · morphology not observed in this session</span>
        ) : parent.kind === 'alive' ? (
          <>
            <button type="button" className="parent-btn mono" onClick={() => onSelectOrganism(parent.parentId)} title="Select the parent (it is alive)">
              Parent #{parent.parentId}
            </button>
            <span className="parent-state parent-alive">alive · gen {parent.record.generationDepth}</span>
            <span className="parent-arrow" aria-hidden="true">→</span>
            <span className="mono">#{o.id}</span>
            <span className="dim">gen {o.generationDepth}</span>
          </>
        ) : (
          <>
            <span className="mono parent-name">Parent #{parent.parentId}</span>
            <span className="parent-state parent-observed">observed · last seen at tick {formatInt(parent.lastSeenTick)} · gen {parent.record.generationDepth}</span>
            <span className="parent-arrow" aria-hidden="true">→</span>
            <span className="mono">#{o.id}</span>
            <span className="dim">gen {o.generationDepth}</span>
          </>
        )}
      </div>
      <table className="genes">
        <thead>
          <tr>
            <th scope="col">Gene</th>
            <th scope="col" className="num">{comparison !== null ? 'Parent' : ''}</th>
            <th scope="col" className="num">Current</th>
            <th scope="col" className="num">{comparison !== null ? 'Δ' : ''}</th>
            <th scope="col" aria-label="change bar" />
          </tr>
        </thead>
        <tbody>
          {MORPHOLOGY_GENES.map((g) => {
            const current = view.organism[g.key];
            const d = comparison?.deltas.find((x) => x.key === g.key) ?? null;
            const cls = d !== null ? deltaClass(d) : 'gene-solo';
            const rel = d !== null ? Math.max(-BAR_CLIP, Math.min(BAR_CLIP, d.relative)) : 0;
            const barPct = Math.abs(rel) / BAR_CLIP * 50;
            return (
              <tr className={`gene ${cls}`} key={g.key} data-testid={`gene-${g.key}`} data-changed={d !== null ? String(d.changed) : undefined}>
                <th scope="row" className="gene-label">
                  {g.label}
                  {g.key === 'visionAngle' ? <span className="gene-sub dim">{g.unit} · {degrees(current)}</span> : null}
                </th>
                <td className="num gene-parent mono">{d !== null ? formatGene(d.parent, g) : ''}</td>
                <td className="num gene-current mono">{formatGene(current, g)}</td>
                <td className="num gene-delta mono">
                  {d !== null ? (
                    <>
                      {d.changed ? <span className="gene-mark" aria-hidden="true">{d.delta > 0 ? '▲' : '▼'}</span> : null}
                      {formatDelta(d.delta, g)}
                    </>
                  ) : ''}
                </td>
                <td className="gene-bar-cell">
                  {d !== null ? (
                    <span className="gene-bar" aria-hidden="true" title={d.changed ? `${(d.relative * 100).toFixed(1)} % of parent value` : 'unchanged'}>
                      <span className="gene-bar-axis" />
                      {d.changed ? (
                        <span
                          className="gene-bar-fill"
                          style={{
                            left: d.delta > 0 ? '50%' : `${50 - barPct}%`,
                            width: `${Math.max(1.5, barPct)}%`,
                            background: color.css,
                          }}
                        />
                      ) : null}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="inheritance-foot dim">
        {comparison !== null
          ? 'Differences are morphology mutations at this birth, at protocol precision (0.001). Neural genome differences are not shown.'
          : 'Values at protocol precision (0.001). Neural genome is not shown.'}
      </p>
    </section>
  );
}
