/**
 * Detect whether the OS focus is inside a real text field (blinking caret /
 * editable UIA element) — not merely "some app window is foreground".
 *
 * Fast path: GetGUIThreadInfo (Win32 caret / native Edit).
 * Chromium path: warm PowerShell UI Automation probe (Cursor, Chrome, …).
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import koffi from "koffi";
import {
  getForegroundHwnd,
  getWindowClassName,
  type Hwnd,
} from "./inject";

const user32 = koffi.load("user32.dll");

const GUI_CARETBLINKING = 0x00000001;

const RECT = koffi.struct("PST_RECT", {
  left: "int32",
  top: "int32",
  right: "int32",
  bottom: "int32",
});

const GUITHREADINFO = koffi.struct("PST_GUITHREADINFO", {
  cbSize: "uint32",
  flags: "uint32",
  hwndActive: "uintptr",
  hwndFocus: "uintptr",
  hwndCapture: "uintptr",
  hwndMenuOwner: "uintptr",
  hwndMoveSize: "uintptr",
  hwndCaret: "uintptr",
  rcCaret: RECT,
});

const GetGUIThreadInfo = user32.func("GetGUIThreadInfo", "bool", [
  "uint32",
  "void *",
]);

const NATIVE_EDIT_CLASSES = new Set([
  "Edit",
  "RichEdit20A",
  "RichEdit20W",
  "RichEdit50W",
  "RichEdit60W",
  "TextBox",
]);

export type CaretProbe = {
  editable: boolean;
  focusHwnd: Hwnd | null;
  reason: string;
  controlType?: string;
};

function asHwnd(value: unknown): Hwnd | null {
  if (value == null || value === 0 || value === 0n) return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
    return BigInt(Math.trunc(value));
  }
  return null;
}

let worker: ChildProcessWithoutNullStreams | null = null;
let workerReady = false;
let pending: {
  resolve: (v: {
    editable: boolean;
    controlType?: string;
    reason?: string;
  }) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

function resolveWorkerScript(): string | null {
  const candidates = [
    // Packaged: electron-builder asarUnpack
    path.join(
      process.resourcesPath ?? "",
      "app.asar.unpacked",
      "scripts",
      "uia-caret-worker.ps1"
    ),
    path.join(app.getAppPath(), "scripts", "uia-caret-worker.ps1"),
    path.join(process.cwd(), "scripts", "uia-caret-worker.ps1"),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function startWorker() {
  if (worker) return;
  const script = resolveWorkerScript();
  if (!script) {
    console.error("[pst] uia-caret-worker.ps1 not found");
    return;
  }
  worker = spawn(
    "powershell.exe",
    ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", script],
    {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    }
  );
  worker.stdout.setEncoding("utf8");
  let buf = "";
  worker.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      if (line === "READY") {
        workerReady = true;
        continue;
      }
      if (!pending) continue;
      const p = pending;
      pending = null;
      clearTimeout(p.timer);
      try {
        const json = JSON.parse(line) as {
          editable?: boolean;
          controlType?: string;
          reason?: string;
        };
        p.resolve({
          editable: Boolean(json.editable),
          controlType: json.controlType,
          reason: json.reason,
        });
      } catch {
        p.resolve({ editable: false, reason: "parse-error" });
      }
    }
  });
  worker.on("exit", () => {
    worker = null;
    workerReady = false;
    if (pending) {
      const p = pending;
      pending = null;
      clearTimeout(p.timer);
      p.resolve({ editable: false, reason: "worker-exit" });
    }
  });
}

export function warmCaretDetector() {
  try {
    startWorker();
  } catch (error) {
    console.error("[pst] caret worker failed to start", error);
  }
}

export function stopCaretDetector() {
  try {
    worker?.stdin.write("quit\n");
  } catch {
    // ignore
  }
  try {
    worker?.kill();
  } catch {
    // ignore
  }
  worker = null;
  workerReady = false;
}

function probeUia(): Promise<{
  editable: boolean;
  controlType?: string;
  reason?: string;
}> {
  startWorker();
  if (!worker) {
    return Promise.resolve({ editable: false, reason: "no-worker" });
  }
  if (pending) {
    return Promise.resolve({ editable: false, reason: "busy" });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (pending?.resolve === resolve) {
        pending = null;
        resolve({ editable: false, reason: "timeout" });
      }
    }, 2000);
    pending = { resolve, timer };
    const started = Date.now();
    const waitReady = () => {
      if (!worker) {
        clearTimeout(timer);
        pending = null;
        resolve({ editable: false, reason: "no-worker" });
        return;
      }
      if (workerReady) {
        try {
          worker.stdin.write("probe\n");
        } catch {
          clearTimeout(timer);
          pending = null;
          resolve({ editable: false, reason: "stdin-error" });
        }
        return;
      }
      if (Date.now() - started > 1800) {
        clearTimeout(timer);
        pending = null;
        resolve({ editable: false, reason: "not-ready" });
        return;
      }
      setTimeout(waitReady, 40);
    };
    waitReady();
  });
}

function readGuiThreadInfo(): {
  flags: number;
  hwndFocus: Hwnd | null;
  hwndCaret: Hwnd | null;
} | null {
  try {
    const size = koffi.sizeof(GUITHREADINFO);
    const buf = Buffer.alloc(size);
    buf.writeUInt32LE(size, 0);
    const ok = GetGUIThreadInfo(0, buf);
    if (!ok) return null;
    const info = koffi.decode(buf, GUITHREADINFO) as {
      flags: number;
      hwndFocus: bigint | number;
      hwndCaret: bigint | number;
    };
    return {
      flags: info.flags,
      hwndFocus: asHwnd(info.hwndFocus),
      hwndCaret: asHwnd(info.hwndCaret),
    };
  } catch {
    return null;
  }
}

function isNativeEditClass(hwnd: Hwnd | null): boolean {
  if (!hwnd) return false;
  const cls = getWindowClassName(hwnd);
  if (!cls) return false;
  if (NATIVE_EDIT_CLASSES.has(cls)) return true;
  if (/^RichEdit/i.test(cls)) return true;
  return false;
}

/**
 * Snapshot: is there a text insertion caret / editable field focused?
 */
