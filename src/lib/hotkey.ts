/** Default global hotkey (matches `DEFAULT_SETTINGS.hotkey`). */
export const DEFAULT_HOTKEY = "F8";

const MODIFIER_KEY_NAMES = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "OS",
  "AltGraph",
]);

const CODE_TO_ACCEL: Record<string, string> = {
  Space: "Space",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Enter: "Enter",
  NumpadEnter: "Enter",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Escape: "Escape",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Slash: "/",
  NumpadDivide: "numdiv",
  NumpadMultiply: "nummult",
  NumpadSubtract: "numsub",
  NumpadAdd: "numadd",
  NumpadDecimal: "numdec",
};

/** Electron `globalShortcut` accelerator token (non-modifier). */
const KEY_TOKEN =
  /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Plus|Space|Tab|Backspace|Delete|Insert|Return|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|Escape|Esc|VolumeUp|VolumeDown|VolumeMute|MediaNextTrack|MediaPreviousTrack|MediaStop|MediaPlayPause|PrintScreen|num[0-9]|numdec|numadd|numsub|nummult|numdiv|\\|-|=|\[|\]|;|'|`|,|\.|\/)$/;

const MODIFIER_TOKEN =
  /^(?:CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Alt|Option|AltGr|Shift|Super|Meta)$/;

export function isModifierKey(event: KeyboardEvent): boolean {
  return MODIFIER_KEY_NAMES.has(event.key);
}

function keyTokenFromEvent(event: KeyboardEvent): string | null {
  const { code, key } = event;

  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`;
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return code;

  if (CODE_TO_ACCEL[code]) return CODE_TO_ACCEL[code];

  if (key === "+") return "Plus";
  if (key.length === 1) {
    const upper = key.toUpperCase();
    if (/^[A-Z0-9]$/.test(upper)) return upper;
  }

  return null;
}

/**
 * Build an Electron accelerator string from a keydown event.
 * Returns `null` for lone modifiers or unmappable keys.
 * Format matches this app's usage: `F8`, `Control+L`, `Control+Shift+H`.
 */
export function eventToAccelerator(event: KeyboardEvent): string | null {
  if (isModifierKey(event)) return null;

  const key = keyTokenFromEvent(event);
  if (!key) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Super");
  parts.push(key);

  return parts.join("+");
}

/** Lightweight check that a string looks like an Electron accelerator. */
export function isValidAccelerator(accelerator: string): boolean {
  const trimmed = accelerator.trim();
  if (!trimmed) return false;

  const tokens = trimmed.split("+");
  if (tokens.some((t) => !t)) return false;

  const key = tokens[tokens.length - 1]!;
  const modifiers = tokens.slice(0, -1);

  if (!KEY_TOKEN.test(key)) return false;
  if (!modifiers.every((m) => MODIFIER_TOKEN.test(m))) return false;

  return true;
}
