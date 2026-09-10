# Phase 0B Pilot Report

**Status: pilot evidence only. No configuration has been frozen. The held-out
validation seeds are untouched.**

Every number in this report was read from the persisted result files under
`packages/experiment-harness/results/` — `condition-summary.csv`,
`replicates.json` and the sampled `timeseries-*.csv` — not from console or chat
output. Where a figure is derived (peak population, outcome classification), the
derivation is stated.

Provenance common to every run below:

```
simulationVersion         0A.1.0
experimentHarnessVersion  0B.1.0
gitCommit                 a568d016a80cbf787def01bc1d2706e3472a93b3
seed set                  pilot (15 seeds; sweep uses the first 8)
```

---

## 1. What this report can and cannot say

It can report, at pilot level:

- the simulation substrate runs deterministically across seeds and conditions;
- the diagnostic interventions do what they claim;
- inheritance and both mutation channels operate under configuration control;
- treatment conditions can produce different replicated outcomes;
- candidate ecological regimes can be explored systematically.

It cannot say, and does not:

- that any population adapted;
- that intelligence increased;
- that neural mutation is beneficial or morphology mutation harmful;
- that any tested configuration is a viable baseline.

Fifteen pilot seeds under a configuration that has not been frozen cannot
support a confirmatory claim (§16.20, §16.28).

---

## 2. Diagnostics A–D

All four use the 15 pilot seeds. A and B run to 5,000 and 10,000 ticks
respectively; C and D to 10,000.

| Diagnostic | Replicates | Extinction rate | Median extinction tick | Total births | Max generation depth | Mean final population |
|---|---:|---:|---:|---:|---:|---:|
| A — starvation | 15 | 100% | 1066 | 0 | 0 | 0.00 |
| B — feeding | 15 | 100% | 3000 | 0 | 0 | 0.00 |
| C — reproduction, no mutation | 15 | 66.67% | 3228.5 | 4337 | 13 | 57.53 |
| D — full evolutionary loop | 15 | 60% | 3000 | 4904 | 14 | 73.13 |

Source: each experiment's `condition-summary.csv`.

### A — starvation: the intervention holds

`food.initialFoodCount = 0`, `food.regenAttemptsPerTick = 0`, both mutation
channels OFF, `reproductionEnergyThreshold = energyCapacity + 1` (a finite
value, not a non-finite sentinel).

Across all 15 replicates: **0 births**, food count 0 at tick 0 and 0 at the end,
100% extinction. Extinction ticks span 485–1662, median 1066.

This is the intended Stage A behaviour. It sits **above** the §16.8 / §16.10
analytical target of 500–700 ticks, which assumes a baseline organism "using
normal movement" spending on the order of 0.08/tick (50 / 0.08 ≈ 625). Observed
lifetimes are 485–1662 with a median of 1066.

The likely reason is that movement energy is charged on *actual resolved*
movement: an organism whose founder controller requests little forward motion
pays close to the basal 0.02/tick, which alone would support roughly 2,500
ticks. The observed range is therefore consistent with founder controllers
moving less, on average, than the "normal movement" the estimate assumes — not
with an energy-model error. §16.9 provides for test-only fixed-speed movement
policies (stationary / 25% / 50% / 100%) precisely to separate these two
explanations; those policies are **not implemented**, so this remains an
inference rather than a measurement.

### B — feeding: food active, reproduction still unreachable

Food left at the **default configuration** — `initialFoodCount = 50`,
`worldFoodCapacity = 60`, `regenAttemptsPerTick = 2` — both mutation channels
OFF, `reproductionEnergyThreshold = energyCapacity + 1`.

Across all 15 replicates: **0 births**. Food count is 50 at tick 0 and 60 at the
end of every replicate, so the resource system is regenerating to capacity
rather than being exhausted.

Extinction ticks: 3000 in 13 of 15 replicates, plus one at 1062 and one at 2931.
`maxAge` is 3000, so most cohorts feed well enough to reach the age ceiling
rather than starving; two seeds still lose their whole cohort earlier. Median
survival roughly triples relative to Diagnostic A (1066 → 3000).

Mechanism demonstrated: organisms detect, reach and consume food, and food
energy is large enough to change survival. This does not measure how
*efficiently* they forage.

### C — reproduction without mutation

Food ON, reproduction ON, both mutation channels OFF; every offspring inherits
its parent's morphology and neural genome exactly (§16.17).

