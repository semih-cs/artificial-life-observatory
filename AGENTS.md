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

For Phase 0A biological/simulation semantics, this is authoritative.

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

### Phase 0B — Calibration and Validation Harness

Package:

`packages/experiment-harness`

Purpose:

Run deterministic multi-seed experiments, collect observational metrics, perform controlled parameter sweeps and evaluate whether the Phase 0A substrate operates in measurable non-degenerate regimes.

Phase 0B must not add new biological intelligence features.

### Phase 0C — Persistent Canonical World

Future scope:

- persistent canonical process,
- exact snapshots,
- RNG-state recovery,
- crash recovery,
- durable storage.

Do not begin this while Phase 0B is still open.

### Phase 0D — Observatory

Future scope:

- observer UI,
- React/PixiJS,
- live visualization,
- inspection/analytics presentation.

Do not add UI concerns to `simulation-core` or `experiment-harness`.

---

## 5. Phase 0A invariants that must be preserved

Do not change these casually.

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

Keep experiment-specific code out of `simulation-core`.

Keep UI/server/database/persistence code out of both packages until their designated phase.

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

Phase 0A deterministic regression:

```bash
npm run simulate -- --seed 20260910 --ticks 10000
```

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
