import koffi from "koffi";

const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");

// HWND as uintptr — void* + koffi.as(bigint) makes IsWindow false-negative.
const GetForegroundWindow = user32.func("GetForegroundWindow", "uintptr", []);
const SetForegroundWindow = user32.func("SetForegroundWindow", "bool", ["uintptr"]);
const IsWindow = user32.func("IsWindow", "bool", ["uintptr"]);
const GetWindowThreadProcessId = user32.func(
  "GetWindowThreadProcessId",
  "uint32",
  ["uintptr", "uint32 *"]
);
const GetCurrentThreadId = kernel32.func("GetCurrentThreadId", "uint32", []);
const AttachThreadInput = user32.func("AttachThreadInput", "bool", [
  "uint32",
  "uint32",
  "bool",
]);
const MapVirtualKeyW = user32.func("MapVirtualKeyW", "uint", ["uint", "uint"]);
const SendInput = user32.func("SendInput", "uint", ["uint", "void *", "int"]);
const AllowSetForegroundWindow = user32.func("AllowSetForegroundWindow", "bool", [
  "uint32",
]);
const GetAsyncKeyState = user32.func("GetAsyncKeyState", "int16", ["int"]);
const GetKeyboardLayout = user32.func("GetKeyboardLayout", "void *", ["uint32"]);
const VkKeyScanExW = user32.func("VkKeyScanExW", "int16", ["uint16", "void *"]);
const GetClassNameW = user32.func("GetClassNameW", "int", [
  "uintptr",
  "void *",
  "int",
]);

/** Desktop / taskbar / Start — never auto-paste here. */
const SHELL_DESKTOP_CLASSES = new Set([
  "Progman",
  "WorkerW",
  "Shell_TrayWnd",
  "Shell_SecondaryTrayWnd",
  "NotifyIconOverflowWindow",
  "Windows.UI.Core.CoreWindow",
  "#32769",
]);

const TRANSIENT_FOCUS_CLASSES = new Set(["ForegroundStaging"]);

const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const INPUT_KEYBOARD = 1;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12;
const VK_SHIFT = 0x10;
const VK_LWIN = 0x5b;
const VK_RWIN = 0x5c;
const VK_V = 0x56;
const ASFW_ANY = 0xffffffff;

const INPUT_KB = koffi.struct("INPUT_KB", {
  type: "uint32",
  padding: "uint32",
  wVk: "uint16",
  wScan: "uint16",
  dwFlags: "uint32",
  time: "uint32",
  dwExtraInfo: "uintptr",
  pad2: "int32",
  pad3: "int32",
});

export type Hwnd = bigint;

