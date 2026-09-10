# Artificial Life Observatory — Phase 0A

A headless, deterministic artificial-life simulation core. Organisms with a
five-gene morphology and a fixed-topology neural controller live, move, eat,
reproduce, mutate and die in a bounded 2D world with a static seeded fertility
field. No UI, no server, no database — those are later phases.

**Status: Phase 0A complete.** The simulation is technically correct enough to
calibrate. It is *not* scientifically validated; validation is Phase 0B.

---

## Phase 0A philosophy

> **We simulate capabilities and constraints, not behaviors.**

Nothing in this repository tells an organism to seek food, avoid walls, or
reproduce at a good moment. The code defines what an organism *can* do (move up
to its `maxSpeed`, see within its `visionRange` and `visionAngle`, request an
action from its network) and what it *costs* (basal metabolism, movement energy,
reproduction energy). What organisms actually do is whatever their inherited
controller produces, filtered by what the world allows.

Consequences that follow from this, and that you should not "fix":

- **There is no fitness function.** Selection is environmental: organisms that
  fail to acquire energy die.
- **Extinction is a valid outcome.** So is population explosion. Both are data.
  The baseline configuration is uncalibrated and most seeds currently go
  extinct — see *Current baseline behaviour* below. Do not tune parameters until
  a trajectory "looks good"; that is Phase 0B's job, with a protocol.
- **There is no hidden homeostasis.** Food does not spawn near hungry organisms,
  populations are not rescued, and no mechanic silently corrects the energy
  economy.
- **Observation is side-effect free.** Telemetry never mutates state or consumes
  RNG, and is excluded from the canonical state hash.

---

## Repository structure

```
.
├── README.md                        this file — practical developer entry point
├── package.json                     npm workspace root (test / build / simulate)
├── tsconfig.base.json               shared TypeScript compiler options
├── .gitignore
├── docs/
│   ├── Artificial Life Observatory - Spec v4 (Phase 0A Hotfixed).docx
│   │                                AUTHORITATIVE specification
│   ├── Phase 0A Implementation Report.md
│   │                                what actually exists in code, post-correction
│   └── reference/                   historical material — see Document hierarchy
└── packages/
    └── simulation-core/             the entire Phase 0A implementation
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── src/
        └── tests/
```

`packages/simulation-core` is the only package. It has zero UI, server,
database, or networking dependencies — its sole runtime dependency surface is
the JavaScript standard library. (`typescript`, `vitest` and `@types/node` are
dev-only.)

---

## Document hierarchy

Read this before implementing anything from a document you found in `docs/`.

### Authoritative

**`docs/Artificial Life Observatory - Spec v4 (Phase 0A Hotfixed).docx`**

The single normative source for biological and simulation semantics. Where this
document and any other disagree, v4 wins. Its most load-bearing Phase 0A
subsections are:

| Section  | Defines                                                     |
|----------|-------------------------------------------------------------|
| §11.58   | the six-input sensory schema (normative)                     |
| §11.59   | activation functions and output semantics (normative)        |
| §13.76   | founder generation, viability screening, bootstrap procedure |
| §15      | the Phase 0A implementation contract and coding checklist    |
| §18.70   | the concrete PRNG, seeding and stream design                 |
| §20.72   | canonical tick semantics, food competition, birth ordering   |

### Reference / history — `docs/reference/`

- `Artificial Life Observatory - Spec v2 (Implementation-Ready).docx`
- `Artificial Life Observatory - Spec v3 (Phase 0A Closed).docx`
- `artificial life observatory.docx` (original concept document)
- `Artificial Life Observatory - Revision Report.md`
- `Phase 0A Final Design Closure Report.md`
- `artificial-life-observatory-simulation-core.zip` (pre-correction source snapshot)

> **Do NOT implement behaviour from v2, v3, the concept document, or any
> revision/closure report where it conflicts with Spec v4.** Several decisions
> that those documents leave open or decide differently were resolved in v4 —
> the tick order, food-competition mechanism, sensory schema, offspring
> placement, and RNG design among them. They are kept for traceability of *why*
> decisions were made, not as instructions.

### Implementation documentation

- **`README.md`** (this file) — how to use the repository.
- **`docs/Phase 0A Implementation Report.md`** — what is implemented, which
  baseline values are in force, what was tested, and the known Phase 0A
  limitations.

### How to use each document