10 of 15 replicates go extinct (extinction ticks 1062–7426, median 3228.5);
5 reach 10,000 ticks with final populations 109, 120, 134, 181, 319. Births per
replicate range from 0 to 1575 — five replicates produced 3 or fewer births,
five produced 400+. Maximum generation depth 13.

### D — full evolutionary loop

The default configuration: food ON, reproduction ON, both mutation channels ON.

9 of 15 replicates go extinct (extinction ticks 1062–5694, median 3000);
6 reach 10,000 ticks with final populations 43, 129, 136, 149, 286, 354. Births
per replicate 0–1675. Maximum generation depth 14.

The complete substrate — sensing, movement, feeding, reproduction, inheritance,
mutation, death — runs end to end for 10,000 ticks across 15 independent seeds
without invalid state. That is a mechanism result, not an evolutionary one
(§16.20).

---

## 3. The 2×2 mutation factorial

Four conditions, same 15 paired pilot seeds, 10,000 ticks, differing only in the
two mutation enable flags. `control` is identical to Diagnostic C and `combined`
identical to Diagnostic D.

| Condition | Morph | Neural | Extinction rate | Mean final population | Total births | Mean births/replicate | Max generation |
|---|---:|---:|---:|---:|---:|---:|---:|
| control | OFF | OFF | 66.67% | 57.53 | 4337 | 289.1 | 13 |
| morph-only | ON | OFF | 60% | 52.40 | 4392 | 292.8 | 13 |
| neural-only | OFF | ON | 60% | 80.80 | 5775 | 385.0 | 15 |
| combined | ON | ON | 60% | 73.13 | 4904 | 326.9 | 14 |

Source: `results/mutation-2x2/condition-summary.csv` and `replicates.json`.

**No condition is a winner and none should be treated as one.** Three
observations make that concrete:

1. **The distributions are bimodal, not centred.** In every condition, 9 or 10
   of the 15 replicates end at population 0 and the remainder end in the
   hundreds. `control` ending populations are
   `[0 x 10, 109, 120, 134, 181, 319]`; `neural-only` are
   `[0 x 9, 125, 158, 171, 199, 251, 308]`. A "mean final population" over such
   a set describes neither mode.
2. **The differences are small relative to that spread.** The 23-point mean-
   population gap between `neural-only` and `control` is dwarfed by the
   0-to-319 spread inside a single condition.
3. **The largest mean is the least ecologically viable.** Applying the §14.29
   runaway cap (200 at initial population 25) to the peak population of every
   replicate:

| Condition | Extinct | Runaway | Viable completion | Viable rate |
|---|---:|---:|---:|---:|
| control | 10 | 1 | 4 | 26.7% |
| morph-only | 9 | 1 | 5 | 33.3% |
| neural-only | 9 | 3 | 3 | 20.0% |
| combined | 9 | 2 | 4 | 26.7% |

`neural-only`'s larger mean population is partly *more runaway*, not more
viability. Ranking conditions by final population would have inverted the
ecological reading.

Derivation: peak population per replicate is recovered from the sampled
`timeseries-<condition>.csv` files (the runs predate cap enforcement), then
classified by `classifyRunOutcome`. Sampling means each recovered peak is a
lower bound, so these runaway counts are conservative.

What the 2×2 does support: the four conditions execute, differ only in the
intended flags, and produce different replicated outcomes. Whether either
mutation channel is beneficial is not answerable from this data.

---

## 4. Calibration sweep `calibration-v1`

12 configurations x the first 8 pilot seeds = 96 replicates, 10,000 ticks each:

```
food.regenAttemptsPerTick : [2, 4, 6]
energy.foodEnergyValue    : [25, 40]
energy.reproductionCost   : [35, 45]
```

### 4.1 What the precommitted criteria say

`DEFAULT_CALIBRATION_CRITERIA` (extinction rate <= 0.8, mean births >= 3, mean
final population <= 500, mean max generation depth >= 1, median extinction tick
>= 1000) passes **11 of 12** configurations. The single failure is
`regenAttemptsPerTick = 4, foodEnergyValue = 40, reproductionCost = 35`, whose
mean final population of 548.6 exceeds the runaway-mean threshold.

A filter that admits 11 of 12 candidates does not select among them. It is a
screen, and on this sweep it barely discriminates.

### 4.2 What the outcome classification says

Reclassifying the same persisted replicates by §14.29 / §16.35 — reproducible
with `npm run experiment -- calibration-report`:

| regen | foodEnergy | reproCost | n | Extinct | Runaway | Viable | Viable rate |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | 25 | 35 | 8 | 5 | 2 | 1 | 12.5% |
| 2 | 25 | 45 | 8 | 4 | 1 | 3 | 37.5% |
| 2 | 40 | 35 | 8 | 5 | 3 | 0 | 0.0% |
| 2 | 40 | 45 | 8 | 5 | 3 | 0 | 0.0% |
| 4 | 25 | 35 | 8 | 5 | 3 | 0 | 0.0% |
| 4 | 25 | 45 | 8 | 5 | 2 | 1 | 12.5% |
| 4 | 40 | 35 | 8 | 4 | 4 | 0 | 0.0% |
| 4 | 40 | 45 | 8 | 4 | 3 | 1 | 12.5% |
| 6 | 25 | 35 | 8 | 5 | 2 | 1 | 12.5% |
| 6 | 25 | 45 | 8 | 5 | 2 | 1 | 12.5% |
| 6 | 40 | 35 | 8 | 5 | 3 | 0 | 0.0% |
| 6 | 40 | 45 | 8 | 4 | 3 | 1 | 12.5% |

The §16.35 [BASELINE] gate is roughly 70% viable completion. The best
configuration observed reaches **37.5%** (3 of 8), and **8 of 12
configurations have zero viable replicates**. Every configuration is bimodal:
between 4 and 5 replicates go extinct and most of the survivors cross the
runaway cap.

### 4.3 A visible timescale signature

Across the sweep, extinction ticks fall into two clusters plus a tail: an early
group near 1060–1620, a pronounced group at 2900–3140 — around `maxAge` = 3000 —
and scattered later extinctions between roughly 3500 and 8950. Every one of the
12 configurations contains at least one extinction in the 2900–3140 band.

This pattern is consistent with §14.22's "poor timescale alignment": the founder
cohort ages out at a fixed ceiling, and a run's fate largely turns on whether
enough offspring were produced and matured before that ceiling arrives.
`maturityAge` is 500 and `maxAge` is 3000, giving a founder a 2,500-tick
reproductive window.

This is a **hypothesis for the next pilot experiment, not a finding.** The sweep
varied food and reproduction cost only; it did not vary any lifecycle parameter,
so nothing here isolates the lifecycle as the cause.

---

## 5. Calibration decision

**No defensible candidate baseline can be selected from the current pilot
evidence. No configuration has been frozen. The validation seeds have not been
consumed.**

Reasons, in order of weight:

1. **No configuration meets the ecological viability gate.** §16.35's baseline
   is roughly 70% viable completion; the best observed is 37.5%, and two thirds
   of the sweep has none at all. §16.18 defines ecological viability as
   sustained non-degenerate dynamics; every tested configuration sits between
   two degeneracies — early extinction and runaway growth — rather than between
   them.
2. **The precommitted criteria do not discriminate.** 11 of 12 configurations
   pass. Selecting one anyway would require a rule invented after seeing the
   data, which is exactly the post-hoc selection §14.27 and §16.28 exclude.
3. **Selecting on population size would be actively wrong here.** The
   largest-population configurations are the ones dominated by runaway
   replicates, and in the 2×2 the largest-mean condition has the lowest viable
   rate.
4. **The evidence base is thin and highly variable.** Eight seeds per
   configuration, with 4–5 extinctions in each, gives very few informative
   replicates. §16.33 makes sample size conditional on observed variance, and
   the observed variance is large.
5. **The horizon does not match the validation horizon.** All runs are 10,000
   ticks; §14.28 and §16.34 set the [BASELINE] validation duration at
   approximately 20,000. Viable completion at the target horizon is unmeasured,
   and the 3000-tick extinction cluster means a 10,000-tick run may not even
   reach the regime that matters.

Freezing a baseline on this evidence and then spending the 25 held-out seeds on
it would consume the project's only confirmatory resource on a configuration
that pilot data already indicates is not viable. The seeds stay held out.

---

## 6. Smallest next pilot experiment

One experiment, one subsystem, following §14.24 and §16.26.

**`calibration-v2` — lifecycle timescale alignment.**

Rationale: the sweep varied the energy/food/reproduction triple across 12 points
and moved the viable rate by at most 37.5 points from zero, while every
configuration showed the same extinction signature at `maxAge`. The parameter
family that the diagnosis implicates and that `calibration-v1` never touched is
the lifecycle timescale.

