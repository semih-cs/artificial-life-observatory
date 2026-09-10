# Phase 0B Experiment Guide

How to run the Phase 0B experiments, what each one isolates, and how to read
what it writes to disk.

Normative source: `docs/Artificial Life Observatory - Spec v4 (Phase 0A
Hotfixed).docx`, principally §12.58, §14.9–§14.33 and §16. Where this guide and
Spec v4 disagree, Spec v4 wins.

Operating rules live in `AGENTS.md`. Current state lives in
`PROJECT_STATUS.md`.

---

## 1. What Phase 0B is for

Phase 0B does not add biology. It asks whether the Phase 0A substrate can be
*run as an experiment*: reproducibly, across many seeds, under intentionally
varied configuration, with standardized metrics, and with extinction and
runaway states detected rather than hidden (§3.4 Phase 0B success criteria).

Phase 0B keeps four kinds of evidence separate (§1.7):

| Gate | Question |
|---|---|
| Engineering | Is the implementation correct and its state valid? |
| Mechanism | Do inheritance and mutation behave as configured? |
| Ecological viability | Does the ecosystem avoid immediate collapse *and* uncontrolled growth? |
| Evolutionary evidence | Across independent seeds, is heritable variation associated with differential outcomes? |

A result from a lower gate is never promoted to a higher one.

---

## 2. Running experiments

From the repository root:

```bash
npm run experiment -- starvation             # Diagnostic A
npm run experiment -- feeding                # Diagnostic B
npm run experiment -- reproduction-control   # Diagnostic C
npm run experiment -- full-evolutionary      # Diagnostic D
npm run experiment -- movement-policy        # Diagnostic A2 (§16.9 fixed movement policies)
npm run experiment -- mutation-2x2           # primary 2x2 mutation factorial
npm run experiment -- calibration-sweep      # coarse ecological parameter sweep
npm run experiment -- calibration-report     # re-read persisted sweep results; runs nothing
```

Options:

| Option | Meaning |
|---|---|
| `--seed-set pilot\|validation` | which seed file to use (default `pilot`) |
| `--max-ticks N` | override the experiment's default horizon |
| `--output DIR` | override the output directory (also the input directory for `calibration-report`) |
| `--sweep-configs a-b\|a,b,c` | run only these sweep configuration indices, so a long sweep can be executed in chunks |
| `--no-runaway-cap` | disable the §14.29 cap — **only** for reproducing a historical run that predates it |

`calibration-report` is read-only: it re-reads an already-persisted sweep from
disk, classifies every replicate, and runs no simulation and consumes no seeds.

`--sweep-configs` runs a subset of a sweep's configurations. Each configuration
writes its own directory, and `sweep-summary.json` is rebuilt from every
configuration directory present on disk afterwards, so a sweep split across
several invocations produces exactly the same output as a single run.

`--no-runaway-cap` exists for one purpose: reproducing results generated before
the cap existed, where enforcing it would change when runs terminate and
confound the comparison. Outcome classification is unaffected either way, since
it works from peak population rather than from how a run ended. **New science
always runs with the cap enforced** — the CLI prints which mode is in force.

---

## 3. Seed discipline

| File | Count | Formula |
|---|---|---|
| `packages/experiment-harness/seeds/pilot.json` | 15 | `100000 + i * 7919`, `i = 0..14` |
| `packages/experiment-harness/seeds/validation.json` | 25 | `500000 + i * 6271`, `i = 0..24` |

The sets are disjoint, and a test asserts it.

Pilot seeds are exploratory. They may be used for debugging, diagnosis,
threshold discovery and configuration tuning (§14.25).

Validation seeds are held out. They may be used only after a candidate
configuration, its thresholds and its analysis plan have been explicitly frozen
and that freeze is recorded in `PROJECT_STATUS.md` (§14.27, §16.28). Results
from validation seeds must never feed back into tuning; doing so and then
calling the same set confirmatory is the specific failure §16.28 exists to
prevent.

**As of this guide, no configuration has been frozen and the validation seeds
are untouched.**

---

## 4. The four diagnostics (§12.58, §16.6–§16.20)

Each stage isolates a progressively larger subsystem. They are not one tuning
loop.

### Diagnostic A — starvation (`starvation`)

Stage A. Isolates energy expenditure with no energy input at all.

- `food.initialFoodCount = 0`, `food.regenAttemptsPerTick = 0`
- both mutation channels OFF
- `energy.reproductionEnergyThreshold = energy.energyCapacity + 1`

The reproduction threshold is a **finite** value strictly above capacity, so
reproduction is unreachable without relying on `Infinity` or `NaN` sentinels —
`validateConfig` rejects non-finite configuration values outright.

