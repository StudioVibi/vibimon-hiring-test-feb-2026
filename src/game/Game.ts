import * as Const from "./Const";
import * as Battle from "./Type/State/Battle";
import * as Dialog from "./Type/State/Dialog";
import * as Menu from "./Type/State/Menu";
import * as State from "./Type/State";
import * as World from "./Type/Map/World";
import * as Map from "./Type/Map";
import * as Pos from "./Type/Pos";
import * as Type from "./Type";

// Build the initial game state.
export function create(): Type.State {
  const world = World.create();
  return {
    map: world.map,
    player_pos: world.player_pos,
    dialog: null,
    menu: null,
    battle: null
  };
}

// Update the state on each tick.
export function on_tick(
  state: Type.State,
  tick: number
): Type.State {
  if (state.battle) {
    return Battle.on_tick(state, tick);
  }
  if (state.dialog || state.menu) {
    return state;
  }

  const entity = Map.entity_at(state.map, state.player_pos);
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
      return Battle.try_move(turned, turned.player_pos, delta, tick);
    }
    return turned;
  }

  if (entity.turn_tick > entity.last_tick) {
    if (tick - entity.turn_tick < Const.turn_cooldown) {
      return state;
    }
  }

  return Battle.try_move(state, state.player_pos, delta, tick);
}

// Apply a user post to the game state.
export function on_post(
  post: Type.Post,
  state: Type.State
): Type.State {
  if (post.type !== "key") {
    return state;
  }

  if (state.battle) {
    return Battle.on_post(post, state);
  }

  const { key, down, tick } = post;

  if (state.menu) {
    return Menu.on_post(post, state);
  }

  if (key === "A" || key === "S" || key === "D" || key === "W") {
    if (down && state.dialog) {
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

  if (state.dialog) {
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
