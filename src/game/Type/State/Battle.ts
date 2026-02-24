import * as Move from "../../../data/Move";
import * as Const from "../../Const";
import * as Battle from "../Battle";
import * as Dialog from "../Dialog";
import * as Creature from "../Creature";
import * as Map from "../Map";
import * as State from "../State";
import * as Tile from "../Tile";
import * as Type from "../../Type";

const battle_anim_ticks = Const.tick_rate;
const battle_hp_ticks = 32;
const battle_enemy_level = 4;
const battle_max_moves = 4;
const battle_chance = 0.25;
const battle_capture_throw_ticks = Const.tick_rate;
const battle_capture_result_ticks = Const.tick_rate;
const battle_capture_chance = 0.5;

// Start a battle state for the current player.
export function start(state: Type.State): Type.State {
  const entity = Map.entity_at(state.map, state.player_pos);
  if (!entity) {
    return state;
  }
  if (entity.party.length === 0) {
    return state;
  }
  const enemy = Battle.enemy_creature(battle_enemy_level);
  const battle = Battle.create(entity.party, enemy);
  const next = State.player_transform(state, player_entity => ({
    ...player_entity,
    keys: { a: false, s: false, d: false, w: false }
  }));
  return { ...next, battle, dialog: null, menu: null };
}

// Try a move and trigger a battle from dark grass.
export function try_move(
  state: Type.State,
  from: Type.Pos,
  delta: Type.Pos,
  tick: number
): Type.State {
  const moved = State.entity_walk(state, from, delta, tick);
  if (moved === state) {
    return state;
  }
  const tile = Map.get(moved.map, moved.player_pos);
  if (!tile || !Tile.is_dark_grass(tile)) {
    return moved;
  }
  if (Math.random() >= battle_chance) {
    return moved;
  }
  return start(moved);
}

// Persist the full player party from battle back to the map.
function apply_party(
  state: Type.State,
  party: Type.Creature[]
): Type.State {
  const next_party = Creature.party_copy(party);
  return State.player_transform(state, entity => {
    return { ...entity, party: next_party };
  });
}

// Open a dialog and keep the provided battle state.
function open_text(
  state: Type.State,
  battle: Type.Battle,
  dialog: Type.DialogText,
  tick: number
): Type.State {
  const dialog_state = Dialog.create(dialog, tick);
  return { ...state, battle, dialog: dialog_state };
}

// Exit the battle and sync state.
function close(state: Type.State): Type.State {
  const battle = state.battle;
  if (!battle) {
    return state;
  }
  let next = apply_party(state, battle.party);
  next = { ...next, battle: null, dialog: null };
  return next;
}

// Apply a pending MON switch when the second paragraph starts.
function apply_pending_party(state: Type.State): Type.State {
  const battle = state.battle;
  if (!battle) {
    return state;
  }
  const pending = battle.pending_party;
  if (!pending) {
    return state;
  }
  const dialog_state = state.dialog;
  if (dialog_state) {
    if (dialog_state.cursor.paragraph <= 0) {
      return state;
    }
  }
  const lead = pending[0];
  if (!lead) {
    const next_battle = { ...battle, pending_party: null };
    return { ...state, battle: next_battle };
  }
  let next_battle = { ...battle, party: pending, pending_party: null };
  next_battle = Battle.player_set(next_battle, lead);
  return { ...state, battle: next_battle };
}

// Begin an attack animation after dialog ends.
function start_anim(
  state: Type.State,
  tick: number
): Type.State {
  const battle = state.battle;
  if (!battle) {
    return state;
  }
  const action = battle.actions[0];
  if (!action) {
    return { ...state, battle: Battle.reset_menu(battle) };
  }
  const move = Move.move_table[action.move];
  const side = Battle.target(action);
  let kind: Type.BattleAnim["kind"] = "hit";
  if (move.kind === "heal") {
    kind = "heal";
  }
  const anim: Type.BattleAnim = {
    kind,
    side,
    start_tick: tick,
    duration: battle_anim_ticks
  };
  const next_battle = { ...battle, anim, phase: "anim", hp_anim: null };
  return { ...state, battle: next_battle };
}

// Begin the HP animation after a hit effect.
function start_hp(
  state: Type.State,
  tick: number
): Type.State {
  const battle = state.battle;
  if (!battle) {
    return state;
  }
  const action = battle.actions[0];
  if (!action) {
    return { ...state, battle: { ...battle, phase: "menu" } };
  }
  const move = Move.move_table[action.move];
  const side = Battle.target(action);
  const target = Battle.creature_get(battle, side);
  let next_hp = target.chp;
  if (move.kind === "damage") {
    next_hp = target.chp - move.power;
    if (next_hp < 0) {
      next_hp = 0;
    }
  }
  if (move.kind === "heal") {
    next_hp = target.chp + move.power;
    if (next_hp > target.mhp) {
      next_hp = target.mhp;
    }
  }
  if (next_hp === target.chp) {
    const next_battle = { ...battle, anim: null, hp_anim: null, phase: "hp" };
    return { ...state, battle: next_battle };
  }
  const updated = { ...target, chp: next_hp };
  let next_battle = Battle.creature_set(battle, side, updated);
  const hp_anim: Type.BattleHpAnim = {
    side,
    from: target.chp,
    to: next_hp,
    start_tick: tick,
    duration: battle_hp_ticks
  };
  next_battle = { ...next_battle, hp_anim, anim: null, phase: "hp" };
  return { ...state, battle: next_battle };
}

