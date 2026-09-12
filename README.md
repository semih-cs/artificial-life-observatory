# Artificial Life Observatory

**v1 — complete.** A deterministic artificial-life simulation, a persistent
world that runs on your machine, and the Observatory: a read-only browser
window onto that world. Organisms with a five-gene morphology and a
fixed-topology feedforward neural controller live, move, eat, reproduce,
mutate and die in a bounded 2D world with a static seeded fertility field;
you watch lineages grow and vanish, generations advance, and inherited
morphology change from parent to child. Everything runs locally: no
database, no cloud, no accounts (see *V1 boundaries*).

**V2 has started.** V2.1 adds a new, separately versioned biological model,
`0A.3.0`, in which organisms can also *perceive* the nearest visible other
living organism (four extra sensory inputs, a 10 → 8 → 4 controller). It adds
no action and no interaction, and the frozen v1 models `0A.2.0` and `0A.1.0`
are unchanged. The Observatory draws the selected organism's vision cone. See
*V2.1 — other organisms enter the sensory world* below.

**V2.2 adds memory.** Model `0A.4.0` gives each organism a small recurrent
(Elman) hidden state, so what it does can depend on what it recently sensed,
not only on the current input. The recurrent weights are inherited genome;
the memory itself is runtime state that starts empty and is never inherited.
There is no learning of any kind during life. `0A.1.0`–`0A.3.0` are unchanged.
See *V2.2 — recurrent memory* below.

**V2.3 gives them bodies.** Model `0A.5.0` makes organisms physically occupy
space: each one is a circle whose radius comes from its inherited `size` gene,
and two that overlap are pushed apart — the larger one moving less. That is
all it is. No attack, no damage, no predation, no new input or output, no push
action; existing movement simply starts to have physical consequences when
bodies meet. `0A.1.0`–`0A.4.0` still pass straight through one another. See
*V2.3 — physical bodies* below.

**V2.4 makes food contestable.** Model `0A.6.0` stops eating being
instantaneous: an organism must handle a food item for five consecutive ticks
before it gets the energy, the item travels with the handler meanwhile, and
physical contact with another organism knocks it loose. Still no steal, defend,
attack, carry or share action — the existing `eat` output does all of it, and
an interrupted item simply becomes free again for anyone. `0A.1.0`–`0A.5.0`
keep eating in a single tick. See *V2.4 — contestable food handling* below.

**V2.5 adds lifetime plasticity.** Model `0A.7.0` keeps the `0A.6.0`
controller and world, but gives each organism 36 runtime offsets on its final
action readout and 36 eligibility traces. A deterministic local rule reinforces
recent neural activity from actual capped food energy gained minus actual
movement energy spent. The 188-parameter genome remains immutable and is the
only inherited controller state. Snapshot format is v4; observer protocol is
still v1. See *V2.5 — lifetime plasticity* below.

Five workspace packages:

| Package | Phase | Purpose |
|---|---|---|
| `packages/simulation-core` | 0A | the deterministic headless biological simulation |
| `packages/experiment-harness` | 0B | multi-seed experiments, metrics, probes, calibration analysis |
| `packages/persistence` | 0C | versioned world snapshots: save, load, resume exactly; a snapshot store with retention and fallback recovery |
| `packages/world-runner` | 0C → 0D bridge | the persistent world process: create or recover a world, run it continuously, save periodically, stop cleanly; optional tick pacing and a read-only WebSocket observer stream |
| `packages/observatory` | 0D | the Observatory frontend (React + TypeScript + Vite + PixiJS): watch the live world in a browser — organisms, lineages, food, births and deaths, an organism inspector, and an evolution panel (living lineages, session-only trends, birth/death feed) parent → child morphology comparison and a compact ancestry strip. Read-only |

## Quick start

You need Node.js 20+ (developed on Node 22) and two terminals.

```bash
npm install            # once — installs the workspace from package-lock.json

npm run demo:new       # terminal 1 — creates worlds/demo with the DEMO seed and starts streaming it
npm run observatory    # terminal 2 — the Observatory → open http://localhost:5173/
```

The page connects by itself. You will see organisms (coloured by lineage)
moving over a dark floor, food as small points, and on the right the
Evolution panel: living lineages, population and generation trends, and a
feed of births and deaths. Click any organism to inspect it — its genes next
to its parent's, and its observed ancestry back to a founder. Press `?` in
the top-right for the controls.

**Stop:** `Ctrl+C` in terminal 1. The runner finishes the current tick,
saves a snapshot and exits; the page shows *Disconnected* and keeps the last
world visible.

**Resume the same world later:**

```bash
npm run demo:resume    # terminal 1 — recovers worlds/demo from its newest valid snapshot and continues
```

`demo:new` is refused (exit 1, nothing touched) if `worlds/demo` already
holds a world, so it can never overwrite one. To start over, delete
`worlds/demo` yourself first.

**Two ways to skip the crowded opening.** A fresh world starts with 25
founders (5 founder groups × 5, the frozen `0A.2.0` bootstrap) and fills
to its food-limited level of ≈ 350 organisms within the first ≈ 4,000
ticks; that early burst is the empty world filling up, not a fast
reproduction setting. If you would rather watch the settled world, or watch
the burst more slowly:

```bash
npm run demo:new:settled   # terminal 1 — creates worlds/demo, fast-forwards to tick 5,000 unpaced (a few seconds), then streams at 10 ticks/s
npm run demo:resume:slow   # terminal 1 — resumes worlds/demo at 3 ticks/s instead of 10
```

Both are plain `npm run world` invocations (`--until-tick 5000`, then the
resume command; `--ticks-per-second 3`). Pace only decides when ticks run —
the world's trajectory is identical at any pace.

**What is where.** The world lives in `worlds/demo/` as local JSON snapshots
(newest five kept, gitignored). The observer stream binds `127.0.0.1:8787`
only and is read-only: the page cannot send anything to the world, and it
has no server, database or accounts. What the page shows beyond the live
frame — trends, the birth/death feed, parent comparisons, ancestry — is
derived in the browser from the frames it received while open, and is
forgotten on reload; only the world itself persists.

**DEMO seed — presentation only.** `demo:new` uses seed `31415926`. It was
picked because, under the frozen v1 configuration, it gave a long-lived
world with visible lineage turnover and advancing generations in a 40,000-
tick headless check (population ≈ 100 at tick 2,000, ≈ 350–380 from tick
4,000 on; 18 living lineages at tick 2,000 narrowing to 1 by tick 30,000;
maximum generation 36 at tick 40,000). That is a choice for watching, not a
finding: it is outside the pilot and validation seed sets, it is not
research evidence, and it says nothing about typical or "best" worlds. The
canonical regression seed and golden hashes are unchanged (`b95a0b4ef7dd8449`
for seed 20260910).

Full details: *Observatory (Phase 0D)* below.

**A V2.1 world (model `0A.3.0`).** `demo:new` keeps creating a frozen v1
(`0A.2.0`) world. To watch organisms that can sense one another, create a
world with `--model 0A.3.0` (any seed outside the pilot and validation sets;
`20260910` is the canonical regression seed):

```bash
npm run world -- --dir worlds/v2 --new --seed 20260910 --model 0A.3.0 --ticks-per-second 10 --observe 8787
npm run world -- --dir worlds/v2 --ticks-per-second 10 --observe 8787   # later: resume it (it stays 0A.3.0)
```

Click an organism to see its vision cone. No DEMO seed has been chosen for
`0A.3.0`; the v1 DEMO seed gives a small population under this model.

**A V2.2 world (model `0A.4.0`, recurrent memory)** works the same way:

```bash
npm run world -- --dir worlds/v22 --new --seed 8 --model 0A.4.0 --ticks-per-second 10 --observe 8787
```

Seed 8 is only the first small seed whose `0A.4.0` world was still alive at
tick 10,000 in our checks (many die out early, including the canonical seed);
it is not a DEMO seed and not evidence of anything.

## Status

| Track | Status |
|---|---|
| Phase 0A — simulation core | **complete, frozen**. The v1 biological model is `simulationVersion 0A.2.0`, multi-founder, `founderGroupCount 5` |
| Phase 0B — engineering (harness, diagnostics, classifiers) | **complete, frozen** |
| Phase 0B — research calibration | **exploratory, closed for v1**. The ~70% research gate was not met. That is not a v1 blocker |
| Phase 0C — persistent canonical world | **complete for v1.** Done: exact save/load/resume, the snapshot store (retention, world identity, fallback recovery, quarantine), the persistent world runner, and the read-only observer bridge (WebSocket frames, tick pacing) |
| **V2.1 — other organisms enter the sensory world** | **done.** New model `simulationVersion 0A.3.0` (10 → 8 → 4): the `0A.2.0` model plus four inputs describing the nearest visible other living organism. Perception only — no new action or interaction. Golden hash `e54d0c11249b7849`. Snapshot format v1 unchanged; observer protocol v1 unchanged; the Observatory adds the selected organism's vision cone |
| **V2.2 — recurrent memory** | **done.** New model `simulationVersion 0A.4.0` (10 → 8 recurrent → 4): the `0A.3.0` model with an Elman hidden layer, h_t = tanh(W_in x_t + W_rec h_(t−1) + b). +64 inherited recurrent weights (188 parameters); runtime memory starts at zero and is never inherited; no lifetime learning. Golden hash `436a377506063609`. New snapshot format v2 for `0A.4.0` (memory is future-affecting state); format v1 unchanged for the older models; observer protocol v1 unchanged; no new UI |
| **V2.3 — physical bodies** | **done.** New model `simulationVersion 0A.5.0`: the `0A.4.0` controller exactly (same 10 inputs, same recurrence, same 4 outputs, same 188 parameters) plus solid bodies. An organism occupies a circle of radius `2.0 + 2.2 × size` world units; two living organisms overlap when their centre distance is strictly less than the sum of their radii, and are separated along the line of centres with the larger body moving less. Displacement only — no damage, attack, predation, energy transfer, event or new state. Feeding uses post-collision positions, so a shove can take an organism out of reach of food. Golden hash `1006a56393e19cd9`. Snapshot format stays v2, observer protocol stays v1, and `0A.1.0`–`0A.4.0` are unchanged |
| **V2.4 — contestable food handling** | **done.** New model `simulationVersion 0A.6.0`: the `0A.5.0` world exactly (same 10 inputs, same recurrence, same 4 outputs, same 188 parameters, same solid bodies) plus multi-tick, contestable eating. An item is acquired by the existing `eat` output under the unchanged nearest-wins competition, travels with its holder, advances one step per consecutive handling tick and is consumed at 5; `eat = false` releases it; genuine organism-organism body contact dislodges it; a dropped item cannot be reacquired until the next tick; progress resets on release, dislodgement and death; held items count towards the food cap. No steal/defend/attack/share rule, no new input or output. Golden hash `3e5b9671f5750712`. New snapshot format **v3**; observer protocol stays v1; `0A.1.0`–`0A.5.0` unchanged |
| **V2.5 — lifetime plasticity** | **done.** New model `simulationVersion 0A.7.0`: all `0A.6.0` capabilities plus 36 non-inherited runtime offsets on hidden→output weights and output biases, with 36 eligibility traces. Learning rate `0.01`, decay `0.90`; reinforcement is actual capped food credit minus actual movement cost, normalized by energy capacity. Genome stays immutable at 188 parameters. Golden hash `04d0b7c5917ca0c0`. Snapshot format **v4**; observer protocol stays v1; `0A.1.0`–`0A.6.0` unchanged |
| **Phase 0D — Observatory UI** | **complete, frozen for v1.** Slices 1–4 plus the final polish (organism quick-jump, first-run card, demo scripts, help hint). `packages/observatory` renders the live world from the read-only observer stream (protocol v1): organisms with lineage colours, heading and energy, food, births and deaths, camera, selection and an organism inspector (slice 1); an evolution panel with living lineages, a birth/death event feed and session-only population/generation trends (slice 2); inherited morphology in the inspector — the five protocol genes next to the parent's with exact deltas, a Δ count on births, parent navigation (slice 3); a compact ancestry strip walking the observed parent chain back to the founder with a Δ badge per hop (slice 4). **v1 is complete**; further work is v2 unless it is a genuine v1 bug |

**The simulation works.** Organisms move, sense, eat, spend energy, reproduce,
inherit and mutate genomes, form lineages and evolve across generations. All of
it is deterministic: the same seed and configuration always give the same world
(golden hash `b95a0b4ef7dd8449`).

Under the default configuration some worlds die out, some grow without settling,
and many live for tens of thousands of ticks at a stable population of about
150–320 organisms. The 15-seed pilot profile and everything learned in Phase 0B
are in `docs/Phase 0B Pilot Report.md`; its closure is §23.

**v1 is complete.** Phase 0C makes a world save, load and resume exactly;
Phase 0D lets you watch it live and inspect organisms, lineages, inherited
morphology and ancestry — see *Observatory (Phase 0D)* and *V1 boundaries*.

The biology is frozen for v1: do not change it unless a genuine bug is found.
The held-out validation seeds are reserved for future research and must not be
used.

---

## V2.1 — other organisms enter the sensory world (model `0A.3.0`)

The first biological slice of V2. Normative contract:
`docs/V2.1 Amendment - Organism Sensing (0A.3.0).md`.

**Models side by side** (all three runnable; golden hashes for seed
20260910, 10,000 ticks, confirmed on linux-arm64 — see *Platform note*):

