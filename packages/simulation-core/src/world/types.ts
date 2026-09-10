import { OrganismRuntimeState } from '../organism/types.js';
import { RngStreamsState } from '../rng/rngStream.js';
import { FertilityField } from './fertility.js';

export interface FoodItem {
  id: number;
  x: number;
  y: number;
}

export interface WorldConfigSnapshot {
  width: number;
  height: number;
}

/** Full canonical world state at a tick boundary (§19.4 shape, Phase 0A subset). */
export interface WorldState {
  tick: number;
  simulationVersion: string;
  worldConfig: WorldConfigSnapshot;
  /** Static, seeded, never mutated after initialization (§12.22). */
  fertility: FertilityField;
  organisms: OrganismRuntimeState[];
  food: FoodItem[];
  nextOrganismId: number;
  nextFoodId: number;
  rng: RngStreamsState;
}
