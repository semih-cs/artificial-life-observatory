import type { AncestryChain } from '../world/ancestry.js';
import { lineageColor } from '../world/lineageColor.js';
import { formatInt } from './format.js';

export interface AncestryProps {
  chain: AncestryChain;
  onSelectOrganism: (id: number) => void;
}

/**
 * The selected organism's observed parent chain as a small vertical strip:
 * founder or boundary at the top, the selected organism at the bottom, a Δ
 * badge on every observed parent → child hop. Session-only; nothing is
 * guessed past the first unobserved ancestor.
 */
export function Ancestry({ chain, onSelectOrganism }: AncestryProps) {
  const selected = chain.nodes[chain.nodes.length - 1]!;
  const b = chain.boundary;
  return (
    <section className="inspector-group ancestry" aria-label="Ancestry" data-testid="ancestry">
      <h3 className="inspector-group-title">Ancestry</h3>
      <p className="ancestry-context dim" data-testid="ancestry-context">
        Lineage <span className="mono">#{selected.lineageRootId}</span> · generation {selected.generationDepth} · observed ancestry: {chain.observedHops === 1 ? '1 hop' : `${chain.observedHops} hops`}
        {b.kind === 'founder' ? ' · complete to founder' : ''}
      </p>
      <ol className="chain">
        {b.kind !== 'founder' ? (
          <li className={`chain-boundary chain-boundary-${b.kind}`} data-testid={`ancestry-boundary-${b.kind}`}>
            <span className="chain-node chain-node-boundary" aria-hidden="true">…</span>
            <span className="chain-text dim">
              {b.kind === 'unobserved'
                ? <>Earlier ancestor <span className="mono">#{b.parentId}</span> not observed this session</>
                : <>Earlier ancestry not shown ({chain.observedHops} closest hops kept)</>}
            </span>
          </li>
        ) : null}
        {chain.nodes.map((n, i) => {
          const color = lineageColor(n.lineageRootId);
          const isFounder = n.parentId === null;
          const showHop = i > 0 || b.kind !== 'founder';
          return (
            <li key={n.id} className={`chain-item chain-${n.state}${isFounder ? ' chain-founder' : ''}`} data-testid={`ancestry-node-${n.id}`} data-state={n.state}>
              {showHop ? (
                <span className="chain-hop" aria-hidden={n.changesFromParent === null ? 'true' : undefined}>
                  <span className="chain-line" />
                  {n.changesFromParent !== null ? (
                    <span className={`chain-delta${n.changesFromParent > 0 ? ' chain-delta-changed' : ''}`} data-testid="ancestry-delta" title={`${n.changesFromParent} of 5 morphology genes differ from parent #${n.parentId}`}>
                      Δ{n.changesFromParent}
                    </span>
                  ) : (
                    <span className="chain-delta chain-delta-none" data-testid="ancestry-delta-unavailable" title="parent morphology not observed this session">Δ?</span>
                  )}
                </span>
              ) : null}
              <div className="chain-row">
                <span className={`chain-node${n.state === 'observed' ? ' chain-node-dead' : ''}${n.state === 'selected' ? ' chain-node-selected' : ''}`} style={{ background: color.css, color: color.css }} aria-hidden="true" />
                {n.state === 'alive' ? (
                  <button type="button" className="chain-id mono chain-link" onClick={() => onSelectOrganism(n.id)} title="Select this ancestor (it is alive)">
                    {isFounder ? 'Founder ' : ''}#{n.id}
                  </button>
                ) : (
                  <span className="chain-id mono">{isFounder ? 'Founder ' : ''}#{n.id}</span>
                )}
                <span className="chain-gen dim">gen {n.generationDepth}</span>
                {n.state === 'selected' ? <span className="chain-tag chain-tag-selected">selected</span> : null}
                {n.state === 'alive' ? <span className="chain-tag chain-tag-alive">alive</span> : null}
                {n.state === 'observed' ? <span className="chain-tag chain-tag-observed">observed · last seen t {n.lastSeenTick !== null ? formatInt(n.lastSeenTick) : '—'}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
