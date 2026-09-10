# Phase 0A Implementation Report

**Status:** Phase 0A complete
**Simulation version:** `0A.1.0`
**Specification:** *Artificial Life Observatory — Spec v4 (Phase 0A Hotfixed)*
**Date:** 2026-09-10
**Supersedes:** the pre-correction Phase 0A Implementation Report

This report describes what is actually implemented and tested after the
correction pass. It deliberately claims nothing that is not in the code and
covered by a passing test. Where something is incomplete, approximate, or a
known limitation, it is listed under *Known Phase 0A limitations*.

---

## 1. Result summary

| Gate | Result |
|------|--------|
| Build (`npm run build`, `tsc` strict) | **PASS** |
| Tests (`npm test`, vitest) | **PASS — 168 passed / 0 failed, 13 files** |
| Deterministic same-seed replay | **PASS** — identical canonical hash across independent processes |
| Headless N-tick execution | **PASS** — 10,000 ticks in ~230 ms |
| Phase 0A definition of done (Spec §14.6, §15.8) | **MET** |

Toolchain: Node 22.23.2, TypeScript 5.5 (`strict`, `noUncheckedIndexedAccess`),
vitest 2.1.

---

## 2. Repository and package

The repository root is a git repository with an npm workspace. The entire
implementation lives in `packages/simulation-core`, which is pure TypeScript
with **zero** UI, server, database, networking or persistence dependencies —
`typescript`, `vitest` and `@types/node` are dev-only. `docs/` holds the
authoritative Spec v4 and this report; `docs/reference/` holds superseded specs
and the revision/closure reports.

Scripts: `npm test`, `npm run build`, `npm run simulate -- --seed N --ticks M`.

---

## 3. Final module inventory

| Module | Responsibility |
|--------|----------------|
| `config/types.ts` | Full configuration surface; every field carries its `[LOCKED]` / `[BASELINE]` / `[OPEN — EMPIRICAL]` classification and spec citation. `validateConfig()` enforces structural invariants. |
| `config/defaults.ts` | The Spec v4 baseline values, with citations. `cloneConfig()` / `defaultConfig()`. |
| `rng/xoshiro128starstar.ts` | xoshiro128\*\* core generator, 32-bit unsigned throughout; `nextFloat`, `nextFloatOpen01`, `nextInRange`, Box–Muller `gaussian`; all-zero-state refused at construction. |
| `rng/splitmix32.ts` | State expansion only, never a draw generator. |
| `rng/streamSeed.ts` | Purpose constants and `streamSeed` / `initialState` derivation with the all-zero fallback. |
| `rng/rngStream.ts` | Named streams, `RngStreams`, export/restore of stream state. |
| `genome/types.ts` | `MorphologyGenome`, `NeuralGenome` (fixed block order), clone helpers, `NEURAL_INPUT_SIZE = 6`, `NEURAL_OUTPUT_SIZE = 4`. |
| `genome/founder.ts` | Founder draw sequence, `mechanicalValidityCheck`, the fixed probe set, `minimalViabilityScreen` (five checks), `generateFounderNeuralGenome`, `founderMorphology`. |
| `organism/types.ts` | `OrganismRuntimeState` (runtime state separate from genome), lineage and death metadata, `isMature`, `cloneRuntimeState`. |
| `world/fertility.ts` | Static seeded fertility field: lattice generation, bilinear `fertilityAt`. |
| `world/types.ts` | `WorldState`, `FoodItem`, `WorldConfigSnapshot`. |
| `world/bootstrap.ts` | Deterministic world initialization in fixed draw order; min-separation placement. |
| `world/stepWorld.ts` | The canonical 20-phase tick. |
| `world/foodCompetition.ts` | Distance-first, ID-tie-break, RNG-free food resolution. |
| `world/foodRegen.ts` | Fertility-weighted regeneration under a hard capacity cap, fixed draws per attempt. |
| `world/offspring.ts` | Child construction with the locked mutation → placement → heading draw order. |
| `world/runner.ts` | `runTicks()`, `runSimulation()`, `RunSummary`. |
| `perception/sense.ts` | The §11.58 six-input vector. |
| `neural/network.ts` | Fixed feedforward evaluation, tanh hidden, §11.59 output activations. |
| `actions/types.ts`, `actions/decide.ts` | `ActionIntent` and the pure decide step. |
| `biology/movement.ts` | Movement resolution returning actual velocity; `movementEnergyCost`. |
| `biology/energy.ts` | Basal cost, energy application, `isDeadByEnergy` / `isDeadByAge` / `evaluateDeath`. |
| `biology/reproduction.ts` | Four-condition eligibility; parent cost. |
| `biology/mutation.ts` | Independent channels, per-parameter rates, bootstrap perturbation (separate path). |
| `telemetry/types.ts` | Read-only tick metrics. |
| `serialization/canonicalState.ts` | Canonicalization, canonical string, 64-bit hash, non-finite scan. |
| `cli.ts` | Minimal headless entry point. |

