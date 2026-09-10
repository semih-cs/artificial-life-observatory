# PROJECT_STATUS.md — Artificial Life Observatory

**Last updated:** 2026-09-10
**Purpose:** live handoff state for continuation across chat/model/usage limits.

> Read `AGENTS.md` first.
> This file describes the current repository state, not the long-term vision.
> Where this file and the repository disagree, the repository wins — fix this
> file before proceeding.

---

## Current phase

**Phase 0A:** COMPLETE / FROZEN
**Phase 0B:** IN PROGRESS — harness, probes and analysis complete; **calibration
is open**. No baseline configuration has been frozen and the validation seeds
are untouched.
**Phase 0C:** NOT STARTED
**Phase 0D:** NOT STARTED

Do not begin Phase 0C.

---

## Git state

Branch: `master`

Phase 0B checkpoint commit:

`388646e5d20eb62836ab4db97fbbf580022f5319`

```text
388646e Phase 0B checkpoint: experiment harness, functional neural probes, calibration decision
a568d01 fix: mutation RNG isolation (§15.7) — disabled channels consume full draw schedule
db294c2 Phase 0A: complete the headless deterministic simulation core
```

(A follow-up commit records this hash in this file; `git log -1` is
authoritative.)

Worktree after the Phase 0B checkpoint: clean apart from generated artifacts,
which are gitignored (`node_modules/`, `dist/`, `coverage/`, `results/`,
`.DS_Store`, `*.log`).

---

## Verification (this session, on the committed tree)

```text
simulation-core tests:   168 / 168 passed
experiment-harness tests: 50 / 50  passed
workspace total:         218 / 218 passed
workspace build:         PASS (tsc -p tsconfig.json in both packages)
Phase 0A golden hash:    seed 20260910, 10000 ticks -> 6a6576bd49e86b27  CONFIRMED
```

Commands:

```bash
npm test
npm run build
npm run simulate -- --seed 20260910 --ticks 10000
```

Phase 0A was **not reopened**. No locked-invariant bug was found or claimed.

---

## Phase 0A — completed baseline

`packages/simulation-core` is the frozen deterministic headless core: bounded 2D
world, static seeded fertility field, renewable food with capacity, deterministic
BootstrapRNG/CanonicalRNG, deterministic IDs, morphology and neural genomes,
fixed feedforward controller, six-input sensing (§11.58), `ActionIntent`,
Sense → Decide → Resolve, movement with nonlinear actual-velocity energy cost,
basal metabolism, feeding with deterministic conflict resolution, maturity,
reproduction energy accounting, asexual inheritance, independently toggleable
morphology/neural mutation with RNG isolation, lineage metadata, starvation and
max-age death, newborn-next-tick semantics, telemetry, canonical state hashing,
headless runner/CLI.

Regression reference:

```text
seed 20260910, 10000 ticks -> canonical hash 6a6576bd49e86b27
```

**One Phase 0A file is touched by the Phase 0B checkpoint:**
`packages/simulation-core/src/config/types.ts`. `validateConfig` now (a) rejects
non-finite and negative values for the numeric configuration parameters it
checks, and (b) no longer rejects `reproductionEnergyThreshold >
energyCapacity`. This is a **configuration-validation change only**. It does not
touch any tick equation, RNG consumption or biological rule; §12.37's 70–80%
figure is a [BASELINE] empirical value, not a locked bound. It exists so
Diagnostics A and B can make reproduction unreachable with a finite threshold
instead of an `Infinity`/`NaN` sentinel. The golden hash is unchanged and all
168 core tests pass.

---

## Phase 0B — what exists

`packages/experiment-harness` (depends only on `simulation-core`):

- deterministic multi-seed replicate and experiment runners with full provenance
- pilot/validation seed management with a disjointness test
- four diagnostic definitions (A–D, §12.58) and the 2×2 mutation factorial
- deterministic parameter sweep facility with locked-invariant validation
- timeseries, morphology, neural, lineage and reproduction metrics
- degeneracy flags and precommitted calibration criteria
- **§14.29 runaway-population cap and run-outcome classification** (new)
- **functional neural probes: `probe-set-v1`, probe evaluation, functional
  distance, `behavior-fingerprint-v1`** (new)
