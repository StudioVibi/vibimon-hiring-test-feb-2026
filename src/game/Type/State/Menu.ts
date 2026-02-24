import * as MenuData from "../../../data/Menu";
import * as Nav from "../Nav";
import * as State from "../State";
import * as Map from "../Map";
import * as Creature from "../Creature";
import * as Type from "../../Type";

// Build a start menu state object.
function menu_start(selected_index: number): Type.Menu {
  return { mode: "start", selected_index, mon_index: 0 };
}

// Read the player party list from the map.
function player_party(state: Type.State): Type.Creature[] {
  const entity = Map.entity_at(state.map, state.player_pos);
  if (!entity) {
    return [];
  }
  return entity.party;
}

// Enter the party picker mode from the start menu.
function open_party(
  state: Type.State,
  menu: Type.Menu
): Type.State {
  const party = player_party(state);
  const total = Creature.party_total(party);
  if (total <= 0) {
    return state;
  }
  let mon_index = menu.mon_index;
  if (mon_index < 0 || mon_index >= total) {
    mon_index = 0;
  }
  const next_menu = { ...menu, mode: "party", mon_index };
  return { ...state, menu: next_menu };
}

// Return from the party picker mode to the start menu.
function close_party(
  state: Type.State,
  menu: Type.Menu
): Type.State {
  const next_menu = { ...menu, mode: "start" };
  return { ...state, menu: next_menu };
}

// Confirm a party pick and swap with the first party slot.
function pick_party(
  state: Type.State,
  menu: Type.Menu
): Type.State {
  const party = player_party(state);
  const swapped = Creature.party_swap_first(party, menu.mon_index);
  let next = state;
  if (swapped) {
    next = State.player_transform(state, player => {
      return { ...player, party: swapped };
    });
  }
  const next_menu = { ...menu, mode: "party" };
  return { ...next, menu: next_menu };
}

// Open the start menu and close dialog.
export function open(state: Type.State): Type.State {
  return { ...state, menu: menu_start(0), dialog: null };
}

// Apply a post to an open menu.
export function on_post(
  post: Type.Post,
  state: Type.State
): Type.State {
  const menu = state.menu;
  if (!menu) {
    return state;
  }
  if (post.type !== "key") {
    return state;
  }
  if (!post.down) {
    return state;
  }

  if (menu.mode === "party") {
    if (post.key === "K") {
      return close_party(state, menu);
    }
    if (post.key === "W" || post.key === "S") {
      const party = player_party(state);
      const total = Creature.party_total(party);
      if (total <= 0) {
        return close_party(state, menu);
      }
      const nav: Type.NavLine = { index: menu.mon_index, items: total };
      const next_nav = Nav.line(nav, post.key);
      if (next_nav.index === menu.mon_index) {
        return state;
      }
      const next_menu = { ...menu, mon_index: next_nav.index };
      return { ...state, menu: next_menu };
    }
    if (post.key === "J") {
      return pick_party(state, menu);
    }
    return state;
  }

  const total = MenuData.items.length;
  if (total === 0) {
    return state;
  }
  if (post.key === "W" || post.key === "S") {
    const nav: Type.NavLine = {
      index: menu.selected_index,
      items: total
    };
    const next_nav = Nav.line(nav, post.key);
    if (next_nav.index === menu.selected_index) {
      return state;
    }
    const next_menu = { ...menu, selected_index: next_nav.index };
    return { ...state, menu: next_menu };
  }
  switch (post.key) {
    case "J": {
      const item = MenuData.items[menu.selected_index];
      if (item !== "PARTY") {
        return state;
      }
      return open_party(state, menu);
    }
    case "K": {
      return { ...state, menu: null };
    }
    default:
      return state;
  }
}
