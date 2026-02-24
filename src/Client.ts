import * as Sprite from "./data/Sprite";
import * as Game from "./game/Game";
import * as Image from "./game/Type/Image";
import * as Util from "./game/Util";
import * as RenderScreen from "./game/Render/Screen";
import * as RenderTerminal from "./game/Render/Terminal";
import * as Type from "./game/Type";

// Grab the game canvas element.
const canvas = document.getElementById("game") as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("missing #game canvas");
}

// Create the 2d rendering context.
const ctx = canvas.getContext("2d");
if (!ctx) {
  throw new Error("unable to create 2d context");
}

const terminal_el = document.getElementById("terminal");
const raw_toggle_el = document.getElementById("raw-toggle");
const terminal = terminal_el as HTMLTextAreaElement | null;
const raw_toggle = raw_toggle_el as HTMLInputElement | null;
const root = document.documentElement;

// Keep pixel art crisp.
ctx.imageSmoothingEnabled = false;

// Track local state and tick progression.
let state: Type.State = Game.create();
let last_tick = Util.tick_now();
let render_mode: Type.RenderMode = "IMG";
const terminal_cols = 40;
const terminal_rows = 18;
const terminal_w = 320;
const terminal_h = 288;
const measure_canvas = document.createElement("canvas");
const measure_ctx = measure_canvas.getContext("2d");

// Pick the terminal font name.
const terminal_font_name = "Menlo";

// Build a CSS font list string.
function font_css(name: string): string {
  return `"${name}", monospace`;
}

// Store the terminal font css.
const terminal_font_css = font_css(terminal_font_name);

// Apply the current font selection.
function apply_terminal_font(): void {
  root.style.setProperty("--terminal-font", terminal_font_css);
  apply_terminal_metrics();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      apply_terminal_metrics();
    });
  }
}

// Measure the glyph width for the active terminal font.
function terminal_glyph_width(font_css: string, size: number): number {
  if (!measure_ctx) {
    return 0;
  }
  measure_ctx.font = `${size}px ${font_css}`;
  const metrics = measure_ctx.measureText("0");
  return metrics.width;
}

// Apply terminal sizing to match the canvas resolution.
function apply_terminal_metrics(): void {
  const test_size = 100;
  const glyph_w = terminal_glyph_width(terminal_font_css, test_size);
  if (glyph_w <= 0) {
    return;
  }
  const target_w = terminal_w / terminal_cols;
  const line_h = terminal_h / terminal_rows;
  const font_a = (target_w * test_size) / glyph_w;
  const font_size = Math.min(font_a, line_h);
  root.style.setProperty("--terminal-font-size", `${font_size.toFixed(2)}px`);
  root.style.setProperty("--terminal-line-height", `${line_h}px`);
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
  } else {
    render_mode = mode;
  }

  if (render_mode === "RAW") {
    canvas.style.display = "none";
    terminal.style.display = "block";
    return;
  }
  canvas.style.display = "block";
  if (terminal) {
    terminal.style.display = "none";
  }
}

// Preload known sprites up front.
const sprite_ids = Object.keys(Sprite.sprite_to_glyph);
Image.preload(sprite_ids);

// Advance ticks, step sim, and render a frame.
function frame(): void {
  const now = Util.tick_now();
  while (last_tick < now) {
    state = Game.on_tick(state, last_tick);
    last_tick++;
  }
  const tick = Util.tick_now();
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
  // Ignore key repeat events.
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
  if (!"ASDWJKL".includes(upper)) {
    return;
  }
  event.preventDefault();

  const key = upper as Type.KeyInput;
  const tick = Util.tick_now();
  const post: Type.Post = { type: "key", key, down, tick };
  state = Game.on_post(post, state);
}

// Wire input and kick the render loop.
window.addEventListener("keydown", (e) => handle_key(e, true));
window.addEventListener("keyup", (e) => handle_key(e, false));

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

apply_terminal_font();

requestAnimationFrame(frame);