| Model | What | Topology | Golden hash |
|---|---|---|---|
| `0A.1.0` | historical single-founder (frozen) | 6 → 8 → 4 | `6a6576bd49e86b27` |
| `0A.2.0` | v1 multi-founder (frozen; `DEFAULT_SIMULATION_CONFIG`) | 6 → 8 → 4 | `b95a0b4ef7dd8449` |
| `0A.3.0` | V2.1: `0A.2.0` + organism sensing (`organismSensingModelConfig()`) | 10 → 8 → 4 | `e54d0c11249b7849` |

The two v1 hashes are unchanged; the `0A.3.0` hash is evidence of
deterministic trajectory stability for the new model, not of biological
quality.

**The four new inputs** (appended after the six v1 inputs, whose meaning and
order are unchanged):

| # | Input | With a target | Nothing visible |
|---|---|---|---|
| 6 | `organismVisible` | 1 | 0 |
| 7 | `organismDistance` | centre distance / own `visionRange`, clamped to [0, 1] | 0 |
| 8 | `organismAngle` | relative bearing / π, food convention (positive = clockwise/right); 0 at zero distance | 0 |
| 9 | `organismRelativeSize` | (target.size − own size) / (sizeMax − sizeMin) from `bootstrap.geneBounds.size`, clamped to [−1, 1] | 0 |

**Which organism.** Candidates are the other organisms alive in the
pre-decision snapshot. One is visible when its centre is within the sensing
organism's own `visionRange` (inclusive) and within ±`visionAngle`/2 of its
heading (inclusive; at zero distance the angle does not reject). The nearest
visible one wins; an exact distance tie goes to the lower organism id (an
engine tie-break, never an input). No occlusion, body radius, lineage, species
or relationship logic. It is a plain O(N²) scan per tick.

**What did not change.** Outputs are still forward, turn, eat, reproduce —
no new action, no attack, predation, mating choice, signalling or
cooperation. No memory, recurrent state, plasticity, lifetime learning or
RL. Mutation rates, sigmas and channel semantics are unchanged (the new
weights mutate like every other weight). Founders are drawn natively as
10-input controllers by the normal BootstrapRNG procedure; the unchanged
viability screen probes them with the four organism inputs at 0, so founder
selection neither requires nor rewards any response to other organisms.
`0A.3.0` diverges from `0A.2.0` under the same seed by design.

**Snapshots.** Format v1 is kept. A snapshot's `simulationVersion` decides
the neural dimension the validator expects (6 or 10); a snapshot is never
converted between models, so a v1 world recovered by the new code stays
`0A.2.0` and continues exactly as before. Snapshots written by the frozen
v1 code are committed as test fixtures (`packages/persistence/tests/fixtures/v1/`).

**Observatory.** Selecting an organism draws its vision cone — the region
within its `visionRange` and ±`visionAngle`/2 of its heading, from frame data
only. It is geometry, not a claim about what was sensed: the frame carries no
sensed target, and the frontend has no sensing code. Observer protocol stays v1.

**Run it.** `npm run simulate -- --seed 20260910 --ticks 10000 --model 0A.3.0`
(prints `e54d0c11249b7849`), or a live world with
`npm run world -- --dir worlds/v2 --new --seed <n> --model 0A.3.0 --observe 8787`
and `npm run observatory`.

**Performance.** Sensing is O(N²). Measured on the development VM
(linux-arm64, ms per tick, fixed population): 25 organisms 0.14 (`0A.2.0`) vs
0.13 (`0A.3.0`); 400 organisms 3.8 vs 11.8; 1,000 organisms 6.1 vs 47. The
canonical `0A.3.0` world runs at ≈ 2,500–13,000 ticks/s unpaced (population
12–80). Nothing was optimised.

**Platform note.** The golden hashes are confirmed on linux-arm64. On an
x86_64 container the frozen v1 code itself produces a different `0A.2.0` hash
(`ea689a61d2fd4b38`); determinism holds per platform (see `PROJECT_STATUS.md`,
*Known gaps*).

---

## V2.2 — recurrent memory (model `0A.4.0`)

Normative contract: `docs/V2.2 Amendment - Recurrent Memory (0A.4.0).md`.

| Model | Controller | Parameters | Memory | Snapshot format | Golden hash (seed 20260910, 10,000 ticks, linux-arm64) |
|---|---|---|---|---|---|
| `0A.1.0` | 6 → 8 → 4 feed-forward | 92 | none | v1 | `6a6576bd49e86b27` |
| `0A.2.0` | 6 → 8 → 4 feed-forward | 92 | none | v1 | `b95a0b4ef7dd8449` |
| `0A.3.0` | 10 → 8 → 4 feed-forward | 124 | none | v1 | `e54d0c11249b7849` |
| `0A.4.0` | 10 → 8 recurrent → 4 | 188 | 8 values | v2 | `436a377506063609` |

**The recurrence.** At every tick in which an organism acts:
`h_t = tanh(W_in · x_t + W_rec · h_(t−1) + b_hidden)`, and the unchanged
hidden → output layer turns `h_t` into forward, turn, eat and reproduce. `x_t`
is the same ten-input V2.1 vector; hidden width stays 8. So two organisms
with the same genome and the same current input can act differently if they
remember different things — that is the capability this slice adds (tested
directly).

**Genome vs memory.**

- `recurrentHiddenWeights` (8 × 8 = 64) is genome: drawn for founders from
  BootstrapRNG with the existing `initSigma` and bounds, inherited, and
  mutated at birth with the unchanged neural mutation settings. It never
  changes during a life.
