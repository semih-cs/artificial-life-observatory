# Phase 0B Pilot Report

**Status: pilot evidence only. No configuration has been frozen. The held-out
validation seeds are untouched.**

> **Model scope.** Sections 1–11 describe the historical **single-founder**
> model (`simulationVersion 0A.1.0`). §12 records the adopted amendment to
> multi-founder initialization (`0A.2.0`). §14 is the first `0A.2.0` result:
> the multi-founder default baseline. §15 is the `0A.2.0` food-limitation
> diagnostic (precommitted design and result: INCONCLUSIVE). §16 is the design
> of the trajectory-based outcome classifier v2; §17 its implementation and the
> read-only reclassification of persisted runs; §18 the continuation that
> completes the 15-seed `0A.2.0` default profile under v2. Every classification
> in §§2–15 is a v1 (peak ≥ 200) result and stays as recorded. Results from the two models are separate
> evidence bases and must not be pooled — see §12.1 and §14.4.

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

**This discrepancy is now resolved and is a controller effect, not an
energy-model effect.** §7 reports the §16.9 fixed-movement-policy diagnostic:
across 60 replicates at four fixed speeds, measured energy drain matches the
closed-form prediction of the specified model to within 0.06%, and the founder
controllers are measured to spend energy like an organism moving at 65.7% of
`maxSpeed`. The §16.8 target band corresponds to v = 1.0, i.e. 80% of the
default `maxSpeed` of 1.25; founders move slower than that, which is exactly why
they live longer. No energy parameter needs changing on this evidence.

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

> **Revised after the §7 movement-policy diagnostic.** An earlier version of
> this section proposed sweeping `lifecycle.maturityAge` x `lifecycle.maxAge`.
> §7 measured the energy budget directly and, together with a closer reading of
> what `calibration-v1` actually varied, points at a different pair of axes. The
> superseded proposal and the reason it changed are kept in §6.3 so the
> reasoning is auditable.

### 6.1 What the evidence now says

Three findings constrain the choice:

1. **The energy model is correct, so energy coefficients are not candidates.**
   §7 verifies basal, movement and speed mapping against closed-form
   predictions at four speeds. Changing `baseMetabolicConstant`,
   `movementEnergyCoefficient` or `configuredInitialEnergy` would be tuning a
   subsystem that has just been shown to behave as specified — precisely what
   §16.26 rules out.

2. **The measured energy budget sets a hard feeding requirement.** Founder
   controllers drain 0.0607/tick. At `foodEnergyValue` = 25, an organism must
   eat once every 25 / 0.0607 ≈ **412 ticks merely to break even**, and more
   often than that to accumulate toward the reproduction threshold of 75. Over
   the 500-tick `maturityAge` window a founder spends about 30 energy, so it
   needs roughly 1.2 food items just to reach maturity alive and about 2.2 to
   reach the reproduction threshold. This is a quantitative target that did not
   exist before §7.

3. **`calibration-v1` never varied standing food density.** The sweep moved
   `regenAttemptsPerTick` across [2, 4, 6], but `worldFoodCapacity` stayed at 60
   in all 12 cells. Regeneration only refills *toward* the cap, so the sweep
   varied refill speed against a fixed standing stock. Two observations confirm
   the cap, not the refill rate, was binding: viable-completion rate shows no
   trend across the three regeneration levels (§4.2), and in Diagnostic B the
   ending food count was exactly 60 — the cap — in all 15 replicates, so food
   supply was never depleted. Raising regeneration cannot help when the world is
   already sitting at capacity.

### 6.2 Proposed `calibration-v2`

**Axes — standing food density x reproductive window:**

```
food.worldFoodCapacity : [60, 120, 240]
lifecycle.maturityAge  : [300, 500]
```

- `worldFoodCapacity` is the parameter that sets standing food density and
  therefore encounter rate, which finding 3 shows was held constant through the
  entire first sweep. 60 is the current baseline; 120 and 240 raise mean food
  density from 1 item per 4,167 world units² to 1 per 2,083 and 1 per 1,042.
- `maturityAge` is the reproductive window measured against finding 2: at 500
  ticks a founder must survive 61% of its no-food lifetime and acquire roughly
  two food items before it can reproduce at all. 300 tests whether that window
  is the binding constraint.

Held fixed, deliberately: `lifecycle.maxAge` stays at the default 3000 so that
cohort turnover happens at the same time in every cell while the *rates* change,
and all energy parameters stay at their verified defaults.

**Execution, precommitted:**

- 6 configurations, all 15 pilot seeds, **20,000 ticks** (the §14.28 / §16.34
  baseline validation horizon, which `calibration-v1` did not use), runaway cap
  enforced. 90 replicates.
- Primary readout: **viable completion rate** per configuration, with extinction
  and runaway counts reported alongside. Mean final population is descriptive
  only and is not a selection criterion.

**Decision rule, precommitted:**

- If one or more configurations reach roughly 70% viable completion, select the
  highest viable rate, breaking ties by the smaller departure from the Phase 0A
  defaults; freeze it as `Phase0Baseline_v1` with its full parameter set,
  thresholds and analysis plan recorded in `PROJECT_STATUS.md`; only then run
  the 2×2 once on the validation seeds, and never retune on those results.
- If none does, report that, diagnose the next implicated subsystem, and define
  `calibration-v3`. Do not lower the gate to manufacture a candidate.

This costs 90 replicates and consumes no validation seeds.

### 6.3 Superseded proposal

The earlier proposal was `lifecycle.maturityAge: [300, 500]` x
`lifecycle.maxAge: [3000, 6000, 10000]`, motivated by the extinction cluster at
`maxAge` = 3000 described in §4.3.

`maturityAge` survives into §6.2 because §7 gave it a quantitative
justification. `maxAge` was dropped: raising it postpones cohort turnover
without changing the feeding and reproduction *rates* that determine whether a
population is self-sustaining when turnover arrives. It remains a reasonable
`calibration-v3` axis if v2 shows the rates are adequate but the cliff still
ends runs.

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

15 pilot seeds per condition, 75 replicates, 20,000 max ticks. Every replicate
in every condition ended in extinction with 0 births and 0 food, as designed.
Source: `results/diagnostic-movement-policy/`.

| Condition | Window | Measured drain/tick | Predicted drain/tick | Meas/Pred | Median lifetime | Predicted lifetime | Implied speed |
|---|---:|---:|---:|---:|---:|---:|---:|
| `neural-reference` | 200 | 0.060739 | — | — | 1066 | — | 65.7% |
| `stationary` | 200 | 0.020000 | 0.020000 | 1.0000 | 2548 | 2500.0 | 0.0% |
| `speed-25` | 200 | 0.025851 | 0.025851 | 1.0000 | 1972 | 1934.2 | 25.0% |
| `speed-50` | 200 | 0.043428 | 0.043424 | 1.0001 | 1189 | 1151.4 | 50.0% |
| `speed-100` | 200 | 0.113731 | 0.113715 | 1.0001 | 461 | 439.7 | 100.0% |

The measurement window was the full 200 ticks in every one of the 75
replicates — no organism died that early in any condition, so every drain
figure is a mean over an unchanging cohort.

**The energy model as implemented is the energy model as specified.** Across all
60 fixed-policy replicates the ratio of measured to predicted drain lies in
[0.99947, 1.00016]. Inverting the model on the measured drain recovers the
requested speed exactly — 0.0%, 25.0%, 50.0%, 100.0% — so basal metabolism,
the size-scaled velocity-squared movement term and the phenotype speed mapping
all behave as §12.6–§12.9 describe. This is the §16.10 sanity check passing at
four separate points rather than one.

**The founder controllers move at roughly two thirds of maximum speed.** The
reference cell drains 0.060739/tick, which the same model maps to 65.7% of
`maxSpeed` (v ≈ 0.82 units/tick). Across seeds the implied speed ranges from
52.3% to 97.0% — the controllers are not uniform, but none of them is close to
stationary and none is at full speed.

#### Reconciling lifetime with drain

A run's extinction tick is the tick of the **last** death, so it tracks the
lowest-drain organism in the cohort, not the mean. Every condition shows this,
and its size follows cohort heterogeneity exactly. Taking the slowest-draining
organism in each cohort at tick 200 (from the timeseries `minEnergy`) and
dividing initial energy by that organism's drain:

| Condition | Energy spread at tick 200 | Implied lifetime of the slowest-draining organism | Observed median extinction tick |
|---|---:|---:|---:|
| `stationary` | 0.165 | 2547 | 2548 |
| `speed-25` | 0.204 | 1972 | 1972 |
| `speed-50` | 0.492 | 1189 | 1189 |
| `speed-100` | 1.878 | 460 | 461 |
| `neural-reference` | 3.264 | 1201 | 1066 |

For all four fixed policies this predicts the observed extinction tick to within
one tick. The only heterogeneity there is morphological — bootstrap perturbs
`size`, `maxSpeed` and `metabolism` by about 1% — so the last death lands 2–5%
beyond the cohort-mean prediction.

The reference cell has an energy spread six times wider than any fixed policy
at the same tick, because its organisms genuinely differ in how much they move.
That is why its median lifetime of 1066 exceeds the 823 ticks its *mean* drain
implies. The remaining gap (1201 predicted from the slowest organism versus 1066
observed) is expected in the other direction: a neural controller's output is a
function of its sensory vector, which includes `normalizedEnergy`, so its drain
is not constant across its life the way a fixed policy's is.

#### Answering the §16.8 discrepancy

§12.59 and §16.10 estimate a starvation lifetime of about 625 ticks from
`50 / 0.08`, where 0.08 is basal 0.02 plus a movement component of 0.06. That
movement component is `movementEnergyCoefficient * size * v^2` evaluated at
**v = 1.0** for a size-1.0 organism. The default `maxSpeed` is 1.25, so the
spec's own worked example describes an organism moving at 80% of maximum, not
100%; the model reproduces its arithmetic exactly at that point.

The founder cohort's measured 65.7% of maxSpeed gives v ≈ 0.82 and a drain of
0.0607, i.e. a cohort-mean lifetime of 823 ticks and a last-death lifetime of
1066. Diagnostic A's median of 1066 is therefore the number this energy model
*should* produce for controllers that move at this speed. Nothing is
mis-calibrated.

### 7.5 Verdict

**Controller effect. Not an energy-model effect.**

Against the decision rule fixed in §7.3: the four fixed policies match their
predicted drain to within 0.06% — far inside the ±10% band — so the
energy-model branch is excluded. The reference cell's implied speed of 65.7% is
materially below 100%, satisfying the controller branch. The "mixed" branch does
not apply: the reference cell's lifetime *is* reconcilable with its own drain,
via the same last-death order statistic that explains all four fixed policies,
and its measured energy spread independently confirms the heterogeneity that
requires.

What this establishes:

- basal metabolism, movement cost and the phenotype speed mapping are
  implemented as specified, verified at four speeds against closed-form
  predictions;
- Diagnostic A's lifetimes are fully explained by controller movement, and the
  §16.8 target band of 500–700 ticks corresponds to v = 1.0, an organism moving
  faster than these founders do;
- there is no evidence of an energy-calibration defect, and none of
  `baseMetabolicConstant`, `movementEnergyCoefficient` or
  `configuredInitialEnergy` should be changed on this evidence.

What it does **not** establish: nothing here says the founder controllers are
good at finding food, or that ~66% of maxSpeed is an appropriate speed, or that
any ecological configuration is viable. This diagnostic ran with food off. It
measures energy expenditure and nothing else.

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

## 9. Provenance: the hazard, and the repair

### 9.1 The hazard

While cross-checking the §7 reference cell against Diagnostic A, one persisted
replicate was found not to reproduce under the current build: Diagnostic A seed
147514 was recorded at extinction tick 1145 / hash `3adf024649660af4`, while the
current tree produced 1150 / `93e832500468f40f` from an identical `configHash`.

Ruled out at the time: current-code non-determinism (repeated runs are
identical, and the Phase 0A golden hash still reproduces); the Phase 0B
checkpoint's harness changes (the pre-checkpoint harness, rebuilt from a
snapshot, also produces 1150); simulation-core source drift (byte-identical);
and float sensitivity (perturbing one organism's energy or heading by 1 ULP,
1e-15, 1e-12, 1e-9 or 1e-6 moves the extinction tick by zero ticks — a 5-tick
shift needs a perturbation around 0.2 energy, nine orders of magnitude larger).

