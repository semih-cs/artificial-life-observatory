# PROJECT_STATUS.md — Artificial Life Observatory

**Last updated:** 2026-09-11
**Purpose:** live handoff state for continuation across chat/model/usage limits.

> Read `AGENTS.md` first.
> This file describes the current repository state, not the long-term vision.
> Where this file and the repository disagree, the repository wins — fix this
> file before proceeding.

---

## Current phase

| Track | Status |
|---|---|
| **Phase 0A** — simulation core | **COMPLETE / FROZEN**, with one adopted versioned amendment: multi-founder initialization, `0A.1.0` → `0A.2.0` |
| **Phase 0B Engineering** — harness, diagnostics, probes, classifiers, provenance | **COMPLETE / FROZEN** |
| **Phase 0B Research Calibration** | **EXPLORATORY — CLOSED FOR V1** (project decision, 2026-09-11) |
| **Phase 0C** — Persistent Canonical World | **ACTIVE — current phase.** **DONE** (below): slice 1 (deterministic save/load/resume), slice 2 (snapshot store: retention, world identity, fallback recovery) and slice 3 (quarantine of corrupt snapshots); the **persistent world runner** (`packages/world-runner`). **Next: a read-only observer bridge to Phase 0D** |
| **Phase 0D** — Observatory / visualisation | NOT STARTED; follows 0C |

**Frozen v1 biological model:**

| Setting | Value |
|---|---|
| `simulationVersion` | `0A.2.0` |
| `bootstrap.founderGroupCount` | `5` |
| configuration | `DEFAULT_SIMULATION_CONFIG` |
| golden hash (seed 20260910, 10,000 ticks) | `b95a0b4ef7dd8449` |

The historical single-founder model `0A.1.0` (`6a6576bd49e86b27`) stays
documented and tested. Biology does not change in Phase 0C or 0D unless a
genuine implementation bug is found, and any such change must be versioned.
This is a **product freeze, not a research baseline qualification**.

### Phase 0B closure — what is recorded

Full account: `docs/Phase 0B Pilot Report.md` §23.

- **The mechanics are operational and deterministic.** Engineering
  verification is complete. The experiment harness and its diagnostics are
  operational.
- **Multi-founder initialization (`0A.2.0`) is the canonical model.**
- **Long-lived bounded worlds demonstrably occur.**
- **Complete 15-seed `0A.2.0` default pilot** (`trajectory-outcome-v2`):
  5 EXTINCTION, 3 BOUNDED_VIABLE, 5 HIGH_BOUNDED, 2 RUNAWAY. **Bounded
  completion 8 / 15.**
- **The research-grade ~70% baseline gate was NOT met.** It has not been
  weakened and is not claimed to have passed.
- **No core simulation defect was found** by the extensive pilot analysis
  (§§7, 9, 14–22).
- **Scientific calibration remains exploratory and inconclusive.** Extinction
  is an establishment failure that goes with lower repeat reproduction; its
  lifecycle mechanism was not identified.
- **Failing the research gate is NOT a blocker for the v1 artificial-life
  product.**
- **The validation seeds remain untouched** and reserved for future research.

**Do not:**

- run further Phase 0B calibration sweeps or diagnostics, or tune;
- reopen Phase 0B questions;
- use the validation seeds.

The Phase 0B sections below are kept as the historical record.

### Product direction

v1 is a functioning, observable artificial-life world. It is built in two steps:

- **Phase 0C** makes the existing world persistent. It can be started or
  loaded, continue across sessions, and resume exactly.
- **Phase 0D** then makes it visible live. You will be able to inspect
  organisms (id, parent, generation, lineage, age, energy, morphology genes,
  neural genome), watch births, deaths and mutations, follow lineages across
  generations, and view population, generation and lineage trends.

No RL, learning, memory, predators, signalling, new actions or richer biology.
The existing life is made persistent and visible first.

A clearly labelled DEMO seed may later be chosen for the UI. It stays separate
from the pilot and validation seeds, and it is never research evidence. None
has been chosen yet.

---

## Git state

Branch: `master`. `git log -1` is authoritative. The most recent work is
the Phase 0C world runner:

```text
(HEAD)  Phase 0C: persistent world runner (create/recover, continuous run, periodic saves, clean stop) — see `git log -1`
3b040ac Phase 0C slice 3: quarantine of corrupt snapshots after fallback recovery
c7dcd11 Phase 0C slice 2: folder snapshot store, retention 5, world identity, fallback recovery
bdcc156 Phase 0C slice 1: persistence package, snapshot format v1, exact save/load/resume
5633ffd Phase 0B closed for v1; biology frozen at 0A.2.0; Phase 0C unblocked
511aa10 diagnostic-reproducer-lifecycle-v1: results — VALID, NEITHER / INCONCLUSIVE
1f07f69 diagnostic-reproducer-lifecycle-v1: read-only recorder, analysis and CLI
80766e0 reproduction-participation: results — B, repeat-reproduction difference (read-only)
b3a3f30 stalled-cohort: results — conclusion A, recovery signal clear from tick 4000 (read-only)
bfa81a9 early-establishment: results — PARTIAL separation by tick 3000 (read-only)
8b7a6bd continuation-multifounder-default-v1: results — complete 15-seed 0A.2.0 profile
3ad28cb trajectory-outcome-v2: reclassification of persisted results (read-only)
da79527 Phase 0A amendment: multi-founder initialization (0A.1.0 -> 0A.2.0)
db294c2 Phase 0A: complete the headless deterministic simulation core
```

The full history is in `git log`. The worktree is clean apart from generated
artifacts, which are gitignored (`node_modules/`, `dist/`, `coverage/`,
`results/`, `.DS_Store`, `*.log`).

---

## Verification (this session, on the committed tree)

```text
simulation-core tests:    179 / 179 passed
experiment-harness tests: 138 / 138 passed
persistence tests:         70 / 70  passed   (slice 1: 31 — §18.60 continuation, golden resume, separate process;
                                             slice 2: 28 — snapshot store 25, fallback-recovery regression 3;
                                             slice 3: 11 — quarantine 10, golden fallback → quarantine → resume → save → recover 1)
world-runner tests:        21 / 21  passed   (in process 13; separate OS processes and signals 8)
workspace total:          408 / 408 passed
workspace build:          PASS (simulation-core, then experiment-harness and persistence, then world-runner)

golden hashes, seed 20260910, 10000 ticks — one per MODEL, never conflated:
  0A.2.0 multi-founder canonical (frozen v1): b95a0b4ef7dd8449  CONFIRMED
  0A.1.0 historical single-founder:           6a6576bd49e86b27  CONFIRMED
```

Re-confirmed at the Phase 0C world-runner checkpoint (and at slices 1–3 before it):

- the amended hash via `npm run simulate`;
- the historical hash via `singleFounderModelConfig()` on the built core;
- both hashes as live tests in the suite.

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
The one `0A.2.0` result, `results/multifounder-default-baseline/`, is described
in its own section above and is never pooled with anything below.
Provenance on every replicate below: `simulationVersion 0A.1.0`,
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
| `docs/Phase 0A Amendment - Multi-Founder Initialization.md` | CREATED — the adopted §13.76 amendment |
| `docs/Phase 0B Pilot Report.md` | UPDATED — §7, §9, §10, §11 calibration-v3, §12 model amendment, §14 multi-founder default baseline (determination C), §15 food-limitation diagnostic (precommitted design, result INCONCLUSIVE), §16 outcome classifier v2 design, §17 v2 implementation and reclassification, §18 complete 15-seed `0A.2.0` default profile, §19 early-establishment analysis (PARTIAL), §20 stalled-cohort analysis (conclusion A), §21 reproduction participation (B), §22 reproducer-lifecycle diagnostic (NEITHER / INCONCLUSIVE), §23 closure for v1 |
| `README.md` | UPDATED — status table, v1 freeze, Phase 0B closed, Phase 0C active, current baseline behaviour under v2; four packages, the world-runner section (create, run/recover, cadence, graceful shutdown, crash recovery, no silent new world, throughput), the persistence API example, and a World persistence section (format v1, semantics, corruption codes, the slice 2–3 snapshot store — layout, naming, retention, identity, fallback, no fresh world, quarantine — and limitations) |
| `AGENTS.md` | UPDATED — amendment in the source hierarchy, multi-founder invariant, per-model golden hashes; Phase 0B closed for v1, frozen v1 biology, Phase 0C active, demo-seed policy; persistence invariants and the persistence regression; slice 2 store invariants (one folder = one world, never overwrite a stored tick, recovery never creates a world); slice 3 quarantine-never-delete invariant, snapshot store declared complete; world-runner invariants (runner never changes the simulation, no silent new world, restart equivalence), package list and runner regression |
| `docs/Phase 0A Implementation Report.md` | unchanged |

