import * as Dialog from "../Dialog";
import * as State from "../State";
import * as Tile from "../Tile";
import * as Type from "../../Type";

// Open a dialog if the player is facing a dialog source.
export function open_facing(
  state: Type.State,
  tick: number
): Type.State {
  const tile = State.player_tile_facing(state);
  if (!tile) {
    return state;
  }
  const dialog = Tile.dialog(tile);
  if (!dialog) {
    return state;
  }
  const dialog_state = Dialog.create(dialog, tick);
  return { ...state, dialog: dialog_state, menu: null };
}

// Apply a post to an open dialog.
export function on_post(
  post: Type.Post,
  state: Type.State
): Type.State {
  if (post.type !== "key") {
    return state;
  }
  const dialog_state = state.dialog;
  if (!dialog_state) {
    return state;
  }
  if (post.down && post.key === "J") {
    const next = Dialog.advance(dialog_state, post.tick);
    return { ...state, dialog: next };
  }
  return state;
}
