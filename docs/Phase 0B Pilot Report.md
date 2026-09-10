# Phase 0B Pilot Report

**Status: pilot evidence only. No configuration has been frozen. The held-out
validation seeds are untouched.**

> **Model scope.** Sections 1–11 describe the historical **single-founder**
> model (`simulationVersion 0A.1.0`). §12 records the adopted amendment to
> multi-founder initialization (`0A.2.0`). §14 is the first `0A.2.0` result:
> the multi-founder default baseline. Results from the two models are separate
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
| The population adapted / intelligence increased | **No** | no confirmatory design has been run; no probe data collected |

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

*(empty at precommitment)*
