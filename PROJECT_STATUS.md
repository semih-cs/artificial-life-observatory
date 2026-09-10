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
**Phase 0B:** harness, probes, diagnostics and analysis COMPLETE.
**The parameter-sweep calibration cycle is CLOSED and UNSUCCESSFUL.** No baseline
configuration was frozen, no candidate qualified, and the validation seeds are
untouched. Phase 0B cannot proceed to confirmatory validation without first
reconsidering the model-level question in §11.8 of the pilot report.
**Phase 0C:** NOT STARTED
**Phase 0D:** NOT STARTED

Do not begin Phase 0C.

---

## Git state

Branch: `master`

Most recent work is calibration-v3, the final sweep of the cycle. `git log -1`
is authoritative; recent history:

```text
(HEAD)  calibration-v3 result — see `git log -1`
fc05ad1 calibration-v3: implement the precommitted sweep
42e63e7 calibration-v3 PRECOMMITMENT: axes, design, selection rule, terminal rule
7521456 calibration-v2: no candidate — 49 extinct, 40 runaway, 1 viable in 90 replicates
4e063db fix: sourceIdentity was hashing nothing and returning a constant
01e6ebe calibration-v2: add the precommitted sweep definition
7fd7135 provenance: record worktree dirty state and a deterministic source identity
700338c Phase 0B provenance repair: re-verify C, D, 2x2 and calibration-v1 on the current build
1fa6de6 Diagnostic A2 (§16.9): results — energy model verified, Diagnostic A explained
388646e Phase 0B checkpoint: experiment harness, functional neural probes, calibration decision
a568d01 fix: mutation RNG isolation (§15.7) — disabled channels consume full draw schedule
db294c2 Phase 0A: complete the headless deterministic simulation core
```

Worktree after the Phase 0B checkpoint: clean apart from generated artifacts,
which are gitignored (`node_modules/`, `dist/`, `coverage/`, `results/`,
`.DS_Store`, `*.log`).

---

## Verification (this session, on the committed tree)

```text
simulation-core tests:   168 / 168 passed
experiment-harness tests: 77 / 77  passed
workspace total:         245 / 245 passed
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
  — re-reads results from disk, runs nothing, consumes no seeds
- **§16.9 test-only deterministic movement policies and the energy-model
  analysis they feed** (new)
- CSV/JSON writers and CLI

CLI:

```bash
npm run experiment -- starvation
npm run experiment -- feeding
npm run experiment -- reproduction-control
npm run experiment -- full-evolutionary
npm run experiment -- movement-policy
npm run experiment -- mutation-2x2
npm run experiment -- calibration-sweep
npm run experiment -- calibration-report      # read-only

# options: --seed-set, --max-ticks, --output,
#          --sweep-configs a-b|a,b,c  (chunked sweep execution)
#          --no-runaway-cap           (historical reproduction ONLY)
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

### Movement-policy diagnostic (§16.9) — IMPLEMENTED AND RUN

`src/experiments/movementPolicies.ts`, `src/experiments/installPolicy.ts`,
`src/analysis/energyModel.ts`.

Four fixed policies at §16.9's own levels — stationary / 25% / 50% / 100% of
`maxSpeed` — plus the unmodified controllers as a reference cell. A policy is an
ordinary `NeuralGenome` with zeroed input→hidden weights (making the controller
provably input-independent) and output parameters, all inside
`neuralParamBounds`, chosen so the [LOCKED] §11.59 mapping yields a constant
action. It is installed once between `bootstrapWorld` and tick 1 through a
condition's optional `worldTransform`, replacing only the neural genome and
consuming no RNG. **No simulation-core code was changed.**

Result — the uncertainty recorded as gap 3 in the previous handoff is
**RESOLVED: controller effect, not an energy-model effect.**

```text
condition          measured drain   meas/pred    median lifetime   implied speed
neural-reference        0.060739           -               1066          65.7 %
stationary              0.020000      1.0000               2548           0.0 %
speed-25                0.025851      1.0000               1972          25.0 %
speed-50                0.043428      1.0001               1189          50.0 %
speed-100               0.113731      1.0001                461         100.0 %
```

Across all 60 fixed-policy replicates measured/predicted drain lies in
[0.99947, 1.00016]: basal metabolism, the size-scaled velocity-squared movement
term and the phenotype speed mapping behave exactly as §12.6–§12.9 specify.
Diagnostic A's median of 1066 is what this model should produce for controllers
moving at 65.7% of `maxSpeed`; §16.8's 500–700 tick band corresponds to v = 1.0,
i.e. 80% of the default `maxSpeed`. **Do not change `baseMetabolicConstant`,
`movementEnergyCoefficient` or `configuredInitialEnergy` on this evidence.**

