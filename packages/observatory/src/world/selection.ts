/**
 * Organism selection — a pure view over the newest frame.
 *
 * When the selected organism is no longer in the live frame, its last known
 * display data is kept and marked `alive: false`, so a death is perceptible
 * instead of the panel vanishing. No history beyond that one record is kept.
 */
import type { ObserverFrame, ObserverOrganism } from '../protocol/observerV1.js';

export interface SelectionView {
  id: number;
  organism: ObserverOrganism;
  alive: boolean;
  /** Tick of the newest frame in which the organism was observed alive. */
  lastSeenTick: number;
}

export function resolveSelection(
  previous: SelectionView | null,
  selectedId: number | null,
  frame: ObserverFrame | null,
  lookup?: (id: number) => ObserverOrganism | undefined,
): SelectionView | null {
  if (selectedId === null) return null;
  if (frame !== null) {
    const live = lookup !== undefined ? lookup(selectedId) : frame.organisms.find((o) => o.id === selectedId);
    if (live !== undefined) {
      if (previous !== null && previous.alive && previous.organism === live) return previous;
      return { id: selectedId, organism: live, alive: true, lastSeenTick: frame.tick };
    }
  }
  if (previous !== null && previous.id === selectedId) {
    return previous.alive ? { ...previous, alive: false } : previous;
  }
  return null;
}

export interface InspectorField {
  label: string;
  value: string;
  /** Optional 0..1 fraction for a small bar next to the value. */
  fraction?: number;
  mono?: boolean;
  /** When set, the value names another organism (e.g. the parent) that the UI may make selectable. */
  organismId?: number;
}

export interface InspectorGroup {
  title: string;
  fields: InspectorField[];
}

const fmt = (v: number, digits: number) => v.toFixed(digits);

/**
 * Real simulation data only: no qualitative labels are invented here.
 * Morphology is not a group any more: the inspector shows it in the
 * inheritance section, next to the parent's values (`world/inheritance.ts`).
 */
export function inspectorGroups(view: SelectionView, energyScale: number): InspectorGroup[] {
  const o = view.organism;
  const scale = energyScale > 0 ? energyScale : 100;
  return [
    {
      title: 'Identity',
      fields: [
        { label: 'ID', value: `#${o.id}`, mono: true },
        { label: 'Parent', value: o.parentId === null ? 'founder' : `#${o.parentId}`, mono: true, ...(o.parentId !== null ? { organismId: o.parentId } : {}) },
        { label: 'Lineage root', value: `#${o.lineageRootId}`, mono: true },
        { label: 'Generation', value: String(o.generationDepth) },
      ],
    },
    {
      title: 'Life',
      fields: [
        { label: 'Age', value: `${o.age} ticks` },
        { label: 'Energy', value: fmt(o.energy, 1), fraction: Math.max(0, Math.min(1, o.energy / scale)) },
      ],
    },
  ];
}
