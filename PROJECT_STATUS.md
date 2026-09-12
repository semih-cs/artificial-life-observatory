# PROJECT_STATUS.md — Artificial Life Observatory

**Last updated:** 2026-09-12 (V2.6 done as a model: regulated recurrent initialization, model `0A.8.0`; its precommitted hypothesis test FAILED — see below; earlier models frozen)
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
| **Phase 0C** — Persistent Canonical World | **COMPLETE FOR V1.** **DONE** (below): slice 1 (deterministic save/load/resume), slice 2 (snapshot store: retention, world identity, fallback recovery) and slice 3 (quarantine of corrupt snapshots); the **persistent world runner** (`packages/world-runner`) and its **read-only observer bridge** (WebSocket frames, protocol v1, tick pacing). Phase 0C is complete for v1 |
| **V2.1** — other organisms enter the sensory world | **DONE** (below): new model `simulationVersion 0A.3.0`, 10 → 8 → 4 — the `0A.2.0` model plus four inputs for the nearest visible other living organism. Perception only. Golden hash `e54d0c11249b7849`. `0A.1.0` / `0A.2.0` unchanged. Snapshot format v1 and observer protocol v1 unchanged. Observatory: selected-organism vision cone |
| **V2.2** — recurrent memory | **DONE** (below): new model `simulationVersion 0A.4.0`, 10 → 8 recurrent → 4 — the `0A.3.0` model with an Elman hidden layer (+64 inherited recurrent weights, 188 parameters), runtime memory (8 values, zero at birth, never inherited), no lifetime learning. Golden hash `436a377506063609`. New snapshot format v2 for `0A.4.0`; format v1 unchanged; observer protocol v1 unchanged; no new UI |
| **V2.3** — physical bodies | **DONE** (below): new model `simulationVersion 0A.5.0` — the `0A.4.0` controller exactly (10 → 8 recurrent → 4, 188 parameters, 8 memory values) plus SOLID BODIES. Radius `2.0 + 2.2 × size` world units from the inherited size gene; overlap is strict `centreDistance < rA + rB`; separation along the line of centres weighted `shareA = sizeB/(sizeA+sizeB)` so the larger body moves less. Displacement only — no damage, attack, predation, energy transfer, event, new input/output/action or persistent physics state. Feeding uses post-collision positions. Golden hash `1006a56393e19cd9` (canonical seed extinct at tick 2,551, 2 births — reported honestly, no seed shopping). Snapshot format stays v2, observer protocol stays v1, `0A.1.0`–`0A.4.0` unchanged |
| **V2.4** — contestable food handling | **DONE** (below): new model `simulationVersion 0A.6.0` — the `0A.5.0` world exactly (10 → 8 recurrent → 4, 188 parameters, solid bodies) plus MULTI-TICK CONTESTABLE EATING. `handling.ticksRequired` = 5 consecutive handling ticks per item, driven entirely by the existing `eat` output (acquire / continue / release); the item travels with its holder and still counts in the food cap; genuine organism-organism body contact from the ACTIVE resolution dislodges it; a dropped item cannot be reacquired until the next tick; progress resets on release, dislodgement and death; only completion grants the ordinary food energy. No steal/defend/attack/share rule, no new input or output, no damage, no transfer. Golden hash `3e5b9671f5750712` (canonical seed: 0 births, extinct at tick 2,854 — reported honestly, no seed shopping, no tuning). New **snapshot format v3**; observer protocol stays v1; `0A.1.0`–`0A.5.0` unchanged |
| **V2.5** — lifetime plasticity | **DONE** (below): new model `simulationVersion 0A.7.0` — all `0A.6.0` capabilities plus deterministic reward-modulated adaptation of the final action readout. The 188 inherited parameters remain immutable; 36 runtime offsets and 36 eligibility traces start at zero and are not inherited. Reinforcement is actual capped food energy credited minus actual movement energy spent, divided by capacity. Learning rate 0.01, decay 0.90. Golden hash `04d0b7c5917ca0c0` (canonical seed: 0 births, extinct tick 2,444). Snapshot format **v4**; observer protocol v1 unchanged; `0A.1.0`–`0A.6.0` unchanged |
| **V2.6** — regulated recurrent initialization | **DONE AS A MODEL; PRECOMMITTED HYPOTHESIS TEST FAILED** (below): new model `simulationVersion 0A.8.0` — the `0A.6.0` world exactly (10 → 8 recurrent → 4, 188 parameters, solid bodies, 5-tick contestable handling, NO lifetime plasticity) with ONE difference: the recurrent hidden→hidden block is DRAWN from `neural.recurrentInitSigma = initSigma / sqrt(hiddenLayerSize)` = `0.282842712474619` instead of the shared `initSigma` (0.8). Initialization only — no runtime gain, leak, time constant, gate, gene, sensor, action or founder-screen change; mutation semantics, the runtime Elman equation and the whole bootstrap RNG schedule are unchanged. Golden hash `0806b096bf4d0061` (canonical seed: 5 births, max generation 3, extinct at tick 2,884 — reported honestly, no seed shopping, no tuning). **Snapshot format v3 REUSED** (`0A.8.0`'s stored shape is `0A.6.0`'s); observer protocol v1 unchanged; `0A.1.0`–`0A.7.0` unchanged. Mechanism confirmed by read-only diagnostics; 3 of 4 precommitted demographic thresholds missed; **nothing was tuned afterwards** |
| **Phase 0D** — Observatory / visualisation | **COMPLETE / FROZEN FOR V1** (below): `packages/observatory`, the Observatory frontend (React + TypeScript + Vite + PixiJS). Slice 1 renders the live world from the read-only observer stream: lineage-coloured organisms with readable heading and an energy ring, food, birth/death effects, interpolated motion, camera, selection with lineage emphasis, an organism inspector, HUD and connection states. Slice 2 makes evolution visible: a living-lineage panel, a birth/death/extinction event feed, session-only population/generation/lineage/food trends, a prominent max-generation stat, and a per-lineage living-count sparkline — all derived in the browser from received frames, bounded, non-persistent, non-scientific. Slice 3 makes inheritance visible: the inspector compares the five protocol morphology genes with the parent's (exact deltas, change marks, tiny bars) from a bounded session cache, distinguishes alive / observed-dead / unavailable parents and founders, lets you select a living parent, marks births with a Δ count, and adds a *Morphology changes* stat. Slice 4 adds a compact ancestry strip: the observed parent chain walked backwards through that cache to the founder (or an honest boundary), a Δ badge per hop, alive ancestors selectable. The final polish adds an organism quick-jump, the first-run card, `npm run demo:new` / `demo:resume` with DEMO seed `31415926`, and a help hint. **V1 COMPLETE.** Further work is v2 unless it is a genuine v1 bug |

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

**V2 model (new, separately versioned — does not replace the v1 default):**

| Setting | Value |
|---|---|
| `simulationVersion` | `0A.3.0` (`organismSensingModelConfig()`, `--model 0A.3.0`) |
| topology | 10 → 8 → 4 (v1 models: 6 → 8 → 4) |
| configuration | `DEFAULT_SIMULATION_CONFIG` with only the version changed |
| golden hash (seed 20260910, 10,000 ticks, linux-arm64) | `e54d0c11249b7849` |

**V2.2 model (new, separately versioned):**

| Setting | Value |
|---|---|
| `simulationVersion` | `0A.4.0` (`recurrentMemoryModelConfig()`, `--model 0A.4.0`) |
| controller | 10 → 8 recurrent → 4 (Elman), 188 neural parameters, 8 runtime memory values |
| configuration | the `0A.3.0` configuration with only the version changed |
| snapshot format | v2 (older models: v1) |
| golden hash (seed 20260910, 10,000 ticks, linux-arm64) | `436a377506063609` |

**V2.3 model (new, separately versioned):**

| Setting | Value |
|---|---|
| `simulationVersion` | `0A.5.0` (`physicalBodiesModelConfig()`, `--model 0A.5.0`) |
| controller | 10 → 8 recurrent → 4 (Elman), 188 neural parameters, 8 runtime memory values — identical to `0A.4.0` |
| bodies | solid; radius = `body.radiusBase + body.radiusPerSize × size` = `2.0 + 2.2 × size` world units (`[3.1, 5.3]` over the gene range) |
| configuration | the `0A.4.0` configuration with the version changed and the `body` section added (`radiusBase 2.0`, `radiusPerSize 2.2`, `separationPasses 4`); nothing else retuned |
| snapshot format | v2 (unchanged — no format v3) |
| observer protocol | v1 (unchanged) |
| golden hash (seed 20260910, 10,000 ticks, linux-arm64) | `1006a56393e19cd9` |

**V2.4 model (new, separately versioned):**

| Setting | Value |
|---|---|
| `simulationVersion` | `0A.6.0` (`foodHandlingModelConfig()`, `--model 0A.6.0`) |
| controller | 10 → 8 recurrent → 4 (Elman), 188 neural parameters, 8 runtime memory values — identical to `0A.5.0` |
| bodies | solid, radius `2.0 + 2.2 × size` — identical to `0A.5.0` |
| feeding | 5 consecutive handling ticks per item (`handling.ticksRequired`); held items travel with their holder, count in the food cap, and are dislodged by active body contact |
| configuration | the `0A.5.0` configuration with the version changed and the `handling` section added; nothing else retuned |
| snapshot format | **v3** (per-food `holderId` and `handlingProgress`) |
| observer protocol | v1 (unchanged) |
| golden hash (seed 20260910, 10,000 ticks, linux-arm64) | `3e5b9671f5750712` |

**V2.5 model (new, separately versioned):**

| Setting | Value |
|---|---|
| `simulationVersion` | `0A.7.0` (`lifetimePlasticityModelConfig()`, `--model 0A.7.0`) |
| controller | 10 → 8 recurrent → 4; 188 immutable inherited parameters |
| plastic runtime | 32 hidden→output offsets + 4 output-bias offsets; 36 matching eligibility traces |
| rule | eligibility decay 0.90; update rate 0.01; reinforcement = `(actual capped food credit - actual movement cost) / energyCapacity`, clamped |
| inheritance | genome only; memory, offsets and eligibility reset to zero |
| snapshot / observer | v4 / v1 |
| golden hash (seed 20260910, 10,000 ticks, linux-arm64) | `04d0b7c5917ca0c0` |

**V2.6 model (new, separately versioned):**

| Setting | Value |
|---|---|
| `simulationVersion` | `0A.8.0` (`regulatedRecurrentInitModelConfig()`, `--model 0A.8.0`) |
| controller | 10 → 8 recurrent → 4; 188 inherited parameters; runtime equation identical to `0A.6.0` |
| recurrent init | `neural.recurrentInitSigma = initSigma / sqrt(hiddenLayerSize)` = `0.8 / sqrt(8)` = `0.282842712474619`; LOCKED and re-derived by `validateConfig()` |
| other blocks | input→hidden, hidden biases, hidden→output, output biases still drawn from `initSigma` (0.8) |
| lifetime plasticity | **off** (V2.5 machinery intact and unchanged for `0A.7.0`) |
| mutation | unchanged; `recurrentInitSigma` is never a mutation or bootstrap-perturbation sigma |
| snapshot / observer | **v3 (reused)** / v1 |
| golden hash (seed 20260910, 10,000 ticks, linux-arm64) | `0806b096bf4d0061` |
| checkpoints | tick 500 `7b9fa5616b128d94`; tick 1,000 `eb32428de387d31d`; tick 2,000 `1d627932555249d7` |

**DEMO seed (presentation only): `31415926`** — used by `npm run demo:new`
(`worlds/demo`, 10 ticks/s, observer on 8787). Chosen from a 40,000-tick
headless check of a handful of candidate seeds outside the pilot and
validation sets: population ≈ 100 at tick 2,000 and ≈ 350–380 from tick
4,000 on, 18 living lineages at tick 2,000 narrowing to 1 by tick 30,000,
maximum generation 36 at tick 40,000. It is not research evidence, not a
"representative" or "best" world, and it changes no regression seed or
golden hash.

### V1 — COMPLETE

v1 = frozen `0A.2.0` biology + exact persistence + the persistent world
runner with its read-only observer stream + the Observatory (Phase 0D
slices 1–4 and the final polish). What v1 deliberately excludes, and the
v2 backlog, are in README *V1 boundaries*. From here on:

- **no new features in v1** — the Observatory, runner and biology are
  frozen; only genuine v1 bugs are fixed, with a focused test each;
- **v2 work starts in a new phase** with its own spec, never by extending
  the frozen packages "a little".

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

For v1, no RL, learning, memory, predators, signalling, new actions or richer biology.
The existing life is made persistent and visible first.

A clearly labelled DEMO seed was chosen for the v1 UI. It stays separate
from the pilot and validation seeds, and it is never research evidence. None
is `31415926`.

---

## Git state

Branch: `main` (tracking `origin/main`). `git log -1` is authoritative. The
most recent implementation is the V2.5 checkpoint; tag `v1.0.0` = `5ea6ee4` is the
frozen v1 release and is not moved:

```text
3e4cc11 V2.5: lifetime plasticity — model 0A.7.0, snapshot format v4
5bbb05f PROJECT_STATUS: record the V2.4 commit hash
5d63787 V2.4: contestable food handling — model 0A.6.0 (5-tick eating, held food, contact dislodges)
62b16fb PROJECT_STATUS: record the V2.3 commit hash
031a301 V2.3: physical bodies — model 0A.5.0 (solid bodies, size-weighted displacement)
ed7644a V2.2: recurrent memory — model 0A.4.0 (10→8 recurrent→4), snapshot format v2
ceecbc8 V2.1: other organisms enter the sensory world — model 0A.3.0 (10→8→4), selected-organism vision cone
cb29594 demo scripts: demo:new:settled (fast-forward to tick 5000, then stream) and demo:resume:slow (3 ticks/s); document the 25-founder opening burst
5ea6ee4 (tag: v1.0.0) v1 complete: Observatory final polish (quick-jump, first-run card, help), demo scripts and DEMO seed, Phase 0D frozen
f21d072 Phase 0D slice 4: Observatory compact ancestry strip — observed parent chain, Δ per hop, honest boundaries
47f7e87 Phase 0D slice 3: Observatory inherited morphology — parent → child gene deltas, birth Δ counts, morphology cache
ddfcda3 Phase 0D slice 2: Observatory evolution visibility — lineage panel, birth/death feed, session-only trends
e809686 Phase 0D slice 1: Observatory frontend — live world view over observer protocol v1
96732ab Phase 0D bridge: read-only observer stream (protocol v1) and tick pacing
68865c7 Phase 0C: persistent world runner (create/recover, continuous run, periodic saves, clean stop)
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

The full history is in `git log`. Before the V2.5 commit, the only unrelated
working-tree item was the owner's untracked `Claude outputs/`; it was preserved
untouched. Generated artifacts are gitignored (`node_modules/`, `dist/`,
`coverage/`, `results/`, `.DS_Store`, `*.log`).

---

## Verification — V2.5 checkpoint (this session)

Official `node:22.23.2-bookworm-slim` image, explicitly linux-arm64, with the
repository mounted read-only and copied only into the disposable container:

```text
simulation-core tests:    313 / 313 passed   (+18: lifetimePlasticity)
experiment-harness tests: 138 / 138 passed   (unchanged)
persistence tests:        116 / 116 passed   (+5: lifetimePlasticitySnapshot)
world-runner tests:        60 / 60  passed   (+2: lifetimePlasticityModel)
observatory tests:         90 / 90  passed   (unchanged)
workspace total:          717 / 717 passed
workspace build:          PASS (`npm run build`)
```

The `0A.7.0` golden ran twice in-test with living checkpoints and ended at
`04d0b7c5917ca0c0`; every historical model golden also passed in the same
suite. Local macOS-arm64 focused V2.5 tests passed (17 core tests excluding the
linux-pinned golden, 5 persistence, 2 runner), and all five packages built.
The macOS canonical hash differs as recorded in Known gap 13; no semantic
change was made to chase it.

Live smoke check: a paced `0A.7.0` seed-8 world ran from tick 0 to 400 with
observer protocol v1; the real Observatory showed `LIVE`, the correct model,
seed and advancing world counters, with no browser warnings/errors. The store
then recovered snapshot 400 and continued to 500 as `0A.7.0` with the same
config hash, saving format-v4 state. Automated tests additionally compare the
resumed canonical state directly with uninterrupted execution.

---

## Verification — V2.4 checkpoint (this session)

Development VM (linux-arm64, Node 22.23.2), package by package (one shell
command is limited to 3 minutes there):

```text
simulation-core tests:    295 / 295 passed   (+34: foodHandling)
experiment-harness tests: 138 / 138 passed   (unchanged)
persistence tests:        111 / 111 passed   (+11: foodHandlingSnapshot)
world-runner tests:        58 / 58  passed   (+4: foodHandlingModel)
observatory tests:         90 / 90  passed   (unchanged — no frontend change)
workspace total:          692 / 692 passed   (V2.3: 643)
workspace build:          PASS (`npm run build`)

golden hashes, seed 20260910, 10000 ticks (linux-arm64), each from a fresh CLI process:
  0A.1.0 single-founder (frozen):     6a6576bd49e86b27  UNCHANGED
  0A.2.0 multi-founder (frozen v1):   b95a0b4ef7dd8449  UNCHANGED  (also `npm run simulate` with no --model)
  0A.3.0 organism sensing (frozen):   e54d0c11249b7849  UNCHANGED
  0A.4.0 recurrent memory (frozen):   436a377506063609  UNCHANGED
  0A.5.0 physical bodies (frozen):    1006a56393e19cd9  UNCHANGED
  0A.6.0 contestable handling (V2.4): 3e5b9671f5750712  NEW (twice in-test + CLI; checkpoints 500 = 811dee5de25a3753,
                                                        1,000 = 11f3da7c82ce8082, 2,000 = 5868f40d685adda3;
                                                        0 births, extinct at tick 2,854)
  0A.6.0 coverage checkpoints (NOT canonical): seed 3 @ 2,500 = 1ed9e874a5f493bf (1 birth, first living seed);
                                               seed 8 @ 2,500 = e21dc19bcc7a85ec (22 births, the most active world)
```

No test was deleted or weakened. Pinned lists were extended for the new model
(`SUPPORTED_MODEL_VERSIONS` in `recurrentMemory`, `organismSensingModel` and
`physicalBodies` tests; `SUPPORTED_SIMULATION_VERSIONS` and the format mapping
in `snapshot`, `recurrentSnapshot` and `physicalBodiesSnapshot` tests), two
registry equality assertions gained `foodHandling: false` for the historical
models, and the `physicalBodies` no-op assertion gained the new derived
`contacts: []` field of `BodySeparationResult`.

Also on the x86_64 cloud container (Node 22.22.2), a clean build of the same
tree: `npm run build` passes and the browser live check ran there (22 / 22,
below). The `0A.6.0` hashes differ there, as every model's do — Known gap 13.

## Verification — V2.3 checkpoint (historical)

Development VM (linux-arm64, Node 22.23.2), package by package (one shell
command is limited to 3 minutes there):

```text
simulation-core tests:    261 / 261 passed   (+28: physicalBodies)
experiment-harness tests: 138 / 138 passed   (unchanged)
persistence tests:        100 / 100 passed   (+8: physicalBodiesSnapshot)
world-runner tests:        54 / 54  passed   (+4: physicalBodiesModel)
observatory tests:         90 / 90  passed   (+3: bodyRadius)
workspace total:          643 / 643 passed   (V2.2: 600)
workspace build:          PASS (`npm run build`)

golden hashes, seed 20260910, 10000 ticks (linux-arm64), each from a fresh CLI process:
  0A.1.0 single-founder (frozen):    6a6576bd49e86b27  UNCHANGED
  0A.2.0 multi-founder (frozen v1):  b95a0b4ef7dd8449  UNCHANGED  (also `npm run simulate` with no --model)
  0A.3.0 organism sensing (frozen):  e54d0c11249b7849  UNCHANGED
  0A.4.0 recurrent memory (frozen):  436a377506063609  UNCHANGED
  0A.5.0 physical bodies (V2.3):     1006a56393e19cd9  NEW (twice in-test + CLI; checkpoints 500 = faa74c30055fde98,
                                                       1,000 = 404f8619ffdab600, 2,000 = e426cc438e25467e;
                                                       extinct at tick 2,551 with 2 births)
  0A.5.0 coverage checkpoint, seed 8, tick 2,500: f398b7b9229d447c (81 births) — not a golden reference