Proposed definition:

```
lifecycle.maturityAge : [300, 500]
lifecycle.maxAge      : [3000, 6000, 10000]
```

- 6 configurations, all other parameters at the Phase 0A defaults.
- Pilot seeds only. Use all 15, not 8 — the bimodality above shows 8 is too few.
- **20,000 ticks** per replicate, matching the §14.28 / §16.34 validation
  horizon, so viable completion is measured where it will be gated.
- Runaway cap enforced (now the default), so explosive runs terminate and are
  labelled instead of inflating means.
- 90 replicates total.

Primary readout, precommitted before running: **viable completion rate per
configuration**, with extinction and runaway counts reported alongside. Mean
final population is descriptive only and is not a selection criterion.

Decision rule, precommitted:

- If one or more configurations reach roughly 70% viable completion, select the
  one with the highest viable rate, breaking ties by the smaller departure from
  the Phase 0A defaults; freeze it as `Phase0Baseline_v1` with its full
  parameter set, thresholds and analysis plan recorded in `PROJECT_STATUS.md`;
  only then run the 2×2 on the validation seeds, once.
- If none does, report that, diagnose the next implicated subsystem, and define
  `calibration-v3`. Do not lower the gate to make a candidate pass.

This costs 90 replicates and consumes no validation seeds.

---

## 7. Diagnostic A2 — test-only fixed movement policies (§16.9)

**Precommitted before execution.** This section was written and committed
before the experiment was run; the results subsection was empty at that point.

### 7.1 The question

§2 recorded an open uncertainty: Diagnostic A's starvation lifetimes (485–1662,
median 1066) sit above the §16.8 / §16.10 analytical target of 500–700 ticks.
Two explanations were left standing:

1. the founder/neural controllers request little movement, so organisms pay far
   less movement energy than the §16.10 estimate assumes; or
2. the basal/movement energy calibration is itself wrong.

§16.9 provides the instrument for separating them, and §16.9 is [LOCKED]:
"Test-only movement policies may be used to isolate the EnergyModel without
altering canonical organism behavior."

### 7.2 Design

Five conditions over the same 15 pilot seeds, differing only in the neural
controller:

| Condition | Controller |
|---|---|
| `neural-reference` | the unmodified founder/bootstrap controllers |
| `stationary` | fixed policy, 0% of `maxSpeed` |
| `speed-25` | fixed policy, 25% of `maxSpeed` |
| `speed-50` | fixed policy, 50% of `maxSpeed` |
| `speed-100` | fixed policy, 100% of `maxSpeed` |