- `hiddenState` (8 values) is runtime memory: all zeros for founders and
  newborns (a child never gets its parent's memory), advanced once per acting
  tick from the pre-decision state S_t and written only after all organisms
  have decided. It is not an input, not visible to other organisms, and not
  in observer frames.
- No learning: no backpropagation, Hebbian updates, plasticity, reward or RL.

**Founders.** The same ten-input probes, each evaluated from a fresh zero
memory, independently. The screen cannot see or require memory use; a founder
that ignores its recurrent weights is valid.

**Snapshots.** Memory changes the future, so it is canonical state — for
`0A.4.0` it is in the state hash — and `0A.4.0` worlds are stored in the new
**snapshot format v2** (every organism's `hiddenState` and recurrent weights).
Format v1 is unchanged for `0A.1.0`–`0A.3.0`; old snapshots load byte-exactly
and are never given memory or upgraded, and a recurrent snapshot can never be
relabelled as feed-forward. `0A.4.0` save → load → resume is exact (tested at
four resume points, in process and across processes).

**Run it.** `npm run simulate -- --seed 20260910 --ticks 10000 --model 0A.4.0`
(prints `436a377506063609`), or a live world with `--model 0A.4.0` (see
*Quick start*). The Observatory shows a `0A.4.0` world like any other; nothing
about memory is displayed.

**Observed, not interpreted.** The canonical-seed `0A.4.0` world has one birth
and dies out at tick 2,474; seed 8 (first of 1, 2, 3, … alive at tick 10,000)
reaches ≈ 230 organisms. Neither says anything about whether memory helps.
Recurrence costs almost nothing: at a fixed 230 organisms `0A.4.0` steps in
≈ 5.1 ms per tick vs 4.7 ms for `0A.3.0` (sensing, O(N²), dominates).

---

## V2.3 — physical bodies (model `0A.5.0`)

Normative contract: `docs/V2.3 Amendment - Physical Bodies (0A.5.0).md`.

> Organisms now physically occupy space and can displace one another.

| Model | Controller | Parameters | Memory | Bodies | Snapshot format | Golden hash (seed 20260910, 10,000 ticks, linux-arm64) |
|---|---|---|---|---|---|---|
| `0A.1.0` | 6 → 8 → 4 feed-forward | 92 | none | non-solid | v1 | `6a6576bd49e86b27` |
| `0A.2.0` | 6 → 8 → 4 feed-forward | 92 | none | non-solid | v1 | `b95a0b4ef7dd8449` |
| `0A.3.0` | 10 → 8 → 4 feed-forward | 124 | none | non-solid | v1 | `e54d0c11249b7849` |
| `0A.4.0` | 10 → 8 recurrent → 4 | 188 | 8 values | non-solid | v2 | `436a377506063609` |
| `0A.5.0` | 10 → 8 recurrent → 4 | 188 | 8 values | **solid** | v2 | `1006a56393e19cd9` |

**This is not combat.** No attack, damage, health, predation, energy transfer,
stun, momentum or collision event exists. There is no new sensory input, no
new output, no push action and no new persistent state. Only positions change.

**The body.** The simulation owns the contract
(`simulation-core/src/biology/physicalBody.ts`):

```
physicalRadiusFromSize(size, config) = config.body.radiusBase + config.body.radiusPerSize * size
                                     = 2.0 + 2.2 * size          // world units
```

a pure function of the inherited `size` gene — no runtime adaptation, no random
variation, no lineage, energy or age term. Over the gene range `[0.5, 1.5]` the
radius runs `[3.1, 5.3]`. Those are the constants the Observatory has drawn with
since Phase 0D slice 1, so the circle you see is the circle that collides; no
world looks different from before. `config.body` exists only on `0A.5.0`, which
is why every older model's configuration — and `configHash` — is byte-identical
to what it was.

**Overlap** is strict: `centreDistance < radiusA + radiusB`. Exact tangency is
contact, not overlap, and is never resolved.

**Separation** pushes the pair apart along the line of centres by the
penetration depth, split so that each body's share is the *other's* fraction of
the combined size:

```
shareA = sizeB / (sizeA + sizeB)      shareB = sizeA / (sizeA + sizeB)
```

Equal sizes share the work exactly in half; the bigger the body, the less of
the separation it performs. It is continuous and monotone — no threshold, no
immovable body, no strength score, no new gene, and a small organism can always
displace a large one, just less. This is the *only* advantage size gains; its
existing energetic cost is unchanged and deliberately not rebalanced.

**The resolver** is a small deterministic Jacobi solver in the simulation core —
no Matter.js, no Box2D, no spatial index. Living organisms in ascending id
order; every overlapping pair measured against the positions at the start of a
pass; corrections accumulated and applied all at once; four fixed passes, and a
pass that finds no overlap ends it. It is RNG-free, independent of array order,
free of iteration-order priority, and clamps into the world exactly as movement
does. Two centres that are *exactly* identical separate along one of four
axis-aligned unit vectors chosen by `(lowerId + higherId) mod 4`, pointing from
the lower id to the higher — identity, never chance, and no trigonometry. Dense
clusters and bodies against a wall can be impossible to separate completely;
the fixed budget runs out and the residual is left and documented rather than
randomised away.

**Where it happens.** Sense → Decide → Resolve is unchanged; collision is
Resolve-only, inserted twice into the §20.72 order:

```
 4   Movement resolution
 4b  body overlap resolution          ← 0A.5.0 and later
 5   Movement energy expenditure
 6-7 Feeding and food competition     ← uses post-collision positions
 ...
17   Births/removals become active
17b  body overlap resolution          ← 0A.5.0 and later, newborns included
```

So **being shoved can move an organism into or out of feeding range**, and it
simply does not get the food. That is intended; there is no food-defence rule.
Collision never touches the sensory vector already used this tick, never gives
anyone a second decision, and never advances memory again.

**Newborns.** Offspring placement is unchanged (same polar offset, same two RNG
draws), so a newborn can land inside its parent — and the same passive
separation rule then applies to it. The newborn gets no extra action, its
memory is still exactly zero, no extra random number is drawn, and its genome
is bit-identical to the one `0A.4.0` would produce.

**Persistence and frames.** Bodies add no future-affecting state beyond
position, which was always stored, so `0A.5.0` reuses **snapshot format v2**
unchanged (no v3) and stores no collision metadata at all. Observer protocol
stays **v1** and carries no contact, push or physics data. The frontend is
unchanged and still read-only.

**Run it.** `npm run simulate -- --seed 20260910 --ticks 10000 --model 0A.5.0`
(prints `1006a56393e19cd9`), or a live world with `--model 0A.5.0` (see *Quick
start*).

**Observed, not interpreted.** The canonical-seed `0A.5.0` world has two births
and dies out at tick 2,551; seed 8 (first of 1, 2, 3, … alive at tick 10,000)
reaches ≈ 234 organisms. Extinction is a legitimate result and no seed was
shopped. Measured, not impressions: in a seed-8 world at ≈ 200 organisms there
are contacts on every tick (≈ 19 pairs per tick); in 4,688 real contacting pairs
of unequal size the larger organism moved less in 99.7% of them, and all 15
exceptions were pairs clamped against a world wall; at tick 6,000 the worst
interpenetration is 6 × 10⁻⁴ world units against `0A.4.0`'s 8.0 (bodies
essentially co-located) at the same tick. Collision costs ≈ 2.5% of a tick at
25 organisms and ≈ 20% at 240. None of this says anything about territory,
dominance, cooperation, aggression or strategy.

---

## V2.4 — contestable food handling (model `0A.6.0`)

Normative contract: `docs/V2.4 Amendment - Contestable Food Handling (0A.6.0).md`.

> Eating is no longer instantaneous. An organism must handle a food item for
> five consecutive ticks before receiving its energy. During that interval the
> food travels with the organism. Physical contact with another organism can
> dislodge it.

| Model | Controller | Bodies | Feeding | Snapshot | Golden hash (seed 20260910, 10,000 ticks, linux-arm64) |
|---|---|---|---|---|---|
| `0A.1.0` | 6 → 8 → 4 feed-forward | non-solid | instant | v1 | `6a6576bd49e86b27` |
| `0A.2.0` | 6 → 8 → 4 feed-forward | non-solid | instant | v1 | `b95a0b4ef7dd8449` |
| `0A.3.0` | 10 → 8 → 4 feed-forward | non-solid | instant | v1 | `e54d0c11249b7849` |
| `0A.4.0` | 10 → 8 recurrent → 4 | non-solid | instant | v2 | `436a377506063609` |
| `0A.5.0` | 10 → 8 recurrent → 4 | solid | instant | v2 | `1006a56393e19cd9` |
| `0A.6.0` | 10 → 8 recurrent → 4 | solid | **5-tick, contestable** | **v3** | `3e5b9671f5750712` |

**No new action.** There is no grab, release, steal, hold, defend, carry or
share output, and no handling, possession or touching input. The existing `eat`
output does everything:

| Holding? | `eat` | Meaning |
|---|---|---|
| no | true | try to acquire a free item in feeding range |
| yes | true | keep handling it |
| yes | false | **release it**, here and now, progress reset |

**Acquisition** is the existing food competition, unchanged: nearest eligible
organism wins, exact ties by lower organism id, items in ascending id order,
one item per organism. The only added rule is that an organism already holding
something cannot take another.

**Progress** is 1 on acquisition, then 2, 3, 4, and the item is consumed at 5
(`handling.ticksRequired`). Only completion pays: the holder receives exactly
the ordinary `foodEnergyValue`, with the unchanged cap and the unchanged
same-tick rescue and reproduction semantics. There is no bonus for handling
longer, no way to keep a finished item, and no inventory.

**The item travels with its holder** — after movement and collision, a held
item's position becomes the holder's. It stays a real world food item: never
duplicated, never removed from the food count, and counted in
`worldFoodCapacity`, so carrying can never create extra regeneration. It is
also ordinary food to the existing sensing: others can watch it move, and the
holder sees it at zero distance under the existing zero-distance rule. No "I am
carrying food" input exists.

**Contact dislodges.** If a holder was overlapping another organism when the
ACTIVE (post-movement) body resolution began, its item is released at the
holder's post-collision position and progress resets. No damage, no energy
transfer, **no recipient** — the item just becomes free again. Several contacts
in one tick do nothing extra; there is no size term, no strength check and no
randomness. A dropped item cannot be reacquired until the next tick, which
removes drop/regrab ordering questions entirely.

**What is not a contest:** wall clamping, visual proximity, vision-cone
overlap, food proximity, and reproduction on its own. In particular the
post-birth passive separation is *not* a contest — a newborn must not knock its
parent's food loose merely by spawning.

**Death and reproduction.** A holder that dies drops its item at its final
position with progress reset and no energy granted; the item is never
destroyed. Reproduction is unchanged: the food stays with the parent, and the
child inherits neither item, progress nor possession (handling state lives on
the food, so a child cannot carry one structurally).

**Movement is free.** A holder is not frozen, slowed or charged extra, and
gains no carrying mass. The only costs are the delayed energy, the need to keep
requesting eat, and the risk of interruption.

**Persistence.** Handling decides who is about to be fed, so it is canonical
and `0A.6.0` worlds are stored in the new **snapshot format v3** (per-food
`holderId` and `handlingProgress`). Formats v1 and v2 are unchanged for the
older models; nothing is migrated, no handling state is invented for a
historical model, and cross-model relabelling is refused in both directions.
Resume is exact at every progress and immediately after a dislodgement.

**Run it.** `npm run simulate -- --seed 20260910 --ticks 10000 --model 0A.6.0`
(prints `3e5b9671f5750712`), or a live world with `--model 0A.6.0` (see *Quick
start*). The Observatory shows a `0A.6.0` world like any other; a held item is
visible simply because its ordinary position moves.

**Observed, not interpreted.** The canonical-seed `0A.6.0` world has no births
at all and dies out at tick 2,854. Seed 3 is the first of 1, 2, 3, … alive at
tick 10,000; seed 8 is the most active world found (both coverage seeds, not
canonical). Contestable handling is plainly a much harsher ecology than
instantaneous feeding — energy arrives at best once per five uninterrupted
ticks — and extinction is a legitimate result; nothing was tuned and no seed was
shopped. Mechanics measured over 6,000 ticks of the seed-8 world: 6,649
acquisitions, 675 completions, 4,426 voluntary releases, 1,537 dislodgements by
body contact, 6 drops on death, and food carried 10,863 world units in total.
Nothing here is a claim about stealing, defending, hoarding, cooperation,
pursuit or strategy.

---

## V2.5 — lifetime plasticity (model `0A.7.0`)

Normative contract: `docs/V2.5 Amendment - Lifetime Plasticity (0A.7.0).md`.

`0A.7.0` adds a generic learning capability without programming a strategy.
The 10 → 8 recurrent → 4 genetic controller remains exactly 188 immutable,
inherited parameters. Runtime phenotype state adds 32 hidden→output offsets,
4 output-bias offsets, and one eligibility trace for each. Founders and
newborns start all 72 values at zero; children inherit only the normally
mutated genetic baseline.

Eligibility uses the actual hidden activation and centered raw output:
`E ← 0.90E + hidden × centeredOutput` (bias traces omit `hidden`). After
movement and feeding, offsets change by `0.01 × reinforcement × E`, with
`reinforcement = clamp((actual capped food credit − actual movement cost) /
energyCapacity, −1, 1)`. Basal metabolism, reproduction cost, sight,
acquisition, holding, handling progress and collision are not rewards. The
five-tick feeding delay is bridged only by eligibility.

Learned state affects the future and is therefore canonical and stored in
snapshot format v4; v1/v2/v3 remain tied to the historical models. Observer
protocol v1 and the Observatory are unchanged and expose no learning internals.
The linux-arm64 canonical hash at seed 20260910 / tick 10,000 is
`04d0b7c5917ca0c0` (extinct at tick 2,444, zero births). This fingerprints one
trajectory; it is not evidence that organisms are smarter.

Run it with:

```bash
npm run simulate -- --seed 20260910 --ticks 10000 --model 0A.7.0
npm run world -- --dir worlds/v2.5 --new --seed 8 --model 0A.7.0 --observe 8787
```

---

## Phase 0A philosophy

> **We simulate capabilities and constraints, not behaviors.**

Nothing in this repository tells an organism to seek food, avoid walls, or
reproduce at a good moment. The code defines what an organism *can* do (move up
to its `maxSpeed`, see within its `visionRange` and `visionAngle`, request an
action from its network) and what it *costs* (basal metabolism, movement energy,
reproduction energy). What organisms actually do is whatever their inherited
controller produces, filtered by what the world allows.

Consequences that follow from this, and that you should not "fix":

- **There is no fitness function.** Selection is environmental: organisms that
  fail to acquire energy die.
- **Extinction is a valid outcome.** So is population explosion. Both are data.
  The baseline configuration is uncalibrated and most seeds currently go
  extinct — see *Current baseline behaviour* below. Do not tune parameters until
  a trajectory "looks good"; that is Phase 0B's job, with a protocol.
- **There is no hidden homeostasis.** Food does not spawn near hungry organisms,
  populations are not rescued, and no mechanic silently corrects the energy
  economy.
- **Observation is side-effect free.** Telemetry never mutates state or consumes
  RNG, and is excluded from the canonical state hash.

---

## Repository structure

```
.
├── README.md                        this file — practical developer entry point
├── package.json                     npm workspace root (test / build / simulate)
├── tsconfig.base.json               shared TypeScript compiler options
├── .gitignore
├── docs/
│   ├── Artificial Life Observatory - Spec v4 (Phase 0A Hotfixed).docx
│   │                                AUTHORITATIVE specification
│   ├── V2.1 Amendment - Organism Sensing (0A.3.0).md
│   │                                the V2.1 model 0A.3.0: nearest-visible-organism sensing
│   ├── V2.2 Amendment - Recurrent Memory (0A.4.0).md
│   │                                the V2.2 model 0A.4.0: Elman recurrent memory, snapshot format v2
│   ├── Phase 0A Implementation Report.md
│   │                                what actually exists in code, post-correction
│   ├── Phase 0B Experiment Guide.md how to run and read the Phase 0B experiments
│   ├── Phase 0B Pilot Report.md     what the persisted pilot results actually show
│   └── reference/                   historical material — see Document hierarchy
├── AGENTS.md                        operating contract for any agent on this repo
├── PROJECT_STATUS.md                live handoff state — read with AGENTS.md
└── packages/
    ├── simulation-core/             the entire Phase 0A implementation
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── src/
    │   └── tests/
    ├── persistence/                 Phase 0C — snapshot formats v1 and v2 (V2.2), atomic save/load, snapshot store
    │   ├── src/                     snapshot.ts, file.ts, store.ts, errors.ts, stableStringify.ts
    │   └── tests/                   continuation, corruption, file, snapshot, store, storeRecovery (+ fixtures/)
    ├── world-runner/                Phase 0C — the persistent world process, its CLI, the observer stream
    │   ├── src/                     runner.ts (WorldRunner), cli.ts, observer/ (frame.ts, server.ts, runnerObserver.ts)
    │   └── tests/                   runner, process, observerFrame, observerStream, golden{Observer,Paced,PacedObserver}
    ├── observatory/                 Phase 0D — the read-only browser frontend (React + TypeScript + Vite + PixiJS)
    │   ├── index.html, vite.config.ts, vitest.config.ts, .env.example
    │   ├── src/
    │   │   ├── protocol/            observerV1.ts — protocol v1 types and the defensive parser
    │   │   ├── connection/          observerConnection.ts — WebSocket lifecycle, backoff, read-only socket contract
    │   │   ├── world/               frameStore.ts (latest + previous frame only), interpolation.ts, lineageColor.ts, selection.ts
    │   │   ├── render/              WorldRenderer.ts (PixiJS world, organisms, food, effects, input), camera.ts, textures.ts
    │   │   ├── ui/                  App shell pieces: WorldView, Hud, Inspector, Controls, ConnectionOverlay
    │   │   ├── App.tsx, main.tsx, config.ts, styles.css
    │   └── tests/                   protocol, connection, frameStore, interpolation, lineageColor, selection (+ HUD), camera
    └── experiment-harness/          Phase 0B — a consumer of simulation-core
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── seeds/                   pilot.json (15) and validation.json (25, held out)
        ├── src/
        │   ├── runner/              replicate runner, experiment runner, sweeps, seeds
        │   ├── metrics/             timeseries and summary metrics
        │   ├── probes/              probe set, probe evaluation, behavior fingerprint
        │   ├── analysis/            degeneracy, run outcomes, persisted-result reader
        │   ├── experiments/         diagnostic and factorial definitions
        │   ├── output/              CSV/JSON writers
        │   └── cli/
        ├── tests/
        └── results/                 generated experiment output (gitignored)
```

`packages/simulation-core` has zero UI, server, database, or networking
dependencies — its sole runtime dependency surface is the JavaScript standard
library. (`typescript`, `vitest` and `@types/node` are dev-only.)

`packages/experiment-harness` depends only on `simulation-core`. It observes
the simulation; it never becomes part of biological selection.

---

## Document hierarchy

Read this before implementing anything from a document you found in `docs/`.

### Authoritative

**`docs/Artificial Life Observatory - Spec v4 (Phase 0A Hotfixed).docx`**

The single normative source for biological and simulation semantics. Where this
document and any other disagree, v4 wins. Its most load-bearing Phase 0A
subsections are:

| Section  | Defines                                                     |
|----------|-------------------------------------------------------------|
| §11.58   | the six-input sensory schema (normative)                     |
| §11.59   | activation functions and output semantics (normative)        |
| §13.76   | founder generation, viability screening, bootstrap procedure |
| §15      | the Phase 0A implementation contract and coding checklist    |
| §18.70   | the concrete PRNG, seeding and stream design                 |
| §20.72   | canonical tick semantics, food competition, birth ordering   |

Its most load-bearing Phase 0B subsections are:

| Section        | Defines                                                        |
|----------------|----------------------------------------------------------------|
| §11.37–§11.41  | functional probe evaluation, probe sets, functional distance, behavior fingerprints |
| §12.58         | the four diagnostic conditions A–D                              |
| §14.21–§14.33  | mechanism verification, ecological calibration, pilot vs confirmatory validation, the runaway cap, metrics |
| §16.3–§16.36   | run identity, configuration freeze, calibration stages, the paired 2×2 design, viable-completion rate |

### Reference / history — `docs/reference/`

- `Artificial Life Observatory - Spec v2 (Implementation-Ready).docx`
- `Artificial Life Observatory - Spec v3 (Phase 0A Closed).docx`
- `artificial life observatory.docx` (original concept document)
- `Artificial Life Observatory - Revision Report.md`
- `Phase 0A Final Design Closure Report.md`
- `artificial-life-observatory-simulation-core.zip` (pre-correction source snapshot)

> **Do NOT implement behaviour from v2, v3, the concept document, or any
> revision/closure report where it conflicts with Spec v4.** Several decisions
> that those documents leave open or decide differently were resolved in v4 —
> the tick order, food-competition mechanism, sensory schema, offspring
> placement, and RNG design among them. They are kept for traceability of *why*
> decisions were made, not as instructions.

### Implementation documentation

- **`README.md`** (this file) — how to use the repository.
- **`docs/Phase 0A Implementation Report.md`** — what is implemented, which
  baseline values are in force, what was tested, and the known Phase 0A
  limitations.
- **`docs/Phase 0B Experiment Guide.md`** — how to run each Phase 0B
  experiment, what it isolates, and how to read its persisted output.
- **`docs/Phase 0B Pilot Report.md`** — what the persisted pilot results
  actually show, and what they do not yet support.
- **`AGENTS.md`** and **`PROJECT_STATUS.md`** — the operating contract and the
  live handoff state.

### How to use each document

| Document                     | Use it for                                             |
|------------------------------|--------------------------------------------------------|
| Spec v4                      | normative biological/simulation semantics              |
| Final Design Closure Report  | rationale behind Phase 0A closure decisions            |
| Revision Report              | historical traceability only                           |
| Implementation Report        | what currently exists in code, and its limits          |
| Phase 0B Experiment Guide    | running and interpreting Phase 0B experiments          |
| Phase 0B Pilot Report        | the current pilot evidence and its limits              |
| PROJECT_STATUS.md            | where the work stands right now and the next step      |
| README                       | practical developer entry point                        |

---

## Setup

Requires Node.js 20+ (developed against Node 22).

```bash
npm install     # installs the workspace (reproducible from package-lock.json)
npm test        # runs the vitest suite in all five packages
npm run build   # builds simulation-core, then the harness and persistence, then the world runner, then the Observatory
```

Headless run:

```bash
npm run simulate -- --seed 123 --ticks 10000
npm run simulate -- --seed 123 --ticks 10000 --json
npm run simulate -- --seed 123 --ticks 10000 --model 0A.3.0   # the V2.1 model (also 0A.1.0, 0A.2.0, 0A.4.0)
```

Or, from code:

```ts
import { DEFAULT_SIMULATION_CONFIG, cloneConfig, runSimulation } from '@alo/simulation-core';

const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
config.rootSeed = 123;

const { world, summary } = runSimulation(config, 10_000);
console.log(summary.finalStateHash, summary.endingPopulation);
```

Save and resume a world (Phase 0C, `@alo/persistence`):

```ts
import { bootstrapWorld, stepWorld, cloneConfig, DEFAULT_SIMULATION_CONFIG } from '@alo/simulation-core';
import { createSnapshot, saveSnapshotAtomic, loadSnapshot, restoreSnapshot } from '@alo/persistence';

const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
config.rootSeed = 123;
let world = bootstrapWorld(config);
for (let i = 0; i < 5000; i++) world = stepWorld(world, config).world;

saveSnapshotAtomic('world.snapshot.json', createSnapshot(world, config));

// later, in any process:
const restored = restoreSnapshot(loadSnapshot('world.snapshot.json'));
let w = restored.world;                     // exactly the world at tick 5000
w = stepWorld(w, restored.config).world;    // continues as if never stopped
```

Keep the newest snapshots of one world in a folder and recover after a crash:

```ts
import { saveToStore, recoverLatestValid, quarantineSkippedSnapshots } from '@alo/persistence';

saveToStore('worlds/demo', createSnapshot(world, config));   // atomic; keeps the newest 5

// after a restart:
const { world: w2, config: c2, report } = recoverLatestValid('worlds/demo');
// report.selected = the snapshot used; report.skipped = corrupt ones and why.
// Throws if there is no valid snapshot. It never starts a fresh world.
quarantineSkippedSnapshots('worlds/demo', report);  // move corrupt ones aside (never deleted) so saving can continue
```

## World persistence (Phase 0C)

**The invariant, proven by test:** continuous run == save → load → resume,
bit for bit. On the golden seed, a world saved at tick 10,000 and resumed —
including in a fresh Node process — has the same canonical state hash as the
uninterrupted run at every 1,000 ticks up to 20,000. A world saved at 5,000
resumes to exactly `b95a0b4ef7dd8449` at 10,000.

**Snapshot format v1** (`packages/persistence/src/snapshot.ts`) — used by the
feed-forward models `0A.1.0`, `0A.2.0`, `0A.3.0` — is one JSON document with
these fields. **Format v2** belongs to recurrent `0A.4.0`/`0A.5.0` and adds
`hiddenState` plus `recurrentHiddenWeights`; **format v3** belongs to `0A.6.0`
and adds food holder/progress; **format v4** belongs to `0A.7.0` and adds the
four plastic offset/eligibility arrays. Each model has exactly one format and
nothing is migrated:

- `format`, `snapshotFormatVersion: 1`, `simulationVersion`, `tick`;
- `config` — the complete `SimulationConfig` including `rootSeed` — and
  `configHash`;
- `state` — exactly `canonicalizeWorldState(world)` from simulation-core: tick,
  world size, the full fertility lattice, the ID counters, every organism with
  its runtime state, lineage and genome, all food, and both the BootstrapRNG
  and CanonicalRNG states;
- `stateHash` — `canonicalStateHash` at save time;
- `checksum` — SHA-256 over every other field.

Snapshots are serialized deterministically: keys sorted, no whitespace, one
trailing newline.

**Semantics.**

- **Tick convention.** A snapshot labelled tick N is the world *after* tick N
  has completed. That is the `WorldState` with `.tick === N`, the input to the
  step that produces N + 1.
- **No randomness.** Saving and loading draw no random numbers from any stream
  and never modify the live world. Restore builds fresh objects.
- **Supported versions.** Snapshots restore `0A.2.0` (canonical) and `0A.1.0`
  (historical).

**Corruption handling.** `parseSnapshot`, `validateSnapshot`,
`restoreSnapshot` and `loadSnapshot` refuse with a `SnapshotError` carrying a
`code`. Nothing is ever repaired. The refusals:

| Code | Refused when |
|---|---|
| `INVALID_SERIALIZATION` | the text is not JSON |
| `NON_CANONICAL_SERIALIZATION` | the text is not byte-identical to its canonical form — this catches any altered byte |
| `UNSUPPORTED_FORMAT_VERSION` | the format version is not 1 |
| `MALFORMED_SNAPSHOT` / `MALFORMED_WORLD_STATE` | a field is missing or has the wrong structure |
| `CHECKSUM_MISMATCH` | the checksum does not match the content |
| `INCOMPATIBLE_SIMULATION_VERSION` | the version is unsupported, or the snapshot, config and state disagree |
| `CONFIG_HASH_MISMATCH` / `INVALID_CONFIG` | the config was altered or is invalid |
| `INVALID_RNG_STATE` | an RNG state is missing, not unsigned 32-bit, or all zero |
| `STATE_HASH_MISMATCH` | the restored world does not hash to the saved value |
| `FILE_ERROR` | the file cannot be read or written |

`saveSnapshotAtomic` writes a temporary file in the same directory, fsyncs it,
then renames it over the target. A reader therefore sees the old snapshot or
the new one, never a partial file. It refuses to write a snapshot that would
not load.

### Snapshot store (slices 2–3)

`packages/persistence/src/store.ts` keeps the recent snapshots of **one** world
in one folder:

```
worlds/demo/
├── world-identity.json            which world this folder belongs to
├── snapshot-000000006000.json     the world after tick 6,000
├── snapshot-000000007000.json
├── …                              at most the newest 5
├── .snapshot-….json.<pid>.<n>.tmp a transient atomic-write file — never a snapshot
└── quarantine/                    corrupt snapshots moved aside after a fallback — never snapshots
```

API: `saveToStore(dir, snapshot, { keep })`, `listSnapshots(dir)`,
`recoverLatestValid(dir)`, `quarantineSkippedSnapshots(dir, report)`,
`pruneSnapshots(dir, keep = 5)`. Refusals throw a `SnapshotStoreError` with a
`code`.

- **File names.** `snapshot-<tick, 12 digits zero-padded>.json`, so lexical
  order is tick order. Only exact matches are snapshots; temporary files and
  look-alike names are ignored everywhere.
- **World identity.** A folder belongs to one world, identified by
  `(simulationVersion, configHash)`. `configHash` covers the complete config,
  `rootSeed` included. The first save records it in `world-identity.json`
  (checksummed). A snapshot of any other world is refused on save
  (`WORLD_IDENTITY_MISMATCH`), and an intact foreign snapshot found in the
  folder makes recovery and pruning refuse the whole folder. Nothing is deleted
  to resolve a conflict. A missing or corrupt identity file refuses the folder
  (`STORE_IDENTITY_MISSING` / `STORE_IDENTITY_INVALID`).
- **Saving.** Atomic, as above. Saves are tick-monotonic. Saving an
  identical snapshot for an existing tick is a no-op; different content for
  an existing tick is refused (`DUPLICATE_TICK`), and an older tick than the
  newest stored is refused (`NON_MONOTONIC_TICK`). Invalid snapshots are never
  written.
- **Retention.** The newest 5 snapshots are kept (`keep` configurable). Older
  ones are deleted only after the new file is committed and reads back
  byte-identical. `pruneSnapshots` refuses to delete anything unless one of the
  retained snapshots is valid.
- **Recovery.** `recoverLatestValid(dir)` validates snapshots newest → oldest,
  skips each invalid one and reports why, and returns the newest valid one
  (`{ snapshot, world, config, report }`). The report names the selected file,
  its tick and state hash, and every skipped file with its refusal code. It
  holds no paths or timestamps, so recovering the same folder twice gives the
  same report. Recovery only reads.
- **No fresh world.** If the folder is missing or empty, or every snapshot is
  invalid, recovery throws `NO_VALID_SNAPSHOT` (with the report). It never
  creates or re-seeds a world.

- **Quarantine.** `quarantineSkippedSnapshots(dir, report)` moves the
  snapshots a recovery report skipped into `quarantine/`, keeping each
  original name. Each file is re-validated first, and only files that are
  still invalid move: a file that became valid stays (`NOW_VALID`), a file
  that is gone is reported (`MISSING`), and files not in the report are never
  touched. The report is checked before anything moves. It must be for this
  world, name only snapshot files — never `world-identity.json` — and never
  list its own selected snapshot (`INVALID_RECOVERY_REPORT`). Each move is a
  hard link into `quarantine/` (which never overwrites), a byte-identical read
  back, then removal from the store, so an interrupted move leaves the file in
  both places, never in neither. A taken name gets `<name>.1`, `<name>.2`, …
  Nothing is ever deleted. Running it twice moves nothing the second time.

**Proven by test.** Golden seed, saving every 1,000 ticks. Corrupt the newest
snapshot, or the newest three: recovery falls back to 8,000 or 6,000, and
resuming reaches exactly `b95a0b4ef7dd8449` at 10,000, hash-equal to the
uninterrupted run at every 1,000 ticks. The full cleanup flow also passes:
with 9,000 corrupt, recover 8,000, quarantine 9,000, resume, save 9,000 and
10,000. Recovery then selects 10,000 with nothing skipped, at
`b95a0b4ef7dd8449`, and the corrupt file sits in `quarantine/` byte-identical.

**Current limitations.**

- One writer per folder. The world runner (below) is that writer.
- No database, events or API.
- The checksums detect corruption, not deliberate tampering.

## Running a persistent world (Phase 0C world runner)

`packages/world-runner` runs one canonical world as a long-lived process. It
stores the world in a snapshot-store folder (above). It uses the unchanged
simulation core: every tick is exactly `stepWorld(world, config)`.

**Create a world** — only with the explicit `--new` flag and a seed:

```bash
npm run world -- --dir worlds/demo --new --seed 20260910
```

This bootstraps the world from the default canonical config (`0A.2.0`) and
saves tick 0. That save records the world identity. It then runs until
stopped. `--new` is refused if the folder already holds a world — healthy or
broken (`WORLD_EXISTS`).

**Run it again later** — recovery needs only the folder:

```bash
npm run world -- --dir worlds/demo
```

Recovery loads the newest valid snapshot and quarantines any corrupt newer
ones, then continues. The seed and config come from the stored world, so
`--seed` is refused here. If no valid snapshot exists, startup fails with a
clear error (`NO_VALID_SNAPSHOT`). **A new world is never created
silently.**

Options:

| Option | Meaning | Default |
|---|---|---|
| `--dir <path>` | world folder (relative to where you run npm) | required |
| `--new --seed <uint32>` | create a fresh world | — |
| `--save-every <ticks>` | snapshot cadence in simulation ticks | 1000 |
| `--keep <n>` | snapshots retained | 5 |
| `--until-tick <tick>` | stop, save and exit at this tick | run until stopped |
| `--status-every <ticks>` | status line cadence | `--save-every` |
| `--json` | status as JSON lines (`started`, `observing`, `status`, `stopping`, `stopped`) | off |
| `--ticks-per-second <n>` | pace the simulation to about n ticks per real second | as fast as possible |
| `--observe <port>` | serve read-only observer frames on `ws://127.0.0.1:<port>/` (`0` = any free port) | off |

- **Snapshot cadence.** A snapshot is saved whenever the tick is a multiple
  of `--save-every`. The cadence depends only on simulation ticks, so it is
  identical after a restart. Saving never changes the trajectory: saving
  every tick, every 37 ticks, or never gives the same world.
- **Graceful shutdown.** Ctrl-C (SIGINT) or SIGTERM stops after the current
  tick and saves that tick if it is not already saved. The process exits 0
  only after the save completes. A second signal exits immediately; the last
  saved snapshot is still intact.
- **Crash recovery.** A hard kill loses only the ticks since the last save.
  The next start recovers the newest valid snapshot and continues from it.
  Unsaved ticks are not reconstructed; the future from the recovered tick is
  the canonical one.
- **Status.** Each line shows tick, population, food, the last snapshot tick,
  `simulationVersion`, `configHash`, seed, and whether the world was created
  fresh or recovered. The CLI adds observational ticks/second; wall-clock
  time never reaches the simulation.
- **From code.** `WorldRunner.create(dir, config)`, `WorldRunner.open(dir)`,
  then `runner.run({ untilTick })` or `runUntil` / `close`, plus `stop()` and
  `status()`.

**Proven by test.**

- 0 → 3,000, restart, → 7,000, restart, → 10,000 equals the uninterrupted
  run, `b95a0b4ef7dd8449`.
- Separate OS processes: A creates the world and runs to 4,321; B recovers
  and runs to 10,000, again `b95a0b4ef7dd8449`.
- SIGINT and SIGTERM stops save the stop tick and continue exactly.
- After a SIGKILL between saves, the world recovers from the last scheduled
  save and still reaches `b95a0b4ef7dd8449`.
- A corrupt newest snapshot is quarantined at startup.
- An all-corrupt world refuses to start.

### Watching a running world (observer stream, protocol v1)

A local command that creates a world, runs it at about 10 ticks per second
and streams it on port 8787:

```bash
npm run world -- --dir worlds/demo --new --seed <seed> --ticks-per-second 10 --observe 8787
# later, the same world again:
npm run world -- --dir worlds/demo --ticks-per-second 10 --observe 8787
```

The DEMO seed `31415926` is what `npm run demo:new` uses (a presentation
choice, not evidence — see *Quick start*). Any other seed outside the pilot
and validation sets works the same way.

- **Two separate rates.** `--ticks-per-second` sets the simulation rate
  (TPS). It only decides when ticks run, never what they compute. The
  observer frame rate (FPS) is fixed at 10 frames per second at most.
  Unpaced, the world may run thousands of TPS and observers still get 10 FPS.
  Paced at 5 TPS, a frame goes out only when the tick has changed.
- **Latest frame only.** On connect a client gets the newest frame at once,
  then the newest frame each round. There is no queue and no history.
  - A client that reads slowly is skipped while its socket holds more than
    1 MiB of unsent data, so buffering per client stays bounded.
  - A slow, stalled or disconnected client never slows the simulation.
- **Read-only.** The stream accepts no commands.
  - Anything a client sends is discarded and never routed anywhere; ping
    gets pong.
  - Unmasked or oversized (> 4 KiB) client frames close that connection.
  - Plain HTTP gets `426`.
  - It binds to `127.0.0.1` only.
- **Status vs frames.** Operational status stays on the runner's stdout; the
  WebSocket carries only frames.

Each WebSocket message is one JSON **frame**:

```jsonc
{
  "type": "frame",
  "observerProtocolVersion": 1,
  "simulationVersion": "0A.2.0",
  "configHash": "d42a0b850f579fb2",   // world identity (with simulationVersion)
  "rootSeed": 20260910,
  "tick": 1000,
  "snapshotTick": 1000,               // newest durable snapshot
  "world": { "width": 500, "height": 500 },
  "population": 34,
  "foodCount": 60,
  "organisms": [ { "id": 1, "parentId": null, "generationDepth": 0, "lineageRootId": 1,
                   "x": 246.36, "y": 333.77, "heading": 3.43, "size": 0.994, "energy": 57.32, "age": 1000,
                   "maxSpeed": 1.282, "visionRange": 148.021, "visionAngle": 1.788, "metabolism": 0.995 }, … ],
  "food": [ { "id": 5, "x": 372.6, "y": 430.11 }, … ]
}
```

This is the golden world at tick 1,000 — about 9.5 KB as JSON. A world of
about 400 organisms (tick 10,000) is about 90 KB per frame.

- Organisms and food are in ascending id order.
- Values are rounded for display: positions and energy to 0.01, heading and
  morphology to 0.001.
- Neural weights, RNG state and the fertility lattice are not in live
  frames.
- A frame is a view, not canonical state; nothing restores from it.

Minimal browser client:

```js
const ws = new WebSocket('ws://127.0.0.1:8787/');
ws.onmessage = (e) => { const f = JSON.parse(e.data); console.log(f.tick, f.population); };
```

From code: `observeRunner(runner, { port })` or
`startObserverServer({ port, latest })`, and `toObserverFrame(world, status)`.

**Proven by test.** Seed 20260910 to tick 10,000 gives
`b95a0b4ef7dd8449` in all three cases:

- unpaced with an observer and a connected client;
- paced (1,500 TPS) without an observer;
- paced with an observer and a client that keeps sending commands.

Also tested:

- building frames every tick changes nothing;
- two clients get byte-identical frames for the same tick;
- a stalled client is bounded at one frame over the cap;
- disconnect and reconnect do not affect the world, and a reconnect gets
  the current frame at once.

**Throughput** (observational, seed 20260910, 0 → 10,000 ticks, one core):

| Run | Time | Overhead vs direct |
|---|---:|---:|
| direct simulation | 8.7 s (≈ 1,150 ticks/s) | — |
| runner, saving every 1,000 ticks | 9.2 s | ≈ 5 % |
| runner, saving every 100 ticks | 11.8 s | ≈ 36 % |

A snapshot at tick 10,000 (population 407) is about 0.9 MB.

## Observatory (Phase 0D)

`packages/observatory` is the first Observatory frontend: open a browser and
watch the live world. It is a static client that only *reads* the observer
stream above. It has no server, no database, no accounts, and no way to
change the simulation.

**Stack:** React 19 + TypeScript + Vite 5 + PixiJS 8. React owns the shell
(HUD, inspector, controls, connection state); PixiJS draws the world,
organisms, food and selection on one canvas. Organisms are never React
elements.

### Run it

```bash
npm run demo:new       # terminal 1, first time — worlds/demo, DEMO seed 31415926, 10 ticks/s, observer on 8787
npm run demo:resume    # terminal 1, every later time — recovers the same world
npm run observatory    # terminal 2 — Vite dev server → http://localhost:5173/
```

Both demo scripts are plain `npm run world` invocations:

```bash
npm run world -- --dir worlds/demo --new --seed 31415926 --ticks-per-second 10 --observe 8787
npm run world -- --dir worlds/demo --ticks-per-second 10 --observe 8787
```

so any other directory, seed or pace works the same way. `--new` is refused
if the directory already holds a world. The DEMO seed is a presentation
choice, not evidence (see *Quick start*); any seed outside the pilot and
validation sets is fine.

The Observatory connects to `ws://127.0.0.1:8787/` by default. To point it
elsewhere set `VITE_OBSERVER_WS_URL`, either in the environment or in
`packages/observatory/.env.local` (see `.env.example`):

```bash
VITE_OBSERVER_WS_URL=ws://127.0.0.1:9000/ npm run observatory
```

Production build and preview: `npm run build -w packages/observatory`, then
`npm run preview -w packages/observatory` (serves `packages/observatory/dist`).

### What you see

- **The world is the hero.** A dark navy floor with a faint 50-unit grid and a
  soft boundary fills the viewport; the world's aspect ratio is preserved with
  letterboxing. The HUD sits top-left, view controls top-right, and the
  right-hand panel holds the evolution view or, when an organism is
  selected, the inspector.
- **Organisms** are abstract procedural cells: a lineage-coloured body with a
  darker rim, a lighter triangular nose and a forward-offset core (so heading
  is readable at any size), an outer energy ring and a faint glow. Body scale
  follows `morphology.size`. No sprites, faces or icons.
- **Lineage colours** are computed on the client from `lineageRootId`
  (golden-ratio hue spacing, tuned for the dark background). The same lineage
  always gets the same colour; colours mean nothing else.
- **Energy** modulates the ring length and the glow only; the lineage colour
  stays recognisable. Energy is shown as a number in the inspector — there are
  no qualitative labels. The ring is scaled against 100 (the default
  `energyCapacity`) or the largest energy in the frame if that is higher; the
  frame itself carries no capacity.
- **Motion** is interpolated between the two newest received frames on
  `requestAnimationFrame`, with headings interpolated along the shortest arc.
  Interpolation is bounded by the received states: nothing extrapolates, and
  when frames stop the view settles on the newest known state.
- **Births** pulse in briefly (scale + glow); **deaths** fade out over
  ~0.45 s at the last known position. Food fades in when it spawns and out when
  eaten. All of this is display only; nothing is queued or stored.
- **Food** is drawn as small luminous points.
- **Vision cone (V2.1).** The selected organism shows its field of vision: a
  faint wedge from its body out to its `visionRange`, ±`visionAngle`/2 around
  its heading, following it as it moves and turns. It is drawn from the
  frame's position, heading and vision genes only. It marks no other organism
  and does not say what the organism sensed.

### Controls

| Action | How |
|---|---|
| zoom | mouse wheel (centred on the cursor), `+` / `−` buttons, double-click |
| pan | click-drag |
| fit the whole world | `Fit` button or `F` |
| select an organism | click it (its vision cone appears); `Esc` or `×` deselects |
| jump to an organism by id | type the id in the `#` box top-right and press `Enter` — if it is in the newest frame it is selected and the camera pans to it; otherwise a small *not currently alive* note appears (the current frame only; dead organisms are not searched). `Esc` clears the box |
| controls help | the `?` button top-right lists these controls |
| emphasise a lineage | selecting an organism emphasises its lineage; **Focus lineage** in the inspector keeps that emphasis (a chip top-right clears it) |
| pause the view | **Pause view** or `Space` — pauses only the browser's drawing; the simulation and the stream continue, and resuming jumps to the newest frame |

Selecting an organism opens the inspector: identity (id, parent, lineage
root, generation), life (age, energy with a small bar), *Inherited
morphology* (slice 3, below) and *Ancestry* (slice 4, below). Only real frame data is shown. If the
selected organism leaves the live frame, the inspector keeps its last known
values and says *no longer alive · last seen at tick N*.

The HUD shows connection state (connecting / live / disconnected /
reconnecting / error), tick, population and maximum living generation
(large), food, snapshot tick and lineage count (all derived from the current
frame), `simulationVersion`, seed, `configHash` and world size.

### Connection behaviour

- Connects automatically on load; the first valid frame makes it *live*.
  Until then a card says *Waiting for a local world…* with the exact
  `demo:new` / `demo:resume` / `observatory` commands.
- On disconnect it retries with backoff (0.5 s → 1 s → 2 s → 4 s → 5 s cap).
  While frames have been seen, the last world stays visible with a small
  *reconnecting* pill; before the first frame a card shows the expected
  address and the command to start a world runner.
- On reconnect the newest frame is accepted and rendering resumes. Missed
  frames are never replayed.
- A malformed frame is ignored; a compact count and the last error appear in
  the HUD.
- An `observerProtocolVersion` other than 1 is a hard, explicit error with a
  manual *Retry*. Unknown data is never interpreted.

### Read-only guarantee

The frontend never sends simulation commands. Its socket contract
(`ReadOnlySocket` in `connection/observerConnection.ts`) has no `send`
method at all, and a test drives the whole lifecycle — frames, garbage,
errors, reconnects — asserting nothing was ever transmitted. The runner
discards anything a client sends in any case (§14.50).

### Frames and performance

Each message is parsed and validated (`protocol/observerV1.ts`); only the
newest frame and the previous one are retained (`world/frameStore.ts`), so
memory does not grow with time. Organism visuals are PixiJS display objects
reused across frames: bodies are drawn once per organism (morphology is
fixed for life), the energy ring is redrawn only when it crosses a 1/24
step, and React state updates once per frame for the HUD and inspector, not
per organism. Around 500 organisms plus food at 10 frames/s is comfortable.

### Tests

`npm test -w packages/observatory` (vitest, no browser needed): protocol
parsing (valid, malformed, unsupported version), deterministic lineage
colour, selection and the inspector (including a selected organism that
disappears), the HUD, connection lifecycle and backoff, the read-only
guarantee, frame replacement without history, interpolation bounds and
angular wrap, camera maths; and for the evolution panel: per-frame lineage
aggregation and sorting, birth/death/extinction derivation, frame-gap safety,
the bounded feed and trend, world-identity reset, reconnect preservation,
and the rendered panel (rows, focus and selection marks, gap marker, no
qualitative labels); and for inherited morphology: exact deltas, founders,
missing and dead parents, the cache bound, identity reset and reconnect,
the birth Δ count, and the rendered inspector section; and for ancestry:
the chain walk (complete, unobserved, founder, truncated, evicted),
per-hop Δ counts, reconnect and world-change behaviour, and the rendered
strip; and the final polish (quick-jump, first-run card, help hint).

### Evolution panel (slice 2)

The right-hand panel has two tabs: **Evolution** (default) and **Organism**
(the inspector; it opens when an organism is selected and `Esc` returns to
Evolution). The world stays the hero: the panel is a fixed 340 px column on
the right (a bottom sheet at narrow widths) and nothing is drawn over the
canvas. Everything in it is derived in the browser from the frames this tab
has received. It is **session-only, display-only and not scientific**:
nothing is stored, nothing is sent, and nothing is interpreted.

- **Max generation** (also large in the HUD): the largest `generationDepth`
  among living organisms in the newest frame; mean generation and lineage
  count next to it. Generation is a depth, not a fitness.
- **Trends** — thin sparklines with the newest value: population and max
  generation (large), lineages and food (small). A sample is taken every 10
  ticks of received frames and at most 300 samples are kept (a ring: about
  the last 3,000 ticks; 5 minutes at 10 ticks/s). No axes; the line reads
  against zero.
- **Lineages** — every lineage alive in the newest frame, sorted by living
  count (ties by id): colour swatch, `#lineageRootId`, a share bar, `N
  alive`, share of the population, and `gen` = the largest generation depth
  alive in that lineage. Clicking a row focuses that lineage in the world
  (the same display-only emphasis as *Focus lineage* in the inspector);
  clicking it again clears the focus; hovering emphasises it temporarily.
  The focused row shows a sparkline of that lineage's living count over the
  session. The selected organism's lineage is marked *selected*. Lineages
  that left the living set during this session are listed briefly under *No
  longer living* (newest first, at most 6), with the tick they were last seen.
  They are lineages — never species, factions, winners or losers.
- **Events** — a bounded feed (80 kept, 40 shown, newest first) of what
  changed between two *consecutive* received frames: **born** (an id absent
  from the previous frame — with parent, lineage and generation), **died**
  (an id present in the previous frame and absent now — with lineage,
  generation and its last observed age), and **lineage no longer living**.
  Clicking a born id selects that organism if it is still alive. When a
  lineage is focused, its events are highlighted and the rest dimmed. Rows
  fade in quietly; there are no alerts.
- **Observation gaps.** The observer stream sends only the newest frame and
  never replays. If the tick step between two received frames is larger
  than 8 (a reconnect, a skipped frame, a world running much faster than
  the frame rate), the feed records one *observation gap · ticks A → B*
  marker instead of inferring births and deaths; consecutive gapped frames
  extend the same marker. Trends and lineage counts continue from the
  received frames regardless — they are per-frame facts, not inferred
  events. The same 8-tick rule decides whether the world shows a birth
  pulse.
- **Reconnect and world identity.** On a reconnect to the same world
  (`simulationVersion`, `configHash`, `rootSeed` unchanged) the history is
  kept and continues after a gap marker. If a frame from a different world
  identity arrives — another runner on the same port — the history is
  cleared and starts again; the panel footer counts these resets. Two worlds
  are never mixed in one trend or feed.

### Inherited morphology (slice 3)

The inspector's *Inherited morphology* section compares the selected
organism's five protocol-v1 morphology genes — size, max speed, vision
range, vision angle, metabolism — with its parent's:

- a factual summary: *N / 5 morphology genes differ from parent*, *No
  morphology difference from parent at protocol precision*, *Founder — no
  parent comparison*, or *Parent comparison unavailable*;
- a parent line: **Parent #id** is a button when the parent is alive
  (clicking selects it; the *Parent* field under Identity is a link too),
  *observed · last seen at tick N* when the parent has died but was seen
  in this session, or *morphology not observed in this session* when it
  never was — in which case nothing is guessed;
- a gene table with Parent, Current, Δ and a tiny centred bar showing the
  change as a fraction of the parent value (clipped at ±25 %). Changed
  genes are bold with ▲/▼ and a signed delta in a cool (up) or warm (down)
  tint; unchanged genes are subdued. Neither tint means good or bad.

**Comparison semantics.** An organism's genome is fixed for life (Spec
§13.4) and a child's genome is its parent's clone plus the reproduction-time
mutation channels, so a parent → child morphology difference *is* a
morphology mutation at that birth; the UI says so. Protocol v1 rounds
morphology to 0.001, and rounding is a pure function of the stored value,
so equal stored genes always show equal: an observed difference is real,
and a 0.001 step is shown, never rounded away. The converse is weaker — a
mutation below the rounding step shows as no difference — hence *at
protocol precision*. Two protocol values differ iff they are not identical;
no epsilon is applied. Neural genome differences are **not** shown (they
are not in the frame). Nothing is interpreted as fit, adapted, beneficial
or harmful.

