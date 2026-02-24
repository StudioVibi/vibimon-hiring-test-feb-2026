import * as Move from "../../data/Move";
import * as Nav from "./Nav";
import * as Creature from "./Creature";
import * as Monster from "./Monster";
import * as Type from "../Type";

const battle_enemy_ids =
  Object.keys(Monster.by_id) as Type.Specie[];

// Build a fresh battle state.
export function create(
  party: Type.Creature[],
  enemy: Type.Creature
): Type.Battle {
  let next_party = Creature.party_copy(party);
  if (next_party.length === 0) {
    next_party = [Creature.create(enemy.specie_id, enemy.nick, enemy.lvl)];
  }
  const player = next_party[0];
  return {
    party: next_party,
    player: Creature.copy(player),
    enemy: Creature.copy(enemy),
    phase: "menu",
    menu: { row: 0, col: 0 },
    move_index: 0,
    mon_index: 0,
    actions: [],
    pending_party: null,
    anim: null,
    hp_anim: null,
    capture: null
  };
}

// Build a random enemy creature for a level.
export function enemy_creature(level: number): Type.Creature {
  const idx = Math.floor(Math.random() * battle_enemy_ids.length);
  const id = battle_enemy_ids[idx];
  const spec = Monster.by_id[id];
  return Creature.create(id, spec.name, level);
}

// Reset a battle back to the main menu state.
export function reset_menu(battle: Type.Battle): Type.Battle {
  return {
    ...battle,
    phase: "menu",
    mon_index: 0,
    actions: [],
    pending_party: null,
    anim: null,
    hp_anim: null,
    capture: null
  };
}

// Decide move order for a turn.
export function turn_actions(
  battle: Type.Battle,
  player_move: Type.Move,
  enemy_move: Type.Move
): Type.BattleAction[] {
  const player = battle.player;
  const enemy = battle.enemy;
  let first: Type.BattleAction;
  let second: Type.BattleAction;
  if (player.spe >= enemy.spe) {
    first = { side: "player", move: player_move };
    second = { side: "enemy", move: enemy_move };
  } else {
    first = { side: "enemy", move: enemy_move };
    second = { side: "player", move: player_move };
  }
  return [first, second];
}

// Build the dialog lines for an action.
export function action_dialog(
  battle: Type.Battle,
  action: Type.BattleAction
): Type.DialogText {
  const side = action.side;
  const move = Move.move_table[action.move];
  let name = battle.player.nick;
  if (side === "enemy") {
    const spec = Monster.by_id[battle.enemy.specie_id];
    name = spec.name;
  }
  return [[`${name} used`, `${move.name}!`]];
}

// Resolve the target side for a battle action.
export function target(
  action: Type.BattleAction
): Type.BattleSide {
  const move = Move.move_table[action.move];
  if (move.kind === "heal") {
    return action.side;
  }
  if (action.side === "player") {
    return "enemy";
  }
  return "player";
}

// Move the battle menu cursor based on a key.
export function menu_nav(
  battle: Type.Battle,
  key: Type.KeyInput
): Type.Battle {
  const menu = battle.menu;
  const nav: Type.NavGrid = {
    row_index: menu.row,
    col_index: menu.col,
    row_total: 2,
    col_total: 2
  };
  const next_nav = Nav.grid(nav, key);
  const next_menu = {
    row: next_nav.row_index,
    col: next_nav.col_index
  };
  if (next_menu.row === menu.row && next_menu.col === menu.col) {
    return battle;
  }
  return { ...battle, menu: next_menu };
}

// Pick the selected main menu action.
export function menu_choice(battle: Type.Battle): string {
  const row = battle.menu.row;
  const col = battle.menu.col;
  const choices = ["fight", "mon", "item", "run"];
  return choices[row * 2 + col] || "run";
}

// Move the battle move cursor based on a key.
export function move_nav(
  battle: Type.Battle,
  key: Type.KeyInput
): Type.Battle {
  if (key !== "W" && key !== "S") {
    return battle;
  }
  const total = Math.min(battle.player.moves.length, 4);
  if (total === 0) {
    return battle;
  }
  const nav: Type.NavLine = { index: battle.move_index, items: total };
  const next_nav = Nav.line(nav, key);
  if (next_nav.index === battle.move_index) {
    return battle;
  }
  return { ...battle, move_index: next_nav.index };
}

// Count the party entries that can be shown in the selector.
export function creature_total(battle: Type.Battle): number {
  return Creature.party_total(battle.party);
}

// Move the selector cursor based on a key.
export function creature_nav(
  battle: Type.Battle,
  key: Type.KeyInput
): Type.Battle {
  if (key !== "W" && key !== "S") {
    return battle;
  }
  const total = creature_total(battle);
  if (total <= 0) {
    return battle;
  }
  const nav: Type.NavLine = { index: battle.mon_index, items: total };
  const next_nav = Nav.line(nav, key);
  if (next_nav.index === battle.mon_index) {
    return battle;
  }
  return { ...battle, mon_index: next_nav.index };
}

// Build a party list where index 0 is swapped with another index.
export function creature_swap_party(
  battle: Type.Battle,
  idx: number
): Type.Maybe<Type.Creature[]> {
  return Creature.party_swap_first(battle.party, idx);
}

// Replace the active player creature and keep party index 0 in sync.
export function player_set(
  battle: Type.Battle,
  mon: Type.Creature
): Type.Battle {
  const player = Creature.copy(mon);
  const party = Creature.party_copy(battle.party);
  if (party.length === 0) {
    party.push(player);
  } else {
    party[0] = player;
  }
  return { ...battle, player, party };
}

// Read a creature for a battle side.
export function creature_get(
  battle: Type.Battle,
  side: Type.BattleSide
): Type.Creature {
  if (side === "player") {
    return battle.player;
  }
  return battle.enemy;
}

// Replace a creature for a battle side.
export function creature_set(
  battle: Type.Battle,
  side: Type.BattleSide,
  mon: Type.Creature
): Type.Battle {
  if (side === "player") {
    return player_set(battle, mon);
  }
  return { ...battle, enemy: Creature.copy(mon) };
}

// Add a creature to the end of the party list.
export function party_push(
  battle: Type.Battle,
  mon: Type.Creature
): Type.Battle {
  const party = Creature.party_copy(battle.party);
  party.push(Creature.copy(mon));
  return { ...battle, party };
}

// Start a capture throw phase.
export function capture_start(
  battle: Type.Battle,
  success: boolean,
  tick: number
): Type.Battle {
  const capture: Type.BattleCapture = {
    success,
    start_tick: tick
  };
  return {
    ...battle,
    phase: "capture_throw",
    actions: [],
    pending_party: null,
    anim: null,
    hp_anim: null,
    capture
  };
}

// Advance capture into the result phase.
export function capture_result(
  battle: Type.Battle,
  tick: number
): Type.Battle {
  const capture = battle.capture;
  if (!capture) {
    return battle;
  }
  const next_capture: Type.BattleCapture = {
    ...capture,
    start_tick: tick
  };
  return { ...battle, phase: "capture_result", capture: next_capture };
}

// Pick a move for the enemy.
export function enemy_move(
  battle: Type.Battle
): Type.Move {
  const moves = battle.enemy.moves;
  if (moves.length === 0) {
    return "scratch";
  }
  const idx = Math.floor(Math.random() * moves.length);
  return moves[idx];
}
