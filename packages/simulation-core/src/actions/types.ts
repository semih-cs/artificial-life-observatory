/**
 * Neural evaluation produces an ActionIntent — the *requested* action for
 * this tick. It is a pure, deterministic function of the input vector and
 * genome (§11.59) and must never itself mutate world/organism state.
 * Resolution (movement/feeding/reproduction outcome) happens later in
 * stepWorld() (§20.72), keeping "attempted" and "resolved" separate.
 */
export interface ActionIntent {
  organismId: number;
  requestedForwardSpeed: number; // clamp(output,0,1) * phenotype.maxSpeed
  requestedTurnRate: number; // output * maxTurnRate, signed
  eatRequested: boolean; // output >= eatThreshold
  reproduceRequested: boolean; // output >= reproductionActionThreshold
}