| Document                     | Use it for                                             |
|------------------------------|--------------------------------------------------------|
| Spec v4                      | normative biological/simulation semantics              |
| Final Design Closure Report  | rationale behind Phase 0A closure decisions            |
| Revision Report              | historical traceability only                           |
| Implementation Report        | what currently exists in code, and its limits          |
| README                       | practical developer entry point                        |

---

## Setup

Requires Node.js 20+ (developed against Node 22).

```bash
npm install     # installs the workspace (reproducible from package-lock.json)
npm test        # runs the vitest suite
npm run build   # type-checks and emits packages/simulation-core/dist
```

Headless run:

```bash
npm run simulate -- --seed 123 --ticks 10000
npm run simulate -- --seed 123 --ticks 10000 --json
```

Or, from code:

```ts
import { DEFAULT_SIMULATION_CONFIG, cloneConfig, runSimulation } from '@alo/simulation-core';

const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
config.rootSeed = 123;

const { world, summary } = runSimulation(config, 10_000);
console.log(summary.finalStateHash, summary.endingPopulation);
```

---

## Architecture

`packages/simulation-core/src`:

| Directory        | Contents                                                                                                   |
|------------------|------------------------------------------------------------------------------------------------------------|
| `config/`        | `types.ts` — the whole configuration surface plus `validateConfig()`. `defaults.ts` — the Spec v4 baselines. |
| `rng/`           | `xoshiro128starstar.ts` (core generator), `splitmix32.ts` (state expansion), `streamSeed.ts` (purpose-derived seeding), `rngStream.ts` (the named streams and their serializable state). |
| `genome/`        | `types.ts` — heritable `MorphologyGenome` / `NeuralGenome`. `founder.ts` — founder draw, mechanical validity, the five-check viability screen. |
| `organism/`      | `types.ts` — `OrganismRuntimeState`, structurally separate from the genome, plus lineage and death metadata. |
| `world/`         | `types.ts` (`WorldState`), `fertility.ts` (static seeded field), `bootstrap.ts` (world initialization), `stepWorld.ts` (the canonical tick), `foodCompetition.ts`, `foodRegen.ts`, `offspring.ts`, `runner.ts` (headless N-tick execution). |
| `perception/`    | `sense.ts` — the §11.58 six-input vector, a pure function of world snapshot + organism + phenotype.          |
| `neural/`        | `network.ts` — fixed feedforward evaluation. Pure, RNG-free, mutates nothing.                                |
| `actions/`       | `types.ts` (`ActionIntent`), `decide.ts` (sense → evaluate → intent).                                        |
| `biology/`       | `movement.ts`, `energy.ts`, `reproduction.ts`, `mutation.ts` — the resolution rules.                         |
| `telemetry/`     | `types.ts` — read-only per-tick metrics.                                                                     |
| `serialization/` | `canonicalState.ts` — deterministic canonicalization and the state hash.                                     |
| `cli.ts`         | the minimal headless entry point.                                                                            |
| `tests/`         | the vitest suite (see *Testing*).                                                                            |

### Sense → Decide → Resolve

The separation is structural, not stylistic:

1. **Sense** builds an input vector from the pre-tick snapshot.
2. **Decide** evaluates the network and returns an `ActionIntent`
   (`requestedForwardSpeed`, `requestedTurnRate`, `eatRequested`,
   `reproduceRequested`). It is pure — it consumes no RNG, mutates no world
   state, and mutates no genome.
3. **Resolve** is the only place world state changes. Decision code never moves
   an organism, removes food, creates offspring, or kills anything.

An intent is a *request*, not an outcome. An organism can request full-speed
movement into a wall, request food it cannot reach, or request reproduction it
is too immature to perform.

---

## Simulation lifecycle

`stepWorld(state, config)` is the canonical single-tick mechanism and executes
the Spec §20.72 phase order exactly. Every phase completes for the entire
population before the next begins.

```
 1  Snapshot                    S_t; all sensing reads only this
 2  Sense                       §11.58 six-input vector per living organism
 3  Decide                      neural evaluation -> buffered ActionIntent
 4  Movement resolution         turn, then forward, clamped to world bounds
 5  Movement energy expenditure basal metabolism + movementCost(ACTUAL velocity)
 6  Feeding                     candidate (organism, food) pairs
 7  Food competition            nearest wins; exact ties by ascending organism ID
 8  Energy gain                 foodEnergy credited
 9  Reproduction eligibility    alive AND mature AND energy>=threshold AND requested
10  Reproduction resolution     every eligible parent reproduces
11  Parent reproduction cost    parent.energy -= reproductionCost
12  Child creation              genome cloned from parent
13  Morphology mutation         if the morphology channel is enabled
14  Neural mutation             if the neural channel is enabled
15  Offspring placement         polar offset from parent, then independent heading
16  Death resolution            energy <= 0 OR age >= maxAge, one combined pass
17  Births/removals applied     children join world state, dead leave
18  Food regeneration           fertility-weighted, capped at worldFoodCapacity
19  Telemetry                   read-only
20  Advance tick
```

