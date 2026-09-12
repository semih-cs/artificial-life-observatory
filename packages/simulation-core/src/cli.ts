/**
 * Minimal headless CLI (§14.10, §15.12).
 *
 * Deliberately thin: this exists so Phase 0A can be executed for N ticks
 * without UI or networking, not as a product surface. Anything richer belongs
 * in the Phase 0B calibration harness, not here.
 *
 *   npm run simulate -- --seed 123 --ticks 10000
 *   npm run simulate -- --seed 123 --ticks 10000 --model 0A.3.0
 *
 * --model selects a supported model by its simulationVersion (0A.1.0 through
 * 0A.8.0) through `modelConfig`. Without it the run uses
 * DEFAULT_SIMULATION_CONFIG, the frozen v1 model 0A.2.0, exactly as before.
 */
import { DEFAULT_SIMULATION_CONFIG, cloneConfig, modelConfig } from './config/defaults.js';
import { SUPPORTED_MODEL_VERSIONS } from './model/simulationModel.js';
import { runSimulation } from './world/runner.js';

interface Args {
  seed: number;
  ticks: number;
  json: boolean;
  model?: string;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { seed: DEFAULT_SIMULATION_CONFIG.rootSeed, ticks: 1000, json: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--json') {
      args.json = true;
      continue;
    }
    const value = argv[i + 1];
    if (key === '--seed' && value !== undefined) {
      args.seed = Number(value);
      i += 1;
    } else if (key === '--ticks' && value !== undefined) {
      args.ticks = Number(value);
      i += 1;
    } else if (key === '--model' && value !== undefined) {
      args.model = value;
      i += 1;
    }
  }
  if (!Number.isFinite(args.seed) || !Number.isInteger(args.ticks) || args.ticks < 0) {
    throw new Error('usage: simulate --seed <uint32> --ticks <n> [--model <version>] [--json]');
  }
  if (args.model !== undefined && !SUPPORTED_MODEL_VERSIONS.includes(args.model)) {
    throw new Error(`--model must be one of ${SUPPORTED_MODEL_VERSIONS.join(', ')}, got ${args.model}`);
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const config = args.model === undefined ? cloneConfig(DEFAULT_SIMULATION_CONFIG) : modelConfig(args.model);
  config.rootSeed = args.seed >>> 0;

  const started = Date.now();
  const result = runSimulation(config, args.ticks);
  const elapsedMs = Date.now() - started;

  if (args.json) {
    process.stdout.write(JSON.stringify({ ...result.summary, elapsedMs }, null, 2) + '\n');
    return;
  }

  const s = result.summary;
  const lines = [
    'Artificial Life Observatory — Phase 0A headless run',
    `  simulationVersion   ${s.simulationVersion}`,
    `  seed                ${s.seed}`,
    `  ticks requested     ${s.ticksRequested}`,
    `  ticks executed      ${s.ticksExecuted}`,
    `  final tick          ${s.finalTick}`,
    `  starting population ${s.startingPopulation}`,
    `  ending population   ${s.endingPopulation}`,
    `  total births        ${s.totalBirths}`,
    `  total deaths        ${s.totalDeaths}`,
    `  ending food count   ${s.endingFoodCount}`,
    `  extinct             ${s.extinct}`,
    `  final state hash    ${s.finalStateHash}`,
    `  wall clock          ${elapsedMs} ms`,
  ];
  process.stdout.write(lines.join('\n') + '\n');
}

main();