The mechanism was the build pipeline. The harness's `experiment` script compiled
only the harness and imported `@alo/simulation-core` from its **prebuilt
`dist`**, so a run could silently consume a stale core build while its
provenance recorded the current git commit. The `simulation-core/dist` in the
pre-edit snapshot — byte-identical to today's — was built at 19:41:08, thirty-
three seconds *after* the 19:40:35 results were written.

The script now builds `simulation-core` before the harness, so this cannot
recur.

### 9.2 The repair

The four experiments whose persisted results predated that fix were re-run on
the current verified build, through the corrected script, with the same pilot
seeds and the same configurations, into parallel `reverified-*` directories. The
originals were preserved for comparison. **No biological parameter was changed
and no validation seed was used.**

One execution setting had to be matched deliberately: the §14.29 runaway cap did
not exist when the originals were produced, and enforcing it now would terminate
runaway replicates early, producing differences that had nothing to do with the
build question. The re-runs therefore used `--no-runaway-cap`, reproducing the
original termination behaviour. Outcome classification is unaffected by this,
because `classifyRunOutcome` works from peak population rather than from how a
run ended — so the extinct/runaway/viable counts remain directly comparable.
(New science should always run with the cap enforced; the flag exists only for
historical reproduction.)

### 9.3 What the comparison shows

| Experiment | Replicates | Bit-identical (incl. `finalStateHash`) | Identical on every observable outcome | Condition summary |
|---|---:|---:|---:|---|
| `diagnostic-reproduction-control` | 15 | 11 | 15 | identical |
| `diagnostic-full-evolutionary` | 15 | 10 | 15 | identical |
| `mutation-2x2` | 60 | 40 | 60 | identical, all four conditions |
| `calibration-v1` | 96 | 56 | 93 | 9 of 12 identical |
| **total** | **186** | **117** | **183** | — |

"Observable outcome" means `terminationReason`, `extinctionTick`, `endTick`,
`endingPopulation`, `totalBirths`, `totalDeaths`, `endingFoodCount`,
`maxGenerationDepth`, `activeLineageCount` and `configHash`.

**Replicate-level differences.** In 69 of 186 replicates the `finalStateHash`
differs. In 66 of those 69, *every* observable outcome is nevertheless
identical — the runs end at the same tick with the same population, the same
births and deaths, and the same generation depth, differing only in continuous
state such as positions and energies. The differing replicates are concentrated
in long runs that survive to the 10,000-tick horizon.

The remaining 3 differ in one observable field, `extinctionTick` (and hence
`endTick`), and all three are **the same seed, 147514** — the seed that
surfaced in §9.1:

| Configuration | Old | Reverified | Shift |
|---|---:|---:|---:|
| `sweep_2` (regen 2, food 40, cost 35) | 3136 | 3125 | −11 |
| `sweep_10` (regen 6, food 40, cost 35) | 3087 | 3090 | +3 |
| `sweep_11` (regen 6, food 40, cost 45) | 3087 | 3090 | +3 |

**Condition-summary differences.** Diagnostics C and D and all four 2×2
conditions are identical in every field. Of the 12 sweep configurations, 9 are
identical in every field and 3 differ in exactly one: `medianExtinctionTick`
(3136 → 3125, 3087 → 3090, 3056.5 → 3058), each driven by the same seed 147514.
Every other field — extinction rate, mean and median final population, births,
deaths, generation depth, lineage counts, morphology and neural variance,
reproductive fraction — is unchanged.

**The current build is deterministic.** Re-running a differing replicate
(seed 115838, reproduction-control) three times in succession gives an identical
hash, end tick, population and birth count each time.

### 9.4 Does any conclusion change?

**No.**

- `passesCalibrationCriteria` is unchanged for all 12 configurations: 11 pass in
  both, with the same single failure (`regen 4, food 40, cost 35`, mean final
  population 548.6).
- The §14.29 / §16.35 reclassification is identical row for row — the same
  extinct, runaway and viable counts, the same viable rates (0% in 8 of 12
  configurations, 37.5% at best), and the same verdict: no configuration meets
  the ~70% gate.
- The 2×2 condition summaries are unchanged, so §3's reading is unchanged: the
  distributions remain bimodal and the condition with the largest mean final
  population still has the lowest viable rate.
- §5's calibration decision stands: no defensible candidate baseline, nothing
  frozen, validation seeds untouched.

None of the observed differences is a biological result. A shift of 3 to 11
ticks in one seed's extinction time, and continuous-state differences in
long-running replicates, are **build-provenance artefacts, not evidence about
adaptation, mutation or selection.** They must not be read as such.

### 9.5 What remains unresolved

The exact numerical delta between the old and current core builds cannot be
recovered, because the older `dist` no longer exists. What can be said is that
the two builds agree on every aggregate and on 183 of 186 observable replicate
outcomes, and disagree in continuous state on long runs plus one seed's death
timing by a few ticks.

Seed 147514 is now the third independent appearance of the same seed as the
sensitive one — Diagnostic A in §9.1 and three sweep configurations here. That
is a property of that world's trajectory, not a defect: nothing in the results
suggests an invalid state, and the current build reproduces it consistently.

The `reverified-*` directories are now the provenance-clean record for these
four experiments. The originals are retained alongside them for comparison.

## 10. calibration-v2 — standing food density x reproductive window

Run on the current build from a clean worktree: commit `4e063db`,
`gitDirty false`, `sourceIdentity 893bcb420accc8cf`, identical across all six
configurations. Results in `results/calibration-v2/`.

### 10.1 What was precommitted

Axes, seeds, horizon, primary readout and decision rule were fixed in §6.2 and
committed **before** the sweep was implemented or run:

```
food.worldFoodCapacity : [60, 120, 240]
lifecycle.maturityAge  : [300, 500]
```

6 configurations x 15 pilot seeds x 20,000 ticks = 90 replicates, §14.29 runaway
cap **enforced**. `lifecycle.maxAge` fixed at 3000 and every energy parameter at
the value §7 verified. Primary readout: `viableCompletionRate`. Mean final
population is descriptive only and is not a selection criterion.

Nothing about the axes or the decision rule was changed after seeing results.

### 10.2 Results

| Capacity | maturityAge | Extinct | Runaway | Viable | Extinction rate | **Viable rate** | Mean final pop | Max generation |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 60 | 300 | 9 | 6 | 0 | 60.0% | **0.0%** | 80.0 | 20 |
| 60 | 500 | 9 | 5 | 1 | 60.0% | **6.7%** | 69.3 | 19 |
| 120 | 300 | 7 | 8 | 0 | 46.7% | **0.0%** | 106.7 | 20 |
| 120 | 500 | 9 | 6 | 0 | 60.0% | **0.0%** | 80.1 | 6 |
| 240 | 300 | 7 | 8 | 0 | 46.7% | **0.0%** | 106.9 | 12 |
| 240 | 500 | 8 | 7 | 0 | 53.3% | **0.0%** | 93.4 | 7 |

Across all 90 replicates: **49 extinct, 40 runaway, 1 viable.**

All six configurations pass `DEFAULT_CALIBRATION_CRITERIA`, which is further
evidence for §8's caution that this screen does not discriminate: it admits
configurations in which 89 of 90 replicates end in a degenerate regime.

### 10.3 Candidate determination

**NOT SELECTED.**

The precommitted gate is roughly 70% viable completion (§16.35 [BASELINE]). The
best configuration reached **6.7%** — a single viable replicate out of 15 — and
five of six configurations produced none at all. No configuration qualifies.

The documented tie-break (highest viable rate, ties broken by smaller departure
from the Phase 0A defaults) never engages, because zero configurations pass the
gate. Per §6.2's decision rule and the standing instruction against inventing a
post-hoc rule, no candidate is selected and the gate is not lowered.

### 10.4 Neither axis moved the system toward viability

Raising standing food density reduced extinction (60.0% → 46.7% at
maturityAge 300) but converted the difference into runaway rather than into
sustained dynamics (6 → 8 runaway replicates). Lowering `maturityAge` from 500
to 300 did the same. Both axes move the system along the extinction-runaway
axis without opening a viable middle.

This is a pilot-level ecological observation about parameter direction. It is
not evidence about adaptation, selection or mutation, and must not be read as
such.

### 10.5 The horizon, not the axes, explains most of the drop from calibration-v1

calibration-v1's best cell reached 37.5% viable completion; the same
configuration here reaches 6.7%. The two are the **same configuration** —
v1's `regen 2 / food 25 / cost 45` cell and v2's `capacity 60 / maturityAge 500`
cell are both the Phase 0A defaults — so the difference is not the new axes. It
is the horizon: v1 ran 10,000 ticks, v2 runs the §14.28 / §16.34 [BASELINE]
20,000.

Seed by seed, on the 8 seeds the two sweeps share:

| Seed | v1 @ 10,000 ticks | v2 @ 20,000 ticks |
|---:|---|---|
| 100000 | extinct @ 1062 | extinct @ 1062 |
| 107919 | extinct @ 2931 | extinct @ 2931 |
| 115838 | ran to 10,000 — peak 296, classified runaway | runaway, halted @ 7022 |
| 123757 | extinct @ 5694 | extinct @ 5694 |
| 131676 | ran to 10,000 — peak 133, **viable** | **runaway, halted @ 11648** |
| 139595 | ran to 10,000 — peak 109, **viable** | **viable, reached 20,000** |
| 147514 | extinct @ 3000 | extinct @ 3000 |
| 155433 | ran to 10,000 — peak 149, **viable** | **runaway, halted @ 12283** |

Two of v1's three viable runs were not viable — they were **not yet runaway**.
Given another 10,000 ticks they crossed the cap. Only seed 139595 sustains a
bounded population for the full 20,000 ticks, and it is the single viable
replicate in all of calibration-v2.

Two consequences:

1. **calibration-v1's viability figures were optimistic**, and §4.2's table
   should be read as viability *at 10,000 ticks*, not at the gated horizon. The
   underlying calibration verdict in §5 is unaffected — it was "no defensible
   candidate", and a shorter horizon flattering the numbers only strengthens
   that.
2. **The 20,000-tick horizon is load-bearing** and should not be shortened for
   convenience in later sweeps.

### 10.6 Where this leaves calibration

Every configuration tested across both sweeps — 18 in total, spanning food
regeneration rate, food energy value, reproduction cost, standing food density
and maturity age — lands in the same bimodal regime. Nothing tested has produced
sustained non-degenerate dynamics at the gated horizon in more than one
replicate out of fifteen.

What has **not** been varied in either sweep is the gate on reproduction itself:
`energy.reproductionEnergyThreshold` has been 75 throughout. It directly
controls how much surplus an organism must accumulate before it may reproduce,
and therefore how fast a population can grow, without touching the energy model
§7 verified. `lifecycle.maxAge` also remains untested, having been deferred from
§6.3 to a later sweep.

A `calibration-v3` over those two axes is the natural next step. **It must be
precommitted and committed before it is run**, exactly as v2 was — axes, seeds,
horizon, primary readout and decision rule fixed in advance. No axes are
selected here on the basis of v2's numbers beyond the observation that the
reproduction gate is the untested growth control.

---

## 11. calibration-v3 — the reproduction gate x cohort turnover (PRECOMMITMENT)

**This section was written and committed before calibration-v3 was implemented
or run. §11.5 was empty at that point.**

**calibration-v3 is the FINAL parameter sweep of this Phase 0B calibration
cycle.** See the terminal rule in §11.4.

### 11.1 Axes

```
energy.reproductionEnergyThreshold : [75, 90]
lifecycle.maxAge                   : [3000, 6000]
```

`reproductionEnergyThreshold` has been 75 in every one of the 18 configurations
tested across calibration-v1 and calibration-v2. It is the gate on reproduction
itself — how much energy an organism must accumulate before it may reproduce —
and therefore the most direct control on population growth rate, which is what
drove 40 of 90 replicates into runaway in v2. It does not touch the energy model
that §7 verified. At 90 it remains below `energyCapacity` (100), so reproduction
stays reachable.

`lifecycle.maxAge` was deferred from §6.3 and remains untested. Now that §10.5
has shown the 20,000-tick horizon to be load-bearing, cohort turnover timing is
worth testing.