Expected: 100% extinction, exactly zero births, food count zero throughout.
A birth here would mean the intervention is not doing what it claims.
Default horizon 5,000 ticks.

### Diagnostic B — feeding (`feeding`)

Stage B. Food ecology and energy acquisition, still without population growth.

- food left at the **default configuration**: `initialFoodCount = 50`,
  `worldFoodCapacity = 60`, `regenAttemptsPerTick = 2`
- both mutation channels OFF
- `energy.reproductionEnergyThreshold = energy.energyCapacity + 1`

Expected: exactly zero births, food present at tick 0 and at the end, and
organisms surviving materially longer than in Diagnostic A. Default horizon
10,000 ticks.

### Diagnostic C — reproduction without mutation (`reproduction-control`)

Stage C. Food ON, reproduction ON, both mutation channels OFF. Because mutation
is off, every offspring must inherit its parent's morphology and neural genome
exactly, which makes this simultaneously an inheritance sanity test (§16.17).
This is also the control cell of the 2×2. Default horizon 10,000 ticks.

### Diagnostic A2 — fixed movement policies (`movement-policy`)

Stage A, refined. §16.9 [LOCKED] permits test-only deterministic movement
policies to isolate the EnergyModel from controller behaviour. Five conditions
over the same seeds:

| Condition | Controller |
|---|---|
| `neural-reference` | the unmodified founder/bootstrap controllers |
| `stationary` | fixed policy, 0% of `maxSpeed` |
| `speed-25` | fixed policy, 25% of `maxSpeed` |
| `speed-50` | fixed policy, 50% of `maxSpeed` |
| `speed-100` | fixed policy, 100% of `maxSpeed` |

The four levels are §16.9's own. Configuration matches Diagnostic A (food
completely off, mutation off, reproduction unreachable) with `lifecycle.maxAge`
raised to 100,000 so `ENERGY_DEPLETION` is the only death mechanism. Default
horizon 20,000 ticks.

A policy is an ordinary `NeuralGenome` with all input→hidden weights zero,
making the controller provably input-independent, and output parameters chosen
so the [LOCKED] §11.59 mapping yields a constant action. All parameters stay
inside `neuralParamBounds`. It is installed once between `bootstrapWorld` and
tick 1 via a condition's optional `worldTransform`, replacing only the neural
genome; morphology, position, heading, energy, ids, food, fertility and both RNG
stream states are preserved exactly, and no RNG is consumed.

Two consequences of the locked rules are handled explicitly. `forward` is a
sigmoid, so 0.0 and 1.0 are asymptotes — the endpoints attain ≈2.7e-8 and
≈1 − 2.7e-8, which for the stationary agent is a movement cost twelve orders of
magnitude below basal. And every policy also turns at full rate: a zero-turn
agent travels straight, reaches the perimeter, is clamped to zero displacement
under the [LOCKED] §12.8 actual-displacement rule, and stops paying movement
cost, which would make all four levels converge on basal. Turning is free and
does not change displacement magnitude, so a full-rate turn keeps each agent
orbiting a ≈2.4-unit polygon well inside the 10-unit minimum boundary
separation. A test demonstrates the zero-turn failure mode.

The CLI prints a §16.9/§16.10 energy report after the standard summary:
measured drain per tick against the drain predicted by the specified model for
each condition's own morphology and speed, observed against predicted lifetime,
and — for the reference cell — the implied constant speed obtained by inverting
the model on the measured drain.

`src/analysis/energyModel.ts` holds the model:

```
predicted drain = metabolism * baseMetabolicConstant
                + movementEnergyCoefficient * size * (fraction * maxSpeed)^2
predicted lifetime = configuredInitialEnergy / predicted drain
```

Drain is measured over the largest death-free sampled window of at most 200
ticks, so the mean is always taken over an unchanging cohort.

Results: see `docs/Phase 0B Pilot Report.md` §7.

### Diagnostic D — full evolutionary loop (`full-evolutionary`)

Stage D. Food ON, reproduction ON, both mutation channels ON — the default
configuration. Verifies the complete substrate operates end to end. It is still
pilot calibration and is not confirmatory evidence of anything (§16.20).
Default horizon 10,000 ticks.

---

## 5. The 2×2 mutation factorial (`mutation-2x2`, §14.15–§14.20, §16.29–§16.31)

Four conditions over the same paired seeds, differing **only** in two boolean
flags:

| Condition | `morphologyMutationEnabled` | `neuralMutationEnabled` |
|---|---|---|
| `control` | false | false |
| `morph-only` | true | false |
| `neural-only` | false | true |
| `combined` | true | true |

A test asserts that these four conditions differ in nothing else.

