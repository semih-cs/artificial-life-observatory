# Phase 0A Amendment — Multi-Founder Initialization

**Status:** ADOPTED. Amends §13.76 (Founder Neural Genome generation and
deterministic bootstrap construction) of
`Artificial Life Observatory - Spec v4 (Phase 0A Hotfixed).docx`.

**Model versions**

| Version | Bootstrap rule | Golden hash (seed 20260910, 10,000 ticks) |
|---|---|---|
| `0A.1.0` — historical, single-founder | 1 founder controller, 25 near-clones | `6a6576bd49e86b27` |
| `0A.2.0` — amended, multi-founder | 5 independent founder controllers, 5 organisms each | `b95a0b4ef7dd8449` |

Both remain runnable and both hashes are live regression tests. The historical
model is reachable via `singleFounderModelConfig()`.

---

## 1. Why the calibration cycle was closed

The Phase 0B parameter-sweep calibration cycle ran three sweeps —
`calibration-v1` (energy and resource coefficients), `calibration-v2` (standing
food density and reproductive window) and `calibration-v3` (the reproduction
gate and cohort turnover) — covering 22 configurations. It was declared
**unsuccessful**: at the gated 20,000-tick horizon no configuration exceeded a
**6.7%** viable-completion rate against a ~70% gate, and the best cell was the
Phase 0A default itself. Every configuration landed in the same bimodal regime
of early extinction or runaway growth.

Full record: `docs/Phase 0B Pilot Report.md` §11.6–§11.7.

## 2. Why this amendment is being made

The calibration cycle identified one model-level question (pilot report §11.8),
and this amendment answers it.

Across the 10 configurations run at the gated horizon — spanning a 4x change in
standing food density, maturity age 300 vs 500, reproduction gate 75 vs 90, and
maximum age 3000 vs 6000 — **11 of 15 seeds produced an identical outcome in
every single configuration** (7 always extinct, 4 always runaway). Under the
default configuration, births by seed split with no middle ground: every extinct
world produced at most 36 births, every non-extinct world at least 270.

A seed fixes the founder neural genome. Under §13.76 as written, all 25
organisms are perturbations of **one** accepted founder, with
`morphBootstrapSigma` about 1% of each gene range and `neuralBootstrapSigma`
0.05. A world therefore began with almost no standing behavioural variation, and
one bootstrap draw decided its whole early trajectory. Ecological calibration
cannot reach a regime that the founder draw has already settled.

The amendment introduces deterministic **standing neural diversity at
initialization** so that a single controller draw no longer dominates a world.

**This is not an attempt to produce smarter organisms.** The acceptance gate is
unchanged, founders are never compared, and nothing about learning, sensing or
action is touched.

## 3. What exactly changed

`bootstrap.founderGroupCount` (default **5**) replaces the implicit single
founder:

- exactly `founderGroupCount` founder neural genomes are generated, in order,
  from BootstrapRNG;
- each is generated **independently** and accepted by the **same unchanged**
  §13.76 validity + viability gate, first passing candidate wins;
- the initial population is divided into contiguous, evenly sized groups —
  25 organisms over 5 groups is exactly 5 each;
- organism `i` is perturbed from the founder of group
  `founderGroupOfIndex(i, N, G)`.

`simulationVersion` moves from `0A.1.0` to `0A.2.0`, so persisted results are
attributable to a model.

Two small robustness rules, so focused tests with tiny populations keep working:
the group count is capped at the population size, and when the division is not
exact the remainder is spread deterministically over the earliest groups. At the
default 25/5 the division is exact and no founder is over- or under-represented.

### Explicitly NOT changed

- The founder viability gate — the five §13.76 checks and their fixtures are
  untouched, neither strengthened nor weakened.
- **No ranking, no scoring, no best-of-N, no trajectory fitness, no comparison
  between accepted founders, no cherry-picking.** Founder *k* is accepted
  without ever being measured against founder *j*. A test replays the exact draw
  sequence and confirms each accepted founder is the first candidate that
  passed.
- Morphology initialization — founder morphology is still the RNG-free midpoint
  of each gene range, and the per-organism bootstrap perturbation is retained
  unchanged for both morphology and neural parameters.
- All runtime biology: sensing, movement, energy, feeding, death, reproduction.
- Mutation rules after reproduction, and offspring-only mutation.
- BootstrapRNG / CanonicalRNG separation. CanonicalRNG is still untouched until
  the first tick.
- Genome immutability during a lifetime; Sense → Decide → Resolve; canonical
  ordering; no hidden randomness; no central fitness; no behavioural
  hard-coding.
- No new sensing, actions, learning, memory, topology evolution, ecology or
  fitness concepts.

## 4. Determinism and versioning

The amended model is deterministic: the same seed produces the same canonical
trajectory, verified across independent processes. Its regression reference is
`b95a0b4ef7dd8449` (seed 20260910, 10,000 ticks).

`6a6576bd49e86b27` belongs to the historical single-founder model. It is **not**
a regression target for the amended model, whose trajectory differs by design.
It remains documented and continues to pass as a live test against
`singleFounderModelConfig()` — which is also the strongest evidence that nothing
outside the bootstrap rule changed.

## 5. Status of existing results

`calibration-v1`, `calibration-v2` and `calibration-v3`, the four diagnostics,
the movement-policy diagnostic and the 2x2 mutation factorial **remain valid
historical results for the single-founder model (`0A.1.0`)**. They are not
invalidated and they are not to be re-run.

They must **not** be pooled or compared numerically with results from the
amended model. Any future calibration cycle belongs to `0A.2.0` and starts from
its own baseline.

The held-out validation seeds remain **untouched** and are unaffected by this
amendment.

## 6. What this amendment does not claim

It does **not** claim that founder diversity will produce a viable ecological
regime. That is the open question the next pilot exists to answer. It makes no
claim about adaptation, intelligence or the value of mutation. Removing a
bootstrap bottleneck changes a starting condition; it does not make an organism
better at anything.
