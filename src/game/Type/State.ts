import * as Const from "../Const";
import * as Dir from "./Dir";
import * as Entity from "./Entity";
import * as Map from "./Map";
import * as Pos from "./Pos";
import * as Tile from "./Tile";
import * as Type from "../Type";

// Update the player entity with a transform function.
export function player_transform(
  state: Type.State,
  fn: (entity: Type.Entity) => Type.Entity
): Type.State {
  const tile = Map.get(state.map, state.player_pos);
  if (!tile || !tile.entity) {
    return state;
  }
  const updated = fn(tile.entity);
  const updated_tile = { ...tile, entity: updated };
  const map = Map.set(state.map, state.player_pos, updated_tile);
  return { ...state, map };
}

// Read the tile in front of the player.
export function player_tile_facing(
  state: Type.State
): Type.Maybe<Type.Tile> {
  const entity = Map.entity_at(state.map, state.player_pos);
  if (!entity) {
    return null;
  }
  const delta = Dir.pos(entity.direction);
  const pos = Pos.add(state.player_pos, delta);
  return Map.get(state.map, pos);
}

// Relocate an entity to a target tile with optional instant move.
function entity_relocate_raw(
  state: Type.State,
  entity: Type.Entity,
  from: Type.Pos,
  to: Type.Pos,
  dir: Type.Dir,
  tick: number,
  instant: boolean
): Type.State {
  const from_tile = Map.get(state.map, from);
  const to_tile = Map.get(state.map, to);
  if (!from_tile || !to_tile) {
    return state;
  }
  if (!Tile.can_step(to_tile)) {
    return state;
  }

  let prev = entity.curr_pos;
  if (instant) {
    prev = to;
  }

  const moved = Entity.move(entity, prev, to, dir, tick);
  const from_next = { ...from_tile, entity: null };
  const to_next = { ...to_tile, entity: moved };

  let map = Map.set(state.map, from, from_next);
  map = Map.set(map, to, to_next);

  let next = { ...state, map };
  if (Pos.equal(from, state.player_pos)) {
    next = { ...next, player_pos: to };
  }
  return next;
}

// Relocate an entity to a target tile (validates collision).
export function entity_relocate(
  state: Type.State,
  from: Type.Pos,
  to: Type.Pos,
  dir: Type.Dir,
  tick: number
): Type.State {
  const entity = Map.entity_at(state.map, from);
  if (!entity) {
    return state;
  }
  return entity_relocate_raw(state, entity, from, to, dir, tick, false);
}

// Teleport an entity to a target tile (no cooldown or on-walk).
export function entity_teleport(
  state: Type.State,
  from: Type.Pos,
  to: Type.Pos,
  tick: number
): Type.State {
  const entity = Map.entity_at(state.map, from);
  if (!entity) {
    return state;
  }
  const dir = entity.direction;
  return entity_relocate_raw(state, entity, from, to, dir, tick, true);
}

// Walk an entity by a delta (validates cooldown and collision).
export function entity_walk(
  state: Type.State,
  from: Type.Pos,
  delta: Type.Pos,
  tick: number
): Type.State {
  const entity = Map.entity_at(state.map, from);
  if (!entity) {
    return state;
  }
  if (tick - entity.last_tick < Const.move_cooldown) {
    return state;
  }

  const to = Pos.add(from, delta);
  const to_tile = Map.get(state.map, to);
  if (!to_tile) {
    return state;
  }

  if (to_tile.on_walk) {
    return to_tile.on_walk(state, from, delta, tick);
  }

  const dir = Pos.delta_dir(delta);
  return entity_relocate(state, from, to, dir, tick);
}