// Open a dialog for a battle action.
function open_dialog(
  state: Type.State,
  battle: Type.Battle,
  action: Type.BattleAction,
  tick: number
): Type.State {
  const next_battle = { ...battle, phase: "dialog_action" };
  const dialog = Battle.action_dialog(battle, action);
  return open_text(state, next_battle, dialog, tick);
}

// Advance to the next action or return to the menu.
function next_action(
  state: Type.State,
  tick: number
): Type.State {
  const battle = state.battle;
  if (!battle) {
    return state;
  }
  const rest = battle.actions.slice(1);
  if (rest.length === 0) {
    return { ...state, battle: Battle.reset_menu(battle) };
  }
  const next_battle = {
    ...battle,
    actions: rest,
    anim: null,
    hp_anim: null
  };
  const action = rest[0];
  if (!action) {
    return { ...state, battle: Battle.reset_menu(next_battle) };
  }
  return open_dialog(state, next_battle, action, tick);
}

// Enter MON selection mode.
function open_mon(state: Type.State): Type.State {
  const battle = state.battle;
  if (!battle) {
    return state;
  }
  const total = Battle.creature_total(battle);
  if (total <= 0) {
    return state;
  }
  let mon_index = battle.mon_index;
  if (mon_index < 0 || mon_index >= total) {
    mon_index = 0;
  }
  const next_battle = {
    ...battle,
    phase: "mon",
    mon_index,
    actions: [],
    pending_party: null,
    anim: null,
    hp_anim: null,
    capture: null
  };
  return { ...state, battle: next_battle };
}

// Confirm the currently selected MON for battle swap.
function confirm_mon(
  state: Type.State,
  tick: number
): Type.State {
  const battle = state.battle;
  if (!battle) {
    return state;
  }
  const idx = battle.mon_index;
  if (idx <= 0) {
    return state;
  }
  const swapped = Battle.creature_swap_party(battle, idx);
  if (!swapped) {
    return state;
  }
  const next_mon = swapped[0];
  if (!next_mon) {
    return state;
  }

  const old_name = battle.player.nick;
  const new_name = next_mon.nick;
  const dialog: Type.DialogText = [
    [`${old_name} enough!`, "Come back!"],
    [`Do it! ${new_name}!`]
  ];

  const enemy_move = Battle.enemy_move(battle);
  const actions: Type.BattleAction[] = [{ side: "enemy", move: enemy_move }];
  const next_battle = {
    ...battle,
    phase: "dialog_script",
    actions,
    pending_party: swapped,
    anim: null,
    hp_anim: null,
    capture: null
  };
  return open_text(state, next_battle, dialog, tick);
}

// Start the capture throw phase.
function start_capture(
  state: Type.State,
  tick: number
): Type.State {
  const battle = state.battle;
  if (!battle) {
    return state;
  }
  const success = Math.random() < battle_capture_chance;
  const next_battle = Battle.capture_start(battle, success, tick);
  return { ...state, battle: next_battle, dialog: null };
}

// Resolve capture after the result animation ends.
function finish_capture(
  state: Type.State,
  tick: number
): Type.State {
  const battle = state.battle;
  if (!battle) {
    return state;
  }
  const capture = battle.capture;
  if (!capture) {
    return { ...state, battle: Battle.reset_menu(battle) };
  }

  if (capture.success) {
    let next_battle = Battle.party_push(battle, battle.enemy);
    next_battle = { ...next_battle, phase: "run" };
    const dialog: Type.DialogText = [[`${battle.enemy.nick} was`, "captured!"]];
    return open_text(state, next_battle, dialog, tick);
  }

  const enemy_move = Battle.enemy_move(battle);
  const actions: Type.BattleAction[] = [{ side: "enemy", move: enemy_move }];
  const next_battle = {
    ...battle,
    phase: "dialog_script",
    actions,
    pending_party: null,
    anim: null,
    hp_anim: null,
    capture: null
  };
  const dialog: Type.DialogText = [[`${battle.enemy.nick} escaped!`]];
  return open_text(state, next_battle, dialog, tick);
}

// Continue battle flow while a dialog phase is active.
function on_dialog_tick(
  state: Type.State,
  tick: number
): Type.State {
  const applied = apply_pending_party(state);
  const battle = applied.battle;
  if (!battle) {
    return applied;
  }
  if (applied.dialog) {
    return applied;
  }
  if (battle.phase === "dialog_action") {
    return start_anim(applied, tick);
  }
  const action = battle.actions[0];
  if (!action) {
    const next_battle = Battle.reset_menu(battle);
    return { ...applied, battle: next_battle };
  }
  return open_dialog(applied, battle, action, tick);
}

