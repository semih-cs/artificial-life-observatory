# AGENTS.md — Artificial Life Observatory

This file is the persistent operating contract for any coding/research agent working on this repository.

It exists so that progress does **not** depend on a single chat session.  
`PROJECT_STATUS.md` contains the current handoff state and must be read together with this file.

---

## 1. Mandatory startup routine

Before changing code, every agent must:

1. Read this `AGENTS.md`.
2. Read `PROJECT_STATUS.md` completely.
3. Run `git status --short`.
4. Inspect the latest Git commits with `git log --oneline -5`.
5. Inspect only the source/spec/result files relevant to `NEXT EXACT STEP`.
6. Continue from the existing repository state. Do **not** recreate completed work merely because previous chat context is unavailable.

If `PROJECT_STATUS.md` disagrees with the actual repository, Git state, tests, or persisted experiment outputs, the repository is authoritative. Update `PROJECT_STATUS.md` before proceeding.

---

## 2. Project purpose

Artificial Life Observatory is a deterministic artificial-life research platform.

The core principle is:

> **We simulate capabilities and constraints, not behaviors.**

Organisms receive primitive capabilities such as sensing, movement, feeding and reproduction. Their neural controllers decide what actions to request. The code must not directly encode high-level behaviors such as:

- seek food,
- flee,
- cooperate,
- hunt,
- form social roles,
- optimize a hand-written fitness score.

There is **no central scalar fitness function** used to select organisms. Selection emerges from resource acquisition, survival and reproduction.

Mutation occurring is not automatically beneficial.  
Population survival is not automatically adaptation.  
Neural-genome change is not automatically intelligence.

---

## 3. Source-of-truth hierarchy

Use the following order of authority.

### Normative simulation specification

`docs/Artificial Life Observatory - Spec v4 (Phase 0A Hotfixed).docx`

For Phase 0A biological/simulation semantics, this is authoritative, **as
amended by**:

- `docs/Phase 0A Amendment - Multi-Founder Initialization.md` — amends §13.76's
  bootstrap rule. The initial population is built from 5 independent founder
  controllers (5 organisms each) rather than 25 near-clones of one. The founder
  acceptance gate is unchanged. Model version `0A.2.0`; the historical
  single-founder model is `0A.1.0`.

An adopted amendment wins over the base document where they conflict.

### Current implementation reality

The actual TypeScript source and passing tests.

If implementation and documentation disagree, do not silently guess. Determine whether the code violates a locked specification rule or whether documentation is stale.

### Implementation documentation

- `README.md`
- `docs/Phase 0A Implementation Report.md`
- Phase 0B documentation when present
- `PROJECT_STATUS.md`

### Historical/reference material

Everything under `docs/reference/` is historical context only.

Do not implement obsolete behavior from older specifications when it conflicts with Spec v4.

---

## 4. Phase boundaries

The project is deliberately staged.

### Phase 0A — Pure Simulation Core

Package:

`packages/simulation-core`

Purpose:

Deterministic, headless organism lifecycle and evolutionary substrate.

Phase 0A is **frozen** unless a later phase demonstrates a genuine implementation bug or violation of a locked invariant.

**Frozen v1 biological model:** `simulationVersion 0A.2.0`, `founderGroupCount 5`,
`DEFAULT_SIMULATION_CONFIG`.

- Its regression hash is `b95a0b4ef7dd8449`.
- The historical single-founder model `0A.1.0` (`6a6576bd49e86b27`) stays
  documented and tested.
- Biology is not changed during Phase 0C or 0D unless a genuine implementation
  bug is found, and any such change must be versioned.
- This is a **product freeze**. It is not a research baseline qualification:
  the Phase 0B gate was not met.

### Phase 0B — Calibration and Validation Harness

Package:

`packages/experiment-harness`

Purpose:

Run deterministic multi-seed experiments, collect observational metrics, perform controlled parameter sweeps and evaluate whether the Phase 0A substrate operates in measurable non-degenerate regimes.

Phase 0B must not add new biological intelligence features.

**Status — closed for v1** (project decision, 2026-09-11):

- **Phase 0B Engineering: COMPLETE / FROZEN.** The harness, diagnostics,
  probes, outcome classifiers and provenance are operational.
- **Phase 0B Research Calibration: EXPLORATORY — CLOSED FOR V1.** The ~70%
  research gate was not met, and no core simulation defect was found. See
  `docs/Phase 0B Pilot Report.md` §23.
- **Not a v1 blocker.** Product development is unblocked.

Do **not**:

- start further calibration sweeps, diagnostics or tuning;
- reopen Phase 0B questions;
- use the validation seeds.