---

## Known gaps and uncertainties

1. **Ecology is not calibrated — research calibration closed for v1 (§23).** Every tested configuration, in both models, is bimodal between
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
5. **No in-world probe or fingerprint data has been collected** from any
   experiment. The only probe data collected is the offline founder functional
   distance of the `0A.2.0` baseline's initial worlds (§14.8), which is
   observational and describes tick 0 only.
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
11. **The relation between the runaway cap and the ecology is unmeasured.**
   Standing food was near capacity whenever a population hit the 200 cap, in
   both models. Whether the default ecology becomes food-limited below or above
   200 is not known (pilot report §14.10). The precommitted diagnostic (§15)
   was run and is INCONCLUSIVE under its own rule; the question remains open.
12. **The v1 outcome classifier is too coarse.** Peak ≥ 200 does not separate
   unbounded growth from bounded high plateaus (§15.10, §16.1). v2 is now
   implemented (§17). But 72 of 169 in-scope persisted runs were stopped by the
   v1 cap and cannot be reclassified. The 6 `0A.2.0` default-baseline seeds
   among them have since been continued and verified (§18), so the default
   profile is complete. The `0A.1.0` cap-stopped runs remain unclassifiable.

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

## `diagnostic-reproducer-lifecycle-v1` — RESULT: VALID, NEITHER / INCONCLUSIVE

Implemented in `1f07f69` (`src/analysis/lifecycle.ts`,
`src/experiments/reproducerLifecycle.ts`, CLI `reproducer-lifecycle`, 7 tests),
with no simulation-core change. Run from that clean commit: `gitDirty false`,
`sourceIdentity b923c6fb51a70756`. Output:
`results/diagnostic-reproducer-lifecycle-v1/`.

**Checks:**

- **Purity: PASS.** Identical hash and timeseries with and without the
  recorder; runs on deep-frozen states; telemetry balanced at every tick of all
  seven runs.
- **Validity: PASS for all seven.** The exact canonical hash matched at every
  persisted checkpoint (baseline extinction or stop ticks, and 20,000 for L).
  All 25 timeseries fields matched exactly at 3000, 5000, 7000 and 9000.
- **Censoring:** none. Eligible reproducers per world: E\* 22, 5, 13, 9;
  L 150, 145, 126.

| Seed | Group | 1st-rep age | Interval | Post-1st survival | Events | Died before 2nd |
|---:|---|---:|---:|---:|---:|---:|
| 131676 | E\* | 832 | 368.5 | 1801.5 | 2 | 0.273 |
| 147514 | E\* | 500 | 676 (n = 1) | 2360 | 1 | 0.800 |
| 187109 | E\* | 960 | 489.8 | 1702 | 1 | 0.538 |
| 195028 | E\* | 1353 | 410 | 1220 | 1 | 0.667 |
| 107919 | L | 654.5 | 336 | 2185.5 | 2 | 0.367 |
| 202947 | L | 506 | 287.5 | 1458 | 2 | 0.379 |
| 210866 | L | 1004.5 | 383.5 | 1659.5 | 2 | 0.333 |

**Decision:**

- **IV (interval):** 1 misclassified, STRONG PARTIAL, L shorter.
- **SV (survival):** 2 misclassified, WEAK / NONE; the best cut has E\*
  longer.
- **Result: NEITHER / INCONCLUSIVE.** Earlier death is not indicated. Longer
  gaps are suggested in 3 of 4 extinct worlds but not established; the
  exception is 131676, and the extinct worlds rest on few reproducers.
- **Causal limit:** no claim about food, neural quality, sensing or
  morphology.

**Next scientific question (§22.10) — NOT PURSUED: Phase 0B research closed for v1 (§23):** after a first reproduction, do
extinct-world reproducers take longer to regain the reproduction threshold (75)
from their post-reproduction energy — or fail to regain it at all — than
reproducers in establishing worlds?

### Precommitment (historical record — EXECUTED)

Full text: pilot report §22. Committed before any code for it exists and before
anything runs.

- **Question:** do reproducers in the extinct stalled worlds produce fewer
  offspring because of longer inter-reproduction intervals or shorter survival
  after first reproduction?
- **Seeds:**
  - E\* 131676, 147514, 187109, 195028;
  - L 107919, 202947, 210866.
- **Run:** `0A.2.0` defaults, 20,000 ticks, cap not an early stop, ceiling
  1000, 200-tick samples.
- **Recorder:** events read through the existing read-only `onTick` hook, with
  no simulation-core change. Purity is tested: identical hash and timeseries,
  deep-frozen states, telemetry balance.
- **Death cause:** derived. `ENERGY_DEPLETION` is exact below `maxAge`;
  `AT_MAX_AGE` is ambiguous with simultaneous starvation.
- **Validity:**
  - exact canonical hash at each seed's persisted exact checkpoint: the
    baseline extinction or stop ticks, and 20,000 from the uncapped runs;
  - exact equality of the full 200-tick timeseries row at 3000, 5000, 7000 and
    9000;
  - any mismatch makes the diagnostic INVALID.
- **Analysis population:** descendants born in ticks 3001–9000 whose death is
  observed; censored organisms are excluded and counted. An eligible
  reproducer has ≥ 1 reproduction.
- **Per-world medians:**
  - age at first reproduction;
  - inter-reproduction interval (IV);
  - post-first-reproduction survival (SV);
  - lifetime events;
  - fraction dying before a second reproduction.
- **Decision** (best single cut over 4 against 3 worlds; a measure supports
  only if CLEAR in the expected direction):
  - LONGER GAPS if IV supports (L shorter) and SV does not;
  - EARLIER DEATH if SV supports (L longer) and IV does not;
  - MIXED if both support;
  - NEITHER / INCONCLUSIVE otherwise, or if any world lacks an IV value.
- **Output:** `packages/experiment-harness/results/diagnostic-reproducer-lifecycle-v1/`.

## Reproduction participation analysis — RESULT: B (repeat reproduction)

Code in `8cf1759` (`src/analysis/reproductionParticipation.ts`, CLI
`reproduction-participation`, 4 tests). Run read-only from that clean commit;
simulated nothing. All 303 source files byte-identical. Output:
`results/analysis-reproduction-participation-v1/reproduction-participation.json`.

| Metric (E\* n = 4 / L n = 3) | 5000 | 6000 | 9000 | Differs? |
|---|---|---|---|---|
| M1 fractionEverReproduced | 0.308–0.351 / 0.349–0.372 (1) | 0.329–0.379 / 0.351–0.380 (2) | 0.316–0.400 / 0.391–0.402 (1) | **no** |
| M2 cumulative births | 52–60 / 86–147 (0) | 54–73 / 126–188 (0) | 57–99 / 289–378 (0) | yes, from 5000 |
| M3 births per reproducer | 1.93–2.21 / 2.15–2.30 (1) | 1.86–2.15 / 2.25–2.41 (0) | 1.84–2.36 / 2.33–2.37 (1) | yes, from 6000 (CLEAR 6000–8000) |

The number in brackets is the best-cut misclassified count out of 7.

What the numbers show:

- **The mechanism is B.** The share that ever reproduces is similar, about
  0.36–0.40 in both groups. Lifetime offspring per reproducer is about 15%
  higher in the late establishers.
- **The births gap is mostly reproducer count.** At tick 9000 it is about 4.5
  times: about 4 times from more reproducers (a count that tracks population
  size, so this part is circular) and about 1.12 times from intensity. This
  co-occurs with the population split; it does not explain it causally.
