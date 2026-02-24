import * as VibiNet from "vibinet";
import * as Sprite from "./data/Sprite";
import * as Const from "./game/Const";
import * as Game from "./game/Game";
import * as Image from "./game/Type/Image";
import * as Post from "./game/Type/Post";
import * as Players from "./game/Type/State/Players";
import * as Smooth from "./game/Type/State/Smooth";
import * as RenderScreen from "./game/Render/Screen";
import * as RenderTerminal from "./game/Render/Terminal";
import * as Type from "./game/Type";

// Grab the game canvas element.
const canvas_el = document.getElementById("game");
if (!(canvas_el instanceof HTMLCanvasElement)) {
  throw new Error("missing #game canvas");
}
const canvas = canvas_el;

// Create the 2d rendering context.
const ctx_raw = canvas.getContext("2d");
if (!ctx_raw) {
  throw new Error("unable to create 2d context");
}
const ctx: CanvasRenderingContext2D = ctx_raw;

const terminal_el = document.getElementById("terminal");
const raw_toggle_el = document.getElementById("raw-toggle");
const terminal = terminal_el instanceof HTMLTextAreaElement ? terminal_el : null;
const raw_toggle = raw_toggle_el instanceof HTMLInputElement ? raw_toggle_el : null;
const root = document.documentElement;

// Keep pixel art crisp.
ctx.imageSmoothingEnabled = false;

let render_mode: Type.RenderMode = "IMG";
const measure_canvas = document.createElement("canvas");
const measure_ctx = measure_canvas.getContext("2d");

// Read a query parameter value.
function query_value(key: string): string | null {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(key);
  if (!value) {
    return null;
  }
  return value;
}

// Create or read a stable player id.
function player_pid(): string {
  const query_pid = query_value("pid");
  if (query_pid) {
    return query_pid;
  }
  try {
    const saved = window.localStorage.getItem(Const.pid_storage_key);
    if (saved) {
      return saved;
    }
    const next = VibiNet.VibiNet.gen_name();
    window.localStorage.setItem(Const.pid_storage_key, next);
    return next;
  } catch {
    return VibiNet.VibiNet.gen_name();
  }
}

const room = query_value("room") || Const.room_default;
const server = query_value("server") || undefined;
const pid = player_pid();
const initial_state = Game.create();

const game = new VibiNet.VibiNet.game<Type.State, Type.Post>({
  server,
  room,
  initial: initial_state,
  on_tick: Game.on_tick,
  on_post: Game.on_post,
  packer: Post.packer,
  tick_rate: Const.tick_rate,
  tolerance: Const.tolerance_ms,
  smooth: (remote_state, local_state) => {
    return Smooth.smooth_player_prediction(remote_state, local_state, pid);
  }
});

// Track held keys for blur/release safety.
const held_keys: Record<Type.KeyInput, boolean> = {
  A: false,
  S: false,
  D: false,
  W: false,
  J: false,
  K: false,
  L: false
};

// Post one key event to the shared room.
function post_key(key: Type.KeyInput, down: boolean): void {
  game.post(Post.key(pid, key, down));
}

// Post leave and close the network client.
function close_game(): void {
  try {
    game.post(Post.leave(pid));
  } catch {
    // Ignore close-time post errors.
  }
  game.close();
}

// Release all held keys in the room.
function release_all_keys(): void {
  for (const key of Post.key_inputs) {
    if (!held_keys[key]) {
      continue;
    }
    held_keys[key] = false;
    post_key(key, false);
  }
}

// Toggle between canvas and raw terminal rendering.
function toggle_render_mode(): void {
  if (render_mode === "RAW") {
    set_render_mode("IMG");
    if (raw_toggle) {
      raw_toggle.checked = false;
    }
    return;
  }
  set_render_mode("RAW");
  if (raw_toggle) {
    raw_toggle.checked = true;
  }
}

// Toggle the active render mode.
function set_render_mode(mode: Type.RenderMode): void {
  if (!terminal) {
    render_mode = "IMG";
    canvas.style.display = "block";
    return;
  }

  render_mode = mode;
  if (render_mode === "RAW") {
    canvas.style.display = "none";
    terminal.style.display = "block";
    return;
  }

  canvas.style.display = "block";
  terminal.style.display = "none";
}

// Preload known sprites up front.
// "wall" is a RAW-only/invisible blocker and has no image asset.
const sprite_ids = Object.keys(Sprite.sprite_to_glyph).filter((id) => id !== "wall");
Image.preload(sprite_ids);

// Advance the networked sim and render a frame.
function frame(): void {
  const shared = game.initial_time() === null
    ? initial_state
    : game.compute_render_state();
  const state = Players.player_view(shared, pid);
  const tick = state.shared.tick;
  if (render_mode === "RAW") {
    if (terminal) {
      terminal.value = RenderTerminal.on_draw_raw(state, tick);
    }
  } else {
    RenderScreen.on_draw(ctx, state, tick);
  }
  requestAnimationFrame(frame);
}

// Handle keyboard input and post actions.
function handle_key(event: KeyboardEvent, down: boolean): void {
  if (down && event.repeat) {
    return;
  }
  if (event.key === "Tab") {
    if (!down) {
      return;
    }
    event.preventDefault();
    toggle_render_mode();
    return;
  }
  const upper = event.key.toUpperCase();
  if (!Post.is_key_input(upper)) {
    return;
  }
  event.preventDefault();

  const key = upper;
  if (down) {
    if (held_keys[key]) {
      return;
    }
    held_keys[key] = true;
    post_key(key, true);
    return;
  }
  if (!held_keys[key]) {
    return;
  }
  held_keys[key] = false;
  post_key(key, false);
}

// Join the room once time sync is ready.
game.on_sync(() => {
  game.post(Post.join(pid));
});

// Wire input and kick the render loop.
window.addEventListener("keydown", (e) => handle_key(e, true));
window.addEventListener("keyup", (e) => handle_key(e, false));
window.addEventListener("blur", release_all_keys);
window.addEventListener("beforeunload", close_game);

if (raw_toggle) {
  raw_toggle.addEventListener("change", () => {
    if (raw_toggle.checked) {
      set_render_mode("RAW");
      return;
    }
    set_render_mode("IMG");
  });
}

if (raw_toggle && raw_toggle.checked) {
  set_render_mode("RAW");
} else {
  set_render_mode("IMG");
}

RenderTerminal.apply_terminal_font(root, measure_ctx);

requestAnimationFrame(frame);