Those stay reserved for future research, which must follow §7 if it is ever
reopened.

### Phase 0C — Persistent Canonical World

**COMPLETE FOR V1** (runner and observer bridge done; Phase 0D is active). Scope, in order:

1. **deterministic snapshot save/load/resume** — first, and alone;
2. snapshot validation, checksum, rotation and fallback;
3. a persistent canonical process and world lifecycle;
4. durable storage and events.

Do not add a database, server or UI before the deterministic save/resume
invariant (Spec §18.60, §19.27) is proven. Persistence code lives in its own
workspace package that consumes `simulation-core`, never inside it.

**Slices 1–3 are done:** `packages/persistence` — snapshot format v1
(slice 1), the folder-based snapshot store (slice 2) and quarantine of corrupt
snapshots (slice 3). The snapshot store is complete; do not open another
persistence sub-project. The persistent world process is also done:
`packages/world-runner`, and so is its read-only observer bridge (WebSocket
frames, observer protocol v1, tick pacing). The Phase 0D Observatory
frontend consumes it (slice 1 done). The following persistence, runner and
observer invariants are proven by test and must hold from now on:

- **Exact continuation.** A snapshot restores to a world that continues bit for
  bit: continuous run == save → load → resume. The continuation and golden-resume
  tests in `packages/persistence/tests` are live regressions. Never weaken
  them.
- **Purity.** Snapshot creation, serialization, validation, loading and restore
  draw no RNG from any stream and never modify the live world or its config.
- **One definition of state.** The stored world state is
  `canonicalizeWorldState(world)`. Any change to its shape, or to anything
  `stepWorld` reads, needs a new `snapshotFormatVersion` and an explicit loader.
- **Tick convention.** Snapshot tick N = the world after tick N completed.
- **Refuse, never repair.** A snapshot that fails any check is rejected with a
  coded `SnapshotError`. There is no automatic fresh world or approximate
  catch-up (§19.24, §19.26).
- **Atomic writes.** Files are written temp → fsync → rename. A partial file is
  never accepted.
- **One folder = one world.** A snapshot store belongs to one world identity,
  `(simulationVersion, configHash)`, recorded in `world-identity.json`.
  Snapshots of another world are refused, never mixed in and never deleted to
  resolve the conflict.
- **Never overwrite a stored tick.** Store saves are tick-monotonic. Different
  content for an existing tick is refused. Retention (newest 5) deletes older
  snapshots only after the new one is committed and read back.
- **Recovery never creates a world.** `recoverLatestValid` falls back past
  invalid snapshots and reports each one. If none is valid, it throws. It only
  reads the folder.
- **Quarantine, never delete.** Corrupt snapshots leave the active store only
  through `quarantineSkippedSnapshots`. It re-validates every file first,
  never moves a valid file, never overwrites anything in `quarantine/`, and
  never deletes evidence.
- **The runner never changes the simulation.** Each tick is exactly
  `stepWorld(world, config)`. Saves only read the world, and the save cadence
  is a multiple of simulation ticks, not wall-clock time. Wall-clock time
  may pace or report the loop, but it never reaches world state.
- **No silent new world.** A world is created only by an explicit
  `WorldRunner.create` / `--new`, never over a folder that already holds a
  world (even a broken one). `WorldRunner.open` / recovery never creates one.
- **Restart equivalence.** Stop/restart at any tick continues exactly. The
  golden multi-restart and separate-process tests in
  `packages/world-runner/tests` are live regressions.
- **Observation is read-only and pure.** `toObserverFrame` draws no RNG,
  writes nothing and changes no ordering. The observer stream routes nothing
  from clients anywhere: there are no mutation commands, as Spec §14.50
  [LOCKED] requires. It only reads the world between ticks. It sends the
  latest frame only, and a slow client is skipped, never buffered without
  bound and never waited for.
- **TPS is not FPS.** Tick pacing (`ticksPerSecond`) only decides when ticks
  run. The observer frame rate is independent. Paced, unpaced, observed and
  unobserved runs reach the same hash — the golden observer/pacing tests are
  live regressions.
- **Observer protocol versioning.** Any change to the frame shape bumps
  `OBSERVER_PROTOCOL_VERSION`. Neural weights stay out of live frames.

### Demo seeds (product only)

A clearly labelled DEMO seed may be chosen for the product UI because it
produces a long-lived, interesting world.

- It must be kept separate from the pilot and validation seed sets.
- Choosing it is **not** a scientific claim.
- It must never be used as research evidence.

### Phase 0D — Observatory

