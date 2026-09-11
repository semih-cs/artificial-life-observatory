# Artificial Life Observatory

A headless, deterministic artificial-life simulation core, the experiment
harness that studied it, exact world persistence with a long-running world
process (Phase 0C), and — from Phase 0D — the Observatory: a read-only browser
frontend for watching the live world.
Organisms with a five-gene morphology and a fixed-topology neural controller
live, move, eat, reproduce, mutate and die in a bounded 2D world with a static
seeded fertility field. No database and no cloud deployment yet; those are
later phases.

Five workspace packages:

| Package | Phase | Purpose |
|---|---|---|
| `packages/simulation-core` | 0A | the deterministic headless biological simulation |
| `packages/experiment-harness` | 0B | multi-seed experiments, metrics, probes, calibration analysis |
| `packages/persistence` | 0C | versioned world snapshots: save, load, resume exactly; a snapshot store with retention and fallback recovery |
| `packages/world-runner` | 0C → 0D bridge | the persistent world process: create or recover a world, run it continuously, save periodically, stop cleanly; optional tick pacing and a read-only WebSocket observer stream |
| `packages/observatory` | 0D | the Observatory frontend (React + TypeScript + Vite + PixiJS): watch the live world in a browser — organisms, lineages, food, births and deaths, with an organism inspector. Read-only |

**Quick start — watch a live world:**

```bash
npm install
npm run world -- --dir worlds/demo --new --seed <seed> --ticks-per-second 10 --observe 8787   # terminal 1 (first time)
npm run observatory                                                                           # terminal 2
# open http://localhost:5173/
```

Pick any seed outside the pilot and validation sets (no demo seed has been
chosen yet). If `worlds/demo` already holds a world, drop `--new --seed`.
Full details: *Observatory (Phase 0D)* below.

## Status

| Track | Status |
|---|---|
| Phase 0A — simulation core | **complete, frozen**. The v1 biological model is `simulationVersion 0A.2.0`, multi-founder, `founderGroupCount 5` |
| Phase 0B — engineering (harness, diagnostics, classifiers) | **complete, frozen** |
| Phase 0B — research calibration | **exploratory, closed for v1**. The ~70% research gate was not met. That is not a v1 blocker |
| Phase 0C — persistent canonical world | **complete for v1.** Done: exact save/load/resume, the snapshot store (retention, world identity, fallback recovery, quarantine), the persistent world runner, and the read-only observer bridge (WebSocket frames, tick pacing) |
| **Phase 0D — Observatory UI** | **active — slice 1 done.** `packages/observatory` renders the live world from the read-only observer stream (protocol v1): organisms with lineage colours, heading and energy, food, births and deaths, camera, selection and an organism inspector. Later slices: lineage history, event feed, mutation visibility, trends |

**The simulation works.** Organisms move, sense, eat, spend energy, reproduce,
inherit and mutate genomes, form lineages and evolve across generations. All of
it is deterministic: the same seed and configuration always give the same world
(golden hash `b95a0b4ef7dd8449`).

Under the default configuration some worlds die out, some grow without settling,
and many live for tens of thousands of ticks at a stable population of about
150–320 organisms. The 15-seed pilot profile and everything learned in Phase 0B
are in `docs/Phase 0B Pilot Report.md`; its closure is §23.

**What comes next is visualisation — not more calibration.**

- Phase 0C (done) makes a world save, load and resume exactly.
- Phase 0D lets you watch it live and inspect organisms, lineages and
  mutations. The first slice — the live world view with selection and an
  inspector — is done; see *Observatory (Phase 0D)*.

The biology is frozen for v1: do not change it unless a genuine bug is found.
The held-out validation seeds are reserved for future research and must not be
used.

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
    ├── persistence/                 Phase 0C — snapshot format v1, atomic save/load, snapshot store
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

**Snapshot format v1** (`packages/persistence/src/snapshot.ts`) is one JSON
document with these fields:

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

No demo seed has been chosen yet (see `PROJECT_STATUS.md`). Use any seed
outside the pilot and validation sets.

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
# terminal 1 — a world, paced at 10 ticks/s, streaming observer frames on port 8787
npm run world -- --dir worlds/demo --new --seed <seed> --ticks-per-second 10 --observe 8787   # first time only
npm run world -- --dir worlds/demo --ticks-per-second 10 --observe 8787                       # every later time (recovers the world)