- **read-only persisted-result reader and `calibration-report` CLI command**
  (new) — re-reads results from disk, runs nothing, consumes no seeds
- CSV/JSON writers and CLI

CLI:

```bash
npm run experiment -- starvation
npm run experiment -- feeding
npm run experiment -- reproduction-control
npm run experiment -- full-evolutionary
npm run experiment -- mutation-2x2
npm run experiment -- calibration-sweep
npm run experiment -- calibration-report      # read-only
```

### Functional neural probes (§11.37–§11.41, §14.31) — IMPLEMENTED

`src/probes/`:

- `probeSet.ts` — `probe-set-v1`: 250 fixed synthetic §11.58 input vectors built
  by deterministic enumeration (210 food-visible, 40 food-absent). No RNG of any
  kind. `contentHash = 2ec7aa31879365c3`, pinned by test; any change to a probe
  input must bump `probeSetId`.
- `evaluate.ts` — `evaluateProbeSet(genome)`: raw controller outputs, offline and
  stateless, topology inferred from the genome.
- `fingerprint.ts` — `behavior-fingerprint-v1`: six descriptive means plus a
  stable `fingerprintHash`. Not a fitness score, not an intelligence score, never
  combined or ranked.
- `distance.ts` — `functionalDistance`, mean absolute output difference
  (`mean-absolute-output-difference-v1`; §11.40 leaves the formula open).

Verified by test: determinism; observational purity on a deeply frozen genome;
and the decisive check — stepping a world 300 ticks while probing every organism
every tick produces the identical canonical state hash as the unprobed run.

**Not implemented, and not required for Phase 0B mechanism validation:** in-world
periodic probe sampling of living organisms (§11.42–§11.43, §14.32), which needs
its own seeded sampling sub-stream and a cadence. No probe or fingerprint results
have been collected from any experiment — see the pilot report for why that waits
on a frozen baseline.

### Run outcomes (§14.29, §16.34–§16.35) — IMPLEMENTED

`src/analysis/outcome.ts`. Cap `min(8 x initialPopulation, 200)` = 200 at the
default initial population of 25. Enforcement is on by default in the runner and
records `RUNAWAY_POPULATION` as a termination reason; `runawayCapEnabled: false`
disables it. Classification uses **peak** population, so a run that exploded and
then crashed back is still a runaway regime. `ConditionSummary` now carries
`runawayCount`, `viableCompletionCount` and `viableCompletionRate`.

**Every persisted result currently on disk predates cap enforcement.** Those runs
were classified post hoc from their sampled timeseries; a recovered peak is a
lower bound, so the runaway counts below are conservative. Rerunning them is not
required and was not done.

---

## Seed sets

| File | Count | Formula | Status |
|---|---:|---|---|
| `packages/experiment-harness/seeds/pilot.json` | 15 | `100000 + i * 7919`, `i = 0..14` | used |
| `packages/experiment-harness/seeds/validation.json` | 25 | `500000 + i * 6271`, `i = 0..24` | **UNTOUCHED** |

**Validation seeds have not been used in any persisted result and must stay held
out until a candidate configuration is explicitly frozen and that freeze is
recorded here (§14.27, §16.28).**

---

## Persisted Phase 0B results

Location: `packages/experiment-harness/results/` (gitignored; local artifacts).
Provenance on every replicate: `simulationVersion 0A.1.0`,
`experimentHarnessVersion 0B.1.0`, `gitCommit a568d016...`, pilot seed set.

**When console or chat output disagrees with these files, the files win.**

### Diagnostics A–D (15 pilot seeds each)