Full analysis, including how last-death order statistics reconcile lifetime with
drain in every condition, is in `docs/Phase 0B Pilot Report.md` §7.

### Run provenance — HARDENED

`src/runner/provenance.ts`. Every replicate and every manifest records
`gitCommit`, `gitDirty` and `sourceIdentity` — a deterministic hash of the built
JavaScript of both packages, so a result produced from uncommitted source or
from a stale build is identifiable from the record alone. The manifest takes its
provenance from the replicates themselves, so it cannot claim a different origin
than the results it describes. The CLI prints all three before a run and warns
on a dirty worktree.

One bug was found and fixed during implementation: the identity directories
resolved to non-existent paths, so the hash covered an empty file set and
returned a constant that looked valid. Caught because two different builds
recorded the same identity. Tests now assert the directories exist and are
non-empty, that the identity differs from `EMPTY_IDENTITY`, and that each
directory contributes independently.

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

**Provenance repair (this session).** The four experiments whose results
predated the stale-`dist` fix were re-run on the current verified build, through
the corrected script, with the same pilot seeds and configurations, into
parallel `reverified-*` directories; the originals are preserved for comparison.
186 replicates: 117 bit-identical, **183 identical on every observable
outcome**, and every condition summary identical except three sweep
`medianExtinctionTick` values (all driven by seed 147514, shifts of −11, +3,
+3 ticks). `passesCriteria` unchanged for all 12 configurations and the
§14.29/§16.35 reclassification identical row for row. **No conclusion changed.**
Prefer the `reverified-*` directories when citing these four experiments. Full
account in `docs/Phase 0B Pilot Report.md` §9.

| Original | Provenance-clean re-run |
|---|---|
| `results/diagnostic-reproduction-control/` | `results/reverified-diagnostic-reproduction-control/` |
| `results/diagnostic-full-evolutionary/` | `results/reverified-diagnostic-full-evolutionary/` |
| `results/mutation-2x2/` | `results/reverified-mutation-2x2/` |
| `results/calibration-v1/` | `results/reverified-calibration-v1/` |

The re-runs used `--no-runaway-cap` so their termination behaviour matches the
originals (the cap did not exist then); outcome classification is unaffected
because it works from peak population, not from how a run ended.

### Diagnostic A2 — movement policies (15 pilot seeds x 5 conditions)

`results/diagnostic-movement-policy/`. 75 replicates, 20,000 max ticks, run on
the current build. All 75 ended in extinction with 0 births and 0 food, as
designed. Numbers above; full report in the pilot report §7.

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

### Calibration sweep `calibration-v3` (4 configurations x 15 pilot seeds) — FINAL

`results/calibration-v3/`. Clean worktree, commit `fc05ad1`,
`sourceIdentity c74242c483aff170`, identical across all four configurations.
60 replicates, 20,000 ticks, runaway cap ENABLED.

```text
energy.reproductionEnergyThreshold : [75, 90]
lifecycle.maxAge                   : [3000, 6000]
```

| Threshold | maxAge | Extinct | Runaway | Viable | Extinction rate | Runaway rate | Viable rate | Mean final pop | Max gen | Mean births |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 75 | 3000 | 9 | 5 | 1 | 60.0% | 33.3% | 6.7% | 69.3 | 19 | 312.5 |
| 75 | 6000 | 9 | 6 | 0 | 60.0% | 40.0% | 0.0% | 80.2 | 20 | 289.5 |
| 90 | 3000 | 9 | 6 | 0 | 60.0% | 40.0% | 0.0% | 80.0 | 16 | 296.2 |
| 90 | 6000 | 9 | 6 | 0 | 60.0% | 40.0% | 0.0% | 80.1 | 16 | 264.9 |

**36 extinct, 23 runaway, 1 viable across 60 replicates. NO CANDIDATE —
CALIBRATION CYCLE UNSUCCESSFUL.** Neither axis moved the primary readout;
extinction rate is 60.0% in all four cells. The best cell is the Phase 0A
default configuration itself.

Integrity check: the default configuration appears in both v2 and v3 from
different builds (`4e063db`, `fc05ad1`) and gives 15 of 15 replicates identical
on every field including `finalStateHash`.

### Calibration sweep `calibration-v2` (6 configurations x 15 pilot seeds)

`results/calibration-v2/`. Run from a clean worktree at commit `4e063db`,
`sourceIdentity 893bcb420accc8cf`, identical across all six configurations.
90 replicates, 20,000 ticks, runaway cap ENFORCED.

```text
food.worldFoodCapacity : [60, 120, 240]
lifecycle.maturityAge  : [300, 500]
```