The four levels are taken verbatim from §16.9 ("Stationary Agent, Constant 25%
Speed Agent, Constant 50% Speed Agent, Constant 100% Speed Agent"), so no level
had to be invented.

Configuration, identical in all five conditions and precommitted:

- food **completely** off — `initialFoodCount = 0` **and**
  `regenAttemptsPerTick = 0`
- both mutation channels off
- reproduction unreachable — `reproductionEnergyThreshold = energyCapacity + 1`
  (finite, per the Diagnostic A/B convention)
- `lifecycle.maxAge` raised to 100,000 so `ENERGY_DEPLETION` is the only death
  mechanism; age death would truncate the slower policies and corrupt the
  measurement. Diagnostic A's longest lifetime was 1662 ticks, well under the
  default `maxAge` of 3000, so the reference cell is unaffected by this and
  stays comparable to Diagnostic A.
- the energy parameters under test — `baseMetabolicConstant`,
  `movementEnergyCoefficient`, `configuredInitialEnergy` — are **not** touched
- 20,000 max ticks, metrics sampled every 50 ticks, pilot seeds only

No simulation-core code is changed. A policy is an ordinary `NeuralGenome`
whose input→hidden weights are all zero — making the controller provably
input-independent — with output biases and hidden→output weights chosen so the
[LOCKED] §11.59 mapping yields the target constant action. Every parameter stays
inside the [BASELINE] `neuralParamBounds` of [-2, 2]. The genome is installed
once between `bootstrapWorld` and tick 1, replacing only the neural genome and
leaving morphology, position, heading, energy, ids, food, the fertility field
and both RNG stream states byte-identical.

Two consequences of the locked rules are documented rather than hidden:

- `forward` is a sigmoid, so exactly 0.0 and exactly 1.0 are unreachable. Within
  bounds the endpoints attain ≈2.7e-8 and ≈1 − 2.7e-8. The "stationary" agent
  therefore requests ~3.4e-8 units/tick and pays ~7e-17 energy for it — twelve
  orders of magnitude below basal metabolism, and asserted by test.
- Every policy also requests a **full-rate turn**. A zero-turn agent travels in
  a straight line, reaches the perimeter, is clamped to zero displacement by
  `resolveMovement`, and from then on pays only basal — its drain would decay to
  basal and the four levels would converge, measuring nothing. Turning costs no
  energy and does not change displacement magnitude, so a full-rate turn makes
  each agent orbit a regular polygon of circumradius ≈2.4 units at full speed,
  far inside the 10-unit minimum boundary separation, and displacement per tick
  stays exactly the requested speed for the whole run. A test demonstrates the
  zero-turn failure mode explicitly, so this design choice is evidenced rather
  than asserted.

### 7.3 Precommitted metrics and decision rule

Primary measurement: **mean energy drain per tick**, read as
`(meanEnergy@0 − meanEnergy@window) / window` over the largest death-free
sampled window no longer than 200 ticks, so the mean is always taken over an
unchanging set of organisms. The window used is reported per condition.

Each condition's measured drain is compared against the drain the **specified**
energy model predicts for that condition, using each replicate's own tick-0 mean
morphology:

```
predicted drain = metabolism * baseMetabolicConstant
                + movementEnergyCoefficient * size * (fraction * maxSpeed)^2
predicted lifetime = configuredInitialEnergy / predicted drain
```

Secondary measurement: observed lifetime (extinction tick) against predicted
lifetime.

For the reference cell, the same model is **inverted** on its measured drain to
express the controllers' energy expenditure as an implied constant speed
fraction. This is a root-mean-square summary of expenditure across the
population, not a claim about what any individual organism requested.

Decision rule, fixed before running:

- **Controller effect** if the four fixed policies each match their predicted
  drain within ±10%, and the reference cell's implied speed is materially below
  100%. The energy model is then behaving as specified and the §16.8 target of
  500–700 ticks is simply the prediction for a near-full-speed organism.
- **Energy-model effect** if the fixed policies do *not* match their
  predictions — the model as implemented would then differ from the model as
  specified, independently of any controller.
- **Mixed** if the policies match but the reference cell's lifetime cannot be
  reconciled with its own measured drain.
- **Inconclusive** if the measurement window is not death-free or the spread
  across seeds swamps the differences between policies.

### 7.4 Results

_Pending execution._

---

## 8. Functional neural probes

`probe-set-v1` (250 fixed synthetic §11.58 sensory states) and
`behavior-fingerprint-v1` are implemented and tested, satisfying the §11.37–
§11.41 and §14.31 requirement that functional neural comparison be available
offline, deterministically and without side effects.

**No probe or fingerprint result is reported here.** The framework exists and
its properties are verified by test — determinism, purity, version pinning — but
it has not yet been applied to organisms from any experiment, and doing so
before a baseline configuration is frozen would produce fingerprint
distributions for a regime the project has no intention of keeping.

Applying probes to sampled living organisms during a run (§11.42–§11.43,
§14.32) requires a seeded sampling sub-stream and a cadence, and is not
implemented. That is a Phase 0B analytics extension, not a gap in mechanism
validation.

---

## 9. Summary of claims

| Claim | Supported? | Evidence |
|---|---|---|
| The substrate runs deterministically across seeds and conditions | Yes | 192 → 218 passing tests; identical replicate hashes; golden hash `6a6576bd49e86b27` |
| Diagnostic interventions do what they claim | Yes | 0 births in A and B across 15 replicates each; food 0 throughout A |
| Organisms detect, reach and consume food | Yes | Diagnostic B: median survival 1066 → 3000 ticks with food active |
| Inheritance and both mutation channels operate under configuration control | Yes | 2×2 executes; conditions differ only in the two flags; RNG isolation tested |
| Treatment conditions can produce different replicated outcomes | Yes | 2×2 condition summaries differ |
| Some tested configuration is ecologically viable | **No** | best viable completion 37.5%, gate ~70% |
| Neural mutation is beneficial | **No** | bimodal distributions; largest mean has lowest viable rate |
| Morphology mutation is harmful | **No** | differences are inside the within-condition spread |
| The population adapted / intelligence increased | **No** | no confirmatory design has been run; no probe data collected |