# terminal 2 — the Observatory (Vite dev server)
npm run observatory
# → http://localhost:5173/
```

`--new` creates a world and is refused if `worlds/demo` already holds one, so
use the second form to continue an existing world. Any seed outside the pilot
and validation sets is fine; no demo seed has been chosen and none is
scientific evidence (`PROJECT_STATUS.md`).

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
  letterboxing. The HUD sits top-left, view controls top-right, the inspector
  on the right when an organism is selected.
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

### Controls

| Action | How |
|---|---|
| zoom | mouse wheel (centred on the cursor), `+` / `−` buttons, double-click |
| pan | click-drag |
| fit the whole world | `Fit` button or `F` |
| select an organism | click it; `Esc` or `×` deselects |
| emphasise a lineage | selecting an organism emphasises its lineage; **Focus lineage** in the inspector keeps that emphasis (a chip top-right clears it) |
| pause the view | **Pause view** or `Space` — pauses only the browser's drawing; the simulation and the stream continue, and resuming jumps to the newest frame |

Selecting an organism opens the inspector: identity (id, parent, lineage
root, generation), life (age, energy with a small bar), morphology (size,
max speed, vision range, vision angle, metabolism). Only real frame data is
shown. If the selected organism leaves the live frame, the inspector keeps
its last known values and says *no longer alive · last seen at tick N*.

The HUD shows connection state (connecting / live / disconnected /
reconnecting / error), tick and population (large), food, snapshot tick,
lineage count and maximum generation depth (both derived from the current
frame), `simulationVersion`, seed, `configHash` and world size.

### Connection behaviour

- Connects automatically on load; the first valid frame makes it *live*.
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
angular wrap, and camera maths.

### Current limitations

- Slice 1 only: no lineage history, event feed, mutation visibility,
  population/generation trends, family tree or neural fingerprints.
- Desktop first. The layout survives narrow widths (the inspector becomes a
  bottom sheet) but there is no pinch-zoom and no mobile polish.
- No organism labels except the selected one; no search by id.
- The energy ring scale is a display assumption (see above), because
  protocol v1 does not carry `energyCapacity`.

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
| `perception/`    | `sense.ts` — the §11.58 six-input vector, a pure function of world snapshot + organism + phenotype.          |
| `neural/`        | `network.ts` — fixed feedforward evaluation. Pure, RNG-free, mutates nothing.                                |
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
 2  Sense                       §11.58 six-input vector per living organism
 3  Decide                      neural evaluation -> buffered ActionIntent
 4  Movement resolution         turn, then forward, clamped to world bounds
 5  Movement energy expenditure basal metabolism + movementCost(ACTUAL velocity)
 6  Feeding                     candidate (organism, food) pairs
 7  Food competition            nearest wins; exact ties by ascending organism ID
 8  Energy gain                 foodEnergy credited
 9  Reproduction eligibility    alive AND mature AND energy>=threshold AND requested
10  Reproduction resolution     every eligible parent reproduces
11  Parent reproduction cost    parent.energy -= reproductionCost
12  Child creation              genome cloned from parent
13  Morphology mutation         if the morphology channel is enabled
14  Neural mutation             if the neural channel is enabled
15  Offspring placement         polar offset from parent, then independent heading
16  Death resolution            energy <= 0 OR age >= maxAge, one combined pass
17  Births/removals applied     children join world state, dead leave
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
  tick order, the six-input schema, sense/decide/resolve separation, the
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
| `storeRecovery.test.ts`  | golden seed: corrupt newest 1 or 3 snapshots → recover → resume == uninterrupted, ending at `b95a0b4ef7dd8449`; fallback → quarantine → resume → save → recover selects 10,000 at `b95a0b4ef7dd8449` |

`packages/world-runner/tests`:

| File               | Covers                                                                    |
|--------------------|---------------------------------------------------------------------------|
| `runner.test.ts`   | fresh launch, controlled run vs direct simulation, restart off the save cadence, golden multi-restart 0 → 3,000 → 7,000 → 10,000, corrupt newest snapshot (recover, quarantine, continue), all-corrupt / missing / empty refusal, create-over-existing refusal, save purity, graceful stop through `run()`, option validation |
| `process.test.ts`  | separate OS processes through the built CLI: create → exit → recover → 10,000 at `b95a0b4ef7dd8449`; SIGINT and SIGTERM graceful stop; SIGKILL between saves; CLI refusals (`--new` over a world, no valid snapshot, bad arguments); corrupt snapshot quarantined at startup; `--observe` + `--ticks-per-second` end to end; busy observer port refused before any world is created |
| `observerFrame.test.ts` | protocol v1 frame fields for a known world (pinned frame hash), ordering, no neural weights; purity: frames every tick leave world/RNG/config untouched, work on deep-frozen input |
| `observerStream.test.ts` | frame on connect, ≤ 10 fps, 426 / 400 for non-WebSocket requests, read-only (commands, binary, ping, unmasked, oversized), two clients, stalled clients (bounded buffering, simulation unaffected), disconnect/reconnect, short pacing checks |
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
| **0D**  | **active** — the Observatory UI (`packages/observatory`). Slice 1 done: the live world view (organisms, lineage colours, heading, energy, food, births/deaths, camera, selection, inspector) over the read-only observer stream (protocol v1). Next slices: lineage history, event feed, mutation visibility, trends |

Phase 0A is complete. **Do not put Phase 0B work inside `simulation-core`.**

Specifically, none of the following belongs in this package: React, PixiJS or
any rendering; WebSocket or any transport; PostgreSQL or any database; cloud
deployment; snapshot persistence; experiment dashboards or runners; species
detection or emergence analytics; recurrent networks, lifetime learning or
plasticity; signaling, predation, health/damage models; sexual reproduction or
crossover; procedural morphology rendering; social sensing.

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