| Diagnostic | Replicates | Extinction rate | Median extinction tick | Total births | Max generation | Mean final population |
|---|---:|---:|---:|---:|---:|---:|
| A — starvation | 15 | 100% | 1066 | 0 | 0 | 0.00 |
| B — feeding | 15 | 100% | 3000 | 0 | 0 | 0.00 |
| C — reproduction, no mutation | 15 | 66.67% | 3228.5 | 4337 | 13 | 57.53 |
| D — full evolutionary loop | 15 | 60% | 3000 | 4904 | 14 | 73.13 |

**Diagnostic A — VALID.** `food.initialFoodCount = 0`,
`food.regenAttemptsPerTick = 0`, both mutation channels OFF,
`reproductionEnergyThreshold = energyCapacity + 1` (finite). Exactly 0 births in
all 15 replicates; food count 0 at tick 0 and 0 at the end; 100% extinction;
extinction ticks 485–1662. Horizon 5,000 ticks.

**Diagnostic B — VALID.** Food left at the **default configuration** —
`initialFoodCount = 50`, `worldFoodCapacity = 60`, `regenAttemptsPerTick = 2`
(verified against `DEFAULT_SIMULATION_CONFIG` and against tick-0 food count 50 in
the persisted timeseries) — both mutation channels OFF,
`reproductionEnergyThreshold = energyCapacity + 1`. Exactly 0 births in all 15
replicates; ending food count 60 in every replicate. Extinction ticks: 3000 in 13
of 15 replicates (`maxAge` = 3000), plus one at 1062 and one at 2931 — so most
but **not all** cohorts reach the age ceiling. Horizon 10,000 ticks.

**Diagnostics C and D** are preliminary pilot observations only.

### 2×2 mutation factorial (15 paired pilot seeds, 10,000 ticks)

| Condition | Morph | Neural | Extinction rate | Mean final pop | Total births | Max generation | Extinct | Runaway | Viable | Viable rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| control | OFF | OFF | 66.67% | 57.53 | 4337 | 13 | 10 | 1 | 4 | 26.7% |
| morph-only | ON | OFF | 60% | 52.40 | 4392 | 13 | 9 | 1 | 5 | 33.3% |
| neural-only | OFF | ON | 60% | 80.80 | 5775 | 15 | 9 | 3 | 3 | 20.0% |
| combined | ON | ON | 60% | 73.13 | 4904 | 14 | 9 | 2 | 4 | 26.7% |

Interpretation is **preliminary only**. The distributions are bimodal (9–10 of 15
end at population 0; the rest end in the hundreds), and the condition with the
largest mean final population has the **lowest** viable completion rate. Do not
select a winner from these seeds.

### Calibration sweep `calibration-v1` (12 configurations x 8 pilot seeds)

```text
food.regenAttemptsPerTick: [2, 4, 6]
energy.foodEnergyValue:    [25, 40]
energy.reproductionCost:   [35, 45]
96 replicates, 10,000 max ticks
```

The precommitted `DEFAULT_CALIBRATION_CRITERIA` pass **11 of 12** configurations;
the single failure is `regen=4, foodEnergy=40, reproCost=35` on mean final
population 548.6.

Reclassified by §14.29 / §16.35 (reproduce with
`npm run experiment -- calibration-report`): viable completion rate is **0% in 8
of 12 configurations** and **37.5% at best** (`regen=2, foodEnergy=25,
reproCost=45`, 3 of 8). The §16.35 [BASELINE] gate is roughly 70%. Full table in
`docs/Phase 0B Pilot Report.md` §4.

---

## Calibration decision

**NO candidate baseline selected. Nothing frozen. Validation seeds untouched.**

Reasons (detail in `docs/Phase 0B Pilot Report.md` §5):

1. No configuration meets the §16.35 viable-completion gate; best observed 37.5%
   against a ~70% baseline, and 8 of 12 configurations have zero viable
   replicates.
2. The precommitted criteria pass 11 of 12 configurations, so they screen but do
   not select. Inventing a tie-break after seeing the data is the post-hoc
   selection §14.27 and §16.28 exclude.
3. Selecting on population size would invert the ecological reading here: the
   largest-population configurations are the runaway-dominated ones.