- **Limits:**
  - lifetime and founder-inclusive;
  - descendant-only figures are not derivable;
  - f × I = B / (25 + B), so M1 and M3 are coupled;
  - n = 4 against n = 3.

**Next scientific question (§21.7):** in the stalled worlds that go extinct, why
do reproducers produce fewer offspring over their lives — longer intervals
between reproductions, or shorter reproductive lifespans? The persisted
aggregates cannot answer it; it needs per-organism reproduction and death
times.

### Precommitment (historical record — EXECUTED)

Full text: pilot report §21. Committed before any group value was computed. No
simulation.

**What `fractionEverReproduced` is** (verified in code):

- It equals distinct organisms that ever produced offspring, divided by all
  organisms ever present (25 founders + cumulative births).
- It is lifetime cumulative, keeps the dead, and mixes founders with
  descendants.
- The denominator is exactly 25 + births: verified integral in all 669 baseline
  rows.

**What can be derived exactly:**

- R = f × (25 + B), the distinct reproducers ever;
- I = B / R, the lifetime births per reproducer.

**What cannot:** descendant-only participation or intensity after tick 3000 is
**NOT derivable**. It is not reconstructed.

**Coupling:** f × I = B / (25 + B), so the two metrics are coupled.
Population growth biases both against the late establishers.

**Design:**

- Groups: the same 7 worlds as §20 — E\* 131676, 147514, 187109, 195028
  against L 107919, 202947, 210866.
- Checkpoints: 3000, 4000, 5000, 6000, 7000, 8000, 9000.
- Metrics: M1 f, M2 cumulative births, M3 I.
- A metric *differs* if it is CLEAR (0 of 7 misclassified) at some checkpoint
  from 4000 on and stays ≤ 1 afterwards.
- Mechanism call:
  - A if M1 differs with L higher and M3 does not;
  - B if M3 differs with L higher and M1 does not;
  - C if both differ;
  - D otherwise, including any L-lower difference.
- The call is lifetime and founder-inclusive only.

## Stalled-cohort analysis (`0A.2.0` default, after tick 3000) — RESULT: conclusion A

Code in `a79401e` (`src/analysis/stalledCohort.ts`, CLI `stalled-cohort`,
3 tests). Run read-only from that clean commit; simulated nothing. All 302
source files byte-identical. Output:
`results/analysis-stalled-cohort-v1/stalled-cohort.json`.

| Metric | 4000 | 5000 | 6000 | 7000 | 8000 | 9000 |
|---|---|---|---|---|---|---|
| population E\* / L (misclassified) | 8–22 / 34–58 (0) | 10–20 / 55–68 (0) | 7–22 / 61–80 (0) | 7–17 / 74–82 (0) | 1–11 / 83–114 (0) | 1–20 / 108–169 (0) |
| cumulative births E\* / L | 45–53 / 50–100 (1) | 52–60 / 86–147 (0) | 54–73 / 126–188 (0) | 57–80 / 167–237 (0) | 57–85 / 228–301 (0) | 57–99 / 289–378 (0) |
| mean energy (misclassified) | 1 | 2 | 2 | 2 | 2 | 1 |

What the numbers show:

- **Earliest separation:** tick 4000, on population. Best observable:
  population, with 0 misclassified at all six checkpoints.
- **The divergence is in reproduction and population, not energy.**
- **Recovery is gradual.** Late establishers grew from the first checkpoint on,
  +10 to +23 by 4000, and climbed steadily. Extinct worlds shrank from the same
  point.
- **No single seed drives the result.** 131676, the closest extinct world,
  stays below every late establisher at every checkpoint. 100000 was extinct at
  3000 and is not counted.
- **The evidence is still thin:** n = 4 against n = 3.
- **Causal limit:** no claim about food, sensing or neural quality.

**Next mechanistic question (§20.7):** once the founders have died, is the
extinct worlds' reproduction deficit a smaller fraction of organisms that ever
reproduce, or the same fraction reproducing less often?

### Precommitment (historical record — EXECUTED)

Full text: pilot report §20. Committed before any post-3000 group metric was
computed. No simulation.

- Groups:
  - E = the 5 EXTINCTION seeds;
  - L = 107919, 202947, 210866.
- Coverage (metadata only): E's earliest extinction is **tick 3000** (100000).
  No all-8 window exists after tick 3000.
- Separation counts therefore use the 7 worlds alive at tick 3000:
  E\* = 131676, 147514, 187109, 195028 against L. 100000 is shown per seed but
  not counted.
- Window: to tick 9000, the last grid point before 147514's extinction at 9092.
- Checkpoints: 4000, 5000, 6000, 7000, 8000, 9000.
- Metrics: population, cumulative births, mean energy.
- Rule: best single cut out of 7.
  - 0 misclassified is CLEAR (A);
  - exactly 1 is STRONG PARTIAL (B);
  - 2 or more is WEAK / NONE (C).
- Chance level stated in advance: ≤ 1 misclassified arises for 40% of random
  labellings per look, and 0 for 5.7%, over 18 looks. Persistence and per-seed
  trajectories are reported alongside.
- No causal claim about food, sensing or neural quality.

## Early establishment analysis (`0A.2.0` default) — RESULT: PARTIAL (conclusion B)

Code in `8ca5532` (`src/analysis/earlyEstablishment.ts`, CLI
`early-establishment`, 4 tests). Run read-only from that clean commit;
simulated nothing. All 301 source files byte-identical. Output:
`results/analysis-early-establishment-v1/early-establishment.json`.

Fields available for all 15 seeds, from one file (the baseline 200-tick
timeseries): population, cumulative births and mean energy at ticks
1000/2000/3000; minimum and maximum population over ticks 0–3000; first tick
with population ≥ 50; first birth. First birth was at tick 600 in all 15, so it
is uninformative. Food intake is unavailable for group E and was not used.

| Metric @ 3000 | Extinct (n = 5) median [range] | Established (n = 10) median [range] | Best cut misclassified |
|---|---|---|---:|
| population | 16 [0–27] | 150.5 [24–194] | 2 / 15 |
| cumulative births | 42 [10–45] | 192 [30–291] | 1 / 15 |
| mean energy | 33.4 [23.6–38.9] (n = 4) | 36.7 [29.2–41.3] | 3 / 14 |

What the numbers show:

- **Separation is PARTIAL.** All 7 worlds that doubled their founding
  population by tick 3000 established.
- **The rest cannot be split yet.** The 8 still at founder scale at tick 3000
  (0–35 organisms, 10–57 births) include all 5 extinct worlds and 3 later
  establishers: 107919, 202947 and 210866.
- **Strongest early indicator** (observational only): cumulative births by tick
  3000. The extinct worlds had ≤ 45; 9 of 10 established worlds had ≥ 48, the
  exception being 107919 with 30.
- **Mean energy does not separate the groups.**
- **Causal limit:** no claim about food acquisition.

**Next scientific question (§19.8):** among the eight worlds still at founder
scale at tick 3000, when do the three later establishers first become
distinguishable from the five that went extinct, on population, births and
mean energy?

### Precommitment (historical record — EXECUTED)

Full text: pilot report §19. Committed before any group comparison was computed.
No simulation.

- Source: `results/multifounder-default-baseline/timeseries-multifounder-default.csv`,
  which covers all 15 seeds over ticks 0–3000 (16 samples each).
- Groups: E = the 5 EXTINCTION seeds; S = the 10 established seeds
  (BOUNDED_VIABLE, HIGH_BOUNDED and RUNAWAY together).
- Fields per seed:
  - population, cumulative births and mean energy at ticks 1000, 2000 and 3000
    (energy is n/a when population is 0);
  - minimum and maximum sampled population over ticks 0–3000;
  - first sampled tick with population ≥ 50;
  - first sampled tick with a birth.
- Food intake is excluded: it was never recorded for the extinct worlds.
- Separation is judged on the tick-3000 population, births and energy only,
  using the best single cut per field:
  - CLEAR (A): some field has no range overlap;
  - PARTIAL (B): the best cut misclassifies ≤ 3 of 15;
  - NONE (C): every field misclassifies ≥ 4.
- Any threshold found is observational only. No causal food claim may be made.

## `continuation-multifounder-default-v1` — RESULT: complete 15-seed profile

