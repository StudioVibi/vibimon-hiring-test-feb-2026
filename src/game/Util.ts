import * as Const from "./Const";

const start_ms = Date.now();
const ms_tick = 1000 / Const.tick_rate;

// Clamp a value between min and max.
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// Get the current simulation tick.
export function tick_now(): number {
  return Math.floor((Date.now() - start_ms) / ms_tick);
}