### 11.2 Design

- 4 configurations
- the 15 existing **pilot** seeds
- 20,000 ticks maximum
- §14.29 runaway cap **enabled**
- all other parameters at the current Phase 0A defaults
- 60 replicates total
- results written to `packages/experiment-harness/results/calibration-v3/`

**`viableCompletionRate` is the precommitted PRIMARY READOUT.** Extinction rate,
runaway rate, mean and median final population, generation depth and births are
reported alongside it as descriptive context and are **not** selectors.

No axis may be added after seeing results. No gate or threshold may be changed
after seeing results.

### 11.3 Selection rule

1. A configuration qualifies **only** if it reaches the existing ~70%
   `viableCompletionRate` gate (§16.35 [BASELINE]).
2. If more than one configuration qualifies, choose the highest
   `viableCompletionRate`.
3. On an exact tie, choose the configuration with the smaller departure from the
   Phase 0A defaults.
4. Mean population, births, maximum generation depth and every other metric are
   **excluded** as primary selectors.

### 11.4 Terminal rule

Exactly two outcomes are permitted.

**Outcome A — a qualifying candidate exists.** Apply the selection rule, freeze
exactly one candidate baseline, version and document it, update
`PROJECT_STATUS.md` and this report, and stop. Validation is a separate,
subsequent step and is not run in the same task.

**Outcome B — no qualifying candidate exists.** Then:

- do not propose a calibration-v4;
- do not launch another parameter sweep;
- do not weaken the viability gate;
- do not add new tuning axes;
- do not use validation seeds.

Instead, declare this Phase 0B calibration cycle unsuccessful, document that the
tested parameter space of the current Phase 0A model did not produce a validated
non-degenerate baseline, summarize which parameter directions v1, v2 and v3 have
covered, and identify the single smallest **model-level** question to reconsider
before any future calibration cycle — without modifying the model.

A failed calibration cycle is a valid scientific result. Success is not to be
forced.

### 11.5 Results

Run from a clean worktree: commit `fc05ad1`, `gitDirty false`,
`sourceIdentity c74242c483aff170`, identical across all four configurations.
60 replicates, 20,000 ticks, runaway cap enabled. Results in
`results/calibration-v3/`.

| Threshold | maxAge | Extinct | Runaway | Viable | Extinction rate | Runaway rate | **Viable rate** | Mean final pop | Median final pop | Total births | Mean births | Max gen | Mean gen |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 75 | 3000 | 9 | 5 | 1 | 60.0% | 33.3% | **6.7%** | 69.3 | 0.0 | 4687 | 312.5 | 19 | 5.20 |
| 75 | 6000 | 9 | 6 | 0 | 60.0% | 40.0% | **0.0%** | 80.2 | 0.0 | 4343 | 289.5 | 20 | 4.60 |
| 90 | 3000 | 9 | 6 | 0 | 60.0% | 40.0% | **0.0%** | 80.0 | 0.0 | 4443 | 296.2 | 16 | 4.60 |
| 90 | 6000 | 9 | 6 | 0 | 60.0% | 40.0% | **0.0%** | 80.1 | 0.0 | 3973 | 264.9 | 16 | 4.20 |

Across all 60 replicates: **36 extinct, 23 runaway, 1 viable.**

Neither axis moved the primary readout. Raising the reproduction gate from 75 to
90 left the runaway count unchanged at 6 of 15 and produced no viable replicate;
raising `maxAge` from 3000 to 6000 did the same. Extinction rate is **60.0% in
all four configurations** — the axes did not move it at all.

The single viable replicate is seed 139595 in the `75 / 3000` cell — which is
the Phase 0A default configuration — ending at 20,000 ticks with a population of
40 and a peak of 109. It is the same replicate that was the sole viable run in
calibration-v2.

**Integrity check.** The Phase 0A default configuration appears in both sweeps:
v2's `capacity 60 / maturityAge 500` cell and v3's `threshold 75 / maxAge 3000`
cell are the same configuration, run from different builds (`4e063db` and
`fc05ad1`). All 15 replicates are identical across every field including
`finalStateHash`. The harness reproduces across builds and the CLI refactor
changed nothing.

### 11.6 Terminal determination: OUTCOME B

**No configuration reached the ~70% `viableCompletionRate` gate. The best result
was 6.7% — one viable replicate in fifteen — in the cell that is the Phase 0A
default, i.e. the configuration this sweep was meant to improve on.**

Per the terminal rule fixed in §11.4, and per the precommitted selection rule in
§11.3 — under which the tie-break never engages because no configuration
qualifies — **this Phase 0B calibration cycle is declared unsuccessful.**

No calibration-v4 is proposed. No further parameter sweep is launched. The
viability gate is not weakened. No new tuning axes are added. No validation seed
has been used.

All four configurations pass `DEFAULT_CALIBRATION_CRITERIA`, which admits cells
where 14 of 15 replicates are degenerate. That screen has now failed to
discriminate in all three sweeps and should not be treated as a viability test.

### 11.7 What the three sweeps established

22 configurations across three sweeps, covering these parameter directions:

| Sweep | Direction tested | Axes | Best viable rate |
|---|---|---|---:|
| v1 | energy and resource coefficients | `regenAttemptsPerTick`, `foodEnergyValue`, `reproductionCost` | 37.5% at 10,000 ticks — see §10.5 |
| v2 | standing resource density and reproductive window | `worldFoodCapacity`, `maturityAge` | 6.7% |
| v3 | the reproduction gate and cohort turnover | `reproductionEnergyThreshold`, `maxAge` | 6.7% |

v1's 37.5% does not survive the gated horizon: §10.5 showed two of its three
"viable" runs were merely *not yet runaway* and crossed the cap by tick ~12,000.
At 20,000 ticks the best result any configuration has produced is 6.7%.

Direction of effect, consistently across sweeps: increasing resources
(regeneration rate, food energy, standing density) reduces extinction but
converts the difference into **runaway**, not into sustained dynamics.
Tightening reproduction (higher cost, higher gate) and altering lifecycle
timings (maturity, maximum age) move the outcome mix hardly at all. No axis
tested has opened a viable middle between the two degeneracies.

Separately established and not in question: the energy model is implemented as
specified, verified at four fixed speeds against closed-form predictions (§7);
the substrate is deterministic and reproducible across builds (§9, §11.5); and
both mutation channels operate under configuration control (§3).

### 11.8 The single smallest model-level question

**Should the founding population be 25 near-clones of one founder controller?**