Paired seeding guarantees an equivalent *starting* stochastic basis, not
identical future random events: once mutation is enabled the streams
legitimately diverge (§16.31). Mutation RNG isolation (§15.7) means a disabled
channel still consumes its fixed draw schedule, so toggling one channel does
not perturb the other's sequence.

`morph-only` and `neural-only` are not "treatments expected to win". A
difference in final population between conditions on 15 pilot seeds is not
evidence that a mutation channel is beneficial.

---

## 6. Calibration sweep (`calibration-sweep`, §14.22–§14.26, §16.24–§16.26)

`calibration-v1` sweeps three coupled ecological parameters (§12.57: energy,
food and reproduction must be calibrated as a system):

```
food.regenAttemptsPerTick : [2, 4, 6]
energy.foodEnergyValue    : [25, 40]
energy.reproductionCost   : [35, 45]
```

12 configurations x the first 8 pilot seeds = 96 replicates, 10,000 ticks each.

Configurations violating a locked invariant are dropped before execution
(`reproductionCost > birthEnergy`, `maxAge > maturityAge`,
`worldFoodCapacity >= initialFoodCount`).

Sweeping is not licence for random knob turning. §14.24 requires calibration to
stay interpretable and diagnosis-driven, and §16.26 requires a change to target
the causal pathway a diagnosis actually implicates.

---

## 7. Run outcomes and the runaway cap (§14.29, §16.34–§16.35)

Every replicate is classified into exactly one outcome:

| Outcome | Meaning |
|---|---|
| `WORLD_EXTINCT` | population reached zero |
| `RUNAWAY_POPULATION` | population reached the test-only cap |
| `VIABLE_COMPLETION` | reached the horizon without extinction or runaway |
| `ERROR` | the run threw |

The cap is `min(8 x initialPopulation, 200)` — 200 at the default initial
population of 25. It exists **only** in experimental execution. The biological
model never suppresses a birth because of it (§12.55), and it is not a
population rule of the canonical world.

Classification uses the **peak** population observed during the run, not the
final one, so a run that exploded and then crashed back is still recorded as a
runaway regime rather than as a viable or an ordinary extinct one.

An early-terminated run stays in the analysis; its termination state is itself
data (§16.34).

`viableCompletionRate` is the fraction of replicates classified
`VIABLE_COMPLETION`. §16.35 sets a [BASELINE] project gate of roughly 70% or
more. That is a project gate placeholder, not a scientific constant.

Results persisted before the cap existed carry no `peakPopulation` field. The
persisted-result reader recovers it from the sampled timeseries and marks it
`recovered-from-timeseries`. Because the timeseries is sampled rather than
per-tick, a recovered peak is a **lower bound**: a run classified runaway from
sampled data genuinely crossed the cap, while a run classified viable might
still have crossed it between two samples.

---

## 8. Degeneracy flags versus calibration criteria

Two separate, configurable threshold sets live in
`src/analysis/degeneracy.ts`. Both are engineering diagnostics, not biological
laws.

`DEFAULT_DEGENERACY_CRITERIA` flags an obviously broken regime:
extinction rate > 0.9, mean births < 1, mean final population > 500, or fewer
than one generation on average.

`DEFAULT_CALIBRATION_CRITERIA` is the precommitted filter for "worth
investigating further": extinction rate <= 0.8, mean births >= 3, mean final
population <= 500, mean max generation depth >= 1, median extinction tick >=
1000.

Two cautions when using these:

1. They are **means over replicates**. A configuration whose replicates are
   half extinctions and half runaways can show a comfortable-looking mean.
   Always read them alongside the outcome classification of §7.
2. Passing them is a screen, not a selection rule. They admit a configuration
   into consideration; they do not choose one.

---

## 9. Functional neural probes (§11.37–§11.41, §14.31)

`src/probes` evaluates a `NeuralGenome` offline against a fixed, versioned
probe set.

`probe-set-v1` is 250 synthetic §11.58 input vectors built by deterministic
enumeration — 210 with food visible (5 distances x 7 bearings x 3 energy levels
x 2 boundary contexts) and 40 with food absent (5 boundary distances x 4
boundary bearings x 2 energy levels). No RNG of any kind is consumed, so there
is no probe-sampling stream to isolate here.

```ts
import {
  PROBE_SET_V1, evaluateProbeSet, computeBehaviorFingerprint,
  fingerprintOfGenome, functionalDistance,
} from '@alo/experiment-harness';

const evaluation  = evaluateProbeSet(genome);           // 250 raw output rows
const fingerprint = computeBehaviorFingerprint(evaluation);
const distance    = functionalDistance(evaluateProbeSet(a), evaluateProbeSet(b));
```