---

## 4. Corrections made in this pass

Each item below was a gap in the previous implementation. Each is now
implemented and covered by tests.

**4.1 Independent mutation controls.** `morphologyMutationEnabled` and
`neuralMutationEnabled` are two separate configuration flags. A disabled channel
produces exact stored-value inheritance while consuming the same RNG draws it
would consume if enabled — see §4.15 below. Per-gene
(`morphologyMutationRate`, baseline 0.10) and per-parameter
(`neuralMutationRate`, baseline 0.05) probability gates were added; previously
every gene and every weight mutated unconditionally. Magnitudes and
probabilities are configuration, not constants. All four channel combinations
are tested, as are the rates (statistically) and the bounds.

**4.2 Maturity.** `lifecycle.maturityAge` (baseline 500 ticks) was absent
entirely; reproduction previously required only energy and neural intent.
Eligibility is now `alive ∧ age ≥ maturityAge ∧ energy ≥ threshold ∧
reproduceRequested`. Tested at `age < maturityAge` (impossible for every age
below the threshold) and `age == maturityAge` (possible), plus an explicit test
that a full-energy organism whose controller maximally requests reproduction
does **not** reproduce at tick 1.

**4.3 Maximum-age death.** `lifecycle.maxAge` (baseline 3000 ticks) was absent;
starvation was the only death condition. Death is now a single combined pass —
`energy ≤ 0 OR age ≥ maxAge` — evaluated once per tick at phase 16, with the
cause recorded. Boundary-tested at `maxAge - 1` (survives) and `maxAge` (dies),
both as a predicate and through the full pipeline.

**4.4 Movement energy cost.** Previously `requestedForwardSpeed × metabolism ×
coefficient` — linear, using the *requested* speed, and scaled by the wrong
gene. Now `movementCoefficient × size × actualVelocity²`, where `actualVelocity`
is the post-clamping displacement returned by `resolveMovement`. Basal
metabolism (`metabolism × baseMetabolicConstant`) remains a separate charge.
Tested: zero movement → zero cost; doubling velocity quadruples cost; larger
size costs more; an organism pinned against a wall pays basal only, while an
identical organism with open room pays strictly more.

**4.5 Reproduction energy accounting.** `reproductionCost` (baseline 45) and
`birthEnergy` (baseline 25) are now distinct configured values; children
previously received `configuredInitialEnergy` (the founder value, 50), which
made reproduction a net energy *source*. On success the parent loses exactly
`reproductionCost` and the child receives exactly `birthEnergy`. The parent cost
is no longer floored at zero, so a parent that reproduces into the red is caught
by the ordinary death check. `validateConfig()` rejects any configuration where
`reproductionCost ≤ birthEnergy`.

**4.6 Static seeded fertility field.** Previously food spawned uniformly at
random. A `(gridResolution+1)²` lattice of values in `[0,1]` is now generated
once from BootstrapRNG and bilinearly interpolated. It is fixed after
initialization, never mutated during simulation, identical for the same
seed + config, different for different seeds, and never responds to population
or hunger. It weights both initial food placement and regeneration. Tested for
determinism, immutability across 100 ticks, spatial heterogeneity, range, and a
demonstrated left/right spawn bias under a deliberately asymmetric field.

**4.7 Food capacity.** `worldFoodCapacity` (baseline 60) was absent — food grew
without limit. Regeneration now never exceeds the cap, verified over 200
repeated regenerations and 300 full ticks, at two different configured caps.

**4.8 Lineage.** `parentId`, `generationDepth`, `lineageRootId` and `birthTick`
are all present (previously only `generationDepth` and a `lineageRoot`, with no
`parentId`). Founders: `parentId = null`, `generationDepth = 0`,
`lineageRootId = own id`. Children: `parentId = parent.id`,
`generationDepth = parent.generationDepth + 1`,
`lineageRootId = parent.lineageRootId`. IDs are deterministic sequential
counters carried in `WorldState`. Tested across multiple generations and for
uniqueness at every tick.

**4.9 Headless runner.** `runTicks(world, config, tickCount, options)` and
`runSimulation(config, tickCount)` were added, returning the final world, an
optional telemetry series, and a `RunSummary` including the canonical hash.
`stepWorld()` remains the canonical single-tick mechanism. A minimal CLI
(`npm run simulate -- --seed 123 --ticks 10000`) wraps it.