The evidence that raises it is in the persisted results and needed no new runs.
Taking all 10 configurations that ran at the gated 20,000-tick horizon (v2's six
and v3's four, the same 15 pilot seeds throughout — 150 replicates):

| | Seeds |
|---|---|
| identical outcome in **all 10** configurations | **11 of 15** |
| always extinct regardless of parameters | 7 |
| always runaway regardless of parameters | 4 |
| responded to parameters at all | 4 |

Those 10 configurations span a 4x change in standing food density, maturity age
300 vs 500, reproduction gate 75 vs 90, and maximum age 3000 vs 6000. Across all
of that, two thirds of seeds never change outcome. And the four that do respond
mostly flip between extinction and runaway — not into viability.

What distinguishes a seed is its founder. Under the default configuration,
births by seed split with no middle ground: every extinct world produced at most
36 births, every non-extinct world at least 270. A seed's world either forages
well enough to grow without limit, or barely reproduces at all.

A seed determines the founder neural genome, and §13.76 builds the whole
starting population from **one** founder: `morphBootstrapSigma` is about 1% of
each gene range and `neuralBootstrapSigma` is 0.05, so all 25 organisms are
near-copies of a single controller. The world therefore begins with almost no
standing behavioural variation, and one controller draw decides its fate.

That is the model-level question worth reconsidering before any future
calibration cycle: whether a founding population with essentially no behavioural
diversity is the right starting condition, given that ecological calibration
cannot reach a regime the founder draw has already decided.

Stated carefully, because this is a question and not a finding:

- This does **not** establish that founder diversity would produce a viable
  regime. It establishes that the tested ecological parameters do not, and that
  the founder draw predicts the outcome better than any of them.
- It is **not** a defect in Phase 0A. §13.76's common-founder bootstrap is a
  [LOCKED] procedure implemented as specified, and the founder screening is
  binary pass/fail with no ranking, exactly as required.
- It says nothing about adaptation, intelligence or the value of mutation. This
  is ecological model calibration, not an intelligence benchmark. A world that
  grows without bound is not a world that learned anything.

**The model is not modified in this task.**


---

## 12. Model amendment: multi-founder initialization

§11.8 identified one model-level question. It has now been answered by an
explicit versioned amendment to §13.76, recorded in
`docs/Phase 0A Amendment - Multi-Founder Initialization.md`.

**What changed.** The initial population is built from 5 independent founder
neural genomes, 5 organisms each, instead of 25 near-clones of a single founder.
Each founder is drawn independently from BootstrapRNG and accepted by the same
unchanged validity + viability gate, first passing candidate wins. Model version
moves `0A.1.0` → `0A.2.0`.

**What did not change.** The founder acceptance gate; morphology initialization
and the per-organism bootstrap perturbation; all runtime biology; mutation rules
after reproduction; RNG stream separation; and every locked invariant. There is
no ranking, scoring, best-of-N or comparison between founders. Nothing about
sensing, actions, learning or fitness was added.

**Golden hashes.** `0A.1.0` keeps `6a6576bd49e86b27`; `0A.2.0` is
`b95a0b4ef7dd8449`, reproduced across independent processes. The historical hash
is not a regression target for the amended model and still passes for the
historical one.

### 12.1 Status of everything in this report

Sections 1–11 describe the **single-founder model (`0A.1.0`)**. Those results —
the four diagnostics, the movement-policy diagnostic, the 2×2 mutation
factorial, and calibration-v1, v2 and v3 — **remain valid historical results**.
They are not invalidated, and they are not to be re-run.

They must **not** be pooled or compared numerically with results from the
amended model. Any future calibration cycle belongs to `0A.2.0` and starts from
its own baseline measurement.

The held-out validation seeds remain **untouched** and are unaffected.

### 12.2 What this amendment does not claim

It does not claim that founder diversity will produce a viable ecological
regime — that is precisely the open question. Whether removing the single-
founder bottleneck changes the extinction/runaway regime is unmeasured until a
new-model baseline pilot is run. No claim is made about adaptation, intelligence
or beneficial mutation: removing a bootstrap bottleneck changes a starting
condition, it does not make an organism better at anything.

---

## 13. Summary of claims

| Claim | Supported? | Evidence |
|---|---|---|
| The substrate runs deterministically within a build | Yes | identical repeated replicate hashes; golden hash `6a6576bd49e86b27`; 183 of 186 re-run replicates identical on every observable outcome, all condition summaries identical (§9) |
| The energy model is implemented as specified | **Yes** | §7: measured/predicted drain in [0.99947, 1.00016] across 60 replicates at four fixed speeds |
| Diagnostic A's long lifetimes are a controller effect, not an energy defect | **Yes** | §7: founders measured at 65.7% of maxSpeed; §16.8's band corresponds to v = 1.0 |
| The founder controllers are good at finding food | Not tested | §7 ran with food off; it measures expenditure only |
| Diagnostic interventions do what they claim | Yes | 0 births in A and B across 15 replicates each; food 0 throughout A |
| Organisms detect, reach and consume food | Yes | Diagnostic B: median survival 1066 → 3000 ticks with food active |
| Inheritance and both mutation channels operate under configuration control | Yes | 2×2 executes; conditions differ only in the two flags; RNG isolation tested |
| Treatment conditions can produce different replicated outcomes | Yes | 2×2 condition summaries differ |
| Some tested configuration is ecologically viable | **No** | 22 configurations across three sweeps; best viable completion at the gated 20,000-tick horizon is 6.7% (1 of 15) against a ~70% gate. Calibration cycle declared unsuccessful (§11.6) |
| Outcome is driven by the founder draw more than by the tested ecology | Yes, at pilot level | 11 of 15 seeds give an identical outcome across all 10 configurations run at the gated horizon (§11.8) |
| Neural mutation is beneficial | **No** | bimodal distributions; largest mean has lowest viable rate |
| Morphology mutation is harmful | **No** | differences are inside the within-condition spread |
| The population adapted / intelligence increased | **No** | no confirmatory design has been run; no in-world probe data collected |
| Multi-founder initialization (`0A.2.0`) produces a viable default regime | **No** | §14: 1 of 15 viable (6.7%), unchanged from `0A.1.0`; extinction 9 → 5, runaway 5 → 9 |
| The single-founder bottleneck explains the calibration failure | **No** | §14.9: removing it moved worlds between the two degeneracies, not into viability |
| Multi-founder worlds start with functionally distinct founders | Yes, observational | §14.8: per-world mean pairwise founder distance 0.304–0.401, min pair 0.224 |
| The 200 runaway cap masks food limitation in the default `0A.2.0` ecology | **Undetermined** | §15.10: decision seeds classified C, A, B — INCONCLUSIVE under the precommitted 2-of-3 rule |
| Peak population ≥ 200 identifies unbounded growth | **No** | §16.1: uncapped, two v1-"runaway" worlds held level near 190 and 310 for ~16,000 ticks |
| The `0A.2.0` default configuration can reach the ~70% gate under v2 | **No** | §17.5: the baseline cohort already has 5 extinctions; at most 4 non-bounded runs of 15 are compatible with the gate. The full v2 classification is not computable (6 seeds stopped by the v1 cap) |
| Complete 15-seed `0A.2.0` default profile under v2 | Measured | §18.6: 5 EXTINCTION, 3 BOUNDED_VIABLE, 5 HIGH_BOUNDED, 2 RUNAWAY, 0 INCONCLUSIVE; boundedCompletionRate 0.533; gate FAILED |
| The default `0A.2.0` failure is extinction-dominated | Yes, at pilot level | §18.7: the 5 extinct worlds never exceeded 37 organisms; all 10 others reached at least 196, and 8 of those 10 plateaued |

---

## 14. Multi-founder default baseline (`0A.2.0`) — PRECOMMITMENT

**This section was written and committed before any code for this run was
added and before the run was executed. §14.7 was empty at that point.**

This is ONE default-baseline pilot of the amended model. It is **not** a
calibration sweep, **not** a new calibration cycle, and it tunes nothing.

### 14.1 Question

Did removing the single-founder initialization bottleneck materially change the
extinction / runaway / viable regime under the **unchanged** Phase 0A default
ecological parameters?

### 14.2 Design (fixed)

- model `simulationVersion 0A.2.0`, `bootstrap.founderGroupCount = 5`,
  `initialPopulationSize = 25` (5 organisms per founder group)
- **every other parameter at the unchanged `DEFAULT_SIMULATION_CONFIG`** — no
  override of any kind
- the 15 existing **pilot** seeds (`seeds/pilot.json`, sha256 `785e4411…`)
- 20,000 ticks maximum; stop on extinction; metrics sampled every 200 ticks
  (the calibration-v2/v3 cadence)
- §14.29 runaway cap **enabled** (cap 200)
- outcome classification unchanged (`classifyRunOutcome`, peak-population based)
- results to `packages/experiment-harness/results/multifounder-default-baseline/`
- run from a clean committed worktree; every replicate must record `gitCommit`,
  `gitDirty = false`, `sourceIdentity` and `simulationVersion = 0A.2.0`
- validation seeds are **not** used

`founderGroupCount` is **not** a calibration axis and is not varied.
`founderGroupCount = 1` exists only for historical regression compatibility.

### 14.3 Readouts

**PRIMARY READOUT: `viableCompletionRate`.** Reference threshold: the existing
§16.35 [BASELINE] gate, `BASELINE_MIN_VIABLE_COMPLETION_RATE = 0.70` — with 15
seeds that means at least 11 of 15 viable (10 of 15 = 66.7% does not pass).

Descriptive only, never selectors: extinction rate, runaway rate, mean and
median final population, total and mean births, maximum generation depth.

### 14.4 Comparison reference

The historical single-founder (`0A.1.0`) DEFAULT configuration at the same
20,000-tick horizon: `results/calibration-v3/sweep_0_reproductionEnergyThreshold=75_maxAge=3000/`
(threshold 75 / maxAge 3000 **is** the Phase 0A default; commit `fc05ad1`,
clean, `sourceIdentity c74242c483aff170`, runaway cap enabled, same 15 pilot
seeds). It is read from disk and **not re-run**. Its values, already recorded in
§11.5: 9 extinct, 5 runaway, 1 viable (6.7%).

The comparison is **paired by seed** — both arms use the same 15 seeds. Reported:
per-seed outcome transitions (unchanged; extinct → viable; extinct → runaway;
runaway → viable; runaway → extinct; viable → other).

Scope of the comparison. §12.1's no-pooling rule stands: the two models are
never combined into one dataset, and single-founder results are never used as
evidence about the calibration of `0A.2.0`. This one paired side-by-side
contrast is precommitted here because the question in §14.1 *is* the model
contrast; both arms are reported separately and labelled by model version.

### 14.5 Decision rule (fixed before results)

With 15 seeds the classes are exhaustive (extinct + runaway + viable = 15), so
"regime moved in the intended direction" is operationalised as viable
completions gained. Across all 10 single-founder configurations at the gated
horizon (§11.8) the viable count never exceeded 1 of 15, so a change of one or
two replicates is within what a single seed flip produces.

- **A — DEFAULT BASELINE QUALIFIES** — `viableCompletionRate ≥ 0.70`
  (≥ 11 of 15). Mark the default `0A.2.0` configuration as the provisional
  calibration candidate and freeze/version exactly that configuration. Tune
  nothing. Do not run validation in this task; the next step becomes held-out
  validation.
- **B — IMPROVED BUT BELOW GATE** — not A, and viable completions **≥ 4 of 15**
  (≥ 26.7%; at least +3 over the historical 1 of 15). Document the effect; state
  that the amendment changed the regime but did not produce a qualifying
  baseline; no sweep is started; stop.
- **C — NO MEANINGFUL IMPROVEMENT** — viable completions **≤ 3 of 15**. Document
  that the single-founder bottleneck was not sufficient to explain the
  calibration failure; no sweep, no model change; identify ONE smallest next
  scientific question; stop.

A shift of extinction into runaway (or back) without viable completions is
**not** movement in the intended direction and does not by itself qualify for B.

No threshold, seed, horizon, parameter or classification may change after the
results are seen.

### 14.6 Optional observational check (not a decision input)

If trivial with existing code: for each pilot world, the pairwise functional
distance (`mean-absolute-output-difference-v1` on `probe-set-v1`) between its 5
founder controllers — 10 pairs per world — summarised as mean / min / max. The
founders are reconstructed by replaying `generateFounderProfiles` on a fresh
BootstrapRNG from the same root seed (the first draws `bootstrapWorld` makes);
probe evaluation consumes no RNG and nothing touches a running world. Functional
distance is descriptive only: it is not fitness, it is not a selection
criterion, and it plays no part in the decision rule above.

### 14.7 Results

Run from a clean committed worktree: commit `d9dfb92`, `gitDirty false`,
`sourceIdentity 99dac89d1820e080`, `simulationVersion 0A.2.0` — identical on all
15 replicates and in the manifest. 20,000-tick horizon, runaway cap 200
enforced, the 15 pilot seeds. Results in
`results/multifounder-default-baseline/`. Every number below was read from the
persisted `replicates.json` / `condition-summary.csv` of both arms.

| Model | Extinct | Runaway | Viable | Extinction rate | Runaway rate | **Viable rate** | Mean final pop | Median final pop | Total births | Mean births | Max gen |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `0A.1.0` single-founder default (calibration-v3 cell 0) | 9 | 5 | 1 | 60.0% | 33.3% | **6.7%** | 69.3 | 0 | 4687 | 312.5 | 19 |
| `0A.2.0` multi-founder default (this run) | 5 | 9 | 1 | 33.3% | 60.0% | **6.7%** | 131.4 | 200 | 5727 | 381.8 | 20 |

The median final population of 200 in the amended arm is the runaway cap: 9 of
15 runs were terminated on reaching it. It is not a sustained population.

#### Paired by seed

| Seed | `0A.1.0` | `0A.2.0` |
|---:|---|---|
| 100000 | extinct @1062 | extinct @3000 |
| 107919 | extinct @2931 | runaway @9793 |
| 115838 | runaway @7022 | runaway @3389 |
| 123757 | extinct @5694 | runaway @3094 |
| 131676 | runaway @11648 | extinct @14505 |
| 139595 | **viable** (end 40, peak 109) | runaway @3037 |
| 147514 | extinct @3000 | extinct @9092 |
| 155433 | runaway @12283 | runaway @3597 |
| 163352 | extinct @3000 | runaway @3782 |
| 171271 | runaway @3422 | runaway @6444 |
| 179190 | extinct @3901 | runaway @3587 |
| 187109 | extinct @1334 | extinct @18374 |
| 195028 | extinct @4174 | extinct @9235 |
| 202947 | runaway @15247 | runaway @18876 |
| 210866 | extinct @3218 | **viable** (end 170, peak 196) |

| Transition | Seeds |
|---|---:|
| unchanged | **8** (4 extinct → extinct, 4 runaway → runaway) |
| extinct → viable | 1 |
| extinct → runaway | 4 |
| runaway → viable | 0 |
| runaway → extinct | 1 |
| viable → other | 1 (viable → runaway) |

7 of 15 seeds changed class, but the net movement was **extinction → runaway**
(4 seeds, against 1 in the reverse direction). The viable count is unchanged at
1 of 15, and the one viable world changed identity: seed 139595 lost it, seed
210866 gained it. The new viable world ended at 170 with a peak of 196 — four
organisms short of the cap — so it resembles calibration-v1's "not yet runaway"
cases (§10.5) more than a clearly bounded population. 14 of 15 worlds remain
degenerate; the regime is still bimodal.

Descriptive, not a selector: extinction under `0A.2.0` comes later (median
extinction tick 9235 vs 3000) and after more reproduction — the five extinct
amended worlds produced 10–119 births, where every extinct single-founder world
produced at most 36.

Also observed in the persisted timeseries, not analysed further: in **every**
runaway world of **both** models the standing food count was at or near
`worldFoodCapacity` (49–60 of 60) at the sample where the population reached the
cap. Populations reaching 200 were not depleting the standing food supply.

### 14.8 Founder functional diversity (observational)

`results/multifounder-default-baseline/founder-diversity.json`. For each world,
the 10 pairwise distances between its 5 founders (`probe-set-v1`,
`mean-absolute-output-difference-v1`):

- per-world mean distance: 0.304 – 0.401 (mean of means 0.351)
- smallest pair in any world: 0.224; largest: 0.539
- every world's founders are functionally distinct (min > 0), and every bootstrap
  organism is functionally nearest to its own group's founder (tested)
- per-world mean distance ranges overlap across outcome classes (extinct
  0.306–0.401, runaway 0.304–0.380, viable 0.366)

This confirms the amendment put standing functional variation into every initial
world. It is not fitness, not a selector, and was not a decision input. Nothing
here says diversity caused or prevented any outcome.

### 14.9 Determination: C — NO MEANINGFUL IMPROVEMENT

Viable completions: **1 of 15 (6.7%)** — identical to the single-founder
default, far below the 0.70 gate (A) and below the precommitted ≥ 4 of 15
threshold for B. Per §14.5 this is **outcome C**.

Removing the single-founder bootstrap bottleneck **changed which degenerate
outcome a world reaches** — extinction fell from 9 to 5 and runaway rose from
5 to 9 — but did not open a viable middle. Per §14.5, conversion of extinction
into runaway is not movement in the intended direction. The single-founder
bottleneck is therefore **not sufficient to explain the calibration failure**.

No sweep is started, `founderGroupCount` is not varied, the model is not changed,
the gate is not weakened, and no candidate is frozen. Validation seeds untouched.

Not claimed: that intelligence improved, that adaptation increased, that
multi-founder initialization is "better" in an evolutionary sense, or that
founder diversity conferred any advantage. This experiment measures an
initialization change and its ecological outcome only, on 15 pilot seeds.

### 14.10 The single smallest next scientific question

**Is the §14.29 runaway cap (200 = 8 x the initial population) below the
population level at which the default ecology becomes food-limited — i.e. are
"runaway" worlds genuinely unbounded, or are they populations still growing
toward a resource-set equilibrium that the cap truncates?**

Why this one. Across three single-founder sweeps and now the model amendment,
every change that helped populations survive (more food, more founder
variation) converted extinction into runaway rather than into viability. And in
every runaway world, in both models, standing food was still at or near
capacity when the population hit 200 — the population was not yet consuming the
food supply down. If the food-limited equilibrium of the default ecology lies
above 200, then under the current classification a world can only be "viable"
if it neither dies out nor reaches its own resource limit within 20,000 ticks,
and the ~70% gate would be measuring something other than a bounded, sustained
ecology.

This is a question about the relation between the outcome instrument and the
ecology. It is not a finding, it does not justify changing the cap or the gate,
and it does not modify the model.

---

## 15. `diagnostic-food-limitation-v1` — does the 200 cap mask food limitation? (PRECOMMITMENT)

**Design only. Written and committed before any code for this diagnostic exists
and before anything is run. §15.10 is empty at this point.**

This is an observational diagnostic of the unchanged `0A.2.0` default ecology.
It is not a calibration sweep, it tunes nothing, it produces no
`viableCompletionRate` evidence, and none of its runs may be added to any
calibration table.

### 15.1 Question

At what population, if any, does the default `0A.2.0` ecology begin to
experience meaningful food scarcity, and is the §14.29 runaway cap of 200
stopping runs before that pressure can appear?

### 15.2 What the model and the saved baseline already say

Food mechanics (read from `foodRegen.ts`, `stepWorld.ts`, defaults):

- food leaves the world only by consumption, at most one item per organism per
  tick; it enters only through `regenAttemptsPerTick = 2` attempts per tick,
  each accepted with probability `fertility(x, y)` and skipped outright when the
  stock is at `worldFoodCapacity = 60`;
- so supply is hard-bounded at **2 items/tick = 50 energy/tick**, and below
  capacity its expectation is `2 x F̄`, where `F̄` is the area-mean of the
  world's static fertility field;
- `F̄` for the pilot worlds, computed exactly from each seed's bootstrap lattice
  (no ticks run): 0.468–0.572, i.e. **uncapped supply ≈ 1 item/tick ≈ 25
  energy/tick**;
- at the founder-measured drain of 0.0607/tick (§7), 25 energy/tick balances
  roughly **390–470 organisms**, and even the hard 50 energy/tick bound balances
  only **≈ 824**. Reproduction (20 energy lost per birth) and age death lower
  these figures further. They are order-of-magnitude anchors, not predictions:
  evolved controllers need not drain what the founders drained.

Saved `0A.2.0` baseline timeseries (`results/multifounder-default-baseline/`,
200-tick samples): in every world the sampled food stock **never fell below 50**
(the tick-0 initial count) at any sample, and at the sample where each runaway
world reached 200 it stood at 50–60 of 60. By the model arithmetic above, 200
organisms are about half the population the uncapped supply can sustain at
founder drain. So the cap may well be stopping runs below the food-limited
scale. That is what this diagnostic tests.

### 15.3 Design (fixed)

| Item | Value |
|---|---|
| Diagnostic id / version | `diagnostic-food-limitation-v1` |
| Model | `simulationVersion 0A.2.0`, `founderGroupCount = 5`, `initialPopulationSize = 25` |
| Parameters | `DEFAULT_SIMULATION_CONFIG`, **no override of any kind** |
| Seeds | 4 pilot seeds (§15.4); validation seeds **not used** |
| Horizon | **20,000 ticks** — the gated horizon of the baseline |
| Early stops | extinction; the diagnostic safety ceiling (§15.5); nothing else |
| §14.29 runaway cap | **not an early-stop condition in this diagnostic** (`runawayCapEnabled = false`); the cap value, `classifyRunOutcome` and the definition of runaway are unchanged |
| Standard metrics | existing `computeTimeseriesRow` every 200 ticks (baseline cadence) |
| Per-tick flux | §15.7 |
| Output | `packages/experiment-harness/results/diagnostic-food-limitation-v1/` |
| Provenance | clean committed worktree; every replicate records `gitCommit`, `gitDirty = false`, `sourceIdentity`, `simulationVersion` |

**Trajectory identity.** Disabling the cap stops nothing earlier and consumes no
RNG, so each run is bit-identical to its baseline replicate up to the tick where
the baseline stopped. This is checked, not assumed (§15.8).

### 15.4 Seeds — chosen only from observed baseline timing

| Seed | Role | Baseline `0A.2.0` observation | Why |
|---:|---|---|---|
| 139595 | decision | runaway, reached 200 at tick 3037 (earliest) | longest post-200 window: 16,963 ticks |
| 123757 | decision | runaway, reached 200 at tick 3094 (2nd earliest) | second-longest post-200 window: 16,906 ticks |
| 107919 | decision | runaway, reached 200 at tick 9793 | the **latest** cap-reaching seed that still leaves ≥ 10,000 ticks (≥ 3 `maxAge` lifespans) after 200: 10,207 ticks |
| 210866 | reference only | the one viable run: peak 196, never capped | never reaches 200 in the baseline, so its diagnostic run must equal the baseline exactly (an integrity check); shows food flux in a population of 100–196 sustained for ~11,600 ticks |

Excluded: 202947 reached 200 at tick 18,876 — only 1,124 ticks remain, too
short to observe anything past the cap. The remaining runaway seeds (115838,
155433, 163352, 171271, 179190) are not needed for a first answer. Only the
three decision seeds enter the A/B/C rule.

### 15.5 Diagnostic safety ceiling — EXECUTION SAFETY LIMIT, not biology

**Population 1000.** A run stops when `populationCount ≥ 1000`, recorded with
its own termination reason `SAFETY_CEILING`.

Justification: 1000 is the first round value above the **hard supply bound**
≈ 824 — the population whose founder-measured drain (0.0607) exceeds 50
energy/tick, the most the food system can deliver if every regeneration attempt
succeeds. Beyond it no population at founder drain can be fed even in principle,
so a world that reaches 1000 with a still-full food stock has already answered
the question (outcome B). It sits about 2.4x above the expected supply balance
(≈ 400), so a food-limited plateau anywhere near that scale is observable before
the ceiling. It is 5x the runaway cap and costs little: baseline throughput near
200 organisms was ~2,200–2,800 ticks/s and per-tick cost is roughly linear in
population, so a worst-case 20,000-tick run near 1000 takes on the order of a
minute. The basal-only theoretical bound (50 / 0.01 = 5000, every organism
stationary at minimum metabolism) is not used: it contradicts every measured
controller and would buy nothing but runtime.

The ceiling is not a biological threshold, not a carrying capacity, and does not
redefine runaway. A run stopped by it is labelled as such and interpreted only
through §15.8.

### 15.6 Milestones

First tick at which `populationCount ≥ M`, for M in:

**200, 250, 300, 400, 600, 800, 1000**

200 is the cap; 250 and 300 are the near-cap band; 400 is the expected supply
balance at founder drain (≈ 390–412 for the decision seeds); 600 lies between
the expected and hard bounds; 800 is the hard supply bound (≈ 824); 1000 is the
ceiling. A milestone never reached is recorded as `null`.

At each milestone tick T record: T, population, food count, food-capacity
fraction, and over the trailing window T−199..T: mean food stock, total food
consumed, total food regenerated, births, deaths, mean of `meanEnergy`,
per-capita intake (consumed / (mean population x 200)), and whether the
scarcity criterion holds at T.

### 15.7 Measurements

Per tick, per replicate (`flux-<seed>.csv`), all read from the pre- and post-tick
`WorldState` and the existing `TickTelemetry` — no simulation-core change, no RNG:

- `population`, `foodCount`, `foodCapacityFraction = foodCount / 60`
- `foodConsumed` = food ids present before the tick and absent after it (food
  leaves only by consumption)
- `foodRegenerated` = `nextFoodId` after − `nextFoodId` before
- `births`, `deaths`, `meanEnergy` (existing telemetry)
- asserted every tick: `foodCount_after = foodCount_before − foodConsumed + foodRegenerated`

Per replicate, constant: the world's area-mean fertility `F̄` and hence the
expected uncapped supply `2 x F̄` items/tick. Descriptive only: supply
utilisation = consumed per tick / `2 x F̄`.

Plus the existing 200-tick standard timeseries and replicate summary.

### 15.8 Food-scarcity criterion (precommitted)

**Meaningful food scarcity holds at tick T (T ≥ 200) when the mean post-tick
food stock over the trailing 200 ticks, T−199..T, is ≤ 30 — half of
`worldFoodCapacity`.** Scarcity **onset** is the first such tick; its onset
population is the population at that tick.

Why the stock, and why half. Regeneration is throttled only by the capacity
check. While the stock sits near 60, regeneration is being blocked and
consumption is below what the field can supply: food is not limiting. A stock
held at or below half capacity for 200 ticks means the capacity check has not
been what limits regeneration for that whole window, so consumption has been
running at the full rate the fertility field can deliver: the supply side, not
foraging, is binding. Half capacity sits far below anything observed without
population pressure — Diagnostic B ended at 60 of 60 in every replicate, and no
baseline sample after tick 0 fell below 50.

Why 200 ticks. From empty, refilling to 60 takes at least 30 ticks at the hard
supply bound and about 60 at `2 x F̄`, so a window of 200 cannot be pulled to
≤ 30 by a transient dip. It is well under `maturityAge` (500), so it resolves
the demographic timescale, and equals the baseline sampling cadence.

Why not "consumption > regeneration". Over any window, `stock_end = stock_start
− consumed + regenerated` exactly, so consumption exceeding regeneration only
says the stock is falling — a transient. A depleted steady state has
consumption ≈ regeneration. The flux balance is recorded (§15.7) and
described; the stock level is the criterion. Population decline is not part of
the criterion.

### 15.9 Interpretation (fixed before any run)

**Integrity gate, checked first.** For 139595, 123757 and 107919 the canonical
state hash at the baseline's termination tick (3037, 3094, 9793) must equal that
baseline replicate's `finalStateHash` (`7bc732eb4dfa8c7b`, `4c4456bc83b5e842`,
`da0a52515e7c9bc6`); for 210866 the final hash at tick 20,000 must equal
`16b073462ec8b5c4`. Any mismatch makes the diagnostic **INVALID**: nothing is
interpreted and the cause is investigated.

