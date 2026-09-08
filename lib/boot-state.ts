/**
 * Boot-time Redis state (M4 STEP 0-A).
 *
 * Tracks whether production boot degraded to memory fallback due to a
 * redis-class configuration issue. Pure state holder: no node: imports,
 * no side effects, no lib/env imports.
 */

export type BootRedisState = "ok" | "misconfigured";

let bootRedisState: BootRedisState = "ok";

export function setBootRedisState(state: BootRedisState): void {
  bootRedisState = state;
}

export function getBootRedisState(): BootRedisState {
  return bootRedisState;
}
