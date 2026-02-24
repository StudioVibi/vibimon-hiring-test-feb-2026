import * as World from "./Type/Map/World";
import * as Map from "./Type/Map";
import * as Post from "./Type/Post";
import * as Players from "./Type/State/Players";
import * as Type from "./Type";

// Build the initial game state.
export function create(): Type.State {
  const world = World.create();
  let map = world.map;
  const spawn_tile = Map.get(map, world.player_pos);
  if (spawn_tile && spawn_tile.entity) {
    if (spawn_tile.entity.name === "Player") {
      map = Map.set(map, world.player_pos, { ...spawn_tile, entity: null });
    }
  }
  return {
    map,
    spawn_pos: world.player_pos,
    players: {},
    tick: 0
  };
}

// Update the full multiplayer state for one simulation tick.
export function on_tick(state: Type.State): Type.State {
  let next = { ...state, tick: state.tick + 1 };
  const ids = Players.player_ids(next);
  for (let i = 0; i < ids.length; i++) {
    const pid = ids[i];
    const scoped = Players.player_project(next, pid);
    const updated = Players.on_tick_player(scoped, next.tick);
    next = Players.player_commit(next, pid, updated);
  }
  return next;
}

// Apply a network post to the shared multiplayer state.
export function on_post(
  post: Type.Post,
  state: Type.State
): Type.State {
  if (Post.is_join_post(post)) {
    return Players.player_join(state, post.pid);
  }
  if (Post.is_leave_post(post)) {
    return Players.player_leave(state, post.pid);
  }
  if (!Post.is_key_post(post)) {
    return state;
  }

  let next = state;
  if (!Players.player_get(next, post.pid)) {
    next = Players.player_join(next, post.pid);
  }
  if (!Players.player_get(next, post.pid)) {
    return next;
  }
  const scoped = Players.player_project(next, post.pid);
  const updated = Players.on_key_post(post, scoped);
  return Players.player_commit(next, post.pid, updated);
}
