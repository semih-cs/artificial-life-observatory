import { inspectorGroups, type SelectionView } from '../world/selection.js';
import { lineageColor } from '../world/lineageColor.js';
import { formatInt } from './format.js';

export interface InspectorProps {
  selection: SelectionView;
  energyScale: number;
  lineageFocused: boolean;
  onToggleLineageFocus: () => void;
  onDeselect: () => void;
}

export function Inspector({ selection, energyScale, lineageFocused, onToggleLineageFocus, onDeselect }: InspectorProps) {
  const o = selection.organism;
  const color = lineageColor(o.lineageRootId);
  const groups = inspectorGroups(selection, energyScale);
  return (
    <aside className={`inspector${selection.alive ? '' : ' inspector-dead'}`} aria-label="Organism inspector">
      <header className="inspector-head">
        <span className="swatch" style={{ background: color.css }} aria-hidden="true" />
        <h2 className="inspector-title mono">Organism #{o.id}</h2>
        <button type="button" className="icon-btn" onClick={onDeselect} aria-label="Deselect organism" title="Deselect (Esc)">×</button>
      </header>
      <p className="inspector-status" data-testid="inspector-status">
        {selection.alive
          ? <>alive · observed at tick {formatInt(selection.lastSeenTick)}</>
          : <>no longer alive · last seen at tick {formatInt(selection.lastSeenTick)}</>}
      </p>
      {groups.map((g) => (
        <section className="inspector-group" key={g.title}>
          <h3 className="inspector-group-title">{g.title}</h3>
          <dl className="fields">
            {g.fields.map((f) => (
              <div className="field" key={f.label}>
                <dt>{f.label}</dt>
                <dd className={f.mono ? 'mono' : undefined}>
                  {f.fraction !== undefined ? (
                    <span className="bar" aria-hidden="true">
                      <span className="bar-fill" style={{ width: `${Math.round(f.fraction * 100)}%`, background: color.css }} />
                    </span>
                  ) : null}
                  <span className="field-value">{f.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <footer className="inspector-foot">
        <button type="button" className={`btn${lineageFocused ? ' btn-active' : ''}`} onClick={onToggleLineageFocus}>
          {lineageFocused ? 'Unfocus lineage' : 'Focus lineage'}
        </button>
        <span className="hint">Lineage #{o.lineageRootId} — display emphasis only</span>
      </footer>
    </aside>
  );
}