```

No test was deleted or weakened. Four pinned lists were extended to include the
new model (`SUPPORTED_MODEL_VERSIONS` in
`simulation-core/tests/recurrentMemory.test.ts` and
`organismSensingModel.test.ts`, `SUPPORTED_SIMULATION_VERSIONS` and the
format mapping in `persistence/tests/snapshot.test.ts` /
`recurrentSnapshot.test.ts`), and two registry equality assertions in
`organismSensingModel.test.ts` gained the new `physicalBodies: false` field for
the historical models.

Also on the x86_64 cloud container (Node 22.22.2), a clean `npm ci` of the same
tree: `npm run build` passes and the browser live check ran there (18 / 18,
below). The `0A.5.0` hashes differ there, as every model's do — Known gap 13.

## Verification — V2.2 checkpoint (historical)

Development VM (linux-arm64, Node 22.23.2), package by package (one shell
command is limited to 3 minutes there):

```text
simulation-core tests:    233 / 233 passed   (+24: recurrentMemory)
experiment-harness tests: 138 / 138 passed   (unchanged)
persistence tests:         92 / 92  passed   (+11: recurrentSnapshot)
world-runner tests:        50 / 50  passed   (+4: recurrentMemoryModel)
observatory tests:         87 / 87  passed   (unchanged; the built bundle is byte-identical in name/hash to V2.1's)
workspace total:          600 / 600 passed   (V2.1: 561)
workspace build:          PASS (`npm run build`)

golden hashes, seed 20260910, 10000 ticks (linux-arm64):
  0A.1.0 single-founder (frozen):    6a6576bd49e86b27  UNCHANGED
  0A.2.0 multi-founder (frozen v1):  b95a0b4ef7dd8449  UNCHANGED  (also `npm run simulate` with no --model)
  0A.3.0 organism sensing (frozen):  e54d0c11249b7849  UNCHANGED
  0A.4.0 recurrent memory (V2.2):    436a377506063609  NEW (several processes; twice in-test; checkpoints 1,000 = 321c43755adfa040, 2,000 = 1215b0df8338e59e)
  0A.4.0 coverage checkpoint, seed 8, tick 2,500: 6560783d7e9c5086 (113 births) — not a golden reference
```

Also on the x86_64 cloud container (Node 22.22.2), `npm ci && npm test` on
the same code tree: 571 / 600 pass; all 29 failures are assertions of a
pinned linux-arm64 value (28 hashes incl. the new `0A.4.0` ones and the
fixture continuations, plus the seed-8 birth count, 130 there vs 113) — Known
gap 13. Every same-platform equivalence (continuous == resumed, observed ==
unobserved) passes there. The browser live check ran there (19 / 19).

## Verification — V2.1 checkpoint (historical)

Run on the development VM (linux-arm64, Node 22.23.2) — the platform the
golden hashes belong to — package by package (the VM's shell limits one
command to 3 minutes, so the root `npm test` was run per workspace):

```text
simulation-core tests:    209 / 209 passed   (+30: organismSensing 18, organismSensingModel 12)
experiment-harness tests: 138 / 138 passed   (unchanged)
persistence tests:         81 / 81  passed   (+11: modelCompatibility)
world-runner tests:        46 / 46  passed   (+5: organismSensingModel)
observatory tests:         87 / 87  passed   (+6: visionCone)
workspace total:          561 / 561 passed   (v1: 509; no v1 test removed or weakened — one pinned list updated, see V2.1 section)
workspace build:          PASS (`npm run build`, ≈ 9 s)

golden hashes, seed 20260910, 10000 ticks:
  0A.2.0 multi-founder (frozen v1):  b95a0b4ef7dd8449  UNCHANGED  (npm run simulate -- --seed 20260910 --ticks 10000)
  0A.1.0 single-founder (frozen):    6a6576bd49e86b27  UNCHANGED  (--model 0A.1.0; also a live test)
  0A.3.0 organism sensing (V2.1):    e54d0c11249b7849  NEW        (--model 0A.3.0; three separate processes + twice in-test)
```

Also on an x86_64 cloud container (Node 22.22.2), `npm ci && npm test` on the
same tree: every test passes except the 22 that pin an arm64 hash; the frozen
`v1.0.0` code itself gives `0A.2.0` = `ea689a61d2fd4b38` there — see *Known
gaps* 13. The live Observatory check ran there (19 / 19, V2.1 section).

### Verification at the v1 checkpoint (historical)

```text
simulation-core tests:    179 / 179 passed
experiment-harness tests: 138 / 138 passed
persistence tests:         70 / 70  passed   (slice 1: 31 — §18.60 continuation, golden resume, separate process;
                                             slice 2: 28 — snapshot store 25, fallback-recovery regression 3;
                                             slice 3: 11 — quarantine 10, golden fallback → quarantine → resume → save → recover 1)
world-runner tests:        41 / 41  passed   (runner 13; processes and signals 10; observer frame 4; observer stream 11;
                                             golden observer / paced / paced+observer 3)
observatory tests:         81 / 81  passed   (protocol 6; connection lifecycle + read-only 7; selection/inspector/HUD 7;
                                             frame store 4; interpolation 5; lineage colour 5; camera 5;
                                             slice 2: lineage aggregation 4; session history 10; evolution panel 6;
                                             slice 3: inheritance, cache, birth feed, inspector section 10;
                                             slice 4: ancestry walk + strip 8; final polish 4) — ≈ 1.4 s
workspace total:          509 / 509 passed   (run per package this session; root `npm test` ≈ 2.5–3 min on this VM)
workspace build:          PASS (simulation-core, then experiment-harness and persistence, then world-runner, then observatory:
                                tsc --noEmit + vite build, ≈ 8 s total)
live integration:          52 / 52 checks passed (v1 acceptance: first-run card, demo world create/resume, quick-jump, help, then slices 1–4 on the golden world and a third world; see the Phase 0D final section)
demo scripts:              verified on the dev VM — `demo:new` creates worlds/demo (seed 31415926) and streams; `demo:resume` recovers it; `demo:new` over an existing world is refused ([WORLD_EXISTS], exit 1, nothing touched)

golden hashes, seed 20260910, 10000 ticks — one per MODEL, never conflated:
  0A.2.0 multi-founder canonical (frozen v1): b95a0b4ef7dd8449  CONFIRMED
  0A.1.0 historical single-founder:           6a6576bd49e86b27  CONFIRMED
```

Re-confirmed at the v1 checkpoint (the biology, persistence and runner
packages are byte-for-byte unchanged by Phase 0D slices 2–4 and the final
polish: `git
diff --stat` touches only `packages/observatory/` and the three
documentation files plus two root `package.json` scripts; no dependency was added), at
the slice 4, 3, 2 and 1 checkpoints, at the
observer-bridge checkpoint, and at every Phase 0C checkpoint before it:

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
| `README.md` | UPDATED — status table, v1 freeze, Phase 0B closed, Phase 0C active, current baseline behaviour under v2; four packages, the world-runner section (create, run/recover, cadence, graceful shutdown, crash recovery, no silent new world, throughput), the observer stream (protocol v1, WebSocket usage, pacing, TPS vs FPS, read-only guarantee), the persistence API example, and a World persistence section (format v1, semantics, corruption codes, the slice 2–3 snapshot store — layout, naming, retention, identity, fallback, no fresh world, quarantine — and limitations) |
| `AGENTS.md` | UPDATED — amendment in the source hierarchy, multi-founder invariant, per-model golden hashes; Phase 0B closed for v1, frozen v1 biology, Phase 0C active, demo-seed policy; persistence invariants and the persistence regression; slice 2 store invariants (one folder = one world, never overwrite a stored tick, recovery never creates a world); slice 3 quarantine-never-delete invariant, snapshot store declared complete; world-runner invariants (runner never changes the simulation, no silent new world, restart equivalence), package list and runner regression; observer invariants (read-only and pure, TPS is not FPS, protocol versioning); **Phase 0D slice 1 done, the Observatory package, frontend rules (read-only, display-only interpolation and effects, no history, protocol types owned by the frontend, no qualitative labels) and the Observatory regression** |
| `README.md` | UPDATED (Phase 0D slice 1) — five packages, quick start, status table, repository structure, the *Observatory (Phase 0D)* section (stack, run commands, WebSocket default and `VITE_OBSERVER_WS_URL`, what you see, controls, inspector, HUD, connection behaviour, read-only guarantee, frames and performance, tests, limitations), the observatory test table, phase boundaries |
| `docs/Phase 0A Implementation Report.md` | unchanged |
| `docs/V2.1 Amendment - Organism Sensing (0A.3.0).md` | CREATED (V2.1) — the `0A.3.0` sensory contract, model dimensions, founders, mutation, persistence, Observatory scope, non-goals, platform note |
| `docs/V2.2 Amendment - Recurrent Memory (0A.4.0).md` | CREATED (V2.2) — the `0A.4.0` Elman controller, genome vs runtime memory, founders, mutation, canonical state and snapshot format v2, Observatory scope, non-goals |
| `docs/V2.3 Amendment - Physical Bodies (0A.5.0).md` | CREATED (V2.3) — the `0A.5.0` physical-body contract: radius rule, strict overlap definition, exact size weighting, the deterministic resolver and its tie/residual handling, lifecycle timing, newborn handling, feeding on post-collision positions, persistence and observer invariance, performance, non-goals, observed-not-interpreted |
| `docs/V2.4 Amendment - Contestable Food Handling (0A.6.0).md` | CREATED (V2.4) — the `0A.6.0` handling contract: the meaning of `eat`, acquisition under the existing competition, progress/completion, held-food movement and sensing, contest and what is not a contest, the same-tick reacquisition refusal, death and reproduction, the final tick order, canonical state and snapshot format v3, observer invariance, performance, non-goals, observed-not-interpreted |
| `README.md`, `AGENTS.md`, `PROJECT_STATUS.md` | UPDATED (V2.4) — status tables and model tables through `0A.6.0`; the V2.4 README section; lifecycle phases 6–7 / 16b; model-specific configuration sections; AGENTS §3 amendment list, §5 invariants (single-consumption vs handling, solid models, recurrent models), §4 V2.4 rules, §9 hash table, commands and the V2.4 regression list |
| `README.md`, `AGENTS.md`, `PROJECT_STATUS.md` | UPDATED (V2.3) — status tables and model tables through `0A.5.0`; the V2.3 README section; lifecycle phases 4b / 17b; model-specific configuration sections; AGENTS §3 amendment list, §5 invariants (solid vs non-solid, collision is Resolve-only, feeding on post-collision positions), §4 V2.3 rules, §9 hash table, commands and the V2.3 regression list |
| `README.md`, `AGENTS.md`, `PROJECT_STATUS.md` | UPDATED (V2.1) — V2 started; model table and hashes; the V2.1 section; model registry and V2 rules; the clarified snapshot rule; the vision-cone frontend rule; known gaps 13–15 |

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

13. **Golden hashes are platform-dependent (found in V2.1, pre-existing).**
   On an x86_64 container (Node 22.22.2) the frozen `v1.0.0` code itself
   gives `0A.2.0` = `ea689a61d2fd4b38` instead of `b95a0b4ef7dd8449`; with the
   V2.1 code `0A.3.0` gives `472d6bc8c8b9dacd` instead of `e54d0c11249b7849`
   (`0A.1.0` happens to match: that world dies out early). V2.2: `0A.4.0` gives
   `3e20f7588750822d` there instead of `436a377506063609`. Every recorded hash
   is confirmed on linux-arm64 (development VM, Node 22.23.2). All
   same-platform equivalence tests pass on x86_64; only the 22 tests that pin
   an arm64 hash fail there. Likely cause: platform-dependent last-bit results
   of the engine's transcendental functions. Determinism holds per platform;
   cross-platform bit-identity would need project-owned deterministic math,
   which would change every trajectory and therefore needs a new model
   version — a decision for the owner. Run golden regressions on arm64.
14. **`0A.3.0` sensing is O(N²)** — measured in the V2.1 section; ≈ 3×
   `0A.2.0` tick cost at 400 organisms, ≈ 8× at 1,000. Not optimised.
15. **The experiment harness is v1-only.** Its probe set and movement
   policies are six-input (`NEURAL_INPUT_SIZE`); it was not extended to
   `0A.3.0` or `0A.4.0` (Phase 0B is frozen). Evaluating a 10-input or recurrent genome with it throws.
16. **Many `0A.4.0` worlds die out early** (canonical seed at tick 2,474 with
   one birth; seeds 1–7 by tick 5,042). Recorded, not tuned; extinction is a
   valid outcome. The golden regression still fingerprints the whole run and
   pins checkpoints while alive; seed 8 supplies birth coverage in tests.

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

## Phase 0C remaining — assessed at the runner checkpoint (historical)

The runner checkpoint found that Phase 0D (Spec §14.45–§14.50) needs only
two things from the backend. It needs a read-only observer interface, and
optional tick pacing (≈ 10 Hz, §14.47). Both are now done (next section).

PostgreSQL, event records, soak tests and cloud are not required before
Phase 0D. §14.37 keeps world continuity in snapshots.

## Phase 0D bridge — RESULT: DONE (read-only observer stream, tick pacing)

No change to simulation-core, biology, `simulationVersion`, snapshot format
or the store. There is no REST API, no authentication and no mutation
command. There are no new dependencies: the WebSocket server is a
self-contained RFC 6455 subset on `node:http`.

**Code** (`packages/world-runner/src`):

- **`observer/frame.ts`** — `toObserverFrame(world, status)` and
  `OBSERVER_PROTOCOL_VERSION = 1`.
  - Frame fields: `type: 'frame'`, `observerProtocolVersion`,
    `simulationVersion`, `configHash`, `rootSeed`, `tick`, `snapshotTick`,
    `world {width,height}`, `population`, `foodCount`.
  - `organisms[]`: id, parentId, generationDepth, lineageRootId, x, y,
    heading, size, energy, age, maxSpeed, visionRange, visionAngle,
    metabolism.
  - `food[]`: id, x, y.
  - It is pure, keeps the world's ascending-id order, and rounds display
    values (positions and energy 0.01, heading and morphology 0.001).
  - No neural weights, RNG or fertility.
  - Size: ≈ 9.5 KB at tick 1,000 (34 organisms), ≈ 90 KB at 10,000 (407).
- **`observer/server.ts`** — `startObserverServer({ port, host = 127.0.0.1,
  maxFps = 10, maxClientBufferedBytes = 1 MiB, latest })`.
  - Latest frame only: sent on connect, then each round when it changed.
  - A client over its buffer cap is skipped that round, never queued.
  - Client data frames are counted and discarded; ping → pong;
    close → close.
  - Unmasked frames close the connection with 1002, frames over 4 KiB with
    1009.
  - Plain HTTP → 426; a bad upgrade → 400.
  - `stats()` reports clients, frames sent and skipped, the maximum buffered
    bytes, and ignored messages.
- **`observer/runnerObserver.ts`** — `runnerFrameSource(getRunner)` caches
  the frame per (tick, snapshotTick); `observeRunner(runner, opts)`.
- **`runner.ts`** — `run({ ticksPerSecond })`: wall-clock pacing decides only
  when ticks run. A backlog of more than 1 s is dropped rather than burst,
  waits are capped at 50 ms so `stop()` stays prompt, and invalid rates are
  refused.
- **CLI:**
  - `--ticks-per-second <n>` and `--observe <port>` (`0` = any free port).
  - An `observing` event carries the URL.
  - The observer binds before the world is created or opened, so a busy port
    changes nothing (exit 1).
  - The stream closes before exit.

**Proof** (20 new tests; 41 in world-runner):

| Requirement | Test | Result |
|---|---|---|
| frame correctness | `observerFrame.test.ts` | golden world at tick 1,000: every field, population 34, food 60, world 500×500, id order, no weights; frame text hash pinned `3e022ea0723de971` |
| frame purity | `observerFrame.test.ts` | 3 frames per tick for 1,500 ticks: canonical state and RNG unchanged every tick, final hash = direct; deep-frozen world and status accepted |
| observer-connected golden | `goldenObserver.test.ts` | unpaced, observer + client throughout → **`b95a0b4ef7dd8449`**; client ends on the tick-10,000 frame |
| pacing golden | `goldenPaced.test.ts` | 1,500 TPS (≥ 1.9 s to reach 3,000, so pacing engaged) → **`b95a0b4ef7dd8449`** |
| paced + observer golden | `goldenPacedObserver.test.ts` | 1,500 TPS, observer, client sending 20 commands (all discarded) → **`b95a0b4ef7dd8449`** |
| read-only protocol | `observerStream.test.ts` | commands, binary, raw frames and ping mid-run: all discarded (pong answered); hash = direct; unmasked → 1002, oversize → 1009, only that client |
| multiple clients | `observerStream.test.ts` | two clients: valid frames, byte-identical text for shared ticks, hash = direct |
| slow client | `observerStream.test.ts` | a non-reading client with 512 KB frames at 100 fps: frames skipped, maximum buffer ≤ cap + one frame, the reading client keeps receiving; on a running world a stalled client leaves progress and hash unchanged |
| disconnect/reconnect | `observerStream.test.ts` | the reconnect gets the current frame on connect (with 5 s publish rounds, it arrives in < 1 s); hash = direct |
| pacing | `observerStream.test.ts`, `process.test.ts` | 60 ticks at 40 TPS ≥ 1.4 s, hash = unpaced; `stop()` prompt at 0.5 TPS; CLI 800 ticks at 400 TPS ≥ 1.8 s with frames served; busy port refused before any world exists |

A mutation check was done during implementation:

- removing the buffer-cap skip fails the slow-client test;
- removing the send-on-connect fails the on-connect test;
- removing the per-round pacing budget fails the short pacing test.

**Manual check** (verified during implementation, seed 20260910, 50 TPS,
port 18787): a Node WebSocket client received a frame within 6 ms of
connecting, then about 10 frames per second. Plain HTTP returned 426, and
SIGTERM stopped and saved cleanly.

**Local usage:**

```bash
npm run world -- --dir worlds/demo --new --seed <seed> --ticks-per-second 10 --observe 8787   # create
npm run world -- --dir worlds/demo --ticks-per-second 10 --observe 8787                       # recover
# connect: ws://127.0.0.1:8787/
```

No demo seed has been chosen; the command stays generic.

**Phase 0D readiness: READY.** A frontend can connect to
`ws://127.0.0.1:<port>/` and render protocol-v1 frames. It has what it needs
to show organism positions, headings, sizes, energy, generation and lineage,
food, population, and tick. Organism detail beyond the live frame, such as
neural fingerprints, needs a later on-demand message and a protocol bump.

## Phase 0D slice 1 — RESULT: DONE (the first Observatory frontend)

No change to simulation-core, experiment-harness, persistence or
world-runner. No change to biology, `simulationVersion`, the snapshot
format, the store, or observer protocol v1 (no blocker was found; nothing
needed a protocol bump). No database, server, REST API, authentication or
mutation command. The Observatory is read-only.

**Package:** `packages/observatory` (`@alo/observatory`) — React 19 +
TypeScript + Vite 5 + PixiJS 8. Root scripts: `npm run observatory` (dev
server, `http://localhost:5173/`), `npm run build` now ends with the
Observatory (`tsc --noEmit` + `vite build`), root `npm test` includes its
vitest suite. New dependencies (all frontend-only, in this package): `react`,
`react-dom`, `pixi.js`, `@vitejs/plugin-react`, `@types/react*`, `vite`
(already in the lockfile through vitest).

**Code** (`packages/observatory/src`):

- `protocol/observerV1.ts` — the frontend's own protocol-v1 types (they
  mirror `world-runner/src/observer/frame.ts` without importing it) and a
  defensive parser: non-JSON and malformed payloads are rejected without
  throwing, an unsupported `observerProtocolVersion` is reported explicitly
  and never interpreted.
- `connection/observerConnection.ts` — the WebSocket lifecycle
  (`connecting → live → disconnected → reconnecting → live`, plus `error`),
  backoff 0.5 s → 1 s → 2 s → 4 s → 5 s cap, malformed frames ignored and
  counted, unsupported version → error with manual retry. Its socket type
  (`ReadOnlySocket`) has no `send`: the frontend cannot transmit anything.
- `world/frameStore.ts` — the newest frame and the previous one, nothing
  else; a derived HUD summary (tick, population, food, snapshot, lineage
  count, max generation, max energy); a bounded frame-interval estimate.
- `world/interpolation.ts` — bounded lerp, shortest-arc angle lerp,
  progress that saturates at the newest frame.
- `world/lineageColor.ts` — deterministic colour from `lineageRootId`
  (golden-ratio hue, three lightness tiers keyed on id mod 3, lifted blues);
  frontend only, never stored anywhere.
- `world/selection.ts` — selection as a pure view over the newest frame;
  a selected organism that disappears keeps its last data as *no longer
  alive*; inspector groups (Identity / Life / Morphology) with real values
  only.
- `render/WorldRenderer.ts` — PixiJS: floor with a faint 50-unit grid and a
  soft boundary; organisms as procedural cells (lineage-coloured body with a
  darker rim, lighter triangular nose, forward-offset core, outer energy
  ring, additive glow), body radius `2.0 + 2.2 × size` world units; food as
  small luminous points; display-only interpolation on the Pixi ticker;
  birth pulse (≈ 0.7 s) and death fade (≈ 0.45 s); lineage emphasis
  (unrelated lineages at 26 % alpha); animated selection ring and id
  label; camera fit (with HUD insets), wheel zoom around the cursor,
  drag pan, double-click zoom, zoom limits 0.5×–40× of fit; nearest-organism
  click picking; view pause (freezes captured frame references; resume
  jumps to the newest frame).
- `render/camera.ts`, `render/textures.ts` — camera maths; three canvas-
  generated textures (glow, dot, floor). No sprite assets.
- `ui/` — `WorldView` (mounts the renderer), `Hud`, `Inspector`,
  `Controls`, `ConnectionOverlay`; `App.tsx` wires them. React state updates
  once per frame (summary and selection), never per organism.

**Proof** (39 tests, `packages/observatory/tests`, ≈ 1 s, Node
environment):

| Requirement | Test | Result |
|---|---|---|
| protocol parsing | `protocol.test.ts` | valid frame (incl. the README example) accepted; non-JSON / binary / 12 malformed shapes rejected without throwing; version 2 → explicit `unsupported-version` |
| lineage colour | `lineageColor.test.ts` | same id → same colour, pure in call order; ids 1–10 pairwise weighted-RGB distance > 60; luma > 90 for ids 1–200 |
| selection | `selection.test.tsx` | inspector groups and values for a live organism; founder label; disappearance → `alive: false`, last data kept, stable across later frames; render with `react-dom/server` shows *no longer alive · last seen at tick N*; no qualitative labels |
| HUD | `selection.test.tsx` | every connection state renders; tick, population, version, seed, hash, world size |
| connection lifecycle | `connection.test.ts` | connecting → live on first frame; close → disconnected (500 ms) → reconnecting → 1000 ms → 2000 ms; newest frame accepted on reconnect and backoff reset; delay cap; unsupported version → error, socket closed, no retry, manual `retryNow`; malformed frames ignored while live; `stop()` cancels the retry |
| read-only guarantee | `connection.test.ts` | a fake socket records zero `send` calls across frames, garbage, errors, reconnects and stop |
| frame replacement | `frameStore.test.ts` | 500 pushes → at most 2 frames retained; summary; interval estimate; subscriptions; collapse-to-latest |
| interpolation | `interpolation.test.ts` | lerp bounded at t < 0 and t > 1; progress saturates at 1; shortest arc across 0/2π both ways; normalisation; bounded interval estimate |
| camera | `camera.test.ts` | fit centred and aspect-preserving; zoom keeps the cursor's world point fixed; limits; pan clamp; wheel mapping |