Implemented in `58d3cd1` and run from that clean commit. All six replicates
record `gitCommit 58d3cd1…`, `gitDirty false`,
`sourceIdentity 0d5741e27a0d291a`, `simulationVersion 0A.2.0`. Results:
`results/continuation-multifounder-default-v1/`. The 15-seed profile was
written read-only into `results/reclassification-trajectory-outcome-v2/`.

Validity (§18.2): **PASS for all six**. Canonical hash, population, births,
deaths and food matched the baseline exactly at every stop tick.

| Seed | Old stop | Peak | Final | Growth ratio | v2 class |
|---:|---:|---:|---:|---:|---|
| 115838 | 3389 | 309 | 261 | 0.9687 | HIGH_BOUNDED |
| 155433 | 3597 | 340 | 288 | 0.9922 | HIGH_BOUNDED |
| 163352 | 3782 | 213 | 147 | 0.9400 | BOUNDED_VIABLE |
| 171271 | 6444 | 331 | 316 | 1.0139 | HIGH_BOUNDED |
| 179190 | 3587 | 298 | 224 | 0.9683 | HIGH_BOUNDED |
| 202947 | 18876 | 221 | 213 | 1.5151 | RUNAWAY (growing at horizon) |

Complete 15-seed `0A.2.0` default profile:

| Class | Count | Rate |
|---|---:|---:|
| EXTINCTION | 5 | 33.3% |
| BOUNDED_VIABLE | 3 | 20.0% |
| HIGH_BOUNDED | 5 | 33.3% |
| RUNAWAY | 2 | 13.3% |
| INCONCLUSIVE | 0 | 0.0% |

- boundedCompletionRate: **0.533**. **BASELINE GATE FAILED**, as fixed before
  the run.
- Mean final population 172.7; median 189.
- Mean births 2056; maximum generation depth 29.

**Dominant failure mode: extinction-dominated establishment failure.** The 5
extinct worlds never exceeded 37 organisms (10–119 births). All 10 others
reached at least 196, and 8 of those plateaued. Both RUNAWAY worlds were slow
risers, nowhere near the ceiling.

**Next scientific question (§18.8):** is extinction in the default `0A.2.0`
model an establishment failure of the founding cohort — decided within the
first founder lifespan (3,000 ticks) by how much food the founding controllers
acquire — rather than by later ecological dynamics?

### Precommitment (historical record — EXECUTED)

Full text: pilot report §18. Committed before any code for it exists and before
anything runs.

**Not a qualification attempt.** The `0A.2.0` default baseline has already
FAILED the ~70% gate under v2. Its 5 extinctions out of 15 rule the gate out
whatever the six missing seeds do (§17.5). This run only completes the
descriptive 15-seed profile.

| Item | Value |
|---|---|
| Model | `0A.2.0`, `founderGroupCount 5`, `DEFAULT_SIMULATION_CONFIG` unchanged |
| Seeds | 115838, 155433, 163352, 171271, 179190, 202947 (pilot; the other nine not rerun) |
| Horizon / stops | 20,000 ticks; extinction; execution safety ceiling 1000. The 200 cap does NOT stop execution |
| Validity | at each baseline stop tick (3389, 3597, 3782, 6444, 3587, 18876), exact agreement with the persisted baseline on canonical hash, population, births, deaths and food; a failing seed is INVALID and not interpreted |
| Classification | `trajectory-outcome-v2` as implemented in `daab8b6`, thresholds unchanged |
| Profile | 15 seeds: complete baseline records, plus verified continuations (`diagnostic-food-limitation-v1` for 139595/123757/107919, this run for the six) |
| Output | `packages/experiment-harness/results/continuation-multifounder-default-v1/` |

Validation seeds untouched.

## Outcome classifier v2 — IMPLEMENTED AND APPLIED TO PERSISTED RUNS

Implemented in `daab8b6` (`src/analysis/trajectoryOutcome.ts`,
`src/analysis/reclassify.ts`, CLI `reclassify-trajectory`, 19 tests), with every
§16 parameter unchanged. Class labels: `EXTINCTION`, `BOUNDED_VIABLE`,
`HIGH_BOUNDED`, `RUNAWAY`, `INCONCLUSIVE`. §16's `EXTINCT` and `RUNAWAY_GROWTH`
were renamed; this is a label change only. v1 `classifyRunOutcome` is
untouched.

Reclassification is read-only. It ran from clean `daab8b6`
(`sourceIdentity 3437054f502219ba`) and simulated nothing. All 288 source
JSON/CSV files are byte-identical before and after. Output:
`packages/experiment-harness/results/reclassification-trajectory-outcome-v2/`
(`reclassification.json`, `reclassification.csv`; one record per run with
seed, versions, final tick, peak, final, early/late/window means, growth ratio,
class, reason, ceiling flag, context and source provenance).

Scope: every 20,000-tick persisted experiment (calibration-v2, calibration-v3,
multifounder-default-baseline, diagnostic-food-limitation-v1). Movement-policy
is excluded (food off by design); 10,000-tick results fall below the horizon.
Eligible = the trajectory is complete (extinct, ceiling, or 20,000 ticks).
Runs stopped by the v1 cap are **not reclassified**.

| Model | In scope | Eligible records (distinct) | Not reclassified (v1 cap) | EXTINCTION | BOUNDED_VIABLE | HIGH_BOUNDED | RUNAWAY | INCONCLUSIVE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `0A.2.0` | 19 | 10 (9) | 9 | 5 | 3 (2) | 1 | 1 | 0 |
| `0A.1.0` | 150 | 87 (77) | 63 | 85 (76) | 0 | 0 | 0 | 2 (1) |

Four uncapped food-diagnostic trajectories: 139595 `BOUNDED_VIABLE` (r 1.011,
window mean 194.0); 123757 `HIGH_BOUNDED` (0.973, 312.2); 107919 `RUNAWAY`
(1.185, 369.7); 210866 `BOUNDED_VIABLE` (0.960, 174.7). The `0A.1.0` default's
only v1-viable world (139595) is `INCONCLUSIVE (DECLINING)`, r 0.653.

**Gate.** No cohort is complete, so `boundedCompletionRate` is **not
computable** for any cohort. The `0A.2.0` default baseline is missing seeds
115838, 155433, 163352, 171271, 179190 and 202947, all stopped by the v1 cap.
Assembled with the verified uncapped continuations, 9 of 15 seeds are known:
5 EXTINCTION, 2 BOUNDED_VIABLE, 1 HIGH_BOUNDED, 1 RUNAWAY. The possible rate
range is 0.20–0.60. The baseline's 5 extinctions alone rule out the 0.70 gate
under v2, since a passing 15-run cohort allows at most 4 non-bounded runs. Every
`0A.1.0` cohort is excluded the same way.

### v2 design (historical record — IMPLEMENTED)

Full design: `docs/Phase 0B Pilot Report.md` §16. Nothing implemented or run;
the 200 cap is unchanged in code; no persisted result rewritten.

**Project-owner decision after §15 (recorded):** Phase 0B next designs a
replacement outcome-assessment rule that separates extinction, unbounded growth,
high bounded plateaus and ordinary viable completion. No further diagnostic, no
sweep, no model change.

**Why.** v1 (`classifyRunOutcome`, §14.29) labels a run runaway once its peak
reaches 200. Uncapped (§15), two v1-"runaway" worlds held level near 190 and 310
for ~16,000 ticks. v1 cannot separate unbounded growth from a high bounded
plateau. The cap value and "reach ⇒ runaway" are [BASELINE] (§6.30, §6.42,
§17.64). The LOCKED content — cap is execution-only, never canonical — is kept.
§16.18 [LOCKED] defines viability as sustained non-degenerate dynamics.

**Rule, evaluated in order** (H = 20,000; terminal window 14,001–20,000 split
into E = 14,001–17,000 and L = 17,001–20,000, one `maxAge` each; standard
200-tick samples, ≥ 10 per half; r = mean pop(L) / mean pop(E)):