**4.10 Founder validity handling.** Non-finite neural values (`NaN`, `±Infinity`)
were previously coerced to `0` and the candidate accepted. They now **reject**
the candidate, which continues to the next draw on the same never-rewound
BootstrapRNG stream. Out-of-bounds *finite* values are still clamped, per §13.76.
A dimensionality mismatch throws, since it is a programming error rather than a
bad draw.

**4.11 Founder approach smoke test.** The old check (c) was
`turn > -0.5` on two `foodAngle = 0` probes — which passes a controller that
swings hard *right* while food sits dead ahead, and never tests directional
response at all. It now verifies both halves of the §13.76 semantics: with food
to the right the turn output must be strictly positive and with food to the left
strictly negative (the fixed-sign check against §11.58's convention), and with
food directly ahead `|turn|` must not exceed the configured
`alignedTurnTolerance`. Tested against a hard-right controller (must fail), a
foodAngle-ignoring controller (must fail), a sign-following controller (must
pass) and its mirror image (must fail). It remains a binary pass/fail gate with
no scoring, ranking, trajectory simulation, or comparison between candidates.

**4.12 Baseline morphology bounds.** Code defaults disagreed with Spec v4 §10.4
on four of five genes. Corrected to the specification values (see §5). Neural
parameter bounds corrected from `[-5, +5]` to §11.30's `[-2, +2]`. Tests
validate against the *configured* bounds, never asserting a baseline is optimal.

**4.13 Tick pipeline.** Restructured so the §20.72 phases are explicit and
ordered in one function. Corrections: age now advances before the death check;
reproduction cost is applied at phase 11 rather than folded into child creation;
the parent-ID ordering of births is explicit; food regeneration receives the
fertility field and capacity; telemetry death counts are computed from the
actual death pass rather than inferred by array subtraction; and initial food
placement moved from CanonicalRNG to BootstrapRNG, where initialization belongs.

**4.14 Snapshot purity (found during correction).** `stepWorld` previously
mutated the caller's organism objects in place, so a `WorldState` was silently
corrupted by stepping forward from it and could not be replayed. The Snapshot
phase now clones runtime state, so resolution writes only to fresh objects and
an earlier world remains valid. This is what makes the restored-state
continuation test meaningful.

**4.15 Mutation RNG isolation (§15.7).** The previous implementation had a
disabled mutation channel consume zero RNG draws, which violated §15.7:
toggling one channel shifted the other channel's draw positions on the shared
CanonicalRNG stream. This is corrected: a disabled channel now executes its
full draw schedule (consuming the same RNG draws it would consume if enabled),
then discards the mutated values and returns an exact parent clone. This makes
RNG consumption invariant to the mutation enable flags, satisfying §15.7
within §18.70's two-stream architecture — no additional persistent RNG streams
were added. Nine new tests prove: (1) toggling morphology ON/OFF does not
change neural child values, (2) toggling neural ON/OFF does not change
morphology child values, (3) all four flag combinations produce identical
offspring placement, heading and final CanonicalRNG state, (4) disabled
channels return exact parent values, and (5) enabled channels still produce
mutated values.

The golden 10,000-tick hash (`6a6576bd49e86b27`) is unchanged because the
default configuration has both channels ON — the early-return path that was
removed was never reached during the golden run.

---

## 5. Baseline values in force

All are `[BASELINE]` or `[OPEN — EMPIRICAL]` placeholders from Spec v4. None is
scientifically validated.

| Parameter | Value | Source |
|-----------|-------|--------|
| world size | 500 × 500 | derived (see limitation 8.1) |
| initial population | 25 | §14.4, §21.3 |
| hidden layer | 8 neurons | §11.18 |
| neural param bounds | `[-2, +2]` | §11.30 |
| founder `initSigma` | 0.8 | §13.76 |
| `maxFounderAttempts` | 2000 | §13.76 (see limitation 8.2) |
| size bounds | `[0.5, 1.5]` | §10.4 |
| maxSpeed bounds | `[0.5, 2.0]` | §10.4 |
| visionRange bounds | `[50, 250]` | §10.4 |
| visionAngle bounds | `[30°, 180°]` | §10.4 |
| metabolism bounds | `[0.5, 1.5]` | §10.4 |
| `maturityAge` | 500 ticks | §8.23, §12.36 |
| `maxAge` | 3000 ticks | §8.24, §12.30 |
| `energyCapacity` | 100 | §12.2 |
| `configuredInitialEnergy` | 50 | §12.3 |
| `baseMetabolicConstant` | 0.02 | §12.6 |
| `movementEnergyCoefficient` | 0.06 | §12.59 sanity calculation |
| `foodEnergyValue` | 25 | §12.13, §12.11 |
| `reproductionEnergyThreshold` | 75 | §12.37 (70–80% of capacity) |
| `reproductionCost` | 45 | §12.40 (40–50% of capacity) |
| `birthEnergy` | 25 | §12.41 |
| `worldFoodCapacity` | 60 | §12.19 |
| `initialFoodCount` | 50 | §12.20 |
| `regenAttemptsPerTick` | 2 | §12.21 |
| `feedingRange` | 5 | §12.15 |
| morphology mutation rate | 0.10 per gene | §10.30, §13.8 |
| neural mutation rate | 0.05 per parameter | §11.29, §13.10 |
| morphology mutation sigma | 0.05 × gene range | §10.31, §13.9 |
| neural mutation sigma | 0.05 | §11.29 |
| `maxTurnRate` | π/6 rad/tick | §11.59 |
| `eatThreshold` / `reproductionActionThreshold` | 0.5 / 0.5 | §11.59 (magnitudes open) |
| `maxOffspringOffset` | 10 | §20.72, §12.46 |
| fertility grid / floor | 8 × 8 lattice, min 0.05 | §12.22 |

`baseMetabolicConstant = 0.02` with `movementEnergyCoefficient = 0.06` gives a
size-1.0, metabolism-1.0 organism moving at velocity 1.0 a total cost of
0.08/tick, i.e. ≈625 ticks of survival from 50 energy — matching §12.59's own
sanity calculation and inside §12.11's 500–700 tick target.

---

## 6. Tests executed

`npm test` → **13 files, 168 tests, all passing**, ~2 s wall clock.

| File | Tests |
|------|-------|
| `rng.test.ts` | 13 |
| `neural.test.ts` | 5 |
| `perception.test.ts` | 13 |
| `founder.test.ts` | 18 |
| `bootstrap.test.ts` | 5 |
| `mutation.test.ts` | 24 |
| `movement.test.ts` | 11 |
| `death.test.ts` | 9 |
| `reproduction.test.ts` | 17 |
| `food.test.ts` | 20 |
| `tickOrder.test.ts` | 8 |
| `determinism.test.ts` | 14 |
| `invariants.test.ts` | 11 |

All twelve §15.9 minimum tests are covered, as is the §15.5 determinism
regression. No test was deleted, weakened, or skipped to obtain a green result;
the four failures encountered during the pass were all genuine defects
(including 4.14) and were fixed in the implementation or in a test fixture that
had itself been wrong.

---

## 7. Deterministic smoke test

Documented test seed **20260910**, 10,000 ticks, shipped default configuration,
executed twice in independent Node processes.

| | Run A | Run B |
|---|---|---|
| seed | 20260910 | 20260910 |
| ticks | 10,000 | 10,000 |
| starting population | 25 | 25 |
| ending population | 0 | 0 |
| births | 10 | 10 |
| deaths | 35 | 35 |
| ending food count | 60 | 60 |
| **final canonical hash** | **`6a6576bd49e86b27`** | **`6a6576bd49e86b27`** |
| wall clock | 235 ms | 230 ms |

The hashes match exactly. This is a technical reproducibility check, not
ecological validation.

**Population trajectory across seeds 1–10** (10,000 ticks each), reported rather
than tuned:

| seed | births | deaths | peak pop | end pop | extinct at |
|------|--------|--------|----------|---------|------------|
| 1 | 3 | 28 | 26 | 0 | 2517 |
| 2 | 36 | 61 | 41 | 0 | 6053 |
| 3 | 4 | 29 | 26 | 0 | 2669 |
| 4 | 35 | 50 | 38 | **10** | — survived |
| 5 | 91 | 116 | 55 | 0 | 7978 |
| 6 | 3 | 28 | 28 | 0 | 2446 |
| 7 | 14 | 39 | 31 | 0 | 7857 |
| 8 | 6 | 31 | 30 | 0 | 3746 |
| 9 | 10 | 35 | 33 | 0 | 3000 |
| 10 | 20 | 45 | 33 | 0 | 7960 |

Nine of ten seeds go extinct; one survives the full horizon with lineages eight
generations deep (`maxGenerationDepth = 8`, all descending from the 25 bootstrap
lineage roots). Food sits at capacity in every run, confirming the cap and the
regeneration path both operate. Seed 9's extinction at exactly tick 3000 is
`maxAge` acting on a founder cohort that all share `birthTick = 0` — correct
behaviour, not a bug.

**This is an uncalibrated energy economy and is left uncalibrated.** Adjusting
`foodEnergyValue`, `regenAttemptsPerTick`, `worldFoodCapacity`, world size or
the action thresholds until the population curve looks healthy is precisely the
ad-hoc tuning Spec §14.24 and §16 forbid outside the Phase 0B protocol.

---

## 8. Known Phase 0A limitations

**8.1 World size is derived, not specified.** Spec v4 fixes gene bounds and food
counts but never states world dimensions. 500 × 500 was chosen once, from
§10.4's visionRange range and §12.19's "2–3 visible food entities per initial
organism" hint, and documented in `defaults.ts`. It is a first-order Phase 0B
calibration target.

**8.2 The founder viability gate has a low pass rate.** Measured over 20,000
random candidates at the shipped fixtures, a Gaussian-random controller clears
all five checks about **0.74%** of the time; check (c) alone passes ~3.9%,
(d) ~50%, (e) ~51%, (b) ~69%. §13.76 suggests `maxFounderAttempts = 5`, which
would fail on essentially every seed, so the baseline is set to 2000 (leaving
roughly a 3 × 10⁻⁷ chance of exhausting the budget). This is a *retry* budget
only — candidates are still accepted first-pass-wins and are never compared,
ranked or scored — so the no-cherry-picking guarantee is intact. Whether the
probe fixtures or `initSigma` should be revisited is a Phase 0B question.

**8.3 (Resolved.)** Mutation RNG isolation (§15.7) is now satisfied within
§18.70's two-stream architecture — see §4.15. A disabled channel consumes its
full draw schedule so that toggling one channel does not perturb the other's
draw positions. No additional persistent RNG streams were added.

**8.4 Perception is O(organisms × food) per tick.** No spatial index. At the
Phase 0A scale (tens of organisms, tens of food items) a 10,000-tick run takes
~230 ms, comfortably inside §21.4's 100 ms-per-tick budget. Performance work is
profile-driven (§21.2); no index is warranted yet.

**8.5 Placement minimum separation is best-effort.** `placeWithMinSeparation`
uses a fixed attempt budget and falls back deterministically to the best
candidate seen, per §13.76. Occasional violations of `minSep` are therefore
expected and permitted; the test asserts they are rare rather than absent.

**8.6 The canonical hash is a 64-bit non-cryptographic fingerprint.** Adequate
for regression comparison; not collision-resistant against an adversary. The
full canonical string is available via `canonicalStateString()` when an exact
comparison is required, and the determinism tests compare both.

**8.7 No persistence.** `WorldState` is fully serializable (the smoke test
round-trips it through JSON) but there is no snapshot format, rotation,
validation or recovery. That is Phase 0C.

**8.8 Turning is energetically free.** Spec v4 defines a movement cost only for
forward displacement, so a pure-rotation tick costs basal metabolism alone. This
follows the specification; it is noted because it is a plausible calibration
finding for Phase 0B.

---

## 9. Phase 0A definition of done

| Condition | Status |
|-----------|--------|
| repository clean and runnable | ✅ |
| `packages/simulation-core` exists, no UI/server/DB deps | ✅ |
| build succeeds | ✅ |
| tests pass | ✅ 159/159 |
| deterministic RNG (xoshiro128\*\*, two isolated streams, serializable) | ✅ |
| deterministic bootstrap | ✅ |
| fixed sensory contract (§11.58, six inputs) | ✅ |
| neural controller (§11.59, pure, RNG-free) | ✅ |
| ActionIntent separation | ✅ |
| movement and energy | ✅ actual-velocity², size-scaled, basal separate |
| food and fertility mechanics | ✅ static seeded field, capacity cap |
| maturity | ✅ |
| reproduction | ✅ cost/birth-energy accounting enforced |
| mutation toggles work independently | ✅ all four combinations tested |
| mutation RNG isolation (§15.7) | ✅ toggling one channel does not perturb the other's draw sequence |
| lineage | ✅ id, parentId, generationDepth, lineageRootId, birthTick |
| starvation and max-age death | ✅ single combined pass |
| newborn-next-tick rule | ✅ |
| canonical tick ordering (§20.72) | ✅ |
| deterministic food conflicts | ✅ distance, then ID; array-order independent |
| food capacity | ✅ |
| headless N-tick execution | ✅ `runTicks` / `runSimulation` / CLI |
| canonical state hashing | ✅ |
| same-seed replay produces identical hashes | ✅ `6a6576bd49e86b27` twice (unchanged after §4.15 fix) |
| README exists | ✅ |
| implementation report reflects final code | ✅ this document |

**Phase 0A is complete. Phase 0B has not been started.**