**Live integration** (`world-runner --observe 8787` on the golden seed
fast-forwarded to tick 4,000, the production build served statically,
headless Chromium 1440×900 with software GL; 22 / 22 checks):

- stream serves protocol v1 (tick 4001, population 160, food 59); the page
  becomes live; HUD tick advances (4,039 → 4,088) and population shows;
  85–557 frames received; the Pixi canvas has a GL context; world pixels
  change between screenshots (organisms move);
- clicking an organism's projected position opens the inspector for a real
  organism of the frame; its lineage root and generation match the frame;
  *Focus lineage* shows the chip; wheel zoom → 287 %, *Fit* → 100 %;
- *Pause view* shows the view-only pill and the HUD tick keeps advancing
  (4,420 → 4,440): the simulation is untouched;
- SIGTERM on the runner → *reconnecting* with the last world still visible
  and the inspector intact; restarting the runner → live again automatically
  (`live → reconnecting → live`); the runner recovered from its stop-tick
  snapshot; the browser sent **0** WebSocket data frames while receiving
  557;
- no application console errors (Chrome's refused-connect lines during the
  reconnect attempts are expected);
- screenshots were inspected: layout, HUD placement (the world is fitted
  clear of the HUD row), organism readability at fit and at 287 %,
  selection ring, lineage dimming, the reconnect pill, and the narrow
  layout (inspector as a bottom sheet at 700 px).

**Performance** (observational): at population ≈ 220 in the software-GL
headless browser, script time was 2.7 % of one core over 5 s with a
13.5 MB JS heap; the render loop there was rasteriser-bound (≈ 4 fps under
SwiftShader), which does not represent a GPU-backed laptop. The per-frame
JS work is small: bodies are drawn once per organism, the energy ring is
redrawn only on a 1/24 step change, React updates once per frame.

**Design decisions recorded:**

- The energy ring is scaled against `max(100, largest energy in the
  frame)`; protocol v1 carries no `energyCapacity`. Display only.
- Births are detected as an id absent from the previous frame when the
  tick gap is ≤ 8; larger gaps (reconnects, fast worlds) show no birth
  effect, deliberately.
- Lineage count and maximum generation in the HUD are derived from the
  current frame only; they are not history.
- No demo seed was chosen; the documented commands stay generic.

**Local usage:**

```bash
npm run world -- --dir worlds/demo --new --seed <seed> --ticks-per-second 10 --observe 8787   # terminal 1, first time
npm run world -- --dir worlds/demo --ticks-per-second 10 --observe 8787                       # terminal 1, later (recover)
npm run observatory                                                                           # terminal 2 → http://localhost:5173/
# override the stream address: VITE_OBSERVER_WS_URL=ws://127.0.0.1:<port>/ npm run observatory
```

**Not in this slice** (later Observatory slices): lineage history, a
birth/death event feed, mutation visibility, population/generation trends,
family tree, neural fingerprints, organism search, mobile polish. (Lineage
history, the event feed and trends are now slice 2, below.)

## Phase 0D slice 2 — RESULT: DONE (evolution visibility)

No change to simulation-core, experiment-harness, persistence or
world-runner. No change to biology, `simulationVersion`, the snapshot
format, the store, or observer protocol v1 (no bump was needed: everything
is derived from protocol-v1 frames). No database, server, REST API,
authentication, mutation command or new dependency. The Observatory stays
read-only (the read-only test is unchanged and the live check counted 0
WebSocket data frames sent).

**Code** (`packages/observatory/src`):

- `world/lineages.ts` — `summarizeLineages(organisms)`: per
  `lineageRootId` the living count, share of population, max and mean
  `generationDepth`; sorted by count desc, then id asc (deterministic);
  frame-wide max/mean generation; `toggleLineageFocus` (click the focused
  lineage → clear).
- `world/sessionHistory.ts` — `SessionHistory`, the only history in the
  UI. Session-only and fixed-bound: event feed ≤ 80 (`DEFAULT_MAX_EVENTS`),
  trend ≤ 300 samples (`DEFAULT_MAX_TREND_POINTS`) taken every 10 ticks
  (`DEFAULT_TREND_SAMPLE_TICKS`), recently-extinct lineages ≤ 6. Each trend
  sample holds `tick, population, foodCount, maxGeneration, lineageCount`
  and the per-lineage counts of that sample (so per-lineage history exists
  only inside retained samples). Events are differences between two
  *consecutive* received frames: `birth` (id absent from the previous
  frame; tick, id, parent, lineage, generation), `death` (id present before
  and absent now; lineage, generation, last age, last-seen tick),
  `extinction` (a lineage whose count went to 0; last count). Continuity
  means a forward tick step of at most `CONTINUOUS_TICK_GAP = 8` — the
  renderer's birth-pulse rule now imports the same constant. A larger or
  backwards step records one `gap` marker (`fromTick → toTick`, frames),
  coalesced with a preceding gap, and infers nothing. The recently-extinct
  list is updated on every frame regardless (absence is a frame fact).
  World identity `(simulationVersion, configHash, rootSeed)` is checked on
  every frame: a different identity clears everything and counts a reset; a
  reconnect to the same world continues (with a gap marker). It exposes one
  immutable snapshot per push for `useSyncExternalStore`; arrays are copied
  only when they change.
- `ui/SidePanel.tsx` — the right-hand column (340 px; bottom sheet under
  820 px) with two tabs, *Evolution* (default) and *Organism* (opens on
  selection; `Esc`/deselect returns to Evolution). The inspector is
  unchanged inside it.
- `ui/EvolutionPanel.tsx` — max generation (large), mean generation,
  lineage count; `TrendPanel`; `LineagePanel`; `EventFeed`; a footer stating
  that everything is session-only observation (and the reset count).
- `ui/TrendPanel.tsx`, `ui/Sparkline.tsx` — four SVG sparklines
  (population and max generation large; lineages and food small), thin
  line, soft fill, dot on the newest value, no axes, scale floored at zero;
  no charting library.
- `ui/LineagePanel.tsx` — rows: swatch, `#id`, share bar, `N alive`, share
  %, `gen` (max depth alive). Click = frontend focus toggle (the existing
  `emphasisLineage` path into the Pixi renderer; nothing is sent); hover =
  temporary emphasis (cleared on leave and on unmount); the focused row
  shows the lineage's living-count sparkline over the session; the selected
  organism's lineage is marked *selected*; *No longer living · this
  session* lists recently extinct lineages with last-seen tick, last count
  and last max gen.
- `ui/EventFeed.tsx` — newest first, 40 rendered of 80 kept; `●` born
  (`#id ← #parent · lineage #L · gen g · t`), `○` died (`… gen g · age a`),
  `◌` lineage no longer living, `···` observation gap (`ticks A → B · n
  frames · births/deaths not inferred`). Marks use the lineage colour;
  rows fade in over 420 ms; with a lineage focused its events are
  highlighted and others dimmed; a born id is a button that selects the
  organism if it is still in the newest frame.
- `ui/Hud.tsx` — *Generation* (max living) joins tick and population as a
  large stat. `render/camera.ts` — fit insets grown (top 124, bottom 36) so
  the fitted world clears the HUD. `App.tsx` — feeds the same frame to the
  store and the history (`history.push(frame, store.latestOrganisms())`, one
  Map per frame, no second pass); emphasis = hover ?? focus ?? selected
  lineage.

**Bounds and cost:** per frame one O(N) pass for the lineage aggregate,
one O(N) Map diff for events, one sample every 10 ticks. Measured in Node:
store + history ≈ 0.09 ms per frame at ~500 organisms with churn. React
re-renders the panel once per frame (as the HUD already did), never per
organism. No unbounded structure exists: 80 events, 300 samples, 6 extinct
lineages, plus the two frames the store already kept.

**Proof** (20 new tests; 59 in observatory):

| Requirement | Test | Result |
|---|---|---|
| lineage aggregation | `lineages.test.ts` | counts, share, max/mean generation per lineage and frame-wide; sort by count desc then id asc, identical for reversed input; empty frame; focus toggle |
| birth/death derivation | `sessionHistory.test.ts` | consecutive frames → death (with last age / last-seen tick) then birth (with parent, lineage, generation); unchanged frame → nothing |
| extinction | `sessionHistory.test.ts` | last organism of a lineage disappears → `extinction` event and a recently-extinct entry with last-seen tick, count and max gen |
| frame-gap safety | `sessionHistory.test.ts` | a 500-tick jump with 200 organisms replaced → exactly one `gap` marker, zero births/deaths; consecutive gapped frames coalesce; a backwards tick is a gap; step = 8 is continuous, 8 + 1 is not; trend keeps sampling across gaps |
| bounded feed | `sessionHistory.test.ts` | 300 ticks of 2 births + 1 death per tick with cap 50 → never above 50, newest kept |
| population / generation trend | `sessionHistory.test.ts` | sampled every 10 ticks: ticks `[0,10,20,30,40]`, population `[2,2,2,3,3]`, food, max generation `[2,2,6,9,9]`, lineage count; per-lineage series via `lineageTrend` |
| bounded trend | `sessionHistory.test.ts` | cap 40 over 500 one-tick samples → 40 kept (ticks 461–500); a lineage outside the window reads 0; each sample holds only its living lineages |
| world identity change | `sessionHistory.test.ts` | a different seed, then hash, then version each clear events, trend, extinct list and frame count; `resets` = 3; the new world's next frame diffs only against its own |
| reconnect same world | `sessionHistory.test.ts` | frames 1, 2, then 40, 41 (same identity) → `['birth','gap','death']`, trend ticks `[1,2,40,41]`, `resets` 0, earlier event objects retained |
| lineage focus is frontend-only | `lineages.test.ts` + `connection.test.ts` | the toggle is a pure function on UI state; the socket type has no `send` and the read-only lifecycle test still records zero transmissions |
| rendered panel | `evolutionPanel.test.tsx` | lineages most numerous first with `N alive`, share and gen; extinct lineages listed; born (parent), died (age) and extinction rows; no qualitative labels (regex over fit/superior/intelligent/adapted/successful/species/…); focused + selected row classes, `aria-pressed`, focused-lineage sparkline; gap marker and no inferred rows; trend cards, sample count, sparkline path bounds; HUD generation stat |

**Live integration** (27 / 27 checks; `world-runner --observe 8787` on the
golden seed created to tick 2,500 and paced at 10 ticks/s, the production
build served statically, headless Chromium 1440×900 with software GL,
driven by Playwright):

1. lineage panel populates (16 living lineages at tick ≈ 2,600);
2. counts change live (`34/18/17 → 41/21/19 alive` over 12 s);
3. clicking a row focuses it — one `.lineage-focused` row, the *Lineage #12
   focused* chip, the world dims other lineages — its living-count
   sparkline appears; clicking it again clears focus and chip;
4. births appear in the feed (25) — 5. and deaths (13) — with 0 gap markers
   on a continuous stream and no qualitative labels;
6. the population sparkline path grows (22 → 50 samples);
7. HUD *Generation* shows the max living generation (4 → 6 over the runs);
8. clicking a born id selects the organism (inspector *alive*, Organism
   tab); the Evolution tab marks its lineage *selected*; `Esc` returns to
   Evolution;
9. wheel zoom (170 %), *Fit* (100 %) and *Pause view* (HUD tick keeps
   advancing) still work;
10. SIGTERM on the runner → disconnected/reconnecting with the panel intact;
    restart → live, samples continue (60 → 66), footer shows no reset,
    exactly one observation-gap marker; then a *different* world (new seed
    on the same port) → *Cleared 1×*, feed and trend restart (3 samples),
    HUD seed changes;
11. the browser sent 0 WebSocket data frames while receiving 713; no
    application console errors.

Screenshots were inspected and two layout issues fixed before sign-off:
feed rows wrapped at 320 px (now 340 px, 11 px text, parent as `← #id`), and
a stale hover emphasis survived the tab switch (hover now clears on
unmount). The lineage and feed lists are capped in height (318 / 340 px)
with their own scroll so the feed stays reachable when many lineages live.

**Performance note:** in the software-GL headless browser the page falls
behind at population ≈ 370 (rasteriser-bound, as in slice 1); the runner
then skips frames for the slow client and the feed correctly shows gap
markers rather than inventing events. The JS work per frame is small
(above); a GPU-backed laptop is the target.

**Design decisions recorded:**

- History is session-only by design: closing or reloading the tab forgets
  it. Persistent lineage history, an event store or a genealogy tree are
  explicitly not this slice.
- Events are differences between consecutive received frames — an
  organism born and dead between two frames is never seen. This is
  documented in the README as a limitation, not hidden.
- `CONTINUOUS_TICK_GAP = 8` is shared by the feed and the renderer's birth
  pulse so both agree on what "observed" means.
- Language: born / died / no longer living / lineage grew or shrank /
  generation. Never fit, adapted, successful, superior, intelligent,
  species.

**Not in this slice** (later Observatory slices): mutation visibility
(morphology/neural change between parent and child), a genealogy tree,
neural fingerprints (needs an on-demand message and a protocol bump),
organism search, mobile polish, persistent history. (Morphology mutation
visibility is now slice 3, below.)

## Phase 0D slice 3 — RESULT: DONE (inherited morphology / mutation visibility)

No change to simulation-core, experiment-harness, persistence or
world-runner. No change to biology, `simulationVersion`, the snapshot
format, the store, or observer protocol v1 (the five morphology genes are
already in every frame). No database, server, REST API, authentication,
mutation command or new dependency. The Observatory stays read-only (the
read-only test is unchanged; the live check counted 0 WebSocket data frames
sent).

**What may be said, verified against the core:** `biology/mutation.ts`
derives a child genome as an exact parent clone followed by the morphology
and neural mutation channels, at reproduction only; the genome is
immutable for life (§13.4). So a parent → child morphology difference is a
morphology mutation at that birth, and the UI labels it so. Protocol v1
rounds morphology to 0.001 (`observer/frame.ts` `r3`), a pure function of
the stored value, so identical stored genes always show identical — an
observed difference is real — while a sub-0.001 mutation can show as no
difference ("at protocol precision"). Comparison rule: two protocol values
differ iff not identical; no epsilon; deltas shown with 3 decimals and a
0.001 step is never rounded away.

**Code** (`packages/observatory/src`):