1. error → `INCONCLUSIVE (ERROR)`
2. population hit 0 → `EXTINCT`
3. safety ceiling (1000) reached → `RUNAWAY_GROWTH (CEILING)`
4. ended before 20,000 for any other reason, incl. the v1 cap → `INCONCLUSIVE (TRUNCATED)`
5. < 10 samples in a half → `INCONCLUSIVE (INSUFFICIENT_SAMPLES)`
6. r ≥ 2^(3000/20000) = 1.1096 (would double within one more horizon) → `RUNAWAY_GROWTH (GROWING_AT_HORIZON)`
7. r ≤ 0.9013 (would halve within one more horizon) → `INCONCLUSIVE (DECLINING)`
8. else plateau: terminal-window mean ≥ 200 → `HIGH_BOUNDED`, else `BOUNDED_VIABLE`

Food pressure and birth/death balance are reported over the terminal window,
confirmatory only, with no threshold. Every run is annotated with peak, final
population and `v1WouldBeRunaway`.

**Retrospective sanity check** (read-only, the four §15 trajectories, rule fixed
first, no revision needed):

| Seed | Peak | Final | r | Window mean | v1 | v2 |
|---:|---:|---:|---:|---:|---|---|
| 139595 | 215 | 189 | 1.011 | 194.0 | RUNAWAY | BOUNDED_VIABLE |
| 123757 | 351 | 310 | 0.973 | 312.2 | RUNAWAY | HIGH_BOUNDED |
| 107919 | 478 | 473 | 1.185 | 369.7 | RUNAWAY | RUNAWAY_GROWTH |
| 210866 | 196 | 170 | 0.960 | 174.7 | VIABLE | BOUNDED_VIABLE |

**Proposed gate.** `boundedCompletionRate = (BOUNDED_VIABLE + HIGH_BOUNDED) / N
≥ 0.70`, where N is all runs including INCONCLUSIVE. The ~70% threshold is
unchanged. Gate-eligible runs must run to 20,000 ticks with the 200 cap not used
as an early stop and the safety ceiling on. The `HIGH_BOUNDED` and
`RUNAWAY_GROWTH` shares are reported alongside.

**Historical scope.** Every recorded `outcome`, count and `viableCompletionRate`
is a v1 result and stays as recorded. The decisions taken under v1 stand. v2
labels go to separate, version-tagged fields/files. Capped runs are
`INCONCLUSIVE (TRUNCATED)` under v2. 10,000-tick results fall below the v2
minimum horizon.

## `diagnostic-food-limitation-v1` — RESULT: INCONCLUSIVE

Implemented in `60bd999` (harness only: diagnostic safety ceiling with its own
`SAFETY_CEILING` termination reason, read-only per-tick observer, food-flux
recorder, §15 analysis, CLI `food-limitation`; no simulation-core change) and
run from that clean commit. Every replicate and the manifest record
`gitCommit 60bd999…`, `gitDirty false`, `sourceIdentity dcf95f68552c5122`,
`simulationVersion 0A.2.0`. Results: `results/diagnostic-food-limitation-v1/`.

Integrity gate: **PASS on all four seeds** — the canonical hash at each
baseline stopping tick (3037, 3094, 9793) equals the baseline `finalStateHash`,
and 210866 reproduces its full baseline result.

| Seed | Role | Peak pop | Scarcity onset (tick / pop) | First tick ≥ 250 | End | Class |
|---:|---|---:|---|---:|---|---|
| 139595 | decision | 215 | 19746 / 190 | never | horizon, 189 | C |
| 123757 | decision | 351 | 19749 / 316 | 3320 | horizon, 310 | A |
| 107919 | decision | 478 | none | 10644 | horizon, 473 | B |
| 210866 | reference | 196 | none | never | horizon, 170 | — |

**Outcome: INCONCLUSIVE** — three different classes, no 2-of-3 majority. Per
§15.9 no conclusion is drawn and no follow-up diagnostic is added on its basis.
No run reached the safety ceiling. Descriptive record in pilot report §15.10.
The two scarcity onsets are marginal: lowest trailing means 29.61 and 29.68
against the ≤ 30 threshold, both within the last 260 ticks. In those two worlds
consumption matched the expected uncapped supply (utilisation 1.00, 1.01) for
~16,000 ticks while the stock averaged 43 and 38. 107919's stock stayed near
capacity up to population 478.

### Precommitted design (historical record — EXECUTED)

Full design: `docs/Phase 0B Pilot Report.md` §15. Committed before any code for
it exists and before anything runs. Observational; not calibration; produces no
`viableCompletionRate` evidence.

Question: at what population, if any, does the default `0A.2.0` ecology begin to
experience meaningful food scarcity, and is the 200 runaway cap stopping runs
before that pressure can appear?

| Item | Precommitted value |
|---|---|
| Model / params | `0A.2.0`, `founderGroupCount 5`, `DEFAULT_SIMULATION_CONFIG` unchanged |
| Seeds | decision: **139595, 123757, 107919**; reference only: **210866** (pilot only) |
| Horizon | 20,000 ticks |
| Early stops | extinction; **safety ceiling 1000** (`SAFETY_CEILING`) — execution safety limit only; the 200 cap is NOT an early stop here, and its value, `classifyRunOutcome` and the definition of runaway are unchanged |
| Milestones | 200, 250, 300, 400, 600, 800, 1000 |
| Per-tick record | population, food count, food-capacity fraction, food consumed, food regenerated, births, deaths, mean energy |
| Scarcity | trailing 200-tick mean food stock ≤ 30 (half of `worldFoodCapacity` 60); onset = first such tick |
| Integrity gate | hash at baseline stop tick equals baseline `finalStateHash` for the three decision seeds; 210866 final hash equals baseline |
| Output | `packages/experiment-harness/results/diagnostic-food-limitation-v1/` |

Per decision seed: **C** = scarcity onset before the population first reaches
250; **A** = no scarcity before 250, onset later; **B** = no onset before the run
ends. Outcome = the class held by ≥ 2 of 3 decision seeds — A (cap too low),
B (food never binding before the safety limit), C (food already scarce near
200) — else INCONCLUSIVE. None of the outcomes changes the cap, the food
parameters or the model in the task that reads it.

Ceiling justification: food supply is hard-bounded at 2 items/tick = 50
energy/tick, which at the founder-measured drain 0.0607 feeds ≈ 824 organisms;
1000 is the first round value above that. The expected uncapped supply
(area-mean fertility 0.47–0.57 → ≈ 1 item/tick) balances ≈ 390–470 organisms.

Validation seeds untouched.

## Multi-founder default baseline (`0A.2.0`) — RESULT: outcome C

Precommitted in `fb1c1b1` (summary below, full text pilot report §14); CLI
support in `d9dfb92`; run from that clean commit. Every replicate and the
manifest record `gitCommit d9dfb92…`, `gitDirty false`,
`sourceIdentity 99dac89d1820e080`, `simulationVersion 0A.2.0`. 15 pilot seeds,
20,000 ticks, runaway cap 200 enforced, all defaults unchanged.

Results: `packages/experiment-harness/results/multifounder-default-baseline/`
(gitignored local artifacts, including `founder-diversity.json`).

| Model | Extinct | Runaway | Viable | Ext rate | Runaway rate | **Viable rate** | Mean final pop | Median final pop | Total / mean births | Max gen |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `0A.1.0` single-founder default (calibration-v3 cell 0, read from disk) | 9 | 5 | 1 | 60.0% | 33.3% | **6.7%** | 69.3 | 0 | 4687 / 312.5 | 19 |
| `0A.2.0` multi-founder default | 5 | 9 | 1 | 33.3% | 60.0% | **6.7%** | 131.4 | 200 (= cap) | 5727 / 381.8 | 20 |

Paired by seed: 8 unchanged (4 extinct→extinct, 4 runaway→runaway);
extinct→viable 1 (210866); extinct→runaway 4; runaway→viable 0;
runaway→extinct 1; viable→other 1 (139595, viable→runaway).

Founder functional diversity (observational only): per-world mean pairwise
distance 0.304–0.401, min pair 0.224, max 0.539; ranges overlap across outcome
classes. Not fitness, not a selector, not a decision input.

