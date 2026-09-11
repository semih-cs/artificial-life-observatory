import type { ObserverFrame, ObserverOrganism, ObserverFood } from '../src/protocol/observerV1.js';

export function organism(overrides: Partial<ObserverOrganism> = {}): ObserverOrganism {
  return {
    id: 1, parentId: null, generationDepth: 0, lineageRootId: 1,
    x: 100, y: 200, heading: 0.5, size: 1.0, energy: 60, age: 10,
    maxSpeed: 1.2, visionRange: 150, visionAngle: 1.8, metabolism: 1.0,
    ...overrides,
  };
}

export function food(overrides: Partial<ObserverFood> = {}): ObserverFood {
  return { id: 1, x: 50, y: 50, ...overrides };
}

export function frame(overrides: Partial<ObserverFrame> = {}): ObserverFrame {
  const organisms = overrides.organisms ?? [organism()];
  const foods = overrides.food ?? [food()];
  return {
    type: 'frame',
    observerProtocolVersion: 1,
    simulationVersion: '0A.2.0',
    configHash: 'd42a0b850f579fb2',
    rootSeed: 20260910,
    tick: 1000,
    snapshotTick: 1000,
    world: { width: 500, height: 500 },
    population: organisms.length,
    foodCount: foods.length,
    ...overrides,
    organisms,
    food: foods,
  };
}

export function frameText(overrides: Partial<ObserverFrame> = {}): string {
  return JSON.stringify(frame(overrides));
}
