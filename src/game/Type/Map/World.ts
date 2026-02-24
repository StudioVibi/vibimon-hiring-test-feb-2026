import * as Const from "../../Const";
import * as Map from "../Map";
import * as Pos from "../Pos";
import * as Tile from "../Tile";
import * as Type from "../../Type";
import * as Build from "./Build";
import * as Glyph from "../../../data/Glyph";
import * as World from "../../../data/World";

const table = Glyph.table;
const origin = Pos.create(World.world_origin.x, World.world_origin.y);
const map_str = World.world_map;

// Parse a map key string back into a position.
function key_pos(key: string): Type.Pos {
  const parts = key.split(",");
  if (parts.length !== 2) {
    throw new Error("bad map key: " + key);
  }
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  if (Number.isNaN(x) || Number.isNaN(y)) {
    throw new Error("bad map key: " + key);
  }
  return Pos.create(x, y);
}

// Check if a tile should be treated as a teleport door.
function is_door(tile: Type.Tile): boolean {
  if (tile.entity) {
    if (tile.entity.name === "Door") {
      return true;
    }
  }
  if (tile.ground === "tile_mountain_door") {
    return true;
  }
  if (tile.ground === "tile_poke_center_01_03") {
    return true;
  }
  return false;
}

// Find all door tiles in map order.
function doors(map: Type.Map): Type.Pos[] {
  const doors: Type.Pos[] = [];
  map.forEach((tile, key) => {
    if (!is_door(tile)) {
      return;
    }
    doors.push(key_pos(key));
  });
  doors.sort((a, b) => {
    if (a.y < b.y) {
      return -1;
    }
    if (a.y > b.y) {
      return 1;
    }
    if (a.x < b.x) {
      return -1;
    }
    if (a.x > b.x) {
      return 1;
    }
    return 0;
  });
  return doors;
}

// Build the complete world map with all teleports wired.
export function create(): {
  map: Type.Map;
  player_pos: Type.Pos;
} {
  const world_width = Const.world_width;
  const world_height = Const.world_height;
  let map = Map.create(world_width, world_height, Tile.create);

  const world = Build.insert(
    map,
    origin,
    map_str,
    table
  );
  if (!world.player_pos) {
    throw new Error("missing player");
  }
  map = world.map;

  const door_list = doors(map);
  if (door_list.length < 2) {
    throw new Error("missing doors");
  }
  const out_door = door_list[0];
  const in_door = door_list[1];
  const in_spawn = Pos.create(in_door.x, in_door.y - 1);
  const out_spawn = Pos.create(out_door.x, out_door.y + 1);

  const out_walk = Build.teleport(in_spawn);
  const in_walk = Build.teleport(out_spawn);
  map = Map.set_on_walk(map, out_door, out_walk);
  map = Map.set_on_walk(map, in_door, in_walk);

  return { map, player_pos: world.player_pos };
}