**ACTIVE — slices 1–4 done.** `packages/observatory` (React + TypeScript +
Vite + PixiJS) consumes the read-only observer stream from
`packages/world-runner`: `--observe <port>`, observer protocol v1, see
README. It never sends commands that change the world (§14.50). Scope:

- observer UI,
- React/PixiJS,
- live visualization,
- inspection/analytics presentation.

Slice 1 is the live world view: organisms (lineage colour, heading, size,
energy), food, births/deaths, interpolated motion, camera, selection with
lineage emphasis, an organism inspector, HUD and connection states. Slice 2
is evolution visibility: a living-lineage panel, a birth/death event feed
and session-only population/generation trends, all derived in the browser
from received frames. Slice 3 is inherited morphology: the inspector shows
the five protocol morphology genes next to the parent's with exact deltas
(from a bounded session cache), births carry a Δ count. Slice 4 is a
compact ancestry strip: the observed parent chain walked backwards through
that cache, one Δ badge per hop, stopping honestly at the first unobserved
ancestor. Next: final v1 polish and the Phase 0D freeze — see
`PROJECT_STATUS.md`.

Frontend rules that hold from now on:

- **Read-only, structurally.** The connection's socket type
  (`ReadOnlySocket`) has no `send`. Nothing in the frontend transmits to the
  runner; the read-only test in `packages/observatory/tests` is a live
  regression. Never add a mutation path "for convenience".
- **Display is not state.** Interpolation, birth/death effects, lineage
  emphasis, the view pause and the camera are presentation only. Nothing is
  written back, nothing is extrapolated past the newest frame, and a paused
  view never pauses the simulation.
- **No unbounded history in the UI.** The frame store keeps the newest
  frame and the previous one. The only history is `world/sessionHistory.ts`
  (slices 2–3): session-only, fixed bounds (80 feed events, 300 trend
  samples every 10 ticks, 6 recently-extinct lineages, 4,000 morphology
  records with least-recently-seen eviction), never persisted, never sent,
  and cleared when a frame from a different world identity
  `(simulationVersion, configHash, rootSeed)` arrives. It is not an event
  database and not scientific evidence. Any new history must be bounded the
  same way and documented.
- **Events are frame differences, never inferences.** A birth is an id
  absent from the previous *consecutive* received frame; a death is an id
  that disappeared. If the tick step between received frames exceeds
  `CONTINUOUS_TICK_GAP` (8), one coalesced observation-gap marker is
  recorded and no birth/death is invented. The frame-gap test in
  `packages/observatory/tests/sessionHistory.test.ts` is a live regression.
- **The frontend owns its protocol types.** `protocol/observerV1.ts` mirrors
  the runner's frame shape and validates every message. A frame-shape
  change bumps `OBSERVER_PROTOCOL_VERSION` in the runner *and* the
  frontend's supported version; unknown versions are refused, never guessed.
- **Only real data.** Colours mean nothing but identity, energy is a
  number, generation is a depth, and no qualitative labels (healthy, weak,
  fit, intelligent, adapted, successful, species, …) are invented. Lineages
  are lineages.
- **Inheritance is compared, never guessed.** A parent → child morphology
  difference is compared only between values actually received in this
  session (`world/inheritance.ts`, `world/morphologyCache.ts`); a parent
  never observed is reported as unavailable. Two protocol values differ iff
  they are not identical (no epsilon; protocol precision is 0.001), and a
  difference may be called a morphology mutation because genomes are fixed
  for life and change only at reproduction (§13). It is never called
  beneficial, harmful, fit or adapted. Neural genomes are not in the frame
  and are not shown.
- **Ancestry is a view, not a store.** `world/ancestry.ts` walks parent
  links only through the bounded session morphology cache and stops at
  the first parent it does not hold (or at `DEFAULT_MAX_ANCESTRY_DEPTH`),
  reporting the boundary. No ancestor id or morphology is ever inferred,
  no descendants/siblings/tree exist, and there is no genealogy storage;
  a full genealogy needs its own bounded design and is not v1.
- **Organisms live in Pixi, not React.** React owns the shell (HUD,
  inspector, controls, connection); entities are Pixi display objects reused
  across frames. React state updates at most once per frame.

Do not add UI concerns to `simulation-core` or `experiment-harness`.

---

## 5. Phase 0A invariants that must be preserved

Do not change these casually.

- The initial population is built from `bootstrap.founderGroupCount` INDEPENDENT
  founder neural genomes (default 5, five organisms each), each accepted by the
  same unchanged viability gate, first passing candidate wins. Founders are never
  ranked, scored, compared or selected among.