// Update the battle state on tick.
export function on_tick(
  state: Type.State,
  tick: number
): Type.State {
  const battle = state.battle;
  if (!battle) {
    return state;
  }

  if (
    battle.phase === "dialog_action" ||
    battle.phase === "dialog_script"
  ) {
    return on_dialog_tick(state, tick);
  }

  if (battle.phase === "anim") {
    const anim = battle.anim;
    if (!anim) {
      return start_hp(state, tick);
    }
    if (tick - anim.start_tick < anim.duration) {
      return state;
    }
    return start_hp(state, tick);
  }

  if (battle.phase === "hp") {
    const hp_anim = battle.hp_anim;
    if (hp_anim) {
      if (tick - hp_anim.start_tick < hp_anim.duration) {
        return state;
      }
    }
    return next_action(state, tick);
  }

  if (battle.phase === "capture_throw") {
    const capture = battle.capture;
    if (!capture) {
      return { ...state, battle: Battle.reset_menu(battle) };
    }
    if (tick - capture.start_tick < battle_capture_throw_ticks) {
      return state;
    }
    const next_battle = Battle.capture_result(battle, tick);
    return { ...state, battle: next_battle };
  }

  if (battle.phase === "capture_result") {
    const capture = battle.capture;
    if (!capture) {
      return { ...state, battle: Battle.reset_menu(battle) };
    }
    if (tick - capture.start_tick < battle_capture_result_ticks) {
      return state;
    }
    return finish_capture(state, tick);
  }

  if (battle.phase === "run") {
    if (state.dialog) {
      return state;
    }
    return close(state);
  }

  return state;
}

// Handle menu selection on the battle home menu.
function menu_select(
  state: Type.State,
  battle: Type.Battle,
  tick: number
): Type.State {
  const choice = Battle.menu_choice(battle);
  if (choice === "fight") {
    const next_battle = { ...battle, phase: "moves", move_index: 0 };
    return { ...state, battle: next_battle };
  }
  if (choice === "mon") {
    return open_mon(state);
  }
  if (choice === "item") {
    return start_capture(state, tick);
  }
  if (choice === "run") {
    const dialog_run: Type.DialogText = [["Got away safely!"]];
    const next_battle = { ...battle, phase: "run" };
    return open_text(state, next_battle, dialog_run, tick);
  }
  return state;
}

// Handle move selection on the move list screen.
function move_select(
  state: Type.State,
  battle: Type.Battle,
  tick: number
): Type.State {
  const moves = battle.player.moves;
  let total = moves.length;
  if (total > battle_max_moves) {
    total = battle_max_moves;
  }
  if (total === 0) {
    return state;
  }

  let idx = battle.move_index;
  if (idx >= total) {
    idx = 0;
  }
  const move_id = moves[idx];
  if (!move_id) {
    return state;
  }

  const enemy_move = Battle.enemy_move(battle);
  const actions = Battle.turn_actions(battle, move_id, enemy_move);
  const next_battle = {
    ...battle,
    actions,
    anim: null,
    hp_anim: null
  };
  const action = actions[0];
  if (!action) {
    return { ...state, battle: Battle.reset_menu(next_battle) };
  }
  return open_dialog(state, next_battle, action, tick);
}

// Apply a post to the battle state.
export function on_post(
  post: Type.Post,
  state: Type.State
): Type.State {
  if (post.type !== "key") {
    return state;
  }
  const battle = state.battle;
  if (!battle) {
    return state;
  }
  const key = post.key;
  const down = post.down;
  const tick = post.tick;

  const dialog_state = state.dialog;
  if (dialog_state) {
    if (down && key === "J") {
      const next = Dialog.advance(dialog_state, tick);
      const next_state = { ...state, dialog: next };
      return apply_pending_party(next_state);
    }
    return state;
  }

  if (!down) {
    return state;
  }

  if (battle.phase === "menu") {
    if (key === "A" || key === "S" || key === "D" || key === "W") {
      const next_battle = Battle.menu_nav(battle, key);
      return { ...state, battle: next_battle };
    }
    if (key === "J") {
      return menu_select(state, battle, tick);
    }
    return state;
  }

  if (battle.phase === "moves") {
    if (key === "K") {
      const next_battle = { ...battle, phase: "menu" };
      return { ...state, battle: next_battle };
    }
    if (key === "W" || key === "S") {
      const next_battle = Battle.move_nav(battle, key);
      return { ...state, battle: next_battle };
    }
    if (key === "J") {
      return move_select(state, battle, tick);
    }
    return state;
  }

  if (battle.phase === "mon") {
    if (key === "K") {
      const next_battle = { ...battle, phase: "menu" };
      return { ...state, battle: next_battle };
    }
    if (key === "W" || key === "S") {
      const next_battle = Battle.creature_nav(battle, key);
      return { ...state, battle: next_battle };
    }
    if (key === "J") {
      return confirm_mon(state, tick);
    }
    return state;
  }

  return state;
}