Per decision seed, with `t250` the first tick the population reaches 250:

- **seed C** — scarcity onset occurs before `t250` (or the population never
  reaches 250 and onset occurs at all);
- **seed A** — no scarcity before `t250`, and onset occurs later, before the run
  ends;
- **seed B** — no scarcity onset at any tick up to the end of the run, whether it
  ends at the horizon, the safety ceiling or extinction.

Outcome — the class held by **at least 2 of the 3** decision seeds (reported as
3/3 or 2/3):

- **A — CAP IS TOO LOW.** Food is abundant at 200 and meaningful scarcity appears
  only at higher population. The 200-organism cap is likely truncating the
  ecological trajectory before resource limitation becomes visible. The cap is
  **not** changed in that task.
- **B — FOOD NEVER BECOMES BINDING BEFORE THE SAFETY LIMIT.** Population rises
  past 200 while food stays near capacity or is rapidly replenished. The default
  ecology lacks sufficient resource pressure in this regime; the problem is not
  merely an early cap. The ecology is **not** modified in that task.
- **C — FOOD IS ALREADY SCARCE NEAR 200.** The cap is not masking the onset of
  food pressure. The cap is **not** changed in that task.
- **INCONCLUSIVE** — the three decision seeds fall in three different classes.
  No conclusion is drawn and no follow-up diagnostic is added on the basis of
  it.

The reference seed 210866 is reported descriptively and never enters the rule.
No threshold, window, milestone, ceiling, horizon or seed may change after
results are seen. Reaching the ceiling is not "runaway" and not a biological
result; these runs are not calibration evidence and no `viableCompletionRate` is
reported from them. Nothing here is evidence about adaptation or intelligence.

### 15.10 Results