**Determination (per the precommitted rule): C — NO MEANINGFUL IMPROVEMENT.**
The amendment moved worlds between the two degeneracies — mostly extinction →
runaway — without opening a viable middle. No candidate frozen, no sweep, no
model change, `founderGroupCount` not varied, validation seeds untouched.

Observed in persisted timeseries (not analysed further): in every runaway world
of both models, standing food was at or near capacity (49–60 of 60) when the
population hit the cap. Single smallest next scientific question (pilot report
§14.10): **is the 200-organism runaway cap below the population level at which
the default ecology becomes food-limited?**

## Multi-founder default baseline — PRECOMMITMENT (historical record — EXECUTED)

Recorded and committed **before** the CLI support for this run was added and
before the run was executed. Full text: `docs/Phase 0B Pilot Report.md` §14.

- ONE default-baseline pilot of the amended model; not a sweep, not a
  calibration cycle, nothing tuned
- `simulationVersion 0A.2.0`, `founderGroupCount = 5`, `initialPopulation = 25`
  (5 per founder group); every other parameter at the unchanged
  `DEFAULT_SIMULATION_CONFIG`
- the same 15 PILOT seeds; 20,000-tick maximum; runaway cap ENABLED; metrics
  every 200 ticks; unchanged outcome classification
- results to `packages/experiment-harness/results/multifounder-default-baseline/`
- clean committed worktree; every replicate records `gitCommit`,
  `gitDirty = false`, `sourceIdentity`, `simulationVersion`
- **PRIMARY READOUT: `viableCompletionRate`**; reference gate 0.70 (≥ 11 of 15)
- comparison reference, read from disk and not re-run: the historical `0A.1.0`
  default cell `results/calibration-v3/sweep_0_reproductionEnergyThreshold=75_maxAge=3000/`
  (9 extinct / 5 runaway / 1 viable), paired by seed

Decision rule, fixed before results:

| Outcome | Condition |
|---|---|
| A — PROVISIONAL CANDIDATE FROZEN | viable ≥ 11 of 15 (rate ≥ 0.70) |
| B — IMPROVED BUT BELOW GATE | not A, and viable ≥ 4 of 15 (≥ +3 over historical 1 of 15) |
| C — NO MEANINGFUL IMPROVEMENT | viable ≤ 3 of 15 |

Extinction converted into runaway (or back) without viable completions is not
movement in the intended direction. `founderGroupCount` is not a calibration
axis. Validation seeds are not used. Optional, observational, non-decisional:
pairwise founder functional distance per world (§14.6).

## Phase 0C slice 1 — RESULT: DONE (deterministic save / load / resume)

**Package:** `packages/persistence` (`@alo/persistence`). It depends only on
`@alo/simulation-core`; simulation-core and the biology are unchanged.

**API:**

- `createSnapshot(world, config)`;
- `serializeSnapshot` / `parseSnapshot`;
- `validateSnapshot`;
- `restoreSnapshot → { world, config }`;
- `saveSnapshotAtomic(file, snapshot)` / `loadSnapshot(file)`;
- `SnapshotError` with a `code`.

**Snapshot format v1:**

- `format`, `snapshotFormatVersion: 1`, `simulationVersion`, `tick`;
- the full `config` and its `configHash` (hash64 of sorted-key JSON);
- `state` = `canonicalizeWorldState(world)`, which covers both RNG states, the
  full fertility lattice, the organisms with runtime state, lineage and
  genomes, the food and the ID counters;
- `stateHash` (the canonical hash);
- `checksum` (SHA-256 over every other field).

It is serialized deterministically as sorted-key JSON with a trailing newline.
`parseSnapshot` also requires the text to be byte-identical to its canonical
serialization, so every altered byte is caught. Supported versions: `0A.2.0`
and `0A.1.0`.

**Semantics:**

- snapshot tick N = the world after tick N completed;
- the fertility lattice is stored in full;
- loading draws no RNG;
- restore builds fresh objects.

**Proof** (`packages/persistence/tests`, 31 tests):

| Test | Result |
|---|---|
| continuous 20,000 vs 10,000 → snapshot → serialize → file → load → restore → 20,000 (seed 20260910) | hash equal at every 1,000 ticks and at the end |
| golden resume: save at 5,000 → resume to 10,000 | `b95a0b4ef7dd8449` |
| separate processes: A creates and saves, a fresh B loads and resumes | hashes equal to the reference every 1,000 ticks |
| round trip world → serialize → parse → restore | canonical state string and hash identical |
| deterministic serialization | identical text, independent of config key order |
| purity | world, RNG streams and config byte-identical after save; works on deep-frozen inputs; restored RNG equals source; restore shares no objects |
| tick 0 and `0A.1.0` save/resume | exact |
| corruption | all of the cases below rejected with a coded `SnapshotError` |
| atomic file | no temp file left, whole replacement, a partial target refused, a stray temp file ignored, an invalid snapshot never written, file errors coded |

Corruption cases rejected:

- 300 single flipped bytes;
- a change that decodes to identical values but is non-canonical;
- malformed or truncated JSON;
- a wrong checksum;
- a wrong state hash, including a tampered state that was resealed;
- a missing or malformed RNG state (negative, ≥ 2³², fractional, string,
  missing word, all zero);
- a wrong format version;
- an incompatible or inconsistent simulation version;
- a modified config with a stale hash;
- a broken structure.

Also in this checkpoint:

- the root `npm run build` now builds simulation-core first;
- `package-lock.json` gains the new workspace.

What slice 1 left for Phase 0C, and where it went: rotation, fallback,
world identity and no-fresh-world recovery are done in slice 2 (below); the
rest is listed under "Phase 0C remaining" there.

### Slice 1 specification (historical record — IMPLEMENTED)

The authority is Spec v4: §14.34–§14.38, §18.24–§18.26, §18.60–§18.62,
§19.4–§19.17 and §19.27–§19.28. The first slice proves one invariant before
anything else is built:

> **continuous run == save → load → resume run**, bit for bit (canonical
> state hash), for the frozen `0A.2.0` model (§18.60 [LOCKED]).

What already exists:

- **`WorldState` is plain data.** It covers tick, version, world size, the
  fertility lattice, organisms with genomes and runtime state, food, the ID
  counters, and both BootstrapRNG and CanonicalRNG states (xoshiro128\*\*
  words).
- **`stepWorld(state, config)` is a pure function of that state and the
  configuration.**
- **`canonicalizeWorldState` already serializes every future-affecting field
  in a fixed order**, and `canonicalStateHash` fingerprints it.

The missing pieces are a versioned snapshot envelope, the inverse (restore),
validation, file I/O, and the proof.

Scope of slice 1:

- **A new workspace package, `packages/persistence`.** It depends only on
  `@alo/simulation-core`. simulation-core is not changed.
- **Snapshot schema v1.** It contains:
  - `snapshotSchemaVersion: 1`, `simulationVersion` and `tick`;
  - the complete immutable `SimulationConfig`, including `rootSeed`, with its
    hash (§19.14);
  - the canonical world state from `canonicalizeWorldState`, which covers both
    RNG states and the full fertility lattice;
  - `stateHash` (the canonical hash);
  - a checksum over the payload;
  - non-canonical metadata (`createdAt`, `snapshotId`) kept outside the hashed
    payload.
- **Conventions to decide and document** (they close §19.6 and §19.11 [OPEN]
  for this implementation):
  - a snapshot at tick N is the world state after tick N completes, which is
    `WorldState.tick`;
  - the fertility lattice is stored in full.
- **Functions:**
  - `createSnapshot(world, config)`;
  - `serializeSnapshot` / `parseSnapshot` (JSON);
  - `restoreWorld(snapshot) → { world, config }`, which builds fresh objects;
  - `validateSnapshot`: schema version, supported `simulationVersion`,
    `validateConfig`, checksum, RNG state present and well-formed (§18.62),
    and the restored state re-hashing to `stateHash`;
  - file `saveSnapshot` / `loadSnapshot`, with an atomic write (temp file then
    rename, §19.18).
