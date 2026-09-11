import type { ReactNode } from 'react';

export type SideTab = 'organism' | 'evolution';

export interface SidePanelProps {
  tab: SideTab;
  hasSelection: boolean;
  onTab: (tab: SideTab) => void;
  children: ReactNode;
}

/** The right-hand panel: a compact switch between the organism inspector and the evolution view. */
export function SidePanel({ tab, hasSelection, onTab, children }: SidePanelProps) {
  return (
    <aside className="side" aria-label="Observatory panel">
      <nav className="tabs" aria-label="Panel">
        <button type="button" className={`tab${tab === 'evolution' ? ' tab-active' : ''}`} onClick={() => onTab('evolution')} aria-pressed={tab === 'evolution'}>Evolution</button>
        <button
          type="button"
          className={`tab${tab === 'organism' ? ' tab-active' : ''}`}
          onClick={() => onTab('organism')}
          aria-pressed={tab === 'organism'}
          disabled={!hasSelection}
          title={hasSelection ? 'Selected organism' : 'Click an organism in the world to inspect it'}
        >
          Organism
        </button>
      </nav>
      <div className="side-body">{children}</div>
    </aside>
  );
}