**Morphology cache.** Comparison uses a session-only cache of every
organism seen in this tab (id, parent, lineage, generation, the five genes,
last-seen tick), bounded at 4,000 records with least-recently-seen
eviction (living organisms are re-touched every frame, so the records that
leave first are the organisms that died longest ago). It is part of the
session history: cleared when a different world identity arrives, kept
across a reconnect to the same world, never persisted or sent.

**Births.** A born row in the event feed carries a small **Δn** badge when
the parent's morphology was known (n = genes that differ; highlighted when
n ≥ 1, plain *Δ0* when none) and no badge otherwise. The Evolution summary
shows *Morphology changes · changed / comparable observed births* for the
session — a count of observed inherited differences, not a mutation rate.

### Ancestry (slice 4)

The inspector's *Ancestry* section shows the selected organism's observed
parent chain as a small vertical strip — oldest at the top, the selected
organism highlighted at the bottom — walked backwards through the same
session morphology cache: `Founder #15 · gen 0 → #30 · gen 1 → #40 · gen 2
→ … → #105 · gen 4 · selected`. Each node carries its lineage colour
(founders as a square), generation, and a state: **alive** (the id is a
link that selects it), **observed · last seen t N** (dead, but seen in this
session) or **selected**. Every observed parent → child hop carries a tiny
**Δn** badge with the slice 3 morphology-change count (a dashed **Δ?** when
that parent's morphology is unknown). A header line gives lineage,
generation and the number of observed hops, and says *complete to founder*
only when the chain really reaches one.

The walk stops honestly, and the boundary is shown at the top of the
strip: *Earlier ancestor #id not observed this session* when the cache
does not hold the next parent (it died before this tab opened, or its
record was evicted — the cache is bounded at 4,000 organisms), or *Earlier
ancestry not shown (10 closest hops kept)* when the chain exceeds the
display depth. Nothing is guessed, and the strip is not a genealogy: it is
a view over the bounded session cache — same-world reconnects keep it, a
different world clears it, and a reload forgets it. There are no
descendants, siblings or trees.

### Current limitations

- No genealogy tree (descendants, siblings), no neural fingerprints or
  neural mutation visibility, no persistent history. The evolution panel,
  the morphology cache and the ancestry strip forget everything when the
  tab is closed or reloaded; ancestors that died before the tab opened, or
  whose cache records were evicted, end the chain.
- A parent that was never in a received frame of this session cannot be
  compared; the inspector says so rather than guessing.
- Births and deaths in the feed are frame differences, not simulation
  events: an organism born and dead between two received frames is never
  seen, and across an observation gap nothing is inferred.
- Desktop first. The layout survives narrow widths (the inspector becomes a
  bottom sheet) but there is no pinch-zoom and no mobile polish.
- No organism labels except the selected one; no search by id.
- The energy ring scale is a display assumption (see above), because
  protocol v1 does not carry `energyCapacity`.

## V1 boundaries

v1 is the observable, persistent, deterministic world described above —
and deliberately nothing more. It intentionally does **not** include:

- lifetime learning, reinforcement learning, or any within-life adaptation;
- memory or recurrent neural state;
- neural plasticity;
- a neural fingerprint / neural genome viewer (neural genomes are not in
  the observer frame);
- a full genealogy database or tree (descendants, siblings, whole-lineage
  history);
- a cloud backend, a database, or any persistence beyond local JSON
  snapshots;
- multiplayer or remote observers (the stream binds localhost);
- simulation controls from the frontend (the observer is read-only by
  construction);
- mobile-first polish;
- persistent analytics (everything analytical in the UI is session-only);
- a semantic species system (there are lineages, identified by founder id,
  and nothing else).

The v1 organism neural network is a fixed-topology feedforward network. It
evolves across generations only, through inherited weights and biases and
mutation at reproduction; it does not change during an organism's life.

Selection is emergent (resource acquisition, survival, reproduction). No
fitness score exists, and the UI never calls anything fit, adapted,
successful, superior or intelligent.

### Deferred to v2

Short list, in no particular order; none of it is started:

- neural fingerprint / neural mutation visualisation;
- richer senses — **started in V2.1**: model `0A.3.0` senses the nearest
  visible other organism (see *V2.1* above);
- memory / recurrent neural state — **started in V2.2**: model `0A.4.0`
  (Elman recurrent memory, see *V2.2* above);
- lifetime learning, plasticity and RL experiments;
- richer morphology;
- full genealogy;
- persistent analytics;
- cloud / database / remote observers;
- mobile polish;
- richer ecosystem and environmental complexity.

Anything else is a v1 bug: fix it, keep the freeze.

## Running Phase 0B experiments

Phase 0B experiments (see `docs/Phase 0B Experiment Guide.md` for what each one
means and how to read its output):

```bash
npm run experiment -- starvation             # Diagnostic A
npm run experiment -- feeding                # Diagnostic B
npm run experiment -- reproduction-control   # Diagnostic C
npm run experiment -- full-evolutionary      # Diagnostic D
npm run experiment -- mutation-2x2           # primary 2x2 mutation factorial
npm run experiment -- calibration-sweep      # coarse ecological parameter sweep
npm run experiment -- calibration-report     # re-read persisted sweep results; runs nothing
npm run experiment -- reclassify-trajectory  # trajectory-outcome-v2 over persisted 20,000-tick runs; runs nothing (pilot report §16–§17)
npm run experiment -- early-establishment    # read-only ticks 0–3000 comparison of the 15 0A.2.0 default worlds; runs nothing (pilot report §19)
npm run experiment -- stalled-cohort         # read-only ticks 4000–9000 comparison of stalled worlds that recover vs die; runs nothing (pilot report §20)
npm run experiment -- reproduction-participation  # read-only lifetime participation vs births per reproducer, stalled cohort; runs nothing (pilot report §21)
npm run experiment -- multifounder-default-baseline  # 0A.2.0 at unchanged defaults, 15 pilot seeds, 20,000 ticks (pilot report §14)
npm run experiment -- food-limitation     # diagnostic-food-limitation-v1: fixed 4 pilot seeds, cap not an early stop, safety ceiling 1000 (pilot report §15)
npm run experiment -- baseline-continuation  # continuation-multifounder-default-v1: the six cap-stopped 0A.2.0 default seeds, uncapped (pilot report §18)
npm run experiment -- reproducer-lifecycle   # diagnostic-reproducer-lifecycle-v1: observational per-organism life histories, 7 stalled-cohort seeds (pilot report §22)
```

Results are written under `packages/experiment-harness/results/<experiment-id>/`
as `manifest.json`, `condition-summary.{json,csv}`, `replicates.{json,csv}` and
one `timeseries-<condition>.csv` per condition. That directory is gitignored:
**the persisted files on disk are the authoritative record of a run**, not
console output and not chat transcripts.

### Pilot and validation seeds

`packages/experiment-harness/seeds/pilot.json` holds 15 pilot seeds and
`validation.json` holds 25 held-out validation seeds; the two sets are
disjoint. Every experiment defaults to the pilot set.

Pilot seeds may be used freely for debugging, diagnosis and tuning. Validation
seeds may only be used **after** a candidate configuration has been explicitly
frozen, and results from them may never be used to retune (Spec v4 §14.27,
§16.28). Pass `--seed-set validation` only when that freeze has actually
happened and is recorded in `PROJECT_STATUS.md`.

---

## Architecture

`packages/simulation-core/src`:

| Directory        | Contents                                                                                                   |
|------------------|------------------------------------------------------------------------------------------------------------|
| `config/`        | `types.ts` — the whole configuration surface plus `validateConfig()`. `defaults.ts` — the Spec v4 baselines. |
| `rng/`           | `xoshiro128starstar.ts` (core generator), `splitmix32.ts` (state expansion), `streamSeed.ts` (purpose-derived seeding), `rngStream.ts` (the named streams and their serializable state). |
| `genome/`        | `types.ts` — heritable `MorphologyGenome` / `NeuralGenome`. `founder.ts` — founder draw, mechanical validity, the five-check viability screen. |
| `organism/`      | `types.ts` — `OrganismRuntimeState`, structurally separate from the genome, plus lineage and death metadata. |
| `world/`         | `types.ts` (`WorldState`), `fertility.ts` (static seeded field), `bootstrap.ts` (world initialization), `stepWorld.ts` (the canonical tick), `foodCompetition.ts`, `foodRegen.ts`, `offspring.ts`, `runner.ts` (headless N-tick execution). |
| `model/`         | `simulationModel.ts` — the model registry: inputs, recurrence, bodies, food handling and lifetime plasticity by version. |
| `perception/`    | `sense.ts` — the §11.58 six-input vector, plus (model `0A.3.0`) the four nearest-visible-organism inputs; a pure function of the world snapshot + organism + phenotype. |
| `neural/`        | `network.ts` — feed-forward/recurrent evaluation; `plasticity.ts` — V2.5 eligibility and bounded runtime readout updates. Deterministic and RNG-free. |
| `actions/`       | `types.ts` (`ActionIntent`), `decide.ts` (sense → evaluate → intent).                                        |
| `biology/`       | `movement.ts`, `energy.ts`, `reproduction.ts`, `mutation.ts` — the resolution rules.                         |
| `telemetry/`     | `types.ts` — read-only per-tick metrics.                                                                     |
| `serialization/` | `canonicalState.ts` — deterministic canonicalization and the state hash.                                     |
| `cli.ts`         | the minimal headless entry point.                                                                            |
| `tests/`         | the vitest suite (see *Testing*).                                                                            |

### Sense → Decide → Resolve

The separation is structural, not stylistic:

1. **Sense** builds an input vector from the pre-tick snapshot.
2. **Decide** evaluates the network and returns an `ActionIntent`
   (`requestedForwardSpeed`, `requestedTurnRate`, `eatRequested`,
   `reproduceRequested`). It is pure — it consumes no RNG, mutates no world
   state, and mutates no genome.
3. **Resolve** is the only place world state changes. Decision code never moves
   an organism, removes food, creates offspring, or kills anything.

An intent is a *request*, not an outcome. An organism can request full-speed
movement into a wall, request food it cannot reach, or request reproduction it
is too immature to perform.

---

## Simulation lifecycle

`stepWorld(state, config)` is the canonical single-tick mechanism and executes
the Spec §20.72 phase order exactly. Every phase completes for the entire
population before the next begins.

```
 1  Snapshot                    S_t; all sensing reads only this
 2  Sense                       §11.58 six-input vector per living organism (0A.3.0: ten)
 3  Decide                      neural evaluation -> buffered ActionIntent and memory
                                0A.7.0: eligibility advances from the activity that chose it
 4  Movement resolution         turn, then forward, clamped to world bounds
 4b Body overlap resolution     0A.5.0+: overlapping bodies pushed apart, larger moves less
 5  Movement energy expenditure basal metabolism + movementCost(ACTUAL velocity)
 6  Feeding                     candidate (organism, food) pairs
 7  Food competition            nearest wins; exact ties by ascending organism ID
                                0A.6.0: instead, food handling — held items follow
                                their holder, drops (eat=false / body contact),
                                progress, completion, then acquisition
 8  Energy gain                 foodEnergy credited (0A.6.0+: on COMPLETION only)
 8b Lifetime plasticity         0A.7.0 only: actual capped food credit minus
                                actual movement cost reinforces eligibility
 9  Reproduction eligibility    alive AND mature AND energy>=threshold AND requested
10  Reproduction resolution     every eligible parent reproduces
11  Parent reproduction cost    parent.energy -= reproductionCost
12  Child creation              genome cloned from parent
13  Morphology mutation         if the morphology channel is enabled
14  Neural mutation             if the neural channel is enabled
15  Offspring placement         polar offset from parent, then independent heading
16  Death resolution            energy <= 0 OR age >= maxAge, one combined pass
16b Dead holders drop food      0A.6.0+: at the final position, progress 0, no energy
17  Births/removals applied     children join world state, dead leave
17b Body overlap resolution     0A.5.0+: the same rule again, newborns included
18  Food regeneration           fertility-weighted, capped at worldFoodCapacity
19  Telemetry                   read-only
20  Advance tick
```

Three consequences of this order are specified behaviour, not accidents:

- **Feeding can rescue.** There is exactly one death check (phase 16), after
  every energy-affecting phase. An organism taken below zero by movement cost in
  phase 5 survives if it feeds in phases 6–8.
- **A rescued organism can reproduce in the same tick,** because eligibility
  (phase 9) reads post-feeding energy. It can also feed, reproduce, and still
  die in that tick if the reproduction cost takes it back to zero.
- **Newborns do not act in their birth tick.** They exist in world state from
  phase 17 and are visible to other organisms, but they were not part of S_t, so
  they first sense and decide on the following tick.
- **Eating takes five ticks and can be interrupted (`0A.6.0`).** Phases 6–7
  become multi-tick handling: an item is acquired under the same competition
  rules, travels with its holder, and pays only on completion. `eat = false`
  releases it, and body contact from the ACTIVE resolution dislodges it — a
  dropped item is free again, but not until the next tick. Models
  `0A.1.0`–`0A.5.0` keep instantaneous feeding exactly.
- **Feeding sees post-collision positions (`0A.5.0`).** Phases 4b and 17b are
  pure displacement — no energy, no damage, no event, no RNG, no extra decision
  — but because 4b runs before feeding, a shove can carry an organism into or
  out of range of a food item. Models `0A.1.0`–`0A.4.0` skip both phases and
  behave exactly as they always have.

`stepWorld` does not modify the state it is given: resolution writes to cloned
runtime objects, so an earlier `WorldState` stays valid and replayable.

---

## Determinism contract

**Given the same `simulationVersion`, configuration, root seed and tick count,
two independent runs produce byte-identical canonical state.** This is a
[LOCKED] guarantee, and the regression tests enforce it.

### Seeds and streams

One externally supplied `rootSeed` (uint32) is the only entropy input. Each
named stream derives its own independent 128-bit state:

```
streamSeed(purpose) = splitmix32(rootSeed XOR PURPOSE_CONSTANT[purpose])
initialState        = splitmix32 expanded 4x from streamSeed
```

Phase 0A has exactly two streams:

- **BootstrapRNG** — initialization only: founder candidate draws, bootstrap
  perturbations, placement, headings, the fertility field, initial food.
- **CanonicalRNG** — everything during ticks: mutation, offspring placement and
  heading, food regeneration.

Generator: **xoshiro128\*\*** with 32-bit unsigned arithmetic throughout.
Gaussians use Box–Muller consuming exactly two draws per result (the paired
value is discarded, never cached, so draw count is a fixed function of call
count). RNG state is fully serializable and restorable, and lives inside
`WorldState`.

### Forbidden randomness

Canonical code must never use `Math.random()`, wall-clock time
(`Date.now()`, `performance.now()`), crypto randomness, request timing, database
ordering, thread scheduling, or unordered `Map`/`Set` iteration where order
affects results. A test asserts that a 100-tick run calls `Math.random()` zero
times.

Ordering is always by explicit ID, never by array position: food competition
processes food by ascending food ID and breaks exact-distance ties by ascending
organism ID; births are processed in ascending parent-ID order. A test runs a
tick with the organism and food arrays reversed and asserts an identical result.

### Canonical state hash

`canonicalStateHash(world)` canonicalizes and fingerprints all future-affecting
state: tick, world config, fertility field identity, ID counters, organisms
sorted by ID (runtime state, lineage metadata, genomes in fixed field/index
order), food sorted by ID, and both RNG states. Telemetry and other purely
observational data are excluded. The hash is a non-cryptographic 64-bit
fingerprint — a reproducibility check, not a security primitive.

---

## Configuration

Everything numeric lives in `SimulationConfig`. There are no hidden biological
constants anywhere else in the package. Three classifications, carried through
from the specification:

- **`[LOCKED]`** — a simulation/research semantic invariant. Not a knob. The
  tick order, the sensory schema of each model (six inputs for `0A.1.0` /
  `0A.2.0`, ten for `0A.3.0`–`0A.7.0`), the `0A.5.0` overlap definition and
  larger-moves-less displacement rule, the `0A.6.0` handling contract (five
  consecutive ticks, contact dislodges, no same-tick reacquisition), the
  `0A.7.0` plasticity rule (`learningRate 0.01`, eligibility decay `0.90`,
  controllable metabolic reinforcement only),
  sense/decide/resolve separation, the
  `reproductionCost > birthEnergy` relationship, "mutation OFF means exact
  inheritance", the two-stream RNG structure, and per-channel RNG isolation
  (§15.7) are all locked. Changing one changes what the simulation *means*,
  not just what it computes.
- **`[BASELINE]`** — a replaceable default. Real, implementable, and used today;
  swappable later. Gene bounds, `maturityAge`, `maxAge`, world size, the PRNG
  algorithm itself.
- **`[OPEN — EMPIRICAL]`** — a value to calibrate in Phase 0B. Action
  thresholds, mutation sigmas, food regeneration rate, initial food count,
  offspring offset.

Every field in `config/types.ts` carries its classification and spec citation.
`validateConfig()` enforces the structural invariants (including
`reproductionCost > birthEnergy`) and is called by `bootstrapWorld()`.

Three sections are **model-specific and present only on models that have
them**, so an older model's configuration — and its `configHash` — can never
drift: `body` exists on `0A.5.0`–`0A.7.0`, `handling` on `0A.6.0`–`0A.7.0`,
and `plasticity` (`learningRate`, `eligibilityDecay`) only on `0A.7.0`.
`validateConfig()` refuses each on any other model and refuses its absence on
the model that needs it.

To change configuration, clone and override — never edit `defaults.ts` for a
one-off experiment:

```ts
const config = cloneConfig(DEFAULT_SIMULATION_CONFIG);
config.mutation.morphologyMutationEnabled = false;
config.mutation.neuralMutationEnabled = true;
```

The two mutation flags are deliberately separate fields rather than one combined
switch, because the Phase 0B 2×2 factorial needs all four combinations.

---

## Testing

```bash
npm test                                     # everything
npm test -- tests/determinism.test.ts        # one file
npm run test:watch --workspace=packages/simulation-core
```

| File                    | Covers                                                                        |
|-------------------------|-------------------------------------------------------------------------------|
| `rng.test.ts`           | generator determinism, stream isolation, state export/restore, Gaussian draw-count, all-zero-state contract |
| `neural.test.ts`        | feedforward correctness, output ranges, purity, dimensionality rejection        |
| `perception.test.ts`    | the §11.58 sensor contract and its edge cases — no food, nearest food, exact-distance tie, FOV boundary, vision-range boundary, angular wrapping, food behind, zero distance, wall contact, corners, phenotype-dependent normalization |
| `founder.test.ts`       | non-finite rejection (never coerced to zero), out-of-bounds clamping, the five viability checks, the corrected steering diagnostic, attempt-budget exhaustion |
| `bootstrap.test.ts`     | deterministic initialization, common-founder ancestry, placement separation     |
| `mutation.test.ts`      | all four channel combinations, RNG isolation (§15.7) — toggling one channel preserves the other's draws, offspring placement, heading, and final RNG state — per-parameter rates, bounds, parent immutability |
| `movement.test.ts`      | world bounds, `maxSpeed`, zero movement → zero cost, velocity-squared scaling, size scaling, wall-blocked actual-movement charging, basal separation |
| `death.test.ts`         | starvation, `maxAge` boundaries at `maxAge - 1` and `maxAge`, combined evaluation, same-tick feeding rescue, feed-reproduce-die |
| `reproduction.test.ts`  | maturity gating, cost/birth-energy accounting, the no-free-energy invariant, lineage across generations, newborn-next-tick |
| `food.test.ts`          | single consumption, deterministic contest under reversed input order, capacity cap, fixed regeneration draw count, fertility field determinism and influence |
| `tickOrder.test.ts`     | intent separation, sense/decide purity, shared snapshot, phase-order consequences, parent-ID birth ordering |
| `determinism.test.ts`   | same-seed initialization and N-tick hashes, restored-state continuation, different seeds differ, telemetry neutrality, no `Math.random()` |
| `invariants.test.ts`    | no NaN/Infinity, unique IDs, genome immutability during life, bounds, energy limits, container-order neutrality, population accounting |
| `organismSensing.test.ts` | V2.1: self never selected, dead excluded, range and cone boundaries (inclusive), nearest wins, id tie-break, zero distance, `[0,0,0,0]` default, exact distance / angle / relative-size normalisation, unchanged first six inputs, no RNG, order independence |
| `organismSensingModel.test.ts` | V2.1: 6 / 6 / 10 input dimensions by model, model-specific validation and refusals, native 10-input founders, viability independent of organism inputs, unchanged mutation, the `0A.3.0` golden hash |
| `recurrentMemory.test.ts` | V2.2: feed-forward vs recurrent layouts by model, 64 / 188 parameters, zero memory for founders and newborns (never inherited), inherited and mutated recurrent weights, immutable genome, memory in the canonical hash, same input + different memory / history → different outputs, exact Elman formula, zero-memory = feed-forward, once-per-acting-tick update from S_t, purity and order independence, founder probes from fresh zero memory, historical mutation schedules, evaluator separation, the `0A.4.0` golden hash |
| `physicalBodies.test.ts` | V2.3: model gating, body-radius contract, deterministic size-weighted overlap resolution, wall clamping, active/post-birth lifecycle placement, historical isolation, and the `0A.5.0` golden hash |
| `foodHandling.test.ts` | V2.4: acquisition, continuation, release, completion, contact dislodgement, holder death, held-food cap accounting, lifecycle ordering, historical isolation, and the `0A.6.0` golden hash |
| `lifetimePlasticity.test.ts` | V2.5: model/config gating, zero runtime state, learning formulas, positive/negative/delayed updates, effective bounds, genome immutability, non-Lamarckian inheritance, RNG isolation, lifecycle timing, excluded reward terms, order independence, and the `0A.7.0` golden hash |

`packages/experiment-harness/tests`:

| File               | Covers                                                                    |
|--------------------|---------------------------------------------------------------------------|
| `harness.test.ts`  | replicate/experiment runners, seed handling, metrics, degeneracy flags, sweep configuration validity, diagnostic interventions (A produces zero food and zero births; B has food and zero births), non-finite config rejection, the Phase 0A golden-hash regression |
| `probes.test.ts`   | probe-set size/legality and pinned content hash, probe determinism, observational purity (a deeply frozen genome; probing every organism every tick leaves the canonical hash unchanged), fingerprint shape and stability, functional distance, the §14.29 runaway cap and outcome classification, the persisted-result reader |

`packages/persistence/tests`:

| File                     | Covers                                                                   |
|--------------------------|--------------------------------------------------------------------------|
| `continuation.test.ts`   | §18.60: continuous 20,000 == save at 10,000 → load → resume; golden resume to `b95a0b4ef7dd8449`; separate-process restore |
| `snapshot.test.ts`       | round trip, deterministic serialization, purity, tick-0 and `0A.1.0` resume |
| `corruption.test.ts`     | every snapshot refusal code, including 300 flipped bytes                  |
| `file.test.ts`           | atomic single-file save/load                                              |
| `store.test.ts`          | file naming, retention, fallback past corrupt snapshots, all-corrupt and empty stores, world identity, duplicate and out-of-order ticks, temp-file leftovers, deterministic read-only recovery, quarantine (re-validation, missing files, collisions, refused reports, reruns, interrupted moves) |
| `recurrentSnapshot.test.ts` | V2.2: a V2.1-written `0A.3.0` snapshot loads byte-exactly as feed-forward and continues as V2.1 did; formats tied to models; `0A.4.0` format v2 stores memory bit-exactly; missing / wrong-length / non-finite memory refused; no relabelling in either direction; exact resume at 500 / 1,000 / 1,500 / 2,000, golden resume, separate process; store recovery |
| `modelCompatibility.test.ts` | V2.1: snapshots written by tag `v1.0.0` (0A.2.0, 0A.1.0) load byte-exactly and continue exactly as v1 did; `0A.3.0` exact resume (in process and across processes) to its golden hash; per-model neural-dimension validation; no conversion between models |
| `storeRecovery.test.ts`  | golden seed: corrupt newest 1 or 3 snapshots → recover → resume == uninterrupted, ending at `b95a0b4ef7dd8449`; fallback → quarantine → resume → save → recover selects 10,000 at `b95a0b4ef7dd8449` |
| `physicalBodiesSnapshot.test.ts` | V2.3: format-v2 reuse, body config, no collision metadata, exact resume/golden/separate-process recovery, and model-store isolation |
| `foodHandlingSnapshot.test.ts` | V2.4: format v3 with complete per-food handling state, strict validation and no relabelling, exact resume at handling boundaries, golden and separate-process recovery |
| `lifetimePlasticitySnapshot.test.ts` | V2.5: format v4 with complete offsets/traces, dimensions/finiteness/effective-bound validation, historical-state refusal, no relabelling, and exact learned-state resume |

`packages/world-runner/tests`:

| File               | Covers                                                                    |
|--------------------|---------------------------------------------------------------------------|
| `runner.test.ts`   | fresh launch, controlled run vs direct simulation, restart off the save cadence, golden multi-restart 0 → 3,000 → 7,000 → 10,000, corrupt newest snapshot (recover, quarantine, continue), all-corrupt / missing / empty refusal, create-over-existing refusal, save purity, graceful stop through `run()`, option validation |
| `process.test.ts`  | separate OS processes through the built CLI: create → exit → recover → 10,000 at `b95a0b4ef7dd8449`; SIGINT and SIGTERM graceful stop; SIGKILL between saves; CLI refusals (`--new` over a world, no valid snapshot, bad arguments); corrupt snapshot quarantined at startup; `--observe` + `--ticks-per-second` end to end; busy observer port refused before any world is created |
| `observerFrame.test.ts` | protocol v1 frame fields for a known world (pinned frame hash), ordering, no neural weights; purity: frames every tick leave world/RNG/config untouched, work on deep-frozen input |
| `observerStream.test.ts` | frame on connect, ≤ 10 fps, 426 / 400 for non-WebSocket requests, read-only (commands, binary, ping, unmasked, oversized), two clients, stalled clients (bounded buffering, simulation unaffected), disconnect/reconnect, short pacing checks |
| `recurrentMemoryModel.test.ts` | V2.2: a `0A.4.0` world through create / stop / recover (format v2, memory restored) and the CLI's `--model`; observer purity with frames exactly protocol v1 and no memory or weights |
| `organismSensingModel.test.ts` | V2.1: a `0A.3.0` world through create / restart and through the CLI's `--model` (refused on recovery), and observer purity for `0A.3.0` with the frame shape exactly protocol v1 |
| `physicalBodiesModel.test.ts` | V2.3: `0A.5.0` create/recover/CLI continuity with format v2, plus unchanged observer-v1 purity |
| `foodHandlingModel.test.ts` | V2.4: `0A.6.0` create/recover/CLI continuity with held food in format v3, plus unchanged observer-v1 purity |
| `lifetimePlasticityModel.test.ts` | V2.5: `0A.7.0` format-v4 create/recover/direct equivalence and observer-v1 purity with no learned-state leakage |
| `goldenObserver.test.ts`, `goldenPaced.test.ts`, `goldenPacedObserver.test.ts` | seed 20260910 to 10,000 = `b95a0b4ef7dd8449` with observer + client, paced, and paced + observer + client |

`packages/observatory/tests` (vitest, Node environment, no browser):

| File | Covers |
|---|---|
| `protocol.test.ts` | a valid observer-v1 frame is accepted (including the README example), non-JSON and malformed payloads are rejected without throwing, an unsupported `observerProtocolVersion` is reported explicitly |
| `connection.test.ts` | connecting → live on the first frame; disconnect → backoff retry → reconnecting → live with the newest frame and a reset backoff; capped delays; unsupported version → error with no automatic retry; malformed frames ignored while staying live; `stop()`; the read-only guarantee (a fake socket records that nothing is ever sent) |
| `frameStore.test.ts` | newer frames replace live state, at most two frames retained over 500 pushes; derived HUD summary; interval estimate and subscriptions; collapse-to-latest |
| `selection.test.tsx` | the selected organism's data and inspector groups; founders; a selected organism that disappears is kept as *no longer alive*; the HUD renders every connection state, tick and population (rendered with `react-dom/server`) |
| `interpolation.test.ts` | position interpolation bounded by the received states, progress saturating at 1, heading interpolation across the 0/2π wrap and in both directions, bounded interval estimate |
| `lineageColor.test.ts` | same id → same colour; pure in call order; representative founder ids distinguishable; never too dark for the background |
| `camera.test.ts` | fit (centred, aspect-preserving), zoom around the cursor, zoom limits, pan clamping, wheel mapping |
| `lineages.test.ts` | per-frame lineage aggregation: counts, share, max and mean generation; deterministic sort (count desc, id asc) independent of input order; empty frame; focus toggle semantics |
| `sessionHistory.test.ts` | births and deaths from consecutive frames; lineage extinction and the recently-extinct list; frame-gap safety (a 500-tick jump with 200 replaced organisms yields one gap marker and no events; coalescing; backwards ticks; the 8-tick limit); bounded feed (50 cap over 300 ticks of churn); trend sampling every N ticks with correct population, food, max generation, lineage count and per-lineage counts; bounded trend (40 cap over 500 samples, evicted lineages gone); world-identity reset on seed, hash or version change; reconnect to the same world keeps and continues history; snapshots and subscriptions |
| `inheritance.test.tsx` | parent → child comparison: five exact deltas (positive, negative, a 0.001 step), unchanged child, founder, missing parent (never guessed), alive vs recently dead cached parent; cache bound (100 over 1,000 frames, least-recently-seen eviction); cache cleared by a world-identity change and kept across a same-world reconnect; births carry a Δ count only with a known parent, session counters, feed badges and the Evolution stat; the rendered inspector section (marks, deltas, clickable living parent, observed / unavailable / founder states, no qualitative labels) |
| `ancestry.test.tsx` | chain walk over the session cache: a fully cached chain to the founder with per-hop Δ counts (reusing `compareMorphology`), alive vs observed states and last-seen ticks; stop at the first unobserved parent (no invented node, no Δ); a founder as a one-node complete chain; truncation to the closest `DEFAULT_MAX_ANCESTRY_DEPTH` hops; an evicted ancestor ends the chain; same-world reconnect keeps it and a world change clears it (through `SessionHistory`); the rendered strip (founder, Δ badges, alive link, observed node, selected node, unobserved / truncated boundaries, no qualitative labels) |
| `visionCone.test.ts` | V2.1: cone geometry (apex, radius, edges, screen-clockwise convention), interpolated position/heading tracking, refusal of invalid values, reads only position/heading/range/angle and modifies nothing |
| `polish.test.tsx` | organism quick-jump id parsing and current-frame-only resolution (a dead organism is not searched); the first-run card shows the demo commands when no world is reachable and nothing over a live world; the help hint is closed by default |
| `evolutionPanel.test.tsx` | rendered with `react-dom/server`: lineages most numerous first with count, share and gen; extinct lineages listed; births (with parent), deaths (with age) and extinctions in the feed; no qualitative labels; focused and selected rows; the focused lineage sparkline; the gap marker instead of inferred events; trend cards and sparkline path bounds; the HUD generation stat |

**Do not weaken or delete a test to get green output.** If a test fails, either
the code is wrong or the test encodes a misreading of Spec v4 — fix whichever it
actually is.

---

## Current baseline behaviour

The frozen v1 model is `0A.2.0` at `DEFAULT_SIMULATION_CONFIG`. Its 15 pilot
seeds were run to 20,000 ticks with no population cap, and classified by
long-horizon trajectory (`trajectory-outcome-v2`, pilot report §16–§18):

| Outcome | Worlds |
|---|---:|
| extinct | 5 |
| bounded, below 200 organisms | 3 |
| bounded, 200 or more organisms | 5 |
| still growing at 20,000 ticks | 2 |

The extinct worlds never get established. They stay near founder size, and the
descendants reproduce too little. The others typically reach stable populations
of about 150–320 organisms, with 17–29 generations of descent.

This fails the Phase 0B research-grade gate (8 of 15 bounded against about
70%). It is recorded, not hidden, and is **not** a v1 blocker. Do not tune it
away. The historical single-founder results (`0A.1.0`) are kept separately and
are never pooled with these.

---

## Phase boundaries

| Phase   | Scope                                                          |
|---------|----------------------------------------------------------------|
| **0A**  | headless deterministic biological simulation core — complete and frozen (`0A.2.0` for v1) |
| **0B**  | experiment harness — engineering complete; research calibration exploratory, closed for v1 |
| **0C**  | **complete for v1** — persistence, snapshots, recovery, the canonical continuous world: slice 1, deterministic save/load/resume (snapshot format v1); slice 2, the snapshot store (retention 5, world identity, fallback recovery); slice 3, quarantine of corrupt snapshots; the persistent world runner (`packages/world-runner`); the read-only observer bridge (WebSocket frames, pacing) |
| **0D**  | **complete / frozen for v1** — live view, evolution visibility, inherited morphology, compact ancestry and final polish over read-only observer protocol v1 |
| **V2**  | **started through V2.5** — separately versioned models: `0A.3.0` organism sensing, `0A.4.0` recurrent memory, `0A.5.0` physical bodies, `0A.6.0` contestable food handling, and `0A.7.0` lifetime plasticity. Every earlier model remains frozen |

Phase 0A is complete. **Do not put Phase 0B work inside `simulation-core`.**

Specifically, none of the following belongs in the frozen Phase 0A model: React, PixiJS or
any rendering; WebSocket or any transport; PostgreSQL or any database; cloud
deployment; snapshot persistence; experiment dashboards or runners; species
detection or emergence analytics; signaling, predation, health/damage models; sexual reproduction or
crossover; procedural morphology rendering. (Sensing other organisms entered
the core in V2.1 as the separately versioned model `0A.3.0`; the v1 models
have none. Recurrence and lifetime plasticity entered only as the separately
versioned V2.2 and V2.5 models.)

The Phase 0B harness is a *consumer* of `simulation-core`, in its own package.
Networking, persistence and visualization are consumers too — never
dependencies of the core.

---

## Functional neural probes

`packages/experiment-harness/src/probes` implements the standardized offline
probe evaluation required by Spec v4 §11.37–§11.41 and §14.31.

`probe-set-v1` is a fixed, versioned list of 250 synthetic §11.58 sensory input
vectors, produced by deterministic enumeration — no RNG of any kind. Feeding a
`NeuralGenome` through it yields raw controller outputs, which can be reduced
to a six-dimension `BehaviorFingerprint` or compared between two genomes with a
`functionalDistance`.

```ts
import { fingerprintOfGenome, evaluateProbeSet, functionalDistance } from '@alo/experiment-harness';

const fingerprint = fingerprintOfGenome(organism.genome.neural);
const distance = functionalDistance(evaluateProbeSet(a), evaluateProbeSet(b));
```

The framework is observational by construction: it consumes no CanonicalRNG,
writes nothing to any genome, organism or world, and works on a deeply frozen
genome. A test steps a world 300 ticks while probing every organism every tick
and asserts the canonical state hash is identical to the unprobed run.

**A fingerprint is a descriptor, not a score.** It is not fitness, not
intelligence, and its six dimensions are never combined into a ranking. A
larger functional distance means two controllers respond differently to the
same fixed inputs — nothing more. Fingerprints are analytical derivatives and
are never inherited or selected on (§6.11, §11.41, both [LOCKED]).

If any probe input changes, `probeSetId` must change: fingerprints computed
under different probe sets are not comparable. A pinned content-hash test
enforces this.