- **Tests — the proof:**
  - **§18.60 continuation.** Run 20,000 ticks without interruption, against
    10,000 ticks → save to file → load → resume to 20,000. The final hash and
    the hash every 1,000 ticks after restore must match. Test at least the
    golden seed and one other non-validation seed.
  - **Golden resume.** Seed 20260910: save at 5000, resume to 10,000, and get
    exactly `b95a0b4ef7dd8449`.
  - **Separate process.** Restore in a separate Node process, so nothing
    carries over in memory.
  - **Edge ticks.** Save at tick 0 and at a tick with same-tick births and
    deaths.
  - **§19.28 corrupt-snapshot rejection.** A flipped byte, a missing or
    malformed RNG state, a wrong schema version and a mismatched
    `simulationVersion` must all be rejected.

Out of scope for slice 1: snapshot rotation and fallback, the persistent server
process and tick scheduler, PostgreSQL, events, the UI, and choosing a demo
seed.

## Phase 0C slice 2 — RESULT: DONE (folder snapshot store and fallback recovery)

Operational persistence only. No change to simulation-core, biology,
`simulationVersion` or snapshot format v1. No database, server, scheduler or UI.

**Module:** `packages/persistence/src/store.ts`, exported from `@alo/persistence`.

- `saveToStore(dir, snapshot, { keep = 5 })`
  → `{ tick, fileName, written, pruned }`;
- `listSnapshots(dir)` → snapshot files, oldest first;
- `recoverLatestValid(dir)` → `{ snapshot, world, config, report }`;
- `pruneSnapshots(dir, keep = 5)`;
- helpers `snapshotFileName`, `readStoreIdentity`, `worldIdentityOf`;
- `SnapshotStoreError` with a `code`.

`file.ts` gains `writeFileAtomic`, the shared temp → fsync → rename → dir-fsync
primitive. `saveSnapshotAtomic` now uses it, with unchanged behaviour.

**Folder layout:**

```text
<dir>/world-identity.json          format, storeFormatVersion 1, simulationVersion, configHash, SHA-256 checksum
<dir>/snapshot-000000010000.json   snapshot format v1 of the world after tick 10,000
<dir>/.<name>.<pid>.<n>.tmp        transient atomic-write file; never a candidate
```

**Rules as implemented:**

- **File names.** `snapshot-<tick, 12 digits zero-padded>.json`, so lexical
  order is tick order. Only regular files matching exactly are candidates.
  Temp files, other widths and look-alike suffixes are ignored by listing,
  recovery and retention.
- **World identity** = `(simulationVersion, configHash)`. This is the smallest
  identity derivable from existing canonical data: `configHash` already
  covers the full config, `rootSeed` and `simulationVersion` included. The
  version is kept explicit for readable refusals. It is recorded on the first
  save in `world-identity.json`, which is canonical and checksummed. Refusals:
  - a save of another world → `WORLD_IDENTITY_MISMATCH`;
  - an intact (checksum-valid) snapshot of another world in the folder →
    recovery and pruning refuse the whole folder, including for an
    unsupported future version;
  - a missing or corrupt identity file → `STORE_IDENTITY_MISSING` /
    `STORE_IDENTITY_INVALID`.

  Nothing is deleted to resolve a conflict. A corrupt file's identity fields
  are not trusted; the file is skipped as corrupt.
- **Save.** It validates first, so an invalid snapshot is never written. It is
  atomic and tick-monotonic:
  - same tick with identical bytes → no-op (`written: false`);
  - same tick with different bytes → `DUPLICATE_TICK`;
  - an older tick than the newest stored → `NON_MONOTONIC_TICK`.
- **Retention.** The newest 5 are kept. Older files are deleted, oldest first,
  only after the new file is committed and read back byte-identical.
  `pruneSnapshots` deletes nothing unless a retained snapshot is valid.
- **Recovery.** Snapshots are tried newest → oldest with full
  `parseSnapshot` validation, plus a check that the file-name tick matches
  the content (`FILENAME_TICK_MISMATCH`). Each failure is recorded in
  `report.skipped` as `{ fileName, tick, code, reason }`. The report holds no
  paths or timestamps, so it is deterministic. Recovery only reads.
- **No fresh world.** A missing directory, an empty store, or all snapshots
  invalid → `NO_VALID_SNAPSHOT`, carrying the report. Recovery never
  creates or re-seeds a world.

**Proof** (28 new tests):

| Required test | Where | Result |
|---|---|---|
| 1 retention | `store.test.ts` | 8 saves → exactly ticks 400–800 remain, names correct, newest restores to the reference hash; custom `keep`; invalid `keep` refused; prune refuses when every retained snapshot is corrupt |
| 2 corrupt newest | `store.test.ts`, `storeRecovery.test.ts` | newest skipped and reported; previous restored; resumed hashes equal the uninterrupted run |
| 3 multiple corrupt | `store.test.ts` | flipped / truncated / empty newest three → 4th selected; a misnamed valid file is skipped |
| 4 all corrupt | `store.test.ts` | `NO_VALID_SNAPSHOT` with a 5-entry report; directory byte-identical afterwards |
| 5 empty | `store.test.ts` | empty, missing (not created), identity-only → `NO_VALID_SNAPSHOT`; no or corrupt identity file → refused |
| 6 mixed world | `store.test.ts` | same version + config (independent run) allowed; other seed, other ecology parameter, `0A.1.0` refused on save; intact foreign or future-version snapshot refuses recovery and prune; nothing deleted |
| 7 duplicate tick | `store.test.ts` | identical re-save idempotent; different content refused, file untouched; older tick refused; after a fallback, the corrupt newer file is never overwritten |
| 8 atomicity | `store.test.ts` | partial and complete temp files and look-alike names never candidates and never pruned; no temp left by a save |
| 9 deterministic recovery | `store.test.ts` | two recoveries give identical reports and state; a copy of the directory gives the same report; directory unchanged |
| continuation regression | `storeRecovery.test.ts` | golden seed saved every 1,000 ticks (store keeps 5,000–9,000). Corrupting 9,000 → recover 8,000; corrupting 9,000/8,000/7,000 → recover 6,000. Both resume to 10,000 hash-equal every 1,000 ticks, ending at `b95a0b4ef7dd8449` |

A mutation check was done during implementation: disabling the identity
comparison fails 4 tests, and breaking pruning fails 6.

**Limitation found in slice 2:** after a fallback, the corrupt newer files
stay in place as evidence and block saves at or below their ticks. **Resolved
by slice 3** (below).

## Phase 0C slice 3 — RESULT: DONE (quarantine of corrupt snapshots)

This is the final snapshot-store cleanup. No change to simulation-core,
biology, `simulationVersion`, snapshot format v1, or the save and recovery
rules of slice 2.

**API:** `quarantineSkippedSnapshots(dir, report)` in `store.ts`
→ `{ moved: [{ fileName, tick, quarantinedAs, code }], kept: [{ fileName, tick, reason: 'NOW_VALID' | 'MISSING' }] }`.
It adds the error code `INVALID_RECOVERY_REPORT` and the constant
`QUARANTINE_DIR = 'quarantine'`.

**Behaviour:**

- **The report is checked before anything moves.** It must belong to this
  store's world (`WORLD_IDENTITY_MISMATCH`). Every skipped entry must name a
  well-formed snapshot file whose name matches its tick. The report may not
  list its own selected snapshot, `world-identity.json`, a path, or the same
  file twice (`INVALID_RECOVERY_REPORT`).
- **Every listed file is re-validated; the old report is not trusted.** Only
  files that are still invalid are planned for moving.
  - A file that now validates stays active (`NOW_VALID`).
  - A file that is gone is reported (`MISSING`).
  - An intact snapshot of another world refuses the whole call.
  - Files not in the report are never touched.
- **The move.** Once every file has been checked:
  1. re-read and confirm the bytes are unchanged;
  2. hard-link into `<dir>/quarantine/` (link(2) never overwrites);
  3. fsync, and read back byte-identical;
  4. unlink from the store.

  An interruption leaves the file in both places or only in the store —
  never in neither — and a rerun completes the move. The original file name
  is kept; a taken name gets the first free `<name>.1`, `<name>.2`, …
  Nothing is ever deleted.
- **Idempotent.** Rerunning with the same report moves nothing and changes
  nothing: every file is `MISSING`.
- **Store isolation.** `quarantine/` is a directory, so listing, recovery and
  retention never see it.

**Proof** (11 new tests):