4. Eight seeds per configuration with 4–5 extinctions each leaves very few
   informative replicates (§16.33).
5. All runs used a 10,000-tick horizon; §14.28 / §16.34 set the validation
   horizon at approximately 20,000, so viable completion at the gated horizon is
   unmeasured.

---

## Documentation

| File | State |
|---|---|
| `README.md` | UPDATED — both packages, Phase 0B commands, seed discipline, probe section, test tables |
| `docs/Phase 0B Experiment Guide.md` | CREATED — how to run and read every Phase 0B experiment |
| `docs/Phase 0B Pilot Report.md` | CREATED — persisted-results-only pilot report and calibration decision |
| `docs/Phase 0A Implementation Report.md` | unchanged |
| `AGENTS.md` | unchanged |

---

## Known gaps and uncertainties

1. **Ecology is not calibrated.** Every tested configuration is bimodal between
   early extinction and runaway growth. This is the open Phase 0B problem.
2. **Persisted results predate cap enforcement.** They are classified post hoc
   from sampled timeseries, so recovered peaks — and therefore runaway counts —
   are lower bounds.
3. **Test-only fixed-speed movement policies (§16.9) are not implemented.** They
   are what would separate "founder controllers move little" from "the energy
   model is off" in Diagnostic A, whose lifetimes (median 1066) sit above the
   §16.8 analytical target of 500–700 ticks.
4. **In-world probe sampling (§11.42–§11.43, §14.32) is not implemented.** The
   offline probe framework is complete; periodic sampling of living organisms
   with its own seeded sub-stream is not.
5. **No probe or fingerprint data has been collected** from any experiment.
6. **Runs are 10,000 ticks, not the §14.28 [BASELINE] 20,000.**
7. `npm ci` on a machine whose platform differs from the one that populated
   `node_modules` may need the platform-specific rollup/esbuild optional
   dependency reinstalled before vitest will start. This is an npm optional-
   dependency issue, not a repository defect.

---

## Scientific caution

Supported at pilot level: the deterministic substrate operates; the diagnostic
interventions do what they claim; inheritance and both mutation channels operate
under configuration control; multi-seed treatment conditions execute and can
yield different replicated outcomes; candidate ecological regimes can be explored
systematically; functional neural comparison is available offline,
deterministically and without side effects.

**Not supported, and not to be claimed:** that neural mutation is beneficial,
that morphology mutation is harmful, that any population adapted, that
intelligence increased, or that any tested configuration is ecologically viable.

---

## NEXT EXACT STEP

**Define and run `calibration-v2` — the lifecycle-timescale pilot — on pilot
seeds only.**

Specified in `docs/Phase 0B Pilot Report.md` §6. Concretely:

1. Add a `calibration-v2` sweep to `packages/experiment-harness/src/cli/main.ts`
   (or as a named sweep spec) with:
   ```text
   lifecycle.maturityAge: [300, 500]
   lifecycle.maxAge:      [3000, 6000, 10000]
   ```
   all other parameters at Phase 0A defaults; **all 15 pilot seeds**;
   **20,000 max ticks**; runaway cap enforced (now the default).
   6 configurations x 15 seeds = 90 replicates.
2. Precommit the readout **before running**: primary criterion is
   `viableCompletionRate` per configuration, with extinction and runaway counts
   reported alongside. Mean final population is descriptive only and is not a
   selection criterion.
3. Run it, and write results to `results/calibration-v2/`.
4. If one or more configurations reach roughly 70% viable completion: select the
   highest viable rate, ties broken by smaller departure from the Phase 0A
   defaults; freeze it as `Phase0Baseline_v1` with its full parameter set,
   thresholds and analysis plan recorded in this file; **only then** run the 2×2
   once on the validation seed set, and never retune on those results.
5. If none does: record that here, diagnose the next implicated subsystem, and
   define `calibration-v3`. **Do not lower the gate to manufacture a candidate.**

Do not touch `packages/experiment-harness/seeds/validation.json` before step 4.
Do not begin Phase 0C.
