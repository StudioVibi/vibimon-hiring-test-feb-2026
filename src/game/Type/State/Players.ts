import * as Const from "../../Const";
import * as Battle from "./Battle";
import * as Dialog from "./Dialog";
import * as Menu from "./Menu";
import * as State from "../State";
import * as Creature from "../Creature";
import * as Entity from "../Entity";
import * as Map from "../Map";
import * as Post from "../Post";
import * as Pos from "../Pos";
import * as Tile from "../Tile";
import * as Util from "../../Util";
import * as Type from "../../Type";

const player_sprite: Type.Sprite = "ent_red";

function player_default(state: Type.State): Type.PlayerState {
  return {
    player_pos: state.spawn_pos,
    dialog: null,
    menu: null,
    battle: null
  };
}

// Read sorted player ids for deterministic update order.
export function player_ids(state: Type.State): string[] {
  const ids = Object.keys(state.players);
  ids.sort();
  return ids;
}

// Read one player runtime state by id.
export function player_get(
  state: Type.State,
  pid: string
): Type.Maybe<Type.PlayerState> {
  const player = state.players[pid];
  if (!player) {
    return null;
  }
  return player;
}

// Project one player's runtime values onto the active view fields.
export function player_project(
  state: Type.State,
  pid: string
): { shared: Type.State; player: Type.PlayerState } {
  const player = player_get(state, pid) || player_default(state);
  return {
    shared: state,
    player
  };
}

// Persist active view fields back into one player's runtime record.
export function player_commit(
  state: Type.State,
  pid: string,
  scoped: { shared: Type.State; player: Type.PlayerState }
): Type.State {
  if (!player_get(state, pid)) {
    return state;
  }
  const next_player: Type.PlayerState = scoped.player;
  const players: Type.Players = { ...state.players, [pid]: next_player };
  return {
    ...scoped.shared,
    players
  };
}

// Build a default starter party for a new player.
function player_party(): Type.Creature[] {
  const mon = Creature.create("minifox", "Minifox", 5);
  return [mon];
}

// Check if a position can be used as a player spawn point.
function can_spawn(
  map: Type.Map,
  pos: Type.Pos
): boolean {
  const tile = Map.get(map, pos);
  if (!tile) {
    return false;
  }
  if (tile.entity) {
    return false;
  }
  return Tile.can_step(tile);
}

// Find a deterministic spawn tile near the configured spawn origin.
function find_spawn(
  map: Type.Map,
  origin: Type.Pos,
  seed: number
): Type.Maybe<Type.Pos> {
  const max_radius = Math.max(Const.world_width, Const.world_height);
  for (let radius = 0; radius <= max_radius; radius++) {
    const ring = Pos.ring_positions(origin, radius);
    if (ring.length === 0) {
      continue;
    }
    const start = seed % ring.length;
    for (let i = 0; i < ring.length; i++) {
      const pos = ring[(start + i) % ring.length];
      if (can_spawn(map, pos)) {
        return pos;
      }
    }
  }
  return null;
}

// Add a player to the world if it is not already present.
export function player_join(
  state: Type.State,
  pid: string
): Type.State {
  if (player_get(state, pid)) {
    return state;
  }
  const seed = Util.hash_text(pid);
  const spawn = find_spawn(state.map, state.spawn_pos, seed);
  if (!spawn) {
    return state;
  }
  const tile = Map.get(state.map, spawn);
  if (!tile || tile.entity) {
    return state;
  }

  const entity = Entity.create(
    "Player",
    player_sprite,
    spawn,
    player_party(),
    null
  );
  const map = Map.set(state.map, spawn, { ...tile, entity });
  const player: Type.PlayerState = {
    player_pos: spawn,
    dialog: null,
    menu: null,
    battle: null
  };
  const players: Type.Players = { ...state.players, [pid]: player };
  return {
    ...state,
    map,
    players
  };
}