| Capacity | maturityAge | Extinct | Runaway | Viable | Extinction rate | Viable rate | Mean final pop | Max gen |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 60 | 300 | 9 | 6 | 0 | 60.0% | 0.0% | 80.0 | 20 |
| 60 | 500 | 9 | 5 | 1 | 60.0% | 6.7% | 69.3 | 19 |
| 120 | 300 | 7 | 8 | 0 | 46.7% | 0.0% | 106.7 | 20 |
| 120 | 500 | 9 | 6 | 0 | 60.0% | 0.0% | 80.1 | 6 |
| 240 | 300 | 7 | 8 | 0 | 46.7% | 0.0% | 106.9 | 12 |
| 240 | 500 | 8 | 7 | 0 | 53.3% | 0.0% | 93.4 | 7 |

**49 extinct, 40 runaway, 1 viable across 90 replicates. NO CANDIDATE
SELECTED** — best viable rate 6.7% against the ~70% gate; the documented
tie-break never engages because no configuration passes. All six pass the weak
`DEFAULT_CALIBRATION_CRITERIA` screen, which admits configurations where 89 of
90 replicates are degenerate.

Important secondary finding: the same configuration reached 37.5% viable in
calibration-v1 at 10,000 ticks. Two of those three "viable" runs were merely
**not yet runaway** and crossed the cap by tick ~12,000. calibration-v1's
viability figures should be read as viability *at 10,000 ticks*; the 20,000-tick
horizon is load-bearing and must not be shortened. Detail in pilot report §10.

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

## Calibration decision — CYCLE CLOSED, UNSUCCESSFUL

**No candidate baseline was selected after three sweeps. Nothing frozen.
Validation seeds untouched. The parameter-sweep calibration cycle is closed.**

22 configurations were tested:

| Sweep | Direction | Axes | Best viable rate |
|---|---|---|---:|
| v1 | energy and resource coefficients | `regenAttemptsPerTick`, `foodEnergyValue`, `reproductionCost` | 37.5% at 10,000 ticks (horizon-inflated, see gap 10) |
| v2 | standing resource density, reproductive window | `worldFoodCapacity`, `maturityAge` | 6.7% |
| v3 | reproduction gate, cohort turnover | `reproductionEnergyThreshold`, `maxAge` | 6.7% |

At the gated 20,000-tick horizon the best result any configuration has produced
is **6.7%** — one viable replicate in fifteen — against the §16.35 [BASELINE]
gate of roughly 70%. Increasing resources reduces extinction but converts it to
runaway; tightening reproduction and altering lifecycle timings barely move the
outcome mix. No axis tested opened a viable middle.

Per the terminal rule precommitted in pilot report §11.4: no calibration-v4, no
further sweep, no weakened gate, no new axes, no validation seeds.

**Single smallest model-level question, to be considered before any future
calibration cycle (pilot report §11.8):**

> Should the founding population be 25 near-clones of one founder controller?

Across the 10 configurations run at the gated horizon — spanning a 4x change in
food density and every reproduction and lifecycle parameter tested — **11 of 15
seeds produce an identical outcome in every configuration** (7 always extinct,
4 always runaway). Under the default configuration, births split with no middle
ground: every extinct world produced at most 36 births, every non-extinct world
at least 270. A seed determines the founder neural genome, and §13.76 builds all
25 organisms from one founder with `morphBootstrapSigma` ≈ 1% of gene range and
`neuralBootstrapSigma` 0.05 — so the world starts with almost no standing
behavioural variation and one controller draw decides its fate.

This does **not** establish that founder diversity would produce a viable
regime, and it is **not** a Phase 0A defect: §13.76 is a [LOCKED] procedure
implemented as specified. **The model was not modified.**

## Documentation

| File | State |
|---|---|
| `README.md` | UPDATED — both packages, Phase 0B commands, seed discipline, probe section, test tables |
| `docs/Phase 0B Experiment Guide.md` | UPDATED — movement-policy diagnostic, chunked sweeps, provenance and the reverified paths |
| `docs/Phase 0B Pilot Report.md` | UPDATED — §7 movement-policy diagnostic, §9 provenance hazard and repair, §10 calibration-v2 |
| `docs/Phase 0A Implementation Report.md` | unchanged |
| `AGENTS.md` | unchanged |

---

## Known gaps and uncertainties

1. **Ecology is not calibrated.** Every tested configuration is bimodal between
   early extinction and runaway growth. This is the open Phase 0B problem.
2. **Original result folders predate cap enforcement.** In those, runaway
   counts are recovered post hoc from sampled timeseries and are therefore lower
   bounds. The `reverified-*` folders record `peakPopulation` natively, so their
   classification is exact.