Implementation: commit `60bd999` (harness only; no simulation-core change; every
precommitted value transcribed unchanged and pinned by test). Run from that
clean commit: every replicate and the manifest record `gitCommit 60bd999…`,
`gitDirty false`, `sourceIdentity dcf95f68552c5122`, `simulationVersion 0A.2.0`.
4 replicates, 20,000 ticks, runaway cap not an early stop, safety ceiling 1000.
Output: `results/diagnostic-food-limitation-v1/` — `replicates.json`, the
200-tick standard timeseries, `flux-<seed>.csv` (one row per tick, accounting
identity asserted every tick) and `food-limitation-analysis.json`. No condition
summary was written, so no viable-completion figure exists for these runs.

Erratum, no substantive effect: §15.3 cites "§15.8" for the trajectory check;
the check is the integrity gate in §15.9.

#### Integrity gate — PASS on all four seeds

| Seed | Check tick | Expected hash | Observed hash | Also identical at that tick | Result |
|---:|---:|---|---|---|---|
| 139595 | 3037 | `7bc732eb4dfa8c7b` | `7bc732eb4dfa8c7b` | population, cumulative births/deaths, food | PASS |
| 123757 | 3094 | `4c4456bc83b5e842` | `4c4456bc83b5e842` | population, cumulative births/deaths, food | PASS |
| 107919 | 9793 | `da0a52515e7c9bc6` | `da0a52515e7c9bc6` | population, cumulative births/deaths, food | PASS |
| 210866 | 20000 | `16b073462ec8b5c4` | `16b073462ec8b5c4` | the full baseline result: termination, end tick, population, births, deaths, food, peak, outcome, generation depth, lineages | PASS |

The diagnostic is valid; each run is the baseline trajectory continued past
the point where the cap stopped it.

#### Per seed

| Seed | Role | End | Peak pop | Scarcity onset tick | Pop at onset | First tick ≥ 250 | Class |
|---:|---|---|---:|---:|---:|---:|---|
| 139595 | decision | horizon, pop 189 | 215 | 19746 | 190 | never | **C** (onset, never reached 250) |
| 123757 | decision | horizon, pop 310 | 351 | 19749 | 316 | 3320 | **A** (onset after 250) |
| 107919 | decision | horizon, pop 473 | 478 | none | — | 10644 | **B** (no onset) |
| 210866 | reference | horizon, pop 170 | 196 | none | — | never | (not classified) |

No run reached the safety ceiling. All four ran the full 20,000 ticks. Under
the unchanged `classifyRunOutcome` the three decision runs are labelled
`RUNAWAY_POPULATION` (peak ≥ 200) and 210866 `VIABLE_COMPLETION`, as in the
baseline; these labels are not a readout of this diagnostic.

Milestones reached (tick → population, trailing-200 mean food stock):
139595 — 200 at 3037 (53.1); no higher milestone. 123757 — 200 at 3094 (57.4),
250 at 3320 (56.4), 300 at 3719 (41.8); no higher. 107919 — 200 at 9793
(59.6), 250 at 10644 (59.4), 300 at 12000 (58.8), 400 at 18624 (58.3); no
higher. No milestone was scarce by the §15.8 criterion. Full records are in
`food-limitation-analysis.json`.

#### Determination: INCONCLUSIVE

The three decision seeds fall in three different classes — C, A, B. Per §15.9
no class reaches 2 of 3, so the outcome is **INCONCLUSIVE**. No conclusion is
drawn about whether the 200 cap masks food limitation, and no follow-up
diagnostic is added on the basis of this result. The cap, the ecology and the
model are unchanged.

#### Descriptive record (not a reclassification)

Recorded so the result is not misread. Nothing below alters the determination
above.

| Seed | Window | Population | Mean food stock | Trailing-200 range | Consumed per tick | Expected uncapped supply `2 x F̄` | Utilisation |
|---:|---|---|---:|---|---:|---:|---:|
| 139595 | ticks 4001–20000 | 165–214 (mean 190) | 42.7 | 29.6–56.1 | 0.986 | 0.990 | 1.00 |
| 123757 | ticks 4001–20000 | 287–351 (mean 320) | 37.6 | 29.7–50.0 | 1.005 | 1.000 | 1.01 |
| 107919 | ticks 10001–20000 | 214–478 (mean 341) | 59.1 | 56.9–59.8 | 0.567 | 0.947 | 0.60 |
| 210866 | ticks 10001–20000 | 117–196 (mean 160) | 59.8 | 59.4–60.0 | 0.297 | 1.096 | 0.27 |

- Once the cap no longer stopped them, none of the three decision worlds came
  near the 1000 safety ceiling within 20,000 ticks. 139595 and 123757 held roughly level
  populations for about 16,000 ticks: near 190 and near 320. 107919 was still
  rising at the horizon (473, peak 478).
- In 139595 and 123757 food was eaten at the rate the fertility field supplies
  it (utilisation 1.00 and 1.01) for about 16,000 ticks. Over that time the
  standing stock averaged 43 and 38. The trailing-200 mean first met the ≤ 30
  criterion only in the last 260 ticks of each run, and its lowest values in
  the whole run were 29.61 and 29.68. The onsets are therefore marginal.
  Food not eaten despite full supply use was still standing in the world.
- In 107919 the stock stayed near capacity (56.9–59.8) up to a population of 478.
  Consumption was 0.60 of the expected supply.
- The reference world 210866 held 117–196 organisms with a full food stock.
  Consumption was 0.27 of supply.

These are pilot-level descriptions of four worlds. They are not evidence of
adaptation, intelligence, or any evolutionary advantage.

---

## 16. Outcome classifier v2 — trajectory-based (DESIGN ONLY)

**Design only. Nothing is implemented, nothing is run, and no persisted result
is rewritten by this section.** The 200 cap is unchanged in code. The retrospective
check in §16.8 reads existing files and does not simulate.

### 16.1 Why the v1 rule is insufficient

The v1 rule (`classifyRunOutcome`, §14.29) labels a run `RUNAWAY_POPULATION` as
soon as its **peak** population reaches 200. §15 ran four worlds past that point
with the cap not used as an early stop. The three worlds v1 had labelled runaway
did not explode. 139595 held near 190 for about 16,000 ticks after a peak of 215.
123757 held near 310 after a peak of 351. 107919 was still climbing slowly at
the horizon (473). None came near the 1000 safety ceiling. A single crossing of
200 therefore does not separate unbounded growth from a high but bounded
population. v1 also cannot tell a world that grows without limit from one that
settles above 200, because it stops the run at 200 and discards what happens
next. Under v1 both are "runaway". That is too coarse to interpret.

### 16.2 Specification basis

- The LOCKED content of §6.30 / §14.29 is preserved. The cap is an
  experimental-execution safeguard, not a canonical population rule, and the
  canonical world never suppresses births.
- The cap value `min(8 x initialPopulation, 200)` and "reaching it ⇒ runaway"
  are [BASELINE] items: §6.30 calls it the "initial rule", and the §6.42 and
  §17.64 decision summaries list it under [BASELINE]. §14.26
  [LOCKED] expects baselines to change when pilot evidence justifies it, as a
  new version.
- §16.18 [LOCKED] defines viability as "sustained non-degenerate dynamics, not
  constant population size". Its named degeneracies are near-certain early
  extinction and "near-immediate unlimited growth". v2 classifies on exactly
  that distinction.
- §16.34 / §16.55: extinction and runaway stay legitimate, reported outcomes.
  No run is dropped.

So v2 is a versioned change to a [BASELINE] analysis rule. It is not a change to
any locked rule or to the model.

### 16.3 Classes and fixed parameters

Classifier id `trajectory-outcome-v2`. The v1 rule is `peak-cap-outcome-v1`.
v2 uses its own labels so the two can never be confused in a results file.

| v2 class | Meaning |
|---|---|
| `EXTINCT` | population reached 0 at any tick |
| `BOUNDED_VIABLE` | reached the horizon; population level over the terminal window; terminal-window mean < 200 |
| `HIGH_BOUNDED` | reached the horizon; population level over the terminal window; terminal-window mean ≥ 200 |
| `RUNAWAY_GROWTH` | reached the execution safety ceiling, **or** reached the horizon still growing at the growth criterion |
| `INCONCLUSIVE` | `TRUNCATED` (stopped early for any other reason, including the v1 cap), `DECLINING` (reached the horizon falling at the decline criterion), `INSUFFICIENT_SAMPLES`, or `ERROR` |

| Parameter | Value | Why |
|---|---|---|
| Horizon H | 20,000 ticks | the §14.28 / §16.34 [BASELINE] horizon; shown load-bearing in §10.5 |
| Terminal window W | ticks 14,001–20,000 (6,000) | two full `maxAge` spans, leaving the first 14,000 ticks as transient |
| Halves | E = 14,001–17,000, L = 17,001–20,000 (3,000 each) | each half is one full `maxAge` (3000). Every organism alive at the start of a half has died by its end, so a half-mean is taken over a population that has fully replaced itself. A plateau across both halves is self-replacing, not a surviving cohort. Averaging over a lifespan also damps cohort-timed oscillation |
| Samples | the standard 200-tick timeseries: 15 samples per half | already recorded for every 20,000-tick result; require ≥ 10 per half |
| Growth ratio r | mean population over L / mean population over E | a ratio of means, robust to the ±10–15% fluctuation seen in plateaus |
| Growth criterion | r ≥ 2^(3000/20000) = **1.1096** | at that terminal rate the population would at least double within one more 20,000-tick horizon: no bound has been demonstrated |
| Decline criterion | r ≤ 2^(−3000/20000) = **0.9013** | the mirror image: the population would at least halve within one more horizon |
| Level marker | terminal-window mean 200 | only splits `HIGH_BOUNDED` from `BOUNDED_VIABLE`. It is the old cap value (8 x the founding population), kept so reports show how many bounded worlds sit above it. No biological meaning |
| Safety ceiling | 1000 (§15.5) | EXECUTION SAFETY LIMIT for the default ecology. It sits above the hard food-supply bound (2 items/tick x 25 energy / 0.0607 drain ≈ 824). If food-supply parameters ever change, it must be re-derived the same way before use |

### 16.4 The rule, evaluated in order

1. The run errored → `INCONCLUSIVE (ERROR)`.
2. Population reached 0 → `EXTINCT`. This holds even after an earlier boom:
   extinction is the terminal fact.
3. Population reached the safety ceiling → `RUNAWAY_GROWTH (CEILING)`.
4. The run ended before 20,000 ticks for any other reason, including the v1
   cap → `INCONCLUSIVE (TRUNCATED)`.
5. Fewer than 10 samples in either half → `INCONCLUSIVE (INSUFFICIENT_SAMPLES)`.
6. r ≥ 1.1096 → `RUNAWAY_GROWTH (GROWING_AT_HORIZON)`.
7. r ≤ 0.9013 → `INCONCLUSIVE (DECLINING)`.
8. Otherwise the population plateaued over the terminal window:
   terminal-window mean ≥ 200 → `HIGH_BOUNDED`, else `BOUNDED_VIABLE`.

Every run is also annotated with its peak population, final population and a
`v1WouldBeRunaway` flag (peak ≥ 200). The flag makes the v1 → v2 difference
visible without changing any v1 record.

### 16.5 Food pressure and birth/death balance — confirmatory, not required

Food pressure is **reported, not required**. §15 showed the food stock is not a
reliable detector of limitation: in 139595 and 123757 consumption matched the
full supply rate while the stock averaged 38–43. The reference world 210866
stayed level with a full stock. Boundedness is a demographic property. Requiring
food scarcity would misclassify plateaus regulated by anything else. Reported per
run over W: mean food stock, and, where per-tick flux exists, consumption and
supply utilisation (consumed per tick / `2 x F̄`). No threshold is attached to
either.

Births and deaths over W are reported too. Their difference is exactly the
population change, so they cannot be an independent criterion. They show
turnover: a world that stays level for 6,000 ticks with `maxAge` 3000 must have
replaced itself at least once.

Neural, mutation, fitness and intelligence measures play no part.

### 16.6 Safety ceiling and late explosions

- **Ceiling.** Reaching it at any tick is `RUNAWAY_GROWTH (CEILING)`. That
  population is past the scale the food system could feed at measured drain,
  so boundedness cannot be shown within the run. The ceiling stays an execution
  limit, not a carrying capacity.
- **Late explosion.** A rise inside the last 3,000 ticks that lifts the L-mean
  to at least 1.1096 x the E-mean is `RUNAWAY_GROWTH`. A world that has not
  settled by the horizon has not demonstrated a bound, which is the
  conservative reading for a viability gate.