- Genome is immutable during an organism's lifetime.
- Morphological and neural heritable state are separate.
- Runtime state is separate from genome state.
- Mutation occurs only during offspring creation.
- Morphology and neural mutation channels are independently controllable.
- Disabled mutation channels still consume their fixed RNG draw schedule so paired experiments retain RNG isolation.
- Phase 0A neural topology is fixed and feedforward.
- No RNN, memory, learning, plasticity, backpropagation, reinforcement learning or stochastic policy in Phase 0A.
- Neural evaluation is deterministic, pure and RNG-free.
- Decision logic returns `ActionIntent`; it does not directly mutate shared world state.
- Canonical lifecycle follows **Sense → Decide → Resolve**.
- Newborns do not act in their birth tick.
- Food is single-consumption.
- Same-tick food conflict is resolved by distance, then deterministic organism ID for exact ties.
- Feeding occurs before the single death-resolution pass and may rescue an organism in the same tick.
- Death mechanisms in Phase 0A are energy depletion and maximum age.
- Reproduction requires maturity and configured energy/action conditions.
- `reproductionCost > birthEnergy`.
- Movement energy cost is based on actual resolved movement, including the nonlinear velocity term.
- The fertility field is static and seeded.
- Food spawning is not adaptively targeted toward hungry organisms.
- Extinction is a valid biological result.
- There is no hidden population rescue/homeostasis.

If a proposed change violates one of these, stop and justify it with a demonstrated bug/spec conflict before editing.

---

## 6. Determinism contract

Canonical biological randomness must be controlled by project-owned RNG.

Never introduce canonical dependence on:

- `Math.random()`,
- wall-clock time,
- request timing,
- database ordering,
- thread/process scheduling,
- rendering timing,
- analytics timing.

Phase 0A uses separate BootstrapRNG and CanonicalRNG responsibilities.

Observation must not alter the biological trajectory.

Given the same supported simulation version, configuration, seed and tick count, repeated execution should produce the same canonical trajectory/state hash.

The current Phase 0A regression reference is recorded in `PROJECT_STATUS.md`.

Any intentional change to canonical RNG consumption or simulation semantics must be version-aware and must update the regression record deliberately.

---

## 7. Experiment rules for Phase 0B

Phase 0B research is closed for v1 (§4). These rules govern any future reopening
of research work. They also bind any use of the pilot and validation seed sets.

The experiment harness observes the simulation; it does not become part of biological selection.

### Pilot vs validation

Pilot/calibration seeds may be used to:

- debug the harness,
- inspect baseline behavior,
- tune empirical ecological parameters,
- narrow candidate configurations.

Validation seeds are held out.

Do not use validation seeds during tuning.  
Do not retune on validation results and then call the same validation set confirmatory evidence.

### Paired comparisons

Experimental conditions that are intended to be compared must use paired seeds where specified.

Treatment conditions must differ only in the intended variables.

### Extinction

If population reaches zero, record extinction. Do not rescue, restart or inject emergency resources.

### Interpretation

Do not call a result “adaptation” merely because:

- mutation occurred,
- a genome changed,
- a population survived,
- a lineage reproduced more,
- one pilot condition had a larger final population.

Use conservative language and distinguish:

1. mechanism validation,
2. replicated evolutionary evidence,
3. adaptation.

---

## 8. Repository/package boundaries

Current npm workspace:

- `packages/simulation-core`
- `packages/experiment-harness`
- `packages/persistence` (Phase 0C) — depends only on `simulation-core`
- `packages/world-runner` (Phase 0C) — depends on `simulation-core` and `persistence`;
  the long-running world process and its CLI (`npm run world`)
- `packages/observatory` (Phase 0D) — the browser frontend (`npm run observatory`);
  depends on no other workspace package. It talks to the world runner only
  over the observer WebSocket, read-only

Keep experiment-specific code out of `simulation-core`.

Keep UI/server/database/persistence code out of `simulation-core` and
`experiment-harness`. Persistence belongs in its own Phase 0C package, and
UI belongs to `packages/observatory`. The frontend never imports simulation
types; it validates the wire protocol itself.

Generated artifacts should not be committed unless intentionally selected as small fixtures.

The repository ignores:

- `node_modules/`
- `dist/`
- `coverage/`
- `results/`
- `.DS_Store`
- logs/transient Vitest artifacts.

Do not commit copied `node_modules`, build output or large experiment result folders.

---

## 9. Standard verification commands

From repository root:

```bash
npm ci
npm test
npm run build
```

Deterministic regression:

```bash
npm run simulate -- --seed 20260910 --ticks 10000
```

Expected hash depends on the model version, and the two must never be conflated:

| Model | Config | Hash |
|---|---|---|
| `0A.2.0` amended multi-founder (default) | `DEFAULT_SIMULATION_CONFIG` | `b95a0b4ef7dd8449` |
| `0A.1.0` historical single-founder | `singleFounderModelConfig()` | `6a6576bd49e86b27` |

Results from the two models must not be pooled or compared numerically.

Persistence regression, part of `npm test`: `npm test -w packages/persistence`.
It covers the §18.60 continuation, the golden resume to `b95a0b4ef7dd8449`, a
separate-process restore, corrupt-snapshot rejection, and the snapshot store,
including fallback recovery that resumes to `b95a0b4ef7dd8449`. It takes about
75–100 s.

World-runner regression, part of `npm test`: `npm test -w packages/world-runner`.
It covers:

- the golden multi-restart and a separate-process restart, both to
  `b95a0b4ef7dd8449`;
- SIGINT/SIGTERM/SIGKILL and the no-silent-new-world refusals;
- observer purity and the read-only stream;
- golden runs with an observer, with pacing, and with both.

It takes about 50 s.

Observatory regression, part of `npm test`: `npm test -w packages/observatory`
(vitest, about 1 s, no browser). It covers protocol parsing, the connection
lifecycle and the read-only guarantee, frame replacement without history,
selection and the inspector, interpolation bounds and angular wrap, lineage
colour determinism and the camera; and (slice 2) lineage aggregation,
birth/death derivation, frame-gap safety, bounded feed and trend,
world-identity reset, reconnect preservation and the rendered evolution
panel; and (slice 3) parent → child morphology deltas, the morphology cache
bound and reset, birth Δ counts and the rendered inheritance section; and
(slice 4) the ancestry walk and strip. `npm run build` type-checks and
bundles it. The live check — a world runner with `--observe` plus the built
Observatory in a browser — is manual (or scripted with a headless browser
where one is available) and is recorded in `PROJECT_STATUS.md`.

The full `npm test` takes about 2.5–3 minutes.

Phase 0B CLI:

```bash
npm run experiment -- starvation
npm run experiment -- feeding
npm run experiment -- reproduction-control
npm run experiment -- full-evolutionary
npm run experiment -- mutation-2x2
npm run experiment -- calibration-sweep
```

Do not rerun expensive experiments merely to reconstruct lost chat context if valid persisted results already exist. Inspect the result files first.

---

## 10. Test discipline

Do not delete, weaken or bypass a test merely to obtain a green suite.

When a bug is found:

1. demonstrate it with a focused failing test when practical,
2. make the smallest correction,
3. rerun the affected package tests,
4. rerun workspace regression tests when canonical behavior could be affected.

A passing test suite does not by itself prove an experiment definition matches its stated scientific condition. For diagnostics, explicitly test the intervention itself (for example, a “reproduction OFF” diagnostic must actually produce zero births under test conditions).

---

## 11. Documentation discipline

Do not create another giant design document unless explicitly requested.

Documentation should now serve implementation, experiment provenance and handoff.

Keep:

- `README.md` as the developer entry point,
- phase implementation/experiment reports as concise factual records,
- `PROJECT_STATUS.md` as the live handoff state.

Do not claim work is implemented, validated or committed when it is not.

---

## 12. Mandatory continuity protocol

This section is specifically intended to survive model limits, context loss and agent changes.

Before ending a substantial work session — and especially before a likely context/usage limit — update `PROJECT_STATUS.md`.

At minimum record:

- current phase and status,
- latest Git HEAD/branch,
- uncommitted files or worktree state,
- what was completed,
- exact tests/build commands executed and their results,
- experiment runs already completed,
- persisted result locations,
- known bugs/uncertainties,
- whether validation seeds were touched,
- the single `NEXT EXACT STEP`.

If a long experiment is in progress, record the exact command and output directory before starting it when possible.

The repository, not the chat transcript, is the project memory.

---

## 13. Commit discipline

Prefer small, descriptive commits around completed logical steps.

Before committing:

- inspect `git diff`,
- run the relevant tests,
- confirm generated/ignored files are not staged,
- update `PROJECT_STATUS.md`.

After committing:

- record the new commit hash/status in `PROJECT_STATUS.md` if the handoff point changed.

Never rewrite Phase 0A history merely to make later work look cleaner.

---

## 14. Definition of a safe handoff

A handoff is good when a fresh agent can do this:

> Read `AGENTS.md` and `PROJECT_STATUS.md`, inspect Git status, and continue from `NEXT EXACT STEP` without needing the previous chat.

If that is not possible, update the two files before stopping.