export async function detectEditableFocus(options?: {
  isOurs?: (hwnd: Hwnd) => boolean;
}): Promise<CaretProbe> {
  const isOurs = options?.isOurs ?? (() => false);
  const fg = getForegroundHwnd();
  if (fg && isOurs(fg)) {
    return { editable: false, focusHwnd: null, reason: "our-window" };
  }

  const gui = readGuiThreadInfo();
  if (gui) {
    if (gui.hwndFocus && isOurs(gui.hwndFocus)) {
      return { editable: false, focusHwnd: null, reason: "focus-ours" };
    }

    if (gui.flags & GUI_CARETBLINKING) {
      return {
        editable: true,
        focusHwnd: gui.hwndCaret ?? gui.hwndFocus ?? fg,
        reason: "gui-caret-blinking",
      };
    }
    if (gui.hwndCaret) {
      return {
        editable: true,
        focusHwnd: gui.hwndCaret ?? gui.hwndFocus ?? fg,
        reason: "gui-hwnd-caret",
      };
    }
    if (isNativeEditClass(gui.hwndFocus)) {
      return {
        editable: true,
        focusHwnd: gui.hwndFocus,
        reason: "native-edit-class",
      };
    }
  }

  // Chromium / Electron apps (Cursor, Chrome, VS Code, …): custom caret.
  const uia = await probeUia();
  if (uia.editable) {
    return {
      editable: true,
      focusHwnd: gui?.hwndFocus ?? fg,
      reason: "uia-editable",
      controlType: uia.controlType,
    };
  }

  return {
    editable: false,
    focusHwnd: gui?.hwndFocus ?? fg,
    reason: uia.reason ?? "no-caret",
    controlType: uia.controlType,
  };
}