- **Short spike.** A spike too brief to move a half-window mean that far is
  fluctuation and does not change the class. The window maximum is reported.
- **Early explosion that later settles.** It is judged on the terminal window
  only. That is the case v1 got wrong: 139595 peaked at 215 and then held near
  190.
- **The v1 cap as an early stop.** The 200 cap may stay available to stop cheap
  exploratory runs early. Any run it stops is `INCONCLUSIVE (TRUNCATED)` under
  v2 and cannot count as viable, bounded or runaway.

### 16.7 Baseline gate under v2

**boundedCompletionRate = (BOUNDED_VIABLE + HIGH_BOUNDED) / N ≥ 0.70**, where N
is every run of the configuration, INCONCLUSIVE included.

- It is the §16.35 [BASELINE] ~70% gate read with v2's meaning of runaway. The
  numerical threshold is unchanged. §16.35 counts runs that reach 20,000 ticks
  "without extinction or runaway termination". Under v2, runaway means
  demonstrated growth (ceiling or growing at the horizon), not one crossing of
  200.
- `HIGH_BOUNDED` counts because a bounded, self-replacing plateau is sustained
  non-degenerate dynamics in the §16.18 [LOCKED] sense. The height of a bounded
  plateau is an ecological-scale property, not one of the named degeneracies.
  The `HIGH_BOUNDED` share is reported next to the rate, so a pass carried by
  high plateaus is visible. Any limit on plateau height would be a separate
  precommitted criterion, not part of this gate.
- `INCONCLUSIVE` runs stay in N and count against the gate. That includes
  `DECLINING`, conservatively. Gate-eligible runs must therefore run to 20,000
  ticks with the 200 cap **not** used as an early stop and the safety ceiling on.
  A configuration evaluated with the cap on would be almost entirely
  `TRUNCATED` and could not pass.
- The §17.28 [BASELINE] runaway-frequency figure (~≤ 10%) is neither changed nor
  adopted as a gate here. The `RUNAWAY_GROWTH` share is reported.
- Per §14.27 the classifier and gate are frozen with a configuration before any
  validation run. They may not be tuned afterwards.

### 16.8 Retrospective sanity check — the four §15 trajectories (read-only)

Applied once to `results/diagnostic-food-limitation-v1/timeseries-food-limitation.csv`
(200-tick samples). The rule was fixed before these numbers were computed.
**No revision was needed.**

| Seed | Peak | Final | E-mean | L-mean | r | Window mean (min–max) | W births / deaths | W mean food | v1 label | **v2 class** |
|---:|---:|---:|---:|---:|---:|---|---|---:|---|---|
| 139595 | 215 | 189 | 193.0 | 195.1 | 1.011 | 194.0 (176–206) | 1083 / 1089 | 39.4 | RUNAWAY | **BOUNDED_VIABLE** |
| 123757 | 351 | 310 | 316.5 | 308.0 | 0.973 | 312.2 (290–336) | 1240 / 1264 | 35.0 | RUNAWAY | **HIGH_BOUNDED** |
| 107919 | 478 | 473 | 338.4 | 400.9 | 1.185 | 369.7 (314–476) | 1069 / 927 | 58.4 | RUNAWAY | **RUNAWAY_GROWTH** (growing at horizon) |
| 210866 | 196 | 170 | 178.3 | 171.1 | 0.960 | 174.7 (161–193) | 506 / 497 | 59.8 | VIABLE | **BOUNDED_VIABLE** |

The same computation from the per-tick flux files gives the same four classes:
r = 1.006, 0.968, 1.174, 0.963. Supply utilisation over W, confirmatory only:
1.00, 0.99, 0.64, 0.29.

The classification is coherent with what the trajectories show:
- the two worlds that settled, one below and one above 200, are bounded;
- the world still rising at the horizon, with food at capacity, is not shown to
  be bounded;
- the never-capped reference stays `BOUNDED_VIABLE`, as under v1.

This is a sanity check of the rule on four pilot worlds. It is not a new
experiment, not calibration evidence and not a gate evaluation.

### 16.9 Scope of historical results

- Every classification already recorded — every `outcome` field, every
  extinct/runaway/viable count and every `viableCompletionRate` in §§2–15 — is
  a **v1 (`peak-cap-outcome-v1`) result** and stays exactly as recorded. No
  persisted file is edited.
- The decisions taken under v1 stand as decisions under v1. They are the
  calibration-v1/v2/v3 determinations, the §14 outcome C and the §15
  INCONCLUSIVE. Reclassification under v2 is descriptive re-analysis and does
  not reopen them.
- Reclassification, when implemented, writes v2 labels to **separate**
  fields/files tagged with the classifier version.
- What v2 can say about old data is limited by construction:
  - runs the cap stopped are `INCONCLUSIVE (TRUNCATED)` under v2;
  - v1-extinct runs are `EXTINCT`;
  - only runs that reached 20,000 ticks uncapped can receive a trajectory class;
  - 10,000-tick results fall below the minimum horizon, and only their
    extinctions are classifiable.
- `0A.1.0` and `0A.2.0` results stay separate under both classifiers.

### 16.10 Known limitations

- A population oscillating with a period near 3,000–6,000 ticks could push r
  across a threshold and be labelled growing or declining. Halves of one full
  lifespan reduce but do not remove this.
- A world still slowly rising at the horizon is `RUNAWAY_GROWTH` even if it
  would have settled later. That is deliberately conservative. The alternative
  would count an unproven bound as viable.
- Four trajectories are a sanity check, not a validation of the rule.

Nothing here is a claim about adaptation, intelligence or evolutionary
advantage.

---

## 17. `trajectory-outcome-v2` — implementation and reclassification of persisted results

**No simulation was run for this section.** Every classification below is
computed from persisted files, and no persisted result file was modified. The
sha256 of all 288 source JSON/CSV files is identical before and after. The only
simulation executed in this task was the standing golden-hash regression check.

### 17.1 Implementation

Commit `daab8b6`, harness only:

- `src/analysis/trajectoryOutcome.ts` — the pure classifier;
- `src/analysis/reclassify.ts` — read-only reader, eligibility and cohort
  summary;
- CLI `reclassify-trajectory` — read-only, runs nothing, consumes no seeds;
- 19 focused tests.

Every §16.3 parameter is transcribed unchanged and pinned by test:

- horizon 20,000;
- window (14000, 20000], split at 17000;
- at least 10 samples per half;
- growth threshold 2^(3000/20000) = 1.10957, shrink threshold 0.90125;
- `HIGH_BOUNDED` at a window mean of 200 or more;
- safety ceiling 1000.

The v1 rule (`classifyRunOutcome`) is untouched, and a test pins its behaviour.

Two points on how the implementation matches the design:

- **Labels.** The classes are named `EXTINCTION`, `BOUNDED_VIABLE`,
  `HIGH_BOUNDED`, `RUNAWAY` and `INCONCLUSIVE`. §16 wrote `EXTINCT` and
  `RUNAWAY_GROWTH`. This is a label change only, and all five names still
  differ from every v1 label. Reasons are recorded alongside:
  - `EXTINCT`, `SAFETY_CEILING`, `GROWING_AT_HORIZON`, `PLATEAU`;
  - `TRUNCATED`, `INSUFFICIENT_SAMPLES`, `DECLINING`, `ERROR`.
- **Order.** Evaluation follows §16.4: error, extinction, safety ceiling,
  truncation, samples, then the growth ratio. So a run that hits the ceiling
  early is `RUNAWAY`, not `INCONCLUSIVE (INSUFFICIENT_SAMPLES)`. No persisted
  run reached the ceiling, so this ordering affects no result below.

Output, version-tagged and separate from every source:
`results/reclassification-trajectory-outcome-v2/`, containing
`reclassification.json` and `reclassification.csv`. Each record carries:

- seed, `simulationVersion` and `classifierVersion`;
- final tick, peak and final population;
- early, late and window means, and the growth ratio;
- class and reason, and whether the safety ceiling was reached;
- window food, births and deaths (context only);
- the untouched v1 label;
- the source directory, timeseries file, `gitCommit`, `gitDirty`,
  `sourceIdentity` and `configHash`.

The reclassification itself ran from clean `daab8b6`
(`sourceIdentity 3437054f502219ba`).

### 17.2 Which persisted runs are eligible

In scope: every persisted experiment on the 20,000-tick horizon.

- `calibration-v2`: 6 cells, `0A.1.0`
- `calibration-v3`: 4 cells, `0A.1.0`
- `multifounder-default-baseline`: `0A.2.0`
- `diagnostic-food-limitation-v1`: `0A.2.0`

Out of scope:

- `diagnostic-movement-policy`: food and reproduction are disabled by design,
  so extinction is built in; it is not an ecological trajectory.
- Every 10,000-tick and 5,000-tick result: below the minimum horizon.

A run in scope is **eligible** only if its persisted trajectory is complete for
the classifier: it went extinct, reached the ceiling, or ran to 20,000 ticks,
and it has its 200-tick timeseries. A run stopped by the v1 cap has no
trajectory past population 200. It is **not reclassified**, and no class is
inferred for it.

| Model | Runs in scope | Eligible records | Distinct eligible trajectories | Not reclassified (stopped by v1 cap) |
|---|---:|---:|---:|---:|
| `0A.2.0` | 19 | 10 | 9 | 9 |
| `0A.1.0` | 150 | 87 | 77 | 63 |

Records and distinct trajectories differ because two pairs of files hold the
same trajectories. calibration-v2 cell 1 and calibration-v3 cell 0 are the same
`0A.1.0` default configuration. Seed 210866 appears in both the baseline and the
food-limitation diagnostic.

### 17.3 Results (eligible records; the two models are never pooled)

| Class | `0A.2.0` records (distinct) | `0A.1.0` records (distinct) |
|---|---:|---:|
| EXTINCTION | 5 (5) | 85 (76) |
| BOUNDED_VIABLE | 3 (2) | 0 |
| HIGH_BOUNDED | 1 (1) | 0 |
| RUNAWAY | 1 (1) | 0 |
| INCONCLUSIVE | 0 | 2 (1) |

The four uncapped food-diagnostic trajectories (`0A.2.0`):

| Seed | Early mean | Late mean | Final-6000 mean | Growth ratio | Peak | Final | v1 label | **v2 class** |
|---:|---:|---:|---:|---:|---:|---:|---|---|
| 139595 | 193.0 | 195.1 | 194.0 | 1.0107 | 215 | 189 | RUNAWAY | **BOUNDED_VIABLE** |
| 123757 | 316.5 | 308.0 | 312.2 | 0.9732 | 351 | 310 | RUNAWAY | **HIGH_BOUNDED** |
| 107919 | 338.4 | 400.9 | 369.7 | 1.1848 | 478 | 473 | RUNAWAY | **RUNAWAY** (growing at horizon) |
| 210866 | 178.3 | 171.1 | 174.7 | 0.9596 | 196 | 170 | VIABLE | **BOUNDED_VIABLE** |

These match the §16.8 sanity check exactly. The baseline copy of 210866 gives
the same result.

The `0A.1.0` model's one non-extinct eligible trajectory is seed 139595 in the
default configuration (calibration-v2 cell 1 ≡ calibration-v3 cell 0; v1
`VIABLE_COMPLETION`). Under v2 it is **INCONCLUSIVE (DECLINING)**: early mean
58.8, late 38.4, growth ratio 0.653, peak 109, final 40. The only world v1 ever
counted as viable in the single-founder model was shrinking at the horizon.

### 17.4 Cohorts and the gate

No cohort is complete. A cohort here means one configuration run on all 15
pilot seeds. Every cohort contains runs stopped by the v1 cap, so
**boundedCompletionRate is not computable for any cohort**, and the gate is not
applied.

For each incomplete cohort the table shows the range the rate could take under
**every** possible class of its missing runs. This is not a rate estimate and
not a gate evaluation.