// Remove a player from the world map and players table.
export function player_leave(
  state: Type.State,
  pid: string
): Type.State {
  const player = player_get(state, pid);
  if (!player) {
    return state;
  }
  let map = state.map;
  const tile = Map.get(map, player.player_pos);
  if (tile && tile.entity) {
    if (tile.entity.name === "Player") {
      map = Map.set(map, player.player_pos, { ...tile, entity: null });
    }
  }

  const players: Type.Players = { ...state.players };
  delete players[pid];
  return {
    ...state,
    map,
    players
  };
}

// Project the shared state into one player's view state for rendering.
export function player_view(
  state: Type.State,
  pid: string
): { shared: Type.State; player: Type.PlayerState } {
  const player = player_get(state, pid) || player_default(state);
  return {
    shared: state,
    player
  };
}

// Update one scoped player's state on the current tick.
export function on_tick_player(
  state: { shared: Type.State; player: Type.PlayerState },
  tick: number
): { shared: Type.State; player: Type.PlayerState } {
  if (state.player.battle) {
    return Battle.on_tick(state, tick);
  }
  if (state.player.dialog || state.player.menu) {
    return state;
  }

  const entity = Map.entity_at(state.shared.map, state.player.player_pos);
  if (!entity) {
    return state;
  }

  let dx = 0;
  if (entity.keys.d) {
    dx += 1;
  }
  if (entity.keys.a) {
    dx -= 1;
  }
  let dy = 0;
  if (entity.keys.s) {
    dy += 1;
  }
  if (entity.keys.w) {
    dy -= 1;
  }

  if (dx === 0 && dy === 0) {
    if (entity.turn_tick > entity.last_tick) {
      return State.player_transform(state, player => {
        return { ...player, turn_tick: player.last_tick };
      });
    }
    return state;
  }

  if (tick - entity.last_tick < Const.move_cooldown) {
    return state;
  }

  let delta: Type.Pos;
  if (dx !== 0 && dy !== 0) {
    delta = { x: dx, y: 0 };
  } else {
    delta = { x: dx, y: dy };
  }

  const dir = Pos.delta_dir(delta);
  if (dir !== entity.direction) {
    const elapsed = tick - entity.last_tick;
    const was_walking = elapsed <= Const.move_cooldown;
    const turned = State.player_transform(state, player => {
      let turn_tick = player.turn_tick;
      if (!was_walking) {
        turn_tick = tick;
      }
      return { ...player, direction: dir, turn_tick };
    });
    if (was_walking) {
      return Battle.try_move(turned, turned.player.player_pos, delta, tick);
    }
    return turned;
  }

  if (entity.turn_tick > entity.last_tick) {
    if (tick - entity.turn_tick < Const.turn_cooldown) {
      return state;
    }
  }

  return Battle.try_move(state, state.player.player_pos, delta, tick);
}

// Apply one scoped key post to the active player state.
export function on_key_post(
  post: Post.KeyPost,
  state: { shared: Type.State; player: Type.PlayerState }
): { shared: Type.State; player: Type.PlayerState } {
  if (state.player.battle) {
    return Battle.on_post(post, state);
  }

  const key = post.key;
  const down = post.down === 1;
  const tick = state.shared.tick;

  if (state.player.menu) {
    return Menu.on_post(post, state);
  }

  if (key === "A" || key === "S" || key === "D" || key === "W") {
    if (down && state.player.dialog) {
      return state;
    }
    const k = key.toLowerCase() as "a" | "s" | "d" | "w";
    return State.player_transform(state, entity => {
      const keys = { ...entity.keys, [k]: down };
      return { ...entity, keys };
    });
  }

  if (!down) {
    return state;
  }

  if (state.player.dialog) {
    return Dialog.on_post(post, state);
  }

  switch (key) {
    case "J": {
      return Dialog.open_facing(state, tick);
    }
    case "L": {
      return Menu.open(state);
    }
    default:
      return state;
  }
}