- `world/morphologyCache.ts` — `MorphologyCache`: id → {id, parentId,
  lineageRootId, generationDepth, five genes, lastSeenTick}; bounded at
  `DEFAULT_MAX_MORPHOLOGY_ENTRIES = 4000`; `observe(organisms, tick)` is
  O(N) per frame and re-touches known ids (Map re-insertion), so eviction
  is least-recently-seen: living organisms stay, the longest-dead leave
  first. Owned by `SessionHistory`, so it is cleared on a world-identity
  change and kept across a same-world reconnect (`history.morphology()`).
- `world/inheritance.ts` — `compareMorphology(parent, child)` → five
  `GeneDelta` (parent, child, exact delta, relative delta, changed) and a
  changed count; `inheritanceView(organism, cache, parentAlive)` →
  `founder | unavailable | alive | observed(lastSeenTick)` plus the
  comparison when the parent's morphology is known; `inheritanceSummary`
  (*N / 5 morphology genes differ from parent* / *No morphology difference
  from parent at protocol precision* / *Founder — no parent comparison* /
  *Parent comparison unavailable*); `morphologyChangesFromCache` for
  births (null when the parent was never observed — never guessed).
- `world/sessionHistory.ts` — births are derived before the frame's
  organisms enter the cache (a parent is always older than its child, so it
  is cached whenever it was observed at all); `BirthEvent.morphologyChanges:
  number | null`; session counters `birthsComparable` / `birthsChanged` in
  the snapshot.