| Cohort | Eligible / 15 | Known classes | Missing | Possible range | Could reach 0.70? |
|---|---:|---|---:|---|---|
| `0A.2.0` multifounder-default-baseline | 6 | 5 E, 1 BV | 9 | 0.067–0.667 | no |
| `0A.2.0` default, baseline + verified uncapped continuations (below) | 9 | 5 E, 2 BV, 1 HB, 1 R | 6 | 0.200–0.600 | no |
| `0A.1.0` calibration-v2, 6 cells | 7–10 | all E, except 1 INCONCLUSIVE in cell 1 | 5–8 | max 0.333–0.533 | no |
| `0A.1.0` calibration-v3, 4 cells | 9–10 | all E, except 1 INCONCLUSIVE in cell 0 | 5–6 | max 0.333–0.400 | no |

The second row assembles the `0A.2.0` default configuration seed by seed. It
takes the baseline record, or — where the v1 cap stopped the baseline — the
`diagnostic-food-limitation-v1` run of that seed. It uses a continuation only
when the `configHash` is identical and the §15.9 integrity gate passed for that
seed, i.e. the run is proven to be the same trajectory continued.

### 17.5 Can the amended-model baseline be assessed under v2?

**No — the complete 15-seed `0A.2.0` default baseline cannot be reclassified.**
Six pilot seeds have no trajectory past population 200. The v1 cap stopped them
in `multifounder-default-baseline`, and nothing has continued them:

| Seed | Stopped by v1 cap at tick |
|---:|---:|
| 115838 | 3389 |
| 179190 | 3587 |
| 155433 | 3597 |
| 163352 | 3782 |
| 171271 | 6444 |
| 202947 | 18876 |

Their v2 classes are unknown and are not inferred.

What the persisted data does settle is narrower. The baseline cohort alone
already contains 5 extinctions. A 15-run cohort can pass the 0.70 gate with at
most 4 runs that are neither `BOUNDED_VIABLE` nor `HIGH_BOUNDED`. So **the
`0A.2.0` default configuration cannot reach the gate under v2, whatever the
missing six turn out to be.** That follows from the extinctions alone, which are
certain under both classifiers. Every `0A.1.0` cohort is excluded the same way,
by its 7–9 extinctions.

### 17.6 Limitations

- Old early-stop runs are the binding limitation. 72 of 169 in-scope records
  (9 `0A.2.0`, 63 `0A.1.0`) were stopped by the v1 cap and cannot be
  reclassified.
- Among 20,000-tick results, only extinctions and the few worlds the cap never
  stopped can be classified. The 10,000-tick results cannot be classified at
  all.
- The window and half lengths are tied to the default `maxAge` (3000).
  calibration-v3's `maxAge 6000` cells are classified with the same fixed
  numbers. Every run in them is extinct or cap-stopped, so no classification is
  affected.
- Four uncapped trajectories and one declining `0A.1.0` world are the only
  non-extinct v2 classifications on record. They describe individual worlds,
  not a regime.

### 17.7 Historical scope — unchanged

Every classification in §§2–15 remains a `peak-cap-outcome-v1` result. That
covers each `outcome` field, the extinct/runaway/viable counts and every
`viableCompletionRate`. The decisions taken under v1 stand. v2 labels live only
in the reclassification output. `0A.1.0` and `0A.2.0` are never pooled. Nothing
here is evidence about adaptation, intelligence or evolutionary advantage.

---

## 18. `continuation-multifounder-default-v1` — completing the 15-seed `0A.2.0` default profile (PRECOMMITMENT)

**Written and committed before any code for this run exists and before anything
is run. §18.6 is empty at this point.**

**This is not a qualification attempt.** Under `trajectory-outcome-v2` the
`0A.2.0` default baseline has **already failed** the ~70% gate. It has 5
EXTINCTION runs among its 15 pilot seeds, and a passing 15-run cohort can have
at most 4 runs that are neither `BOUNDED_VIABLE` nor `HIGH_BOUNDED` (§17.5).
Nothing these six runs show can change that. Their only purpose is to complete
the descriptive 15-seed outcome profile of the default multi-founder model.

### 18.1 Design (fixed)

| Item | Value |
|---|---|
| Id | `continuation-multifounder-default-v1` |
| Model | `simulationVersion 0A.2.0`, `founderGroupCount = 5`, `DEFAULT_SIMULATION_CONFIG` with no override |
| Seeds | the six pilot seeds the v1 cap stopped in `multifounder-default-baseline`: **115838, 155433, 163352, 171271, 179190, 202947**. The other nine are not rerun |
| Horizon | 20,000 ticks |
| Early stops | extinction; the diagnostic **execution safety ceiling of 1000** (`SAFETY_CEILING`); nothing else. The 200 cap does **not** stop execution |
| Recorded | standard 200-tick timeseries (what the classifier reads), per-tick food flux (context), replicate summaries |
| Classification | `trajectory-outcome-v2` exactly as implemented in `daab8b6`. Thresholds unchanged; the ceiling is not a classification rule beyond §16.4 step 3 |
| Output | `packages/experiment-harness/results/continuation-multifounder-default-v1/` |
| Provenance | clean committed worktree; each replicate records `gitCommit`, `gitDirty = false`, `sourceIdentity`, `simulationVersion`; the classification records `classifierVersion` |
| Validation seeds | not used |

### 18.2 Validity check, per seed, before any interpretation

At the tick where the baseline run stopped, the continuation must agree
**exactly** with the persisted baseline replicate on five things: the canonical
state hash, population, cumulative births, cumulative deaths and food count.

| Seed | Stop tick | `finalStateHash` | Population | Births | Deaths | Food |
|---:|---:|---|---:|---:|---:|---:|
| 115838 | 3389 | `187ce9dba4a57f07` | 200 | 259 | 84 | 60 |
| 155433 | 3597 | `f324c5ff4e03f447` | 200 | 371 | 196 | 60 |
| 163352 | 3782 | `11e00e24d8788908` | 200 | 425 | 250 | 56 |
| 171271 | 6444 | `ec2ca3f9ae35a43b` | 200 | 466 | 291 | 53 |
| 179190 | 3587 | `bfff9ef115a23623` | 200 | 289 | 114 | 57 |
| 202947 | 18876 | `b6fbde0b63d26a5d` | 200 | 1484 | 1309 | 57 |

Values are transcribed from `results/multifounder-default-baseline/replicates.json`
(commit `d9dfb92`).

A seed that fails is **INVALID**. Its continuation is not interpreted, only the
reproducibility failure is investigated, and the model is never altered to
force a match.

### 18.3 The 15-seed profile

Each seed contributes exactly one record:

- **Baseline record**, where the baseline trajectory is complete: seeds 100000,
  131676, 147514, 187109 and 195028 (EXTINCTION), and 210866 (reached 20,000).
- **Verified continuation from `diagnostic-food-limitation-v1`**: 139595,
  123757 and 107919. Their §15.9 integrity gate passed with the same
  `configHash`.
- **Verified continuation from this run**: the six seeds above, where valid.

Reported for the 15:

- count and rate of each v2 class, and `boundedCompletionRate`;
- mean and median final population, mean births and maximum generation depth.

These are taken from each seed's chosen record. The `boundedCompletionRate` is
**descriptive**: the gate verdict is already FAIL and is not re-evaluated. If
any seed is INVALID, the profile is reported as incomplete for that seed, and
nothing is inferred for it.

### 18.4 Interpretation, fixed in scope

After the profile is complete, answer **one** question: what does the full
15-seed profile suggest is the dominant failure mode of the default `0A.2.0`
model? Then identify **one** smallest next model-level question. No parameter
sweep is proposed, and no change is implemented.

### 18.5 Not claimed

No claim about adaptation, intelligence or evolutionary advantage. The `0A.1.0`
and `0A.2.0` results stay separate.

### 18.6 Results

Implementation: commit `58d3cd1`. It is harness-only: the precommitted constants
are pinned by test, and a test shows an uncapped run reproduces the capped
baseline's exact stop state for seed 179190. The run used that clean commit.
All six replicates record `gitCommit 58d3cd1…`, `gitDirty false`,
`sourceIdentity 0d5741e27a0d291a`, `simulationVersion 0A.2.0`. The
classification records `classifierVersion trajectory-outcome-v2`.

Output: `results/continuation-multifounder-default-v1/`. It contains
`replicates.json`, the 200-tick standard timeseries, `flux-<seed>.csv` and
`continuation-analysis.json`. The 15-seed profile was then produced read-only
by `reclassify-trajectory` into `results/reclassification-trajectory-outcome-v2/`.
All 299 source JSON/CSV files were byte-identical before and after that step.

#### Validity check — PASS on all six seeds

At each baseline stop tick, the canonical hash, population, cumulative births,
cumulative deaths and food count all matched the persisted baseline exactly.
No seed is INVALID.

#### The six continued seeds

| Seed | Old stop tick | Validity | Peak | Final | Early / late mean | Growth ratio | Window mean food | Class |
|---:|---:|---|---:|---:|---|---:|---:|---|
| 115838 | 3389 | PASS | 309 | 261 | 285.5 / 276.5 | 0.9687 | 56.1 | HIGH_BOUNDED |
| 155433 | 3597 | PASS | 340 | 288 | 308.0 / 305.6 | 0.9922 | 41.5 | HIGH_BOUNDED |
| 163352 | 3782 | PASS | 213 | 147 | 151.1 / 142.0 | 0.9400 | 43.3 | BOUNDED_VIABLE |
| 171271 | 6444 | PASS | 331 | 316 | 302.8 / 307.0 | 1.0139 | 48.6 | HIGH_BOUNDED |
| 179190 | 3587 | PASS | 298 | 224 | 223.2 / 216.1 | 0.9683 | 41.7 | HIGH_BOUNDED |
| 202947 | 18876 | PASS | 221 | 213 | 128.1 / 194.1 | 1.5151 | 59.2 | RUNAWAY (growing at horizon) |

All six ran the full 20,000 ticks. None came near the safety ceiling; the
highest peak was 340.

#### The complete 15-seed `0A.2.0` default profile

Each seed contributes one record:

- the baseline record for the 5 extinct seeds and for 210866;
- the verified continuation from `diagnostic-food-limitation-v1` for 139595,
  123757 and 107919;
- this run for the six above.

| Class | Count | Rate | Seeds |
|---|---:|---:|---|
| EXTINCTION | 5 | 33.3% | 100000, 131676, 147514, 187109, 195028 |
| BOUNDED_VIABLE | 3 | 20.0% | 139595, 163352, 210866 |
| HIGH_BOUNDED | 5 | 33.3% | 115838, 123757, 155433, 171271, 179190 |
| RUNAWAY | 2 | 13.3% | 107919, 202947 |
| INCONCLUSIVE | 0 | 0.0% | — |

| Figure (15 seeds) | Value |
|---|---:|
| boundedCompletionRate | **0.533** (8 of 15) |
| mean final population | 172.7 |
| median final population | 189 |
| mean births | 2056 |
| maximum generation depth | 29 |

Maximum generation depth uses the existing replicate field: the deepest
generation alive at the end of the run.

**BASELINE GATE FAILED.** 0.533 < 0.70. The verdict was fixed before this run
(§17.5), and these six outcomes do not reopen it.

### 18.7 Dominant failure mode

**Extinction-dominated. The failure is one of establishment, not of runaway
growth.**

- **The worlds split cleanly in two.**
  - The 5 extinct worlds never grew. Their peak populations were 28–37 against
    a founding population of 25. They produced only 10–119 births in total
    and died out at ticks 3000–18374.
  - Every one of the other 10 worlds reached at least 196 organisms.
  - No world sits in between.
- **Of the 10 worlds that established, 8 settled into bounded plateaus.**
  Window means ranged from 146.5 to 312.2.
- **The 2 `RUNAWAY` worlds were only slow risers.** Both were still climbing at
  the horizon: 107919 reached 473, and 202947 reached 213 after first touching
  200 at tick 18876. Neither approached the safety ceiling.
- **Extinction alone decides the gate.** At 5 of 15 it rules out 0.70 however
  the rest behave. Without it, the established worlds would give 8 bounded out
  of 10.

This is pilot evidence from 15 seeds under one configuration. It is a
description of the default regime. It is not a claim about adaptation,
intelligence or selection.

### 18.8 Next scientific question

**Is extinction in the default `0A.2.0` model an establishment failure of the
founding cohort — decided within the first founder lifespan (3,000 ticks) by
how much food the founding controllers acquire — rather than by later
ecological dynamics?**

This is a question only. Nothing is implemented, no model or parameter
changes, and no sweep is proposed.