`BehaviorFingerprint` has exactly six dimensions, each a plain mean of raw
network outputs over an explicitly defined probe subset:

| Dimension | Definition |
|---|---|
| `meanForwardTendency` | mean `forward` over all 250 probes |
| `meanTurnMagnitude` | mean \|`turn`\| over all 250 probes |
| `foodApproachResponse` | mean of `turn x sign(foodAngle)` over food-visible probes with non-zero bearing |
| `lowEnergyFoodResponse` | mean `eat` over food-visible probes at the lowest energy level |
| `wallProximityTurnDelta` | mean \|`turn`\| when the wall is near minus mean \|`turn`\| when it is far |
| `highEnergyReproductionResponse` | mean `reproduce` over probes at the highest energy level |

`functionalDistance` is mean absolute difference across the four outputs,
averaged over probes (§11.40 leaves the formula open; the harness commits to
this one and versions it as `mean-absolute-output-difference-v1`).

Three rules, all enforced by tests:

1. **Observational purity.** Probing consumes no CanonicalRNG and writes
   nothing. A deeply frozen genome evaluates fine, and stepping a world 300
   ticks while probing every organism every tick produces the identical
   canonical state hash as the unprobed run.
2. **Not a score.** A fingerprint is a descriptor. It is not fitness, not
   intelligence, and the six dimensions are never combined or ranked. A larger
   functional distance means two controllers respond differently to the same
   fixed inputs — nothing more. Fingerprints are analytical derivatives, never
   inherited or selected on (§6.11, §11.41, both [LOCKED]).
3. **Versioning.** Change any probe input and `probeSetId` must change, because
   fingerprints computed under different probe sets are not comparable
   (§11.38). A pinned content-hash test forces the bump.

Not yet implemented, and not required to close Phase 0B's mechanism work:
in-world periodic probe sampling of living organisms (§11.42–§11.43, §14.32),
which needs its own seeded sampling sub-stream and a cadence.

---

## 10. Output layout

Each experiment writes to `packages/experiment-harness/results/<experiment-id>/`:

| File | Contents |
|---|---|
| `manifest.json` | experiment id, condition and replicate counts, generation timestamp |
| `condition-summary.{json,csv}` | one row per condition: extinction/runaway/viable counts and rates, median extinction tick, population and lineage means, morphology and neural variance means |
| `replicates.{json,csv}` | one row per replicate, including full provenance |
| `timeseries-<condition>.csv` | sampled per-run trajectories |

Every replicate carries provenance: `experimentId`, `conditionId`,
`replicateId`, `seed`, `simulationVersion`, `experimentHarnessVersion`,
`configHash`, `maxTicks`, `gitCommit`, `timestamp`, plus the run's own
`finalStateHash` (§16.3–§16.4).

**Provenance.** `gitCommit` is `git rev-parse HEAD`, which says nothing about
uncommitted changes, and the `experiment` script used to compile only the
harness and import `simulation-core` from its prebuilt `dist` — so a run could
consume a stale core build while recording the current commit. The script now
builds `simulation-core` first, and that hazard cannot recur.

The four experiments whose results predated the fix were re-run on the current
build into parallel `reverified-*` directories, with the originals preserved:

| Original | Provenance-clean re-run |
|---|---|
| `results/diagnostic-reproduction-control/` | `results/reverified-diagnostic-reproduction-control/` |
| `results/diagnostic-full-evolutionary/` | `results/reverified-diagnostic-full-evolutionary/` |
| `results/mutation-2x2/` | `results/reverified-mutation-2x2/` |
| `results/calibration-v1/` | `results/reverified-calibration-v1/` |

All condition summaries matched except three sweep `medianExtinctionTick`
values, and no conclusion changed. **Prefer the `reverified-*` directories when
citing these four experiments.** Full account in
`docs/Phase 0B Pilot Report.md` §9. When a persisted result matters, re-verify
it against the current build rather than trusting the recorded commit alone.

`results/` is gitignored. **The persisted files are the authoritative record of
a run** — not console output, not chat transcripts. Do not rerun an expensive
experiment to reconstruct lost context when valid results are already on disk
(`AGENTS.md` §9).

---

## 11. Interpretation discipline (§1.7, §14.33, AGENTS.md §7)

Do not write, and do not let a summary imply:

- that adaptation occurred, because mutation occurred;
- that intelligence increased, because a genome or a fingerprint changed;
- that a mutation channel is beneficial, because one condition had a larger
  final population on pilot seeds;
- that the population is viable, because a mean looked reasonable across a
  bimodal set of extinctions and runaways.

State the mechanism that was demonstrated, the number of replicates, the seed
set used, and the file the numbers came from. Keep exploratory analytics and
formal gate evidence separately labelled (§14.33).