Three consequences of this order are specified behaviour, not accidents:

- **Feeding can rescue.** There is exactly one death check (phase 16), after
  every energy-affecting phase. An organism taken below zero by movement cost in
  phase 5 survives if it feeds in phases 6–8.
- **A rescued organism can reproduce in the same tick,** because eligibility
  (phase 9) reads post-feeding energy. It can also feed, reproduce, and still
  die in that tick if the reproduction cost takes it back to zero.
- **Newborns do not act in their birth tick.** They exist in world state from
  phase 17 and are visible to other organisms, but they were not part of S_t, so
  they first sense and decide on the following tick.

`stepWorld` does not modify the state it is given: resolution writes to cloned
runtime objects, so an earlier `WorldState` stays valid and replayable.

---

## Determinism contract

**Given the same `simulationVersion`, configuration, root seed and tick count,
two independent runs produce byte-identical canonical state.** This is a
[LOCKED] guarantee, and the regression tests enforce it.

### Seeds and streams

One externally supplied `rootSeed` (uint32) is the only entropy input. Each
named stream derives its own independent 128-bit state:

```
streamSeed(purpose) = splitmix32(rootSeed XOR PURPOSE_CONSTANT[purpose])
initialState        = splitmix32 expanded 4x from streamSeed
```

Phase 0A has exactly two streams:

- **BootstrapRNG** — initialization only: founder candidate draws, bootstrap
  perturbations, placement, headings, the fertility field, initial food.
- **CanonicalRNG** — everything during ticks: mutation, offspring placement and
  heading, food regeneration.

Generator: **xoshiro128\*\*** with 32-bit unsigned arithmetic throughout.
Gaussians use Box–Muller consuming exactly two draws per result (the paired
value is discarded, never cached, so draw count is a fixed function of call
count). RNG state is fully serializable and restorable, and lives inside
`WorldState`.

### Forbidden randomness

Canonical code must never use `Math.random()`, wall-clock time
(`Date.now()`, `performance.now()`), crypto randomness, request timing, database
ordering, thread scheduling, or unordered `Map`/`Set` iteration where order
affects results. A test asserts that a 100-tick run calls `Math.random()` zero
times.

Ordering is always by explicit ID, never by array position: food competition
processes food by ascending food ID and breaks exact-distance ties by ascending
organism ID; births are processed in ascending parent-ID order. A test runs a
tick with the organism and food arrays reversed and asserts an identical result.

### Canonical state hash

`canonicalStateHash(world)` canonicalizes and fingerprints all future-affecting
state: tick, world config, fertility field identity, ID counters, organisms
sorted by ID (runtime state, lineage metadata, genomes in fixed field/index
order), food sorted by ID, and both RNG states. Telemetry and other purely
observational data are excluded. The hash is a non-cryptographic 64-bit
fingerprint — a reproducibility check, not a security primitive.

---

## Configuration

Everything numeric lives in `SimulationConfig`. There are no hidden biological
constants anywhere else in the package. Three classifications, carried through
from the specification:

- **`[LOCKED]`** — a simulation/research semantic invariant. Not a knob. The
  tick order, the six-input schema, sense/decide/resolve separation, the
  `reproductionCost > birthEnergy` relationship, "mutation OFF means exact
  inheritance", the two-stream RNG structure, and per-channel RNG isolation
  (§15.7) are all locked. Changing one changes what the simulation *means*,
  not just what it computes.
- **`[BASELINE]`** — a replaceable default. Real, implementable, and used today;
  swappable later. Gene bounds, `maturityAge`, `maxAge`, world size, the PRNG
  algorithm itself.
- **`[OPEN — EMPIRICAL]`** — a value to calibrate in Phase 0B. Action
  thresholds, mutation sigmas, food regeneration rate, initial food count,
  offspring offset.

Every field in `config/types.ts` carries its classification and spec citation.
`validateConfig()` enforces the structural invariants (including
`reproductionCost > birthEnergy`) and is called by `bootstrapWorld()`.

To change configuration, clone and override — never edit `defaults.ts` for a
one-off experiment:

```ts
const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
config.mutation.morphologyMutationEnabled = false;
config.mutation.neuralMutationEnabled = true;
```

The two mutation flags are deliberately separate fields rather than one combined
switch, because the Phase 0B 2×2 factorial needs all four combinations.

---

## Testing

```bash
npm test                                     # everything
npm test -- tests/determinism.test.ts        # one file
npm run test:watch --workspace=packages/simulation-core
```

| File                    | Covers                                                                        |
|-------------------------|-------------------------------------------------------------------------------|
| `rng.test.ts`           | generator determinism, stream isolation, state export/restore, Gaussian draw-count, all-zero-state contract |
| `neural.test.ts`        | feedforward correctness, output ranges, purity, dimensionality rejection        |
| `perception.test.ts`    | the §11.58 sensor contract and its edge cases — no food, nearest food, exact-distance tie, FOV boundary, vision-range boundary, angular wrapping, food behind, zero distance, wall contact, corners, phenotype-dependent normalization |
| `founder.test.ts`       | non-finite rejection (never coerced to zero), out-of-bounds clamping, the five viability checks, the corrected steering diagnostic, attempt-budget exhaustion |
| `bootstrap.test.ts`     | deterministic initialization, common-founder ancestry, placement separation     |
| `mutation.test.ts`      | all four channel combinations, RNG isolation (§15.7) — toggling one channel preserves the other's draws, offspring placement, heading, and final RNG state — per-parameter rates, bounds, parent immutability |
| `movement.test.ts`      | world bounds, `maxSpeed`, zero movement → zero cost, velocity-squared scaling, size scaling, wall-blocked actual-movement charging, basal separation |
| `death.test.ts`         | starvation, `maxAge` boundaries at `maxAge - 1` and `maxAge`, combined evaluation, same-tick feeding rescue, feed-reproduce-die |
| `reproduction.test.ts`  | maturity gating, cost/birth-energy accounting, the no-free-energy invariant, lineage across generations, newborn-next-tick |
| `food.test.ts`          | single consumption, deterministic contest under reversed input order, capacity cap, fixed regeneration draw count, fertility field determinism and influence |
| `tickOrder.test.ts`     | intent separation, sense/decide purity, shared snapshot, phase-order consequences, parent-ID birth ordering |
| `determinism.test.ts`   | same-seed initialization and N-tick hashes, restored-state continuation, different seeds differ, telemetry neutrality, no `Math.random()` |
| `invariants.test.ts`    | no NaN/Infinity, unique IDs, genome immutability during life, bounds, energy limits, container-order neutrality, population accounting |

**Do not weaken or delete a test to get green output.** If a test fails, either
the code is wrong or the test encodes a misreading of Spec v4 — fix whichever it
actually is.

---

## Current baseline behaviour

With the shipped defaults, most seeds go extinct within a few thousand ticks.
Across seeds 1–10 at 10,000 ticks: births 3–91, peak population 26–55, nine of
ten extinct (earliest ~2,450 ticks), one seed surviving with a population of 10
and lineages eight generations deep.

**This is reported, not hidden, and must not be tuned away here.** The energy
economy is uncalibrated by design: `foodEnergyValue`, `regenAttemptsPerTick`,
`worldFoodCapacity`, world size and the action thresholds are exactly the
coupled parameters Phase 0B exists to calibrate, with a protocol that separates
pilot from confirmatory runs. Random ad-hoc knob turning now would destroy that
separation.

---

## Phase boundaries

| Phase   | Scope                                                          |
|---------|----------------------------------------------------------------|
| **0A**  | **this repository** — headless deterministic biological simulation core |
| 0B      | calibration and validation experiments; the 2×2 mutation factorial, paired seeds, functional probes |
| 0C      | persistence, snapshots, recovery, the canonical continuous world |
| 0D      | the Observatory UI — realtime stream, rendering, creature inspection |

Phase 0A is complete. **Do not start Phase 0B inside `simulation-core`.**

Specifically, none of the following belongs in this package: React, PixiJS or
any rendering; WebSocket or any transport; PostgreSQL or any database; cloud
deployment; snapshot persistence; experiment dashboards or runners; species
detection or emergence analytics; recurrent networks, lifetime learning or
plasticity; signaling, predation, health/damage models; sexual reproduction or
crossover; procedural morphology rendering; social sensing.

The Phase 0B harness will be a *consumer* of `simulation-core`, in its own
package. Networking, persistence and visualization are consumers too — never
dependencies of the core.