3. ~~Test-only fixed-speed movement policies (§16.9) are not implemented.~~
   **RESOLVED.** Implemented and run; the energy model is verified correct and
   Diagnostic A's lifetimes are a controller effect. See the movement-policy
   section above and pilot report §7.
4. **In-world probe sampling (§11.42–§11.43, §14.32) is not implemented.** The
   offline probe framework is complete; periodic sampling of living organisms
   with its own seeded sub-stream is not.
5. **No probe or fingerprint data has been collected** from any experiment.
6. ~~Runs are 10,000 ticks, not the §14.28 [BASELINE] 20,000.~~ **RESOLVED for
   calibration-v2**, which ran at 20,000. The earlier experiments remain at
   10,000; see gap 10.
7. `npm ci` on a machine whose platform differs from the one that populated
   `node_modules` may need the platform-specific rollup/esbuild optional
   dependency reinstalled before vitest will start. This is an npm optional-
   dependency issue, not a repository defect.
8. ~~One persisted replicate does not reproduce.~~ **REPAIRED.** The stale-
   `dist` hazard is fixed (the `experiment` script now builds `simulation-core`
   first) and the four affected experiments were re-run on the current build
   into `reverified-*` directories. 183 of 186 replicates are identical on every
   observable outcome and every condition summary matches except three sweep
   `medianExtinctionTick` values; no conclusion changed. Diagnostics A and B
   were already re-verified (29 of 30 bit-identical). What remains open, and is
   not a defect: seed 147514's trajectory is the one that shifts between builds
   — by 5 ticks in Diagnostic A and by −11/+3/+3 ticks in three sweep
   configurations — and the exact numerical delta between the old and current
   core builds cannot be recovered because the older `dist` no longer exists.
   The current build reproduces that seed consistently.
9. ~~`gitCommit` provenance is still weak.~~ **RESOLVED.** Replicates and
   manifests now record `gitDirty` and `sourceIdentity` alongside `gitCommit`.
10. **calibration-v1 viability figures are horizon-limited.** They were measured
   at 10,000 ticks; two of the three "viable" runs in its best cell were merely
   not yet runaway and crossed the cap by tick ~12,000 at the gated 20,000-tick
   horizon. Read §4.2 of the pilot report as viability *at 10,000 ticks*. The
   §5 verdict is unaffected.

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

## calibration-v3 precommitment (historical record — EXECUTED)

Recorded and committed in `42e63e7`, **before** implementation or execution.
Full text in `docs/Phase 0B Pilot Report.md` §11; results in §11.5 and the
terminal determination in §11.6.

```text
energy.reproductionEnergyThreshold : [75, 90]
lifecycle.maxAge                   : [3000, 6000]
```

4 configurations x 15 pilot seeds x 20,000 ticks = 60 replicates, §14.29 runaway
cap ENABLED, all other parameters at Phase 0A defaults, results to
`results/calibration-v3/`.

**PRIMARY READOUT: `viableCompletionRate`.** Everything else is descriptive.

Selection rule: a configuration qualifies only at the existing ~70%
`viableCompletionRate` gate; among qualifiers take the highest rate; on an exact
tie take the smaller departure from Phase 0A defaults; never select on mean
population, births or generation depth. No axis or threshold may change after
results are seen.

**Terminal rule.** calibration-v3 is the FINAL parameter sweep of this cycle.
Either a qualifying candidate exists — freeze exactly one, document it, stop
before validation — or none does, in which case the cycle is declared
unsuccessful with no calibration-v4, no further sweep, no weakened gate and no
new axes, and the single smallest model-level question is identified without
modifying the model.

---

## NEXT EXACT STEP

**Decide, as a human design decision, whether §13.76's single-founder bootstrap
should remain the starting condition — before any further calibration work.**

This is a model-level decision, not an implementation task, and it is
deliberately the only thing on the list. The evidence supporting the question is
in `docs/Phase 0B Pilot Report.md` §11.8; the decision itself is out of scope for
an agent to make unilaterally, because changing §13.76 changes a [LOCKED]
Phase 0A procedure and would require a deliberate, versioned Phase 0A amendment.

Nothing else should start until that is settled. In particular:

- do **not** run another parameter sweep — the cycle is closed;
- do **not** weaken the ~70% viability gate;
- do **not** touch `packages/experiment-harness/seeds/validation.json`;
- do **not** begin Phase 0C.

If the decision is to keep the single-founder bootstrap unchanged, the honest
recorded state is that the current Phase 0A model has no validated
non-degenerate baseline within the parameter space explored, and Phase 0B stops
short of confirmatory validation.