- `ui/Inheritance.tsx` — the inspector's *Inherited morphology* section:
  summary (bold when ≥ 1 gene differs); parent line — **Parent #id** button
  when alive (selects it), *observed · last seen at tick N* when dead but
  cached, *morphology not observed in this session* when unavailable,
  *Founder · generation 0 · lineage #r* for founders — then `→ #child gen
  g`; a five-row table Gene / Parent / Current / Δ / bar. Changed rows: bold
  current value, ▲/▼ mark, signed delta (cool tint up, warm-neutral tint
  down — neither means good or bad), a tiny centred bar in the lineage
  colour scaled by the relative change (clipped ±25 %). Unchanged rows
  subdued. Founders and unavailable parents show current values only. A
  footer states the precision and that neural genome differences are not
  shown.
- `world/selection.ts` — the Morphology group is gone from
  `inspectorGroups` (Identity, Life remain); the Parent field carries
  `organismId` and the inspector renders it as a link when that organism is
  alive. `ui/Inspector.tsx` takes `inheritance`, `isAlive`,
  `onSelectOrganism`; `App.tsx` builds the view once per frame from the
  session cache.
- `ui/EventFeed.tsx` — born rows carry a **Δn** badge (highlighted for
  n ≥ 1, plain *Δ0* for a comparable unchanged birth, absent when the
  parent was not observed). `ui/EvolutionPanel.tsx` — *Morphology changes
  · changed / comparable observed births* (session counters; not called a
  rate).
- Not implemented (allowed to skip): a world-side birth cue for mutated
  newborns; the renderer is unchanged in this slice.

**Bounds and cost:** parent lookup is O(1) by id; per frame one O(N)
cache touch in addition to slice 2's passes; per birth one five-gene
comparison; the inspector view is one comparison per frame for the
selected organism. Memory: ≤ 4,000 records of six numbers each.

**Proof** (10 new tests; 69 in observatory):

| Requirement | Test | Result |
|---|---|---|
| parent → child comparison | `inheritance.test.tsx` | known parent/child → five deltas in gene order: +0.032 size, −8.5 vision range, +0.001 metabolism (a protocol step, never rounded away), 0 for max speed and vision angle; changed count 3; relative delta; `formatDelta` `+0.032` / `−8.500` / `0` |
| unchanged genes | `inheritance.test.tsx` | identical child → 0 differences, every delta 0 and unchanged |
| founder | `inheritance.test.tsx` | `founder`, no comparison, *Founder — no parent comparison* |
| missing parent | `inheritance.test.tsx` | child cached, parent never seen → `unavailable`, no comparison, births report null |
| dead cached parent | `inheritance.test.tsx` | parent seen at tick 100, absent at 101 → `observed · last seen 100` with the full comparison; alive lookup → `alive` |
| cache bound | `inheritance.test.tsx` | cap 100 over 1,000 frames with 40 long-lived + 3 births per frame → never above 100, the 40 re-seen ids retained, long-dead evicted, newest kept |
| world identity reset / reconnect | `inheritance.test.tsx` | through `SessionHistory`: a parent dead across a missed-frame gap is still compared (same world); a different `rootSeed` clears the cache and the same parent id is `unavailable` |
| birth feed integration | `inheritance.test.tsx` | births `[20 → 3, 21 → 0, 30 → null]`; counters 2 comparable / 1 changed; feed renders `Δ3` (highlighted), `Δ0`, no badge for the unknown parent; Evolution stat `1 / 2` |
| inspector section | `inheritance.test.tsx` | summary, `data-changed` per gene, `+0.032` / `−8.500` / `+0.001`, up/down/same classes, parent button and Identity link when alive; dead parent → *observed · last seen*, no button; unavailable → *Parent comparison unavailable*; founder → own values, no comparison; no fit/beneficial/harmful/adapted/superior wording |
| read-only guarantee | `connection.test.ts` (unchanged) | the socket type has no `send`; zero transmissions across the lifecycle |
| selection groups | `selection.test.tsx` (updated) | groups are Identity + Life; morphology values render in the inheritance section at 3 decimals; Parent field carries `organismId` |

**Live integration** (34 / 34 checks; runner `--observe 8787` on the
golden seed created to tick 2,700, paced at 10 ticks/s, production build,
headless Chromium 1440×900 via Playwright; a second world, seed 424242
created to tick 700, for the world-change phase):

1. selecting a born organism from the feed opens the inspector with the
   comparison (*1 / 5 morphology genes differ from parent*, Parent #74
   alive · gen 2 → #139 gen 3);
2. changed genes obvious (bold current value, ▲ +0.149, bar), 4 unchanged
   rows subdued;
3. parent navigation: clicking **Parent #74** selects it; the chain ended
   at *Parent #15 observed · last seen at tick 2,999 · gen 0* — a founder
   that reached `maxAge` 3,000 during the run — so a dead parent was
   compared from the cache (item 6);
4. births in the feed carry Δ badges (19 comparable, 11 with ≥ 1 change);
   Evolution shows *Morphology changes 18 / 41*;
5. after the runner restart (same world) the panel and history continue;
   after switching to the other world the cache holds only that world: the
   first birth's parent is *alive* there, and clicking it shows *Founder —
   no parent comparison* with five current values and no comparison rows
   (items 7–9);
6. slice 1–2 features intact (lineage focus, sparklines, zoom/fit/pause,
   gap marker on reconnect, identity reset); 0 WebSocket frames sent of
   1,009 received; no console errors.

Screenshots were inspected; one layout fix before sign-off: gene labels
wrapped at 340 px, so the table now uses 11.5 px, a 40 px bar and the
`rad` unit under the label.

**Not in this slice** (later Observatory slices): a genealogy view, neural
fingerprints / neural mutation visibility (needs an on-demand message and a
protocol bump), organism search, a world-side mutated-birth cue, mobile
polish, persistent history. (The compact ancestry view is now slice 4.)

## Phase 0D slice 4 — RESULT: DONE (compact ancestry strip)

No change to simulation-core, experiment-harness, persistence or
world-runner. No change to biology, `simulationVersion`, the snapshot
format, the store, or observer protocol v1. No new storage (the strip is a
view over the slice 3 cache), no database, server, REST API,
authentication, mutation command or dependency. Read-only (0 WebSocket
data frames sent in the live check).

**Code** (`packages/observatory/src`):

- `world/ancestry.ts` — `ancestryChain(organism, cache, parentAlive,
  maxDepth = DEFAULT_MAX_ANCESTRY_DEPTH (10))`: walks `parentId` links
  through the session `MorphologyCache` only; returns `nodes` (oldest shown
  ancestor first, the selected organism last; each with id, parent,
  generation, lineage, state `selected | alive | observed`, last-seen tick
  for dead ancestors, and `changesFromParent` from slice 3's
  `compareMorphology` — null where the parent is not held), a `boundary`
  (`founder` / `unobserved {parentId}` / `truncated {parentId}`) and
  `observedHops`. Terminates at a founder (`parentId === null`), at the
  first parent the cache does not hold (dead before the session, or
  evicted), or after `maxDepth` ancestors keeping the closest ones. No id
  or morphology is ever inferred. Cost: ≤ 11 O(1) lookups and ≤ 10
  five-gene comparisons per frame for the selected organism.
- `ui/Ancestry.tsx` — the *Ancestry* section after *Inherited
  morphology*: a context line (*Lineage #r · generation g · observed
  ancestry: n hops · complete to founder* — the last part only when true),
  then a vertical strip. Boundary rows at the top: *Earlier ancestor #id not
  observed this session* or *Earlier ancestry not shown (n closest hops
  kept)*. Nodes: lineage-coloured dot (square for founders; dim for the
  dead; outlined for the selected), `Founder #id` / `#id` (a link when
  alive → selects it), `gen n`, and a tag: *alive* (green), *observed ·
  last seen t N* (dim), *selected* (accent, row highlighted). Each hop is a
  short connector with a **Δn** badge (accent when n ≥ 1; dashed **Δ?**
  when that parent's morphology is unknown). Dead ancestors are never
  clickable and never shown as alive; their cached morphology is not
  opened (no historical inspector in v1). Subtle 360 ms fade-in on
  mount; no graph library, no canvas.
- `ui/Inspector.tsx` / `App.tsx` — take and build the chain once per
  frame next to the inheritance view, from the same cache and `isAlive`.

**Proof** (8 new tests; 77 in observatory):

| Requirement | Test | Result |
|---|---|---|
| complete chain | `ancestry.test.tsx` | founder → #2 → #3 → #4: nodes in order with generations, states `observed/observed/alive/selected`, hop Δ `null/1/0/3` equal to `compareMorphology`, founder `parentId` null, last-seen tick of a dead ancestor |
| missing ancestor | `ancestry.test.tsx` | #2 and the founder never cached → boundary `unobserved #2`, nodes `[3, 4]`, no Δ for #3, nothing invented |
| founder | `ancestry.test.tsx` | one node, boundary `founder`, 0 hops |
| depth bound | `ancestry.test.tsx` | a 30-deep chain → 11 nodes, boundary `truncated`, the 10 closest kept; `maxDepth 3` → `[27, 28, 29, 30]` |
| cache eviction | `ancestry.test.tsx` | bound 3 evicts the founder → boundary `unobserved #1`, chain `[2, 3, 4]`, no crash |
| reconnect / world change | `ancestry.test.tsx` | through `SessionHistory`: a missed-frame gap keeps the chain complete to the founder (dead ancestors `observed`, living `alive`); a different `rootSeed` clears it → boundary `unobserved`, one node |
| rendered strip | `ancestry.test.tsx` | `Founder #1`, *complete to founder*, *3 hops*, three Δ badges (`Δ1`, `Δ0`, `Δ3`), alive link, observed node with last-seen tick, selected node, no boundary row; unobserved boundary text and dashed `Δ?`; truncated boundary text; no qualitative labels |
| alive ancestor click / read-only | `ancestry.test.tsx` (link rendered), live check (click selects), `connection.test.ts` (no `send`) | |

**Live integration** (42 / 42 checks; runner `--observe 8787` on the
golden seed created to tick 2,500 at 10 ticks/s; a second world, seed
424242 created to tick 3,200, whose founders died before the session):

1. selecting the deepest-generation birth in the feed (#105, gen 4) shows
   a 5-node chain, *observed ancestry: 4 hops · complete to founder*,
   founder at the top, selected node last and highlighted;
2. hop badges `Δ0 Δ0 Δ1 Δ0`; the last badge equals the inspector's
   comparison count;
3. alive ancestors are links — clicking one selects it (inspector →
   *Organism #53*);
4. after the founders reach `maxAge` 3,000, a chain climbed from a birth
   ends at *Parent #15 observed · last seen at tick 2,999* and the strip
   shows that founder as an observed-dead node (dim, no link);
5. in the second world the chain of a gen-2 organism stops at *Earlier
   ancestor #11 not observed this session* — the founder died before the
   tab opened, nothing was invented;
6. slice 1–3 features intact (lineage focus, sparklines, feed Δ badges,
   inheritance table, zoom/fit/pause, reconnect gap marker, identity
   reset); 0 WebSocket frames sent; no console errors.

Screenshots inspected: the strip fits the 340 px panel, reads top-down,
and the world stays the hero. No layout fix was needed.

**Performance:** per frame for the selected organism only: ≤ 11 cache
lookups and ≤ 10 comparisons; nothing per organism, no new allocation
outside the selected view. Memory unchanged (the cache bound is 4,000).

**Not in v1** (deliberately): descendants, siblings, whole-lineage trees,
a historical inspector for dead ancestors, persistent genealogy, neural
fingerprints, mobile polish, database/cloud, deeper analytics.

## Phase 0D final — RESULT: DONE (v1 polish, demo experience, freeze)

No change to simulation-core, experiment-harness, persistence or
world-runner; no change to biology, `simulationVersion`, the snapshot
format, the store or observer protocol v1; no dependency added. Only
`packages/observatory`, two root `package.json` scripts and the docs.

**Added (small, all display-only):**

- **Organism quick-jump** (`ui/QuickJump.tsx`, top-right `#` box): `Enter`
  parses `208` / `#208`; if the id is in the newest frame it is selected,
  the Organism tab opens and the camera pans to it without changing zoom
  (`WorldRenderer.centerOnOrganism`, clamped); otherwise a small
  *#id is not currently alive* note for 2.4 s. Current frame only — no
  history, no query, no message. `Esc` in the box clears it and does not
  reach the global shortcuts (which already ignore inputs).
- **First-run card** (`ui/ConnectionOverlay.tsx`): before any frame,
  *Artificial Life Observatory — Waiting for a local world…* (or *Looking
  for…* while connecting) with the observer address, the exact
  `npm run demo:new` + `npm run observatory` commands, and `npm run
  demo:resume` for an existing `worlds/demo`. Styled as a welcome, not an
  error. After frames were seen a disconnect stays the small pill.
- **Demo scripts** (root `package.json`): `demo:new` =
  `world --dir worlds/demo --new --seed 31415926 --ticks-per-second 10
  --observe 8787`; `demo:resume` = the same without `--new --seed`. The
  runner's existing refusal (`WORLD_EXISTS`) makes `demo:new` safe over an
  existing world. Verified on the dev VM (create → stop → resume → refuse).
- **Help hint** (`ui/HelpHint.tsx`, `?` top-right): the existing controls
  in one popover; the hint bar now also names Space and `?`.
- **Opening-burst conveniences** (scripts only, after the v1 checkpoint):
  `demo:new:settled` creates `worlds/demo` and fast-forwards it to tick
  5,000 unpaced (`--until-tick 5000`, ≈ 5 s, population ≈ 344) before
  streaming at 10 ticks/s; `demo:resume:slow` resumes at 3 ticks/s. No
  biology or runner change: the 25-founder start and the early fill to the
  food-limited level are the frozen `0A.2.0` model, documented in the
  README Quick start. Verified on the dev VM.
- **Polish:** the inheritance parent line uses *last seen t N* so it no
  longer wraps; the welcome card's commands are on their own lines.

**Language pass:** all visible strings reviewed — born, died, no longer
living, generation, lineage, parent, morphology mutation, observed
ancestry, population. No fit / superior / successful / intelligent /
adapted / strongest anywhere (the rendered-panel tests assert it).

**Proof:** `polish.test.tsx` (4 tests; 81 in observatory): id parsing;
current-frame-only resolution (a dead id is *not-alive*); the first-run
card shows the three commands when disconnected, *Looking for* while
connecting, nothing when live, and the pill after frames; the help hint is
closed by default. The read-only test is unchanged.

**v1 acceptance pass (52 / 52; production build served statically, headless
Chromium 1440×900 via Playwright):**

1. *First run:* page opened with no runner → the welcome card with
   `demo:new` / `demo:resume` / `observatory`.
2. *Demo world:* the runner started exactly as `demo:new` does (fresh
   `worlds/demo`, seed 31415926) → live automatically, HUD seed 31415926,
   world pixels change between screenshots (organisms move), food and
   population shown; quick-jump `7` → *Organism #7* with zoom unchanged;
   `999999` → *not currently alive* note; `?` opens the controls; stop →
   *Disconnected*; restart as `demo:resume` → live, same seed, tick
   continues (170 → 202).
3. *Slices 1–4* on the golden world at tick 2,500 (identity change →
   *Cleared 1×*): tick advances, lineage panel, live counts, focus and
   sparkline, births/deaths with no gap on a continuous stream, no
   qualitative labels, inheritance comparison and change marks, 5-node
   ancestry chain to a founder with Δ badges matching the inspector, alive
   ancestor click, Evolution *Morphology changes*, feed Δ badges, a founder
   dead at `maxAge` shown as an observed parent and ancestor, zoom / fit /
   pause-view, runner stop and same-world reconnect (samples continue, one
   gap marker), a third world (seed 424242, tick 3,200) → *Cleared 2×* and an
   unobserved-ancestor boundary.
4. 0 WebSocket data frames sent (1,311 received); no application console
   errors; screenshots inspected (welcome card, quick-jump, help popover).

## V2.1 — RESULT: DONE (other organisms enter the sensory world, model `0A.3.0`)

Contract: `docs/V2.1 Amendment - Organism Sensing (0A.3.0).md`. Perception
only — no new action, output, interaction, memory, learning or gene.

**Model versioning (how v1 is protected).**

- `simulation-core/src/model/simulationModel.ts` is the registry: `0A.1.0` →
  6 inputs, `0A.2.0` → 6, `0A.3.0` → 10 (+ organism sensing). Bootstrap,
  founders, Sense, network evaluation and snapshot validation ask it by
  `simulationVersion`; `validateConfig` refuses unknown versions.
- Every dimension-dependent function takes the model's `inputSize`,
  defaulting to the historical 6 (`NEURAL_INPUT_SIZE` keeps its value and
  meaning), so every v1 call site — including the frozen experiment harness
  — is untouched. `evaluateNetwork` now also checks the genome's input→hidden
  length against `inputSize`, so a genome is never evaluated under another
  model's layout; `stepWorld` refuses a world whose version differs from its
  config's.
- `DEFAULT_SIMULATION_CONFIG` stays `0A.2.0`. `0A.3.0` =
  `organismSensingModelConfig()` / `modelConfig()`; `npm run simulate` and
  `npm run world -- --new` accept `--model` (refused on recovery).
- Proof: both v1 hashes unchanged; snapshots written by tag `v1.0.0`
  (committed fixtures) re-serialise byte-for-byte and continue exactly as
  the v1 code continued them; the user's real v1 world `worlds/demo`
  (tick 21,763, seed 31415926) was recovered from a copy by the V2.1 code and
  by the `v1.0.0` code and both reached `5dda6722346203cb` at tick 22,763
  (48 weights per genome; the original folder was verified unchanged).

**Sensing (`perception/sense.ts`).** Candidates = alive members of S_t
(`state.organisms`) other than self; visible = centre within `visionRange`
(inclusive) and `|bearing| <= visionAngle/2` (inclusive; not applied at zero
distance); nearest wins, exact ties → lower id. Inputs 6–9:
`organismVisible`, `organismDistance` = d / visionRange clamped [0,1],
`organismAngle` = food bearing convention (0 at d = 0),
`organismRelativeSize` = (target.size − self.size) / (geneBounds.size.max −
min) clamped [−1,1]; none visible → exactly `[0,0,0,0]`. Pure, RNG-free,
order-independent, O(N²).

**Founders and mutation.** Founders of `0A.3.0` are drawn natively as
10-input genomes (124 parameters) by the unchanged procedure; probe fixtures
append `[0,0,0,0]`; the screen's result is provably independent of the
organism-input weights (tested). Mutation config and semantics unchanged.

**Persistence.** Format v1 kept (no shape change; the validator derives 6 or
10 from the snapshot's own version; nothing is converted). `0A.3.0` exact
resume proved in process (2,500 → 10,000 every 500 ticks; 5,000 → 10,000 =
golden) and across processes. The AGENTS "one definition of state" rule is
clarified accordingly.

**Observatory.** `world/visionCone.ts` + `WorldRenderer.drawVisionCone`: the
selected organism's cone from frame position, heading, `visionRange`,
`visionAngle`; drawn beneath food and organisms; nothing for no selection or
a dead selection. One help-row text change. Observer protocol v1, frame
shape unchanged (tested for `0A.3.0`).

**Tests changed, not weakened.** `persistence/tests/snapshot.test.ts` pinned
`SUPPORTED_SIMULATION_VERSIONS` to `['0A.2.0', '0A.1.0']`; it now pins
`['0A.3.0', '0A.2.0', '0A.1.0']`. `persistence/tests/fixtures/process.mjs`
takes an optional model argument (default unchanged). No other existing test
was edited.

**Live verification.**

1. *Development VM (arm64), real CLI:* `--new --seed 20260910 --model 0A.3.0
   --until-tick 2000` → resume with `--observe 8799 --ticks-per-second 200`
   and a WebSocket client (41 frames, protocol 1, `0A.3.0`) → SIGINT at
   2,803 (saved 2,803) → resume `--until-tick 10000` → recovered 2,803,
   final hash `e54d0c11249b7849` = the golden hash.
2. *Browser (x86_64 cloud container, production build via `vite preview`,
   headless Chromium 1440×900, Playwright), 19 / 19 checks:* a `0A.3.0` world
   created to 3,000 and resumed at 10 ticks/s with `--observe 8787`; the page
   goes live, HUD shows `0A.3.0`; organisms move; frames are protocol 1 with no
   sensing data; clicking an organism selects it and draws its cone, which
   follows it across screenshots; after a graceful stop the page keeps the
   last frame (= saved tick); a pixel diff with lineage emphasis held
   constant shows the selection adds exactly the cone (≈ 99–100% of interior
   pixels changed, **0** changed pixels outside cone, ring and label — no
   other organism marked); `Esc` restores the canvas pixel-for-pixel;
   quick-jump moves the cone to another organism; restarting the runner
   resumes the exact stopped tick and the page reconnects and continues;
   **0** WebSocket frames sent by the page; no application console errors
   (only the expected connection-refused retries while stopped).

**Performance (measured, not optimised).** Development VM, ms per tick at a
fixed population (bootstrap with N organisms, 200 ticks): N=25 0.139 vs 0.134;
N=400 3.76 vs 11.82; N=1,000 6.10 vs 47.1 (`0A.2.0` vs `0A.3.0`). The
canonical `0A.3.0` world ran at 2,459–13,081 ticks/s unpaced (population
12–80). A 10 ticks/s Observatory world is far from the limit; an unpaced
fast-forward of a population near 400 would be ~3× slower than `0A.2.0`.
No spatial index was added (AGENTS: only with a measured need and a recorded
decision).

**Observed, not interpreted.** At seed 20260910 the `0A.3.0` world holds 80
organisms at tick 10,000 (355 births); the v1 DEMO seed 31415926 gives a
population of 1–15 through 20,000 ticks under `0A.3.0`. These are single
trajectories of a new model, not evidence about organism sensing. No DEMO
seed was chosen for `0A.3.0` and no seed shopping or tuning was done.

## V2.2 — RESULT: DONE (recurrent memory, model `0A.4.0`)

Contract: `docs/V2.2 Amendment - Recurrent Memory (0A.4.0).md`. Memory only —
no learning, no new inputs, outputs, actions, genes or interactions.

**Controller.** `evaluateRecurrentNetwork` (`simulation-core/src/neural/network.ts`):
h_t = tanh(W_in x_t + W_rec h_(t−1) + b_hidden), sums formed bias → inputs →
previous hidden units; the unchanged hidden → output layer and activations.
The feed-forward `evaluateNetwork` is arithmetically unchanged (refactored
only to share the output layer) and refuses recurrent genomes; each
evaluator refuses the other's genomes, `decideAction` refuses organisms with
memory, `decideRecurrentAction` requires it.

**Model protection.** Registry flag `recurrent` (only `0A.4.0`). Feed-forward
genomes/organisms have no recurrent key at all; canonical records of
`0A.1.0`–`0A.3.0` are byte-identical to before (all three hashes unchanged),
and canonicalization refuses a world whose organisms do not match its model.
Every founder/mutation function takes `recurrent` (default false), so every
historical draw and mutation schedule is untouched (tested: 92 / 124 uniforms
per mutation, no recurrent block).

**Genome.** `recurrentHiddenWeights` (64 = 8²) appended as the fifth block:
founder draw (existing `initSigma`, bounds), bootstrap perturbation,
mutation (existing rate/sigma/bounds/flag) and storage all visit it last.
188 parameters per `0A.4.0` controller.

**Memory lifecycle.** `hiddenState`: zeros for founders (`bootstrapWorld`) and
newborns (`createOffspring`; never the parent's); in `stepWorld` every living
organism decides from its S_t copy, the new states are buffered and written
after all have decided — once per acting tick; newborns are not in `living`,
so they stay zero through their birth tick; memory ends with death.

**Founders.** Probes each from a fresh zero memory; tested that the screen's
result is identical for any recurrent weights (zeros, ±2, arbitrary) and
equal to the `0A.3.0` screen of the feed-forward part; a founder with all-zero
recurrent weights is valid.

**Persistence.** Snapshot format v2 (`persistence/src/snapshot.ts`):
`snapshotFormatVersionFor(model)` = 2 for `0A.4.0`, 1 otherwise; the format is
checked against the model before the checksum; v2 requires `hiddenState`
(length `hiddenLayerSize`, finite) and `recurrentHiddenWeights`
(hiddenSize²), v1 forbids both. Fixtures: `tests/fixtures/v2.1/` — a `0A.3.0`
snapshot written by the accepted V2.1 commit `ceecbc8` (continuation hashes to
tick 1,500 recorded by that code) — plus the existing `v1.0.0` fixtures; all
load byte-exactly and continue exactly. A copy of the user's current v1 world
`worlds/demo` (tick 1,125) resumed by the V2.2 code and by the `v1.0.0` code
reached the same hash (`eeda96b73d45a314` at 2,125); the folder was verified
unchanged. `0A.4.0` exact resume: seed 8, saved at 500 / 1,000 / 1,500 /
2,000, each resumed from file to 2,500 hash-equal every 250 ticks; golden
seed saved at 1,000 → `436a377506063609`; separate process.

**Tests changed, not weakened.** V2.1 tests that pinned the registry now also
pin `recurrent: false` for the old models and the four-model list; the
"unknown version" examples moved from `0A.4.0` (now real) to `0A.9.0`;
`persistence/tests/snapshot.test.ts` pins the four supported versions.

**Live verification.**

1. *Development VM (arm64), real CLI:* `--new --seed 8 --model 0A.4.0
   --until-tick 3000` → resume with `--observe 8799 --ticks-per-second 100`
   and a WebSocket client (61 frames, protocol 1, `0A.4.0`, 104 births and
   35 deaths seen between frames, no memory/weights in frames) → SIGINT at
   3,602 (saved 3,602) → resume `--until-tick 10000` → recovered 3,602,
   final hash `d61e69c30f279993` = the uninterrupted direct run; format v2;
   all 230 organisms carry 8-value memory and 64 recurrent weights, all
   memories non-zero, max generation 12, no founders left.
2. *Browser (x86_64 cloud container, production build, headless Chromium,
   Playwright), 19 / 19:* a seed-8 `0A.4.0` world resumed at 10 ticks/s with
   `--observe`; live, HUD `0A.4.0`, organisms move, frames protocol 1 with no
   memory/weights/intents; selection via quick-jump; after a graceful stop
   the page shows exactly the last delivered frame (the runner saves one tick
   after its last broadcast — pre-existing, frames are a view); the vision
   cone adds exactly the cone (≈ 99.7% of interior pixels changed, 0 outside);
   `Esc` restores the canvas; selection change moves it; stop → resume
   recovers the exact tick and the page reconnects; 0 WebSocket frames sent;
   no application console errors.

**Performance.** Recurrence is negligible next to O(N²) sensing: fixed
population, ms/tick `0A.3.0` vs `0A.4.0` — 25: 0.160 vs 0.171; 230: 4.65 vs
5.14; 400: 11.5 vs 11.5. The seed-8 world ran at ≈ 330–370 ticks/s unpaced
at population ≈ 230.

**Observed, not interpreted.** Canonical seed: one birth, extinct at tick
2,474. Seeds 1–7 die out by tick 5,042; seed 8 lives (≈ 230 at 10,000).
Single trajectories of a new model — not evidence about memory. No seed is
chosen as a DEMO seed; no tuning.

## V2.3 — RESULT: DONE (physical bodies, model `0A.5.0`)

Contract: `docs/V2.3 Amendment - Physical Bodies (0A.5.0).md`. Physical
displacement only — no attack, damage, predation, energy transfer, event, new
input, output, action, gene or persistent physics state.

**Model.** Registry flag `physicalBodies` (only `0A.5.0`);
`simulationModel()` now reports `{ neuralInputSize, organismSensing, recurrent,
physicalBodies }`. `0A.5.0` is `0A.4.0`'s controller unchanged: ten V2.1
inputs, Elman recurrence, four outputs, 188 parameters, unchanged mutation
settings (all asserted in test).

**Body contract.** `simulation-core/src/biology/physicalBody.ts`:
`physicalRadiusFromSize(size, config) = body.radiusBase + body.radiusPerSize *
size` = `2.0 + 2.2 * size`, i.e. `[3.1, 5.3]` world units over the §10.4 size
range — the mapping the Observatory has drawn since Phase 0D slice 1, moved
into the simulation as the authoritative contract. Depends on the inherited
size gene and two configured constants only. The renderer keeps its own copy of
the constants (the frontend never imports simulation types) and
`observatory/tests/bodyRadius.test.ts` pins the two together; the drawn radius
is numerically unchanged.

**Model-specific configuration.** `body` (`radiusBase`, `radiusPerSize`,
`separationPasses`) is present only on `0A.5.0`; `validateConfig` refuses it on
any other model and refuses its absence on `0A.5.0`. This is deliberate: every
historical model's configuration — and `configHash` — is byte-identical to what
it was, so old snapshots, the `v1.0.0` / V2.1 fixtures and existing world
folders are untouched.

**Overlap and separation.** Strict overlap `centreDistance < rA + rB` (exact
tangency is contact, never resolved), tested on squared distances.
Penetration `p = rA + rB − d` is split `shareA = sizeB/(sizeA+sizeB)`,
`shareB = sizeA/(sizeA+sizeB)`, so equal bodies share exactly half each and the
larger body always moves less — continuous, monotone, no threshold, no strength
score, no immovable body.

**Resolver.** A small deterministic Jacobi solver: living organisms in
ascending id order, every pair measured against the start-of-pass positions,
corrections accumulated then applied at once, clamped by the existing hard-wall
rule, `body.separationPasses` (4) fixed passes with early exit when a pass finds
no overlap. RNG-free (spied: no `Math.random`, no `RngStream.nextFloat`, no
`nextInRange`), order-independent (three permutations give bit-identical
results), no iteration-order priority. Exactly coincident centres separate along
one of four axis-aligned unit vectors chosen by `(loId + hiId) mod 4`, pointing
lo → hi — identity, no trigonometry, no RNG. No physics engine, no spatial
index.

**Residual overlap, documented not hidden.** A configuration the budget can
resolve settles at the floating-point floor (~4e-15 world units against radii of
~4.2; exact tangency is not representable, so the strict `<` test can still be
true). A configuration it cannot — twelve bodies of radius 3.1–5.3 on a 2.5-unit
grid — keeps a bounded residual (< 0.25 world units), strictly better than where
it started and identical on every run. In a real seed-8 world at ~240 organisms
the worst residual interpenetration is < 1e-3 world units and no pair is ever
deeply interpenetrating.

**Lifecycle.** Two position-only steps in Resolve, nothing else reordered:
phase **4b** after movement + energy and BEFORE feeding, phase **17b** after
births become active. Sense → Decide → Resolve is intact: sensing reads S_t
(which the tick never modifies — a deep-frozen S_t still steps), memory advances
exactly once per acting tick and is not recalculated after collision, and no
organism gets a second decision. Feeding therefore uses post-collision
positions, and a displacement can move an eater into or out of range (both
directions tested, with a no-neighbour control).

**Newborns.** Offspring placement unchanged (same polar offset, same two
canonical draws). Phase 17b applies the same passive rule to the post-birth
population: no extra action, memory still exactly zero, and the canonical draw
schedule plus the child's genome are bit-identical to `0A.4.0`'s from the same
state (tested by spy counts and genome equality).

**Persistence.** Snapshot format stays **v2** — physical bodies add no
future-affecting state beyond position, which was always stored — so there is no
format v3 and no collision metadata anywhere: the stored organism record is
exactly the v2 record and the serialized state contains no radius, overlap,
contact, collision, displacement, damage or health field. A `0A.4.0` world
cannot be relabelled `0A.5.0` (its config would have to gain `body`, which
`validateConfig` refuses) and the reverse is refused. Exact resume tested at
four resume points, across processes, and live through SIGINT.

**Observer.** Protocol v1 unchanged, frame shape unchanged, nothing about
bodies, contact or displacement in frames. No Observatory feature added.

**Tests changed, not weakened.** Four pinned model lists extended; two registry
equality assertions gained `physicalBodies: false` for the historical models.
Nothing removed.

**Live verification.**

1. *Development VM (arm64), real CLI:* `--new --seed 8 --model 0A.5.0
   --until-tick 3000` → resume with `--observe 8791 --ticks-per-second 100` and
   a WebSocket client (197 frames, protocol 1, `0A.5.0`, population 142 → 240,
   466 distinct organisms, every organism moved and turned between frames, 0
   messages sent by the client, frame keys exactly the v1 set, no
   memory/collision field present) → SIGINT at tick 5,305 (saved 5,305) →
   resume `--until-tick 6000` → recovered 5,305, final hash `175d36b506c1f3f4`
   = the uninterrupted direct run.
2. *Ghosting, measured on canonical state (seed 8, same ticks, both models):*
   at tick 6,000 `0A.4.0` has 88 overlapping living pairs, a worst
   interpenetration of **8.04** world units (bodies essentially co-located) and
   26 deeply interpenetrating pairs, closest centres 0.43 apart; `0A.5.0` has 17
   overlapping pairs, worst interpenetration **0.0006** world units, **0** deep
   overlaps, closest centres 8.16 apart (≈ the radius sum). Same at tick 3,000.
3. *Contact and size resistance, measured (seed 8, 400–600 real ticks from tick
   4,000):* contact on every one of 400 ticks, 7,523 contacting pairs (≈ 19 per
   tick at population ~200); of 4,688 real contacting pairs of UNEQUAL size the
   larger organism was displaced less in **4,673 = 99.7%**, and all 15
   exceptions were pairs clamped against a world wall (verified individually);
   1,590 equal-size contacting pairs shared displacement exactly. About 11.8% of
   displacement events occur within 15 world units of a food item.
4. *Browser (x86_64 cloud container, clean `npm ci`, production build, headless
   Chromium, Playwright), 18 / 18:* a seed-8 `0A.5.0` world resumed at 10
   ticks/s with `--observe`; the Observatory connects and shows `0A.5.0` LIVE,
   the Pixi canvas renders and changes over time, the tick advances, an organism
   can be selected and inspected and selection changes what is drawn (the V2.1
   vision cone still works), **0** WebSocket messages sent by the browser, no
   memory/collision internals in the UI, no application console errors; SIGINT
   saved cleanly, resume recovered the exact tick, and observed + paced +
   interrupted + resumed == one uninterrupted run (`1cf33cc848809dcb` at tick
   5,428); recovered snapshot is format v2 with memory intact; newborns carry
   zero memory.

**Performance.** The plain deterministic O(N²) pair scan, as sensing already is.
Development VM, seed 8: population 25 — step 0.125 ms, resolver 0.0016 ms per
call (2 calls/tick ≈ 2.5% of the tick); 113 — 1.13 ms / 0.079 ms (13.9%); 243 —
3.68 ms / 0.356 ms (19.3%); 234 — 3.41 ms / 0.336 ms (19.7%). The seed-8 world
ran at ≈ 770–1,400 ticks/s unpaced. No pathological regression, so nothing was
optimised and no spatial index was added.

**Observed, not interpreted.** Canonical seed 20260910: two births, extinct at
tick 2,551 (the golden hash still fingerprints the whole 10,000-tick run;
checkpoints at 500 / 1,000 / 2,000 cover it while alive). Seeds 1–7 die out by
tick 4,818; seed 8 — the first of 1, 2, 3, … alive at tick 10,000, the same
living seed V2.2 used — reaches 234 organisms with 1,291 births. Extinction is a
legitimate result; no seed was shopped, no ecological parameter was touched, and
none of this is evidence that physical bodies help or hurt. No claim is made
about territory, dominance, cooperation, aggression, strategy or intelligence:
only the physical effects above were measured. No DEMO seed was chosen for
`0A.5.0`.

## V2.4 — RESULT: DONE (contestable food handling, model `0A.6.0`)

Contract: `docs/V2.4 Amendment - Contestable Food Handling (0A.6.0).md`.
Multi-tick, contestable eating — no steal, defend, attack, carry or share
action, no damage, no energy transfer, no new input, output or gene.

**Model.** Registry flag `foodHandling` (only `0A.6.0`); `simulationModel()`
now reports `{ neuralInputSize, organismSensing, recurrent, physicalBodies,
foodHandling }`. `0A.6.0` is `0A.5.0` otherwise: ten V2.1 inputs, Elman
recurrence, four outputs, 188 parameters, solid bodies, and bit-identical
founder genomes from the same bootstrap stream (asserted in test).

**Handling contract.** `handling.ticksRequired` = 5. `world/foodHandling.ts`:
held items take their holder's resolved position; holders that did not request
eat, or that met another body in the ACTIVE resolution, drop their item
(progress 0, item free at the holder's position, NOT reacquirable this tick);
surviving handlers advance one step; an item reaching 5 is consumed and its
holder credited exactly `energy.foodEnergyValue` in the unchanged phase 8;
free items are then acquired by eligible non-holders through
`resolveFoodAcquisition` — `resolveFeeding`'s competition rules verbatim
(nearest wins, exact ties by ascending organism id, items in ascending food id
order, one per organism) plus one rule: an organism already holding cannot
acquire.

**State.** `holderId` / `handlingProgress` live on the FOOD item, so "one
holder per item" is structural and a child cannot inherit a hold. Canonical and
future-affecting (four progress values hash four different ways, and their
futures differ). Food records of every older model are exactly `{ id, x, y }`;
canonicalization refuses a world whose food does not match its model.

**Contest.** `resolveBodyOverlap` now returns a derived `contacts` report — the
ascending ids of organisms overlapping another organism at the START of that
resolution (first pass only, so contact depends on what organisms did rather
than on `body.separationPasses`). Only the ACTIVE (phase 4b) resolution's set
is a contest; the post-birth passive resolution (17b) is deliberately ignored,
so a newborn cannot knock its parent's food loose by spawning (tested with a
real birth). Wall clamping, proximity and vision never dislodge (tested). The
report is never stored, persisted, canonical or broadcast.

**Lifecycle.** Phases 1–5 and 9–20 unchanged; 4b/17b unchanged; phases 6–7
become handling for `0A.6.0` (instantaneous feeding for every older model); new
phase 16b releases a dead holder's item at its final position with progress 0
and no energy. Sense → Decide → Resolve intact: S_t is never modified (a
deep-frozen one still steps), memory advances exactly once, and handling causes
no second neural evaluation.

**Persistence.** Snapshot format **v3** for `0A.6.0`
(`snapshotFormatVersionFor` = 3 for a handling model, 2 for the other recurrent
ones, 1 for feed-forward), with the format checked against the model before
anything is trusted. Validation rejects missing holder/progress, non-integer or
out-of-range progress (held `1..ticksRequired`, free exactly 0), a holder that
is not a living organism of that world, one organism holding two items,
handling state on an instantaneous-feeding model, v3 relabelled `0A.5.0` and v2
relabelled `0A.6.0`. Formats v1 and v2 are untouched and the `v1.0.0` / V2.1
fixtures still load byte-exactly. Exact resume proved at progress 1, 2, 3, 4
(5 is unreachable in stored state) and immediately after a dislodgement, in
process and across processes.

**Observer.** Protocol v1 unchanged; the food entry is still `{ id, x, y }`, and
a held item is visible only because its ordinary position moves. No Observatory
change at all.

**Live verification.**

1. *Development VM (arm64), real CLI:* `--new --seed 8 --model 0A.6.0
   --until-tick 1500` → resume with `--observe 8793 --ticks-per-second 60` and a
   WebSocket client (197 frames, protocol 1, `0A.6.0`, food keys exactly
   `id/x/y`, no handling field, 0 messages sent by the client; **818 of 11,664
   food samples moved between consecutive frames** — carried items — up to
   12.43 world units per frame; organisms moved in 4,173 of 4,175 samples; food
   steady at the cap of 60 with 91 consumed and 91 regenerated) → SIGINT at tick
   2,878, which saved **five items mid-handling** (progress 1, 2, 3, 1, 2) in
   format v3 → the saved state equals the uninterrupted direct run
   (`563124b4a568672e`), and resuming to 3,400 also matches
   (`e1a4d566d06d46ee`).
2. *Mechanics measured over 6,000 ticks of the seed-8 world*, each release
   classified exactly against that tick's `eatRequested` and active contact
   set: **6,649 acquisitions, 675 completions, 4,426 voluntary releases, 1,537
   dislodgements by body contact, 6 drops on a holder's death**, body contact on
   4,303 of 6,000 ticks, and food carried **10,863 world units** in total.
3. *Browser (x86_64 cloud container, clean build, headless Chromium,
   Playwright), 22 / 22:* a seed-8 `0A.6.0` world resumed at 10 ticks/s with
   `--observe`; the Observatory connects and shows `0A.6.0` LIVE, the canvas
   renders and changes, the tick advances, an organism can be selected and
   inspected and selection changes what is drawn (the V2.1 vision cone still
   works), **0** WebSocket messages sent by the browser, no handling internals
   in the UI, no application console errors; SIGINT saved cleanly, resume
   recovered the exact tick, and observed + paced + interrupted + resumed == one
   uninterrupted run (`96558905dadcbe4e` at tick 1,971); the recovered world is
   format v3 with memory and handling intact, the held item had a living holder
   and valid progress, free items carried no progress, and the 60-item cap
   included the held one.

**Performance.** A plain deterministic O(food × organisms) scan; no spatial
index, no new engine. At the standard 60-item cap: 0.052 ms/tick at 25
organisms, 0.209 at 100, 0.589 at 250, 1.010 at 400. In real `0A.6.0` worlds
(populations ≈ 20–30) handling is 0.045–0.10 ms of a 0.10–0.32 ms tick. No
pathological regression, so nothing was optimised.

**Observed, not interpreted.** Canonical seed 20260910: **no births at all,
extinct at tick 2,854**. Seeds 1–2 also die out; seed 3 is the first of 1, 2,
3, … alive at tick 10,000 (9 organisms, 38 births); seed 8 is the most active
world found (≈ 20–46 organisms). Contestable handling is plainly a much harsher
ecology than instantaneous feeding — energy arrives at best once per five
uninterrupted ticks, and body contact is common — but nothing was tuned, no
seed was shopped and no ecological parameter was touched. Extinction is a
legitimate result. No claim is made about stealing, defending, hoarding,
cooperation, pursuit, strategy or intelligence; only the mechanics above were
measured. No DEMO seed was chosen for `0A.6.0`.

## V2.5 — RESULT: DONE (lifetime plasticity, model `0A.7.0`)

Contract: `docs/V2.5 Amendment - Lifetime Plasticity (0A.7.0).md`.

**Implementation.** Registry flag `lifetimePlasticity` is true only for
`0A.7.0`. The genetic controller stays 10 → 8 recurrent → 4 with 188
parameters. Each organism adds 32 `hiddenOutputWeightOffsets`, 4
`outputBiasOffsets`, and 36 matching eligibility traces as runtime phenotype
state. `neural/plasticity.ts` implements deterministic centered-output
eligibility (`0.90 × old + pre × post`) and bounded updates (`0.01 ×
reinforcement × eligibility`). `stepWorld` buffers decision activity, records
actual movement cost and actual capped food credit, then learns before
reproduction. Basal metabolism and reproduction cost never enter the signal.

**Inheritance and protection.** Founders/newborns start memory, offsets and
traces at exact zero. Offspring inherit/mutate only the genome. Tests compare
`0A.6.0`/`0A.7.0` founder genomes and RNG states, child mutation/RNG states,
and repeated learning against an exact serialized genome. Historical models
have no plastic keys or config.

**Persistence and observer.** Format v4 belongs only to `0A.7.0`; v1/v2/v3
mapping is unchanged. Exact dimensions, finiteness and effective neural bounds
are validated, plastic state is forbidden historically, and format/model relabelling is rejected.
Continuous and serialized/resumed learning trajectories match. Protocol v1 is
unchanged and frames contain no plastic, eligibility, reward or neural state.

**Canonical linux-arm64 verification.** Official Docker image
`node:22.23.2-bookworm-slim`, explicitly `--platform linux/arm64`, repository
mounted read-only. Historical 10,000-tick hashes all matched:
`6a6576bd49e86b27`, `b95a0b4ef7dd8449`, `e54d0c11249b7849`,
`436a377506063609`, `1006a56393e19cd9`, `3e5b9671f5750712`.
New `0A.7.0`: tick 500 `3430a275c26406f2`; tick 1,000
`9cf7240aa1ca863e`; tick 2,000 `cfeb892aecfbaf91`; tick 10,000
`04d0b7c5917ca0c0`; zero births, extinct tick 2,444. The unrelated pre-existing
Docker image briefly used before the owner's explicit environment constraint
was discarded as evidence; none of its results are used here.

**Controlled evidence.** Positive reinforcement 0.5 with eligibility 2 gives
offset +0.01; negative gives -0.01. Five zero-reward eligibility steps leave
offsets zero but retain trace 1.22853; delayed reward 0.25 then adds
0.003071325. With the same genome/input, those ±0.01 histories produce forward
outputs 0.7009695482 vs 0.6990286580. Tests also cover zero reward, bounds,
capped credit, movement penalty, excluded basal/reproduction/collision/sight/
acquisition terms, exactly-once lifecycle timing, order independence and
genome immutability.

**Descriptive coverage comparison (seed 8, 6,000 ticks; no tuning).** Both
models survived. `0A.6.0`: population 46, births 118, acquisitions 6,649,
completions 675. `0A.7.0`: population 47, births 103, acquisitions 5,043,
completions 557, living-organism mean absolute offset 0.022569 and maximum
0.236630. Combined release counts were 5,969 vs 4,483; this measurement does
not separate voluntary release, dislodgement and death. One trajectory is not
causal evidence and supports no intelligence claim.

**Performance.** Paired medians in the same official environment: 25
organisms 0.1165 → 0.1240 ms/tick (+0.0075 ms, 6.5%); 100 organisms 0.7438 →
0.7797 (+0.0359 ms, 4.8%); 250 organisms 3.3857 → 3.5274 (+0.1417 ms, 4.2%).
Plain loops only; no ML library, GPU, worker or spatial optimization.

## V2.6 — regulated recurrent initialization (model `0A.8.0`) — DONE as a model; HYPOTHESIS FAILED

Contract: `docs/V2.6 Amendment - Regulated Recurrent Initialization (0A.8.0).md`.

**Headline.** The substrate fix works mechanically and improves demographics
substantially, and it still **failed 3 of its 4 precommitted falsification
targets**. Both facts are recorded. No parameter was tuned after the results
were seen, and none should be until the owner decides.

**The one change.** `0A.8.0` is `0A.6.0` with the recurrent hidden→hidden block
DRAWN from `neural.recurrentInitSigma = initSigma / sqrt(hiddenLayerSize)`
(`0.8 / sqrt(8)` = `0.282842712474619`) instead of the shared `initSigma`
(0.8). The four historical blocks still use `initSigma`. Registry flag
`regulatedRecurrentInit` is true only for `0A.8.0`; `validateConfig()` requires
`neural.recurrentInitSigma` exactly on that model, refuses it everywhere else
(so every historical `configHash` is byte-identical), and re-derives the value
from the locked rule, refusing `0.1`, `0.15` or anything else.

**Diagnosis addressed.** Not generic chaos: excessive recurrent drive → tanh
saturation → reduced sensory conductance → large state-generated output offsets
→ loss of sensory authority once the recurrent state settles.

**Initialization only.** No runtime recurrent gain, no leak/time constant/λ (a
follow-up experiment showed leaky recurrence was harmful here), no gate,
LSTM/GRU or structural bound, no new gene/input/output/action, and no
founder-screen change (no temporal screen, spin rejection, saturation gate or
wall-avoidance test — a circling controller is still a valid founder). The
runtime Elman update is unchanged in summation order, activation placement and
timing. Mutation is unchanged and `recurrentInitSigma` is never a mutation
sigma. Bootstrap perturbation still uses `neuralBootstrapSigma` (0.05) for
every block including the recurrent one: it was never `initSigma`, so the V2.6
brief's conditional did not fire, and measured it adds only +1.6% to the
recurrent standing deviation (0.2828 → 0.2872) rather than undoing the fix.

**RNG protection.** `gaussian()` consumes two draws whatever its sigma, and the
founder screen runs from a zero hidden state where recurrent weights contribute
nothing — so at the same seed `0A.8.0` accepts founders at the SAME attempt
indices as `0A.6.0`, each founder's four historical blocks are byte-identical,
and bootstrap positions, headings, fertility and food are identical. Only the
recurrent block's scale differs, which makes this a controlled comparison.

**Plasticity isolation.** `lifetimePlasticity` is false for `0A.8.0`: no
offsets, no eligibility traces, no learning update, no V2.5 runtime state in
snapshots or canonical state. The V2.5 implementation is untouched and
`0A.7.0` is unchanged.

**Persistence.** `0A.8.0` reuses **snapshot format v3**: its future-affecting
state shape is `0A.6.0`'s exactly, and a format number describes stored shape,
not chronological model order. Mapping is v1 → `0A.1.0`–`0A.3.0`; v2 →
`0A.4.0`, `0A.5.0`; v3 → `0A.6.0`, `0A.8.0`; v4 → `0A.7.0`. Cross-model
relabelling is refused in both directions (a `0A.8.0` snapshot renamed to
`0A.6.0` fails because its stored config carries `recurrentInitSigma`, which
`0A.6.0` must not have). Observer protocol stays v1.

**Canonical linux-arm64 verification.** linux-arm64, Node 22.23.2 (the
canonical runtime), seed 20260910, 10,000 ticks. All seven historical hashes
matched before and after the change: `6a6576bd49e86b27`, `b95a0b4ef7dd8449`,
`e54d0c11249b7849`, `436a377506063609`, `1006a56393e19cd9`, `3e5b9671f5750712`,
`04d0b7c5917ca0c0`. New `0A.8.0`: tick 500 `7b9fa5616b128d94`; tick 1,000
`eb32428de387d31d`; tick 2,000 `1d627932555249d7`; tick 10,000
`0806b096bf4d0061`; 5 births, max generation 3, extinct at tick 2,884.

**Controller diagnostics (read-only; measure, never gate).** Coverage seeds 5,
8, 12, 13, settled 300 ticks, averaged over living organisms:

| Measurement | `0A.6.0` | `0A.7.0` | `0A.8.0` |
|---|---|---|---|
| mean \|h\| | 0.791 | 0.785 | 0.650 |
| fraction \|h\| > 0.95 | 0.439 | 0.438 | 0.220 |
| mean tanh derivative | 0.299 | 0.309 | 0.485 |
| mean \|recurrent pre-activation\| | 1.588 | 1.544 | 0.482 |
| mean \|sensory pre-activation\| | 0.877 | 0.864 | 0.889 |
| recurrent / sensory ratio | 2.64 | 2.39 | 0.75 |
| sensory authority (settled ÷ zero memory) | 0.545 | 0.541 | 1.052 |
| mean \|turn\| | 0.622 | 0.619 | 0.337 |
| wall-near fraction | 0.310 | 0.290 | 0.340 |
| food in range, eat not requested | 0.020 | 0.030 | 0.000 |

The causal chain is confirmed end to end. This is mechanism evidence, not
evidence of intelligence.

**Precommitted evaluation — FAILED.** Seeds, tick counts and thresholds were
fixed in `results/v2.6/PRECOMMITMENT.md` before any run. The prior diagnostic's
17 seeds are not reproducible from this repository (no note or script records
them) and the Phase 0B pilot/validation sets are reserved, so the precommitted
substitute is the first N of the natural counting order: seeds 1–17 at 5,000
ticks, seeds 1–7 at 12,000 ticks.

| Metric (17 seeds, 5,000 ticks) | Result | Target | Verdict |
|---|---|---|---|
| median births | 16 | ≥ 15 | PASS |
| extinctions | 8 / 17 | ≤ 7 / 17 | **FAIL** |
| max generation | 7 | ≥ 8 | **FAIL** |
| total births | 661 | — | — |
| mean final population | 13.12 | — | — |
| seeds with ≥ 20 births | 8 / 17 | — | — |

| Metric (7 seeds, 12,000 ticks) | Result | Target | Verdict |
|---|---|---|---|
| seeds reaching generation ≥ 10 | 2 / 7 | ≥ 4 / 7 | **FAIL** |

(12,000-tick secondary data: median births 45, total 968, 3/7 extinct, mean
final population 26.6, max generation 13.)

**Descriptive comparison, same 17 seeds, 5,000 ticks:**

| Metric | `0A.6.0` | `0A.7.0` | `0A.8.0` |
|---|---|---|---|
| median births | 4 | 1 | 16 |
| total births | 169 | 154 | 661 |
| extinct | 12 / 17 | 15 / 17 | 8 / 17 |
| mean final population | 3.94 | 3.47 | 13.12 |
| max generation | 6 | 6 | 7 |
| seeds with ≥ 20 births | 2 / 17 | 2 / 17 | 8 / 17 |

`0A.8.0` is ahead of both predecessors on every descriptive metric and still
misses the absolute thresholds. The decision about what follows is the owner's.

**Live verification.** A real `0A.8.0` world (coverage seed 8, `worlds/`,
gitignored — NOT canonical) was created, run to tick 600, then stopped and
resumed four times across separate processes with `--observe 8791` and
`--ticks-per-second 20`. Verified: store identity `0A.8.0` / configHash
`52e617dc91e31732`; snapshot format **v3**; organisms carry `hiddenState` (8)
and `recurrentHiddenWeights` (64) and NO plastic keys; food carries
`holderId`/`handlingProgress`; the stored config carries `recurrentInitSigma`
and the world state does not; reproduction and deaths occur (population 25 →
33 → 41, generation depths 0/1/2 present, 19 of 38 organisms had parents);
observer frames arrive with `observerProtocolVersion` 1 and leak no
`hiddenState`, recurrent weights, initialization metadata, handling state,
offsets or eligibility; the frozen Observatory protocol validator accepts a
captured real frame unchanged (committed as a fixture). The restarted world's
tick-1,400 stored hash `99da0eb183e6d7e4` equals an uninterrupted 1,400-tick
run. A browser Observatory check was not possible in this environment (no
browser can reach a locally started server here); the frontend is covered by
its vitest suite plus the new real-frame fixture test.

**Performance.** Paired medians, same environment, 300 ticks after a 100-tick
warm-up: 25 organisms `0A.6.0` 0.1524 → `0A.8.0` 0.1447 ms/tick; 100 organisms
1.0733 → 0.9582; 250 organisms 4.1911 → 4.3656. Within run-to-run noise in both
directions — the runtime neural equation is unchanged, so no recurrent overhead
exists by construction.

## V2 backlog (deferred)

Richer senses — **started** (V2.1 above). Memory / recurrent neural state —
**started** (V2.2 above). Physical interaction — **started** (V2.3 above). Contestable resources —
**started** (V2.4 above). Neural fingerprint / neural mutation visualisation;
lifetime-learning extensions and RL experiments;
richer morphology; full genealogy; persistent analytics; cloud / database /
remote observers; mobile polish; richer ecosystem and environmental
complexity. Any of these is a new phase with its own spec.

## NEXT EXACT STEP

**Owner decision required — do not proceed unilaterally.** V2.6 is implemented,
tested, documented and committed, and its precommitted hypothesis test FAILED
(median births passed; extinctions 8/17 vs ≤ 7, max generation 7 vs ≥ 8, and
generation ≥ 10 in 2/7 vs ≥ 4/7 all failed). The mechanism is confirmed and
`0A.8.0` is far ahead of `0A.6.0`/`0A.7.0` descriptively. The next step is the
owner's call between, for example: accepting `0A.8.0` as-is and moving to a
different V2 slice; re-running the evaluation against the original 17-seed
diagnostic set if it can be recovered; or opening a separate, specified
follow-up (which would be a NEW model version, never an edit of
`0A.1.0`–`0A.8.0`).

**An agent must NOT**, in response to these results: retune
`recurrentInitSigma` (try `0.1`, `0.15` or a sweep), weaken or rebalance
`handling.ticksRequired`, adjust ecology/energy/mutation, add a founder
viability gate, add a recurrent gain, leak or λ, or pick different seeds. Those
are the explicit non-goals of V2.6.

---

### Previous step (V2.5, superseded)

**None pending — V2.5 is complete.** The next task, if any, is either a genuine
bug fix (focused failing test, smallest correction, rerun the affected package
and all six golden hashes on arm64) or the next V2 slice under its own approved
specification, as a new model version (never an edit of `0A.1.0`–`0A.7.0`).
Open decisions for the owner, not for an agent: whether new product worlds
should default to a V2 model, DEMO seeds for `0A.3.0`–`0A.6.0`, whether
`0A.6.0`'s much harsher ecology should eventually be rebalanced (deliberately
left alone for now — observe first), whether the `0A.5.0` size trade-off should
be rebalanced, and whether the platform dependence of the hashes (Known gap 13)
should be addressed.

Backend work stays limited to what the frontend demonstrably needs.