function toHwnd(value: unknown): Hwnd | null {
  if (value == null || value === 0 || value === 0n) return null;
  if (typeof value === "bigint") return value === 0n ? null : value;
  if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
    return BigInt(Math.trunc(value));
  }
  try {
    const addr = koffi.address(value as object);
    if (!addr) return null;
    return typeof addr === "bigint" ? addr : BigInt(addr);
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function sameHwnd(a: Hwnd | null, b: Hwnd | null) {
  return Boolean(a && b && a === b);
}

export function getForegroundHwnd(): Hwnd | null {
  try {
    return toHwnd(GetForegroundWindow());
  } catch {
    return null;
  }
}

export function isWindowAlive(hwnd: Hwnd | null) {
  if (!hwnd) return false;
  try {
    return Boolean(IsWindow(hwnd));
  } catch {
    return false;
  }
}

export function getWindowPid(hwnd: Hwnd | null): number | null {
  if (!hwnd) return null;
  try {
    const pid = [0];
    GetWindowThreadProcessId(hwnd, pid);
    return pid[0] || null;
  } catch {
    return null;
  }
}

export function hwndFromBuffer(buf: Buffer): Hwnd | null {
  try {
    if (buf.length >= 8) return buf.readBigUInt64LE(0) || null;
    if (buf.length >= 4) {
      const n = buf.readUInt32LE(0);
      return n ? BigInt(n) : null;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getWindowClassName(hwnd: Hwnd | null): string {
  if (!hwnd) return "";
  try {
    const buf = Buffer.alloc(512);
    const len = GetClassNameW(hwnd, buf, 256) as number;
    if (!len || len <= 0) return "";
    return buf.toString("utf16le", 0, len * 2);
  } catch {
    return "";
  }
}

export function isShellOrDesktopWindow(hwnd: Hwnd | null): boolean {
  if (!hwnd) return false;
  const cls = getWindowClassName(hwnd);
  if (!cls) return false;
  if (SHELL_DESKTOP_CLASSES.has(cls)) return true;
  if (cls.startsWith("Windows.UI.")) return true;
  return false;
}

function isTransientFocusWindow(hwnd: Hwnd | null): boolean {
  if (!hwnd) return false;
  const cls = getWindowClassName(hwnd);
  return TRANSIENT_FOCUS_CLASSES.has(cls);
}

export function isAppWindow(hwnd: Hwnd | null): boolean {
  if (!hwnd) return false;
  if (isShellOrDesktopWindow(hwnd)) return false;
  if (isTransientFocusWindow(hwnd)) return false;
  return true;
}

/**
 * Soft focus restore — never ShowWindow(SW_RESTORE) / BringWindowToTop.
 * Those yank browsers/Electron apps out of fullscreen into a restored tab.
 */
function softFocusWindow(hwnd: Hwnd | null) {
  if (!hwnd) return false;

  try {
    AllowSetForegroundWindow(ASFW_ANY);
  } catch {
    // ignore
  }

  try {
    const foreground = toHwnd(GetForegroundWindow());
    if (sameHwnd(foreground, hwnd)) return true;

    const targetPid = [0];
    const forePid = [0];
    const targetThread = GetWindowThreadProcessId(hwnd, targetPid);
    const foreThread = foreground
      ? GetWindowThreadProcessId(foreground, forePid)
      : 0;
    const currentThread = GetCurrentThreadId();

    if (foreThread && foreThread !== currentThread) {
      AttachThreadInput(currentThread, foreThread, true);
    }
    if (targetThread && targetThread !== currentThread) {
      AttachThreadInput(currentThread, targetThread, true);
    }

    SetForegroundWindow(hwnd);

    if (targetThread && targetThread !== currentThread) {
      AttachThreadInput(currentThread, targetThread, false);
    }
    if (foreThread && foreThread !== currentThread) {
      AttachThreadInput(currentThread, foreThread, false);
    }
  } catch (error) {
    console.error("[pst] softFocus failed", error);
    return false;
  }

  return true;
}

function encodeKey(vk: number, flags: number) {
  const scan = MapVirtualKeyW(vk, 0);
  return {
    type: INPUT_KEYBOARD,
    padding: 0,
    wVk: vk,
    wScan: scan,
    dwFlags: flags,
    time: 0,
    dwExtraInfo: 0,
    pad2: 0,
    pad3: 0,
  };
}

function sendInputs(events: ReturnType<typeof encodeKey>[]) {
  const size = koffi.sizeof(INPUT_KB);
  const buf = Buffer.alloc(size * events.length);
  for (let i = 0; i < events.length; i += 1) {
    koffi.encode(buf, i * size, INPUT_KB, events[i]);
  }
  return SendInput(events.length, buf, size) === events.length;
}

function releaseModifiers() {
  const mods = [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN];
  const ups: ReturnType<typeof encodeKey>[] = [];
  for (const vk of mods) {
    if (GetAsyncKeyState(vk) & 0x8000) {
      ups.push(
        encodeKey(
          vk,
          KEYEVENTF_KEYUP |
            (vk === VK_LWIN || vk === VK_RWIN ? KEYEVENTF_EXTENDEDKEY : 0)
        )
      );
    }
  }
  if (ups.length) sendInputs(ups);
}

function sendCtrlV() {
  releaseModifiers();
  return sendInputs([
    encodeKey(VK_CONTROL, 0),
    encodeKey(VK_V, 0),
    encodeKey(VK_V, KEYEVENTF_KEYUP),
    encodeKey(VK_CONTROL, KEYEVENTF_KEYUP),
  ]);
}

/**
 * Tracks last non-self app window for gentle focus return after HUD.
 */
export class FocusTracker {
  #lastExternal: Hwnd | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #isOurs: (hwnd: Hwnd) => boolean;

  constructor(isOurs: (hwnd: Hwnd) => boolean) {
    this.#isOurs = isOurs;
  }

  start() {
    if (this.#timer) return;
    this.#tick();
    this.#timer = setInterval(() => this.#tick(), 150);
    this.#timer.unref?.();
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  #tick() {
    try {
      const fg = getForegroundHwnd();
      if (!fg || this.#isOurs(fg)) return;
      if (isAppWindow(fg)) this.#lastExternal = fg;
    } catch {
      // ignore
    }
  }

  #lastApp(): Hwnd | null {
    return this.#lastExternal && isAppWindow(this.#lastExternal)
      ? this.#lastExternal
      : null;
  }

  /** Best top-level app hwnd near hotkey time (not proof of editable caret). */
  captureTarget(): Hwnd | null {
    this.#tick();
    try {
      const fg = getForegroundHwnd();
      if (!fg) return this.#lastApp();
      if (this.#isOurs(fg) || isTransientFocusWindow(fg)) return this.#lastApp();
      if (isShellOrDesktopWindow(fg)) return null;
      return fg;
    } catch {
      return null;
    }
  }

  get lastExternal() {
    return this.#lastExternal;
  }
}

/**
 * Clipboard write → soft-focus target → Ctrl+V.
 * Only call when an editable caret was confirmed; never restores/minimizes windows.
 */
export async function pasteViaClipboard(
  text: string,
  targetHwnd: Hwnd | null
): Promise<boolean> {
  if (!text) return false;

  const { clipboard } = await import("electron");
  const previous = clipboard.readText();
  clipboard.writeText(text);

  if (!targetHwnd || !isAppWindow(targetHwnd)) {
    console.log(
      "[pst] paste skipped — no app target",
      String(targetHwnd),
      getWindowClassName(targetHwnd) || "(no class)"
    );
    return false;
  }

  let pasted = false;
  try {
    await sleep(30);
    const fg = getForegroundHwnd();
    // Only nudge focus if we (or shell) stole it — never ShowWindow(SW_RESTORE).
    if (!fg || !sameHwnd(fg, targetHwnd)) {
      softFocusWindow(targetHwnd);
      await sleep(80);
    }
    pasted = sendCtrlV();
    await sleep(180);
    console.log(
      "[pst] Ctrl+V sent",
      pasted,
      "class=",
      getWindowClassName(targetHwnd) || "?"
    );
    return pasted;
  } catch (error) {
    console.error("[pst] paste failed", error);
    return false;
  } finally {
    if (pasted) {
      setTimeout(() => {
        try {
          if (clipboard.readText() === text) {
            clipboard.writeText(previous);
          }
        } catch {
          // ignore
        }
      }, 2000);
    }
  }
}

void GetKeyboardLayout;
void VkKeyScanExW;
