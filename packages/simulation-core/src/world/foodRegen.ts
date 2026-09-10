import { FoodItem, WorldConfigSnapshot } from './types.js';
import { RngStream } from '../rng/rngStream.js';
import { FoodConfig } from '../config/types.js';
import { FertilityField, fertilityAt } from './fertility.js';

/**
 * Food regeneration (§20.72 phase 18; model from §12.19-§12.26).
 *
 * Runs on CanonicalRNG, after this tick's consumption, births and removals are
 * final. Each of `regenAttemptsPerTick` attempts consumes EXACTLY three draws
 * (x, y, acceptance) regardless of outcome, so per-tick RNG consumption for
 * this phase is a fixed function of configuration alone.
 *
 * Rules:
 *   - spawn probability at (x, y) is proportional to fertility(x, y)
 *     (§12.22, §12.24) — never uniform, never adaptive;
 *   - the world food count may never exceed worldFoodCapacity (§12.19);
 *   - an optional minimum food-to-food spawn distance (§12.25);
 *   - nothing here reads organism positions, hunger, or population
 *     (§12.26, §12.60 — no hidden assistance, no homeostasis).
 */
export interface FoodRegenResult {
  newFood: FoodItem[];
  nextFoodId: number;
}

export function regenerateFood(
  world: WorldConfigSnapshot,
  fertility: FertilityField,
  rng: RngStream,
  foodConfig: FoodConfig,
  existingFood: readonly FoodItem[],
  nextFoodId: number
): FoodRegenResult {
  const newFood: FoodItem[] = [];
  let id = nextFoodId;
  let count = existingFood.length;

  for (let attempt = 0; attempt < foodConfig.regenAttemptsPerTick; attempt++) {
    // Fixed three-draw consumption, taken before any early-out.
    const x = rng.nextInRange(0, world.width);
    const y = rng.nextInRange(0, world.height);
    const p = rng.nextFloat();

    if (count >= foodConfig.worldFoodCapacity) continue; // hard cap (§12.19)
    if (p > fertilityAt(fertility, x, y, world)) continue; // fertility-weighted (§12.22)

    if (foodConfig.minFoodSpawnDistance > 0) {
      let tooClose = false;
      for (const f of existingFood) {
        if (Math.hypot(f.x - x, f.y - y) < foodConfig.minFoodSpawnDistance) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        for (const f of newFood) {
          if (Math.hypot(f.x - x, f.y - y) < foodConfig.minFoodSpawnDistance) {
            tooClose = true;
            break;
          }
        }
      }
      if (tooClose) continue;
    }

    newFood.push({ id: id++, x, y });
    count += 1;
  }

  return { newFood, nextFoodId: id };
}