| Test | Result |
|---|---|
| golden scenario (`storeRecovery.test.ts`) | seed 20260910, store 5,000–9,000, corrupt 9,000 → recover selects 8,000 → quarantine moves 9,000 → resume, saving 9,000 and 10,000 (hash-equal to the uninterrupted run) → recover selects 10,000, **0 skipped**, stateHash **`b95a0b4ef7dd8449`**; the live world also ends at `b95a0b4ef7dd8449`; `quarantine/snapshot-000000009000.json` byte-identical to the corrupted file |
| one corrupt | moved byte-identical; the resumed world saves 800; the next recovery is clean |
| multiple corrupt | flipped / truncated / empty all moved; the selected snapshot and identity file stay |
| re-validation | a file repaired after the report stays active (`NOW_VALID`) |
| valid never moved | a stale report naming a valid file moves nothing |
| refused reports | selected snapshot, identity file, `../` path, tick mismatch, duplicate entry, wrong world — refused, directory unchanged |
| already missing | reported `MISSING`; a corrupt file outside the report is not touched |
| existing quarantine dir and collisions | unrelated files kept; the new file goes to `.2` after `name` and `.1` are taken; nothing overwritten |
| foreign snapshot | refuses the whole call before any move |
| twice | second and third runs move nothing and change nothing |
| interrupted move | link-without-unlink state: the store still recovers identically, and a rerun completes the move |

A mutation check was done during implementation. Removing re-validation
fails 2 tests. Replacing the no-overwrite link with a copy that overwrites
fails 2.

The snapshot store is complete. What came next — the world process — is the
section below.

## Phase 0C world runner — RESULT: DONE (persistent world process)

No change to simulation-core, biology, `simulationVersion`, snapshot format
v1 or the store. No database, server, API or UI.

**Package:** `packages/world-runner` (`@alo/world-runner`). It depends on
`simulation-core` and `persistence`.

**`WorldRunner` (`src/runner.ts`):**

- `WorldRunner.create(dir, config, { saveEvery, keep })` — the explicit
  fresh launch. It refuses a folder that already holds a world — identity,
  snapshots or `quarantine/`, healthy or broken — with `WORLD_EXISTS`. It
  bootstraps from the config and saves tick 0, which records the world
  identity. The config lives in every snapshot, so recovery never needs the
  seed again.
- `WorldRunner.open(dir, …)` — `recoverLatestValid`, then
  `quarantineSkippedSnapshots` when anything was skipped, then continue. Any
  recovery failure propagates. It never creates a world.
- `step()` = `stepWorld` plus a save when `tick % saveEvery === 0` (default
  1000). `runUntil(t)`, `saveNow()`, and `close()` (saves the current tick
  if unsaved).
- `async run({ untilTick, statusEvery, onStatus, batchTicks })` yields to
  the event loop every 100 ticks. It stops after the current tick on
  `stop()` and always saves before resolving.
- `status()` → `{ dir, origin, tick, population, food, snapshotTick,
  simulationVersion, configHash, rootSeed, saveEvery, recoveredFromTick,
  stopRequested }`. It is plain data with no timestamps.

**CLI (`src/cli.ts`, root `npm run world --`):**

- Options: `--dir`, `--new --seed`, `--save-every`, `--keep`, `--until-tick`,
  `--status-every`, `--json`.
- `--new` requires `--seed`, and `--seed` without `--new` is refused. The
  folder resolves from npm's `INIT_CWD`.
- SIGINT/SIGTERM trigger a graceful stop: the current tick is saved and the
  process exits 0. A second signal exits 130.
- Exit codes: 1 for a refused start (with "no world was created or
  modified"), 2 for bad arguments.
- Ticks/second appear in status lines only; wall-clock time never reaches the
  simulation.

Also: root `build` builds world-runner last, the lockfile gains the
workspace, `worlds/` is gitignored, and the `node_modules/@alo` links for
persistence and world-runner were added locally.

**Proof** (21 tests):

| Required | Test | Result |
|---|---|---|
| 1 fresh launch | `runner.test.ts` | config, `0A.2.0`, identity file, tick-0 snapshot, cadence 0/100/200, final save at 250, status fields |
| 2 controlled run | `runner.test.ts` | seed 11 to 2,000, saving every 250: hash = direct simulation; newest 5 kept |
| 3 restart/resume | `runner.test.ts` | stop at 1,234 (off cadence, saved on close) → reopen → 2,000 = direct |
| 4 multi-restart | `runner.test.ts` | 0 → 3,000 → 7,000 → 10,000 across three runners = **`b95a0b4ef7dd8449`** |
| 5 corrupt newest | `runner.test.ts`, `process.test.ts` | recover 900, quarantine 1,000 (byte-identical), continue, saves resume through 1,000 to 1,500 = direct; the next open skips nothing |
| 6 all corrupt | `runner.test.ts`, `process.test.ts` | `NO_VALID_SNAPSHOT`; directory byte-identical; a missing directory is not created |
| 7 existing dir + new | `runner.test.ts`, `process.test.ts` | `WORLD_EXISTS` for healthy, broken, identity-only and quarantine-only folders; unchanged |
| 8 save purity | `runner.test.ts` | save every tick, every 37, or never → same hash = direct; config not modified |
| 9 separate process | `process.test.ts` | CLI process A creates and runs to 4,321 and exits; process B recovers and runs to 10,000 = **`b95a0b4ef7dd8449`** |
| graceful stop | `runner.test.ts`, `process.test.ts` | `run()` + `stop()` saves the stop tick; SIGINT (golden, continues to `b95a0b4ef7dd8449`) and SIGTERM exit 0 with the stop tick saved |
| hard kill | `process.test.ts` | SIGKILL between saves: the newest snapshot is a scheduled save; restart recovers it and reaches `b95a0b4ef7dd8449` |

A mutation check was done during implementation. Dropping the final save
and the `WORLD_EXISTS` check fails 6 tests.

**Throughput** (observational, seed 20260910, 0 → 10,000 ticks, on this
session's VM):

| Run | Time |
|---|---:|
| direct | 8.7 s (≈ 1,150 ticks/s) |
| runner, saving every 1,000 ticks | 9.2 s (≈ 5 % overhead) |
| runner, saving every 100 ticks | 11.8 s |

A tick-10,000 snapshot is ≈ 0.9 MB. No optimisation was needed.

## Phase 0C remaining — only what Phase 0D genuinely needs

Spec §14.45–§14.50 define Phase 0D as a read-only live observatory:

- React, PixiJS and WebSocket;
- a server that periodically publishes observer state, with simulation
  ≈ 10 Hz and network 5–10 Hz (§14.47);
- organism inspection (§14.49);
- no mutation commands (§14.50 [LOCKED]).

What that needs from the backend:

1. **A read-only observer interface on the running world.** This is the next
   step.
2. **Optional tick pacing** for a watchable world (≈ 10 Hz, §14.47). The
   runner currently runs as fast as possible. Pacing only schedules when
   ticks run and never reaches world state.

Not required before Phase 0D:

- PostgreSQL historical storage, event records and soak tests (§14.35). The
  spec does not require a database to execute or observe the world (§14.37:
  continuity is snapshots). Births and deaths for a recent-event feed can
  come from `stepWorld` telemetry, which is optional in §14.46.
- Cloud deployment.

## NEXT EXACT STEP

**Phase 0D bridge — a read-only local observer stream from the world
runner.**

1. Add a pure projection `toObserverFrame(world, status)` to
   `packages/world-runner`. It returns tick, population, the world size, the
   food positions, and per organism: id, x, y, heading, size, energy, age,
   generation depth, `parentId` and `lineageRootId`.
2. Add an opt-in `--observe <port>` to the runner. It serves the latest frame
   read-only over a minimal local WebSocket (or HTTP) at ≤ 10 Hz, independent
   of the tick rate. There are no mutation endpoints.
3. Add an optional `--ticks-per-second` pace (§14.47), which schedules ticks
   only.

Prove it with a test: the canonical hash with observers connected and
pacing on equals the hash without them (`b95a0b4ef7dd8449` at 10,000).

No React or PixiJS in this step. No database or cloud. No change to
simulation-core or biology.
