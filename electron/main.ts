import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} from "electron";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ShenavaService } from "./shenava/service";
import { resolveNimruzModelRoots } from "./shenava/paths";
import {
  FocusTracker,
  pasteViaClipboard,
  getWindowPid,
  getWindowClassName,
  sameHwnd,
  hwndFromBuffer,
  type Hwnd,
} from "./inject";
import {
  detectEditableFocus,
  warmCaretDetector,
  stopCaretDetector,
} from "./caret";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "./settings";
import type { HudMode, PanelView } from "../src/lib/app-settings";
import { addHistoryEntry, clearHistory, loadHistory } from "./history";
import { CodexService } from "./codex/service";
import { polishTranscript } from "./correction";
import { isCorrectionProviderId } from "../src/lib/speech/correction";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const USER_DATA_DIR_NAME = "persian-speach-type";

/** Pin userData to `%APPDATA%/persian-speach-type` (fresh profile after rebrand). */
app.setPath("userData", path.join(app.getPath("appData"), USER_DATA_DIR_NAME));
app.setName("Persian Speach Type");

export type { HudMode, PanelView } from "../src/lib/app-settings";

type SessionSnapshot = {
  targetHwnd: Hwnd | null;
  shouldInject: boolean;
};

let hudWindow: BrowserWindow | null = null;
let panelWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let shenava: ShenavaService | null = null;
let codex: CodexService | null = null;
let settings: AppSettings = DEFAULT_SETTINGS;
let session: SessionSnapshot | null = null;
let recording = false;
let transcribing = false;
/** True while polish → paste pipeline runs (blocks overlapping hotkey starts). */
let pipelineBusy = false;
let hudMode: HudMode = "hidden";
let panelView: PanelView | null = null;
let lastPanelText = "";
let focusTracker: FocusTracker | null = null;
let isAppQuitting = false;
let ipcRegistered = false;
let unsubscribeCodexStatus: (() => void) | null = null;

function hwndOf(win: BrowserWindow | null): Hwnd | null {
  if (!win) return null;
  try {
    return hwndFromBuffer(win.getNativeWindowHandle());
  } catch {
    return null;
  }
}

function isOurWindow(hwnd: Hwnd) {
  if (sameHwnd(hwnd, hwndOf(hudWindow))) return true;
  if (sameHwnd(hwnd, hwndOf(panelWindow))) return true;
  const pid = getWindowPid(hwnd);
  return Boolean(pid && pid === process.pid);
}

function resolveWorkerScript() {
  const unpacked = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "dist-electron",
    "shenava-worker.cjs"
  );
  const local = path.join(__dirname, "shenava-worker.cjs");
  return app.isPackaged ? unpacked : local;
}

function rendererUrl(hash: string) {
  const base = process.env.ELECTRON_RENDERER_URL;
  if (isDev && base) {
    return `${base.replace(/\/$/, "")}/#${hash}`;
  }
  return null;
}

function loadRenderer(win: BrowserWindow, hash: string) {
  const url = rendererUrl(hash);
  if (url) {
    void win.loadURL(url);
    return;
  }

  const indexHtml = path.join(__dirname, "../dist/index.html");
  win.webContents.on("did-fail-load", (_e, code, desc, validatedURL) => {
    console.error("[pst] renderer failed to load", { code, desc, validatedURL, indexHtml });
  });
  void win.loadFile(indexHtml, { hash }).catch((error) => {
    console.error("[pst] loadFile error", indexHtml, error);
  });
}

function sendToHud(channel: string, ...args: unknown[]) {
  hudWindow?.webContents.send(channel, ...args);
}

function sendToPanel(channel: string, ...args: unknown[]) {
  panelWindow?.webContents.send(channel, ...args);
}

function sendToAll(channel: string, ...args: unknown[]) {
  sendToHud(channel, ...args);
  sendToPanel(channel, ...args);
}

function placeHud() {
  if (!hudWindow) return;
  const display = screen.getPrimaryDisplay();
  const { x: wx, y: wy, width: sw, height: sh } = display.workArea;
  const w = 280;
  const h = 52;
  const gap = 8;
  hudWindow.setBounds({
    width: w,
    height: h,
    x: Math.round(wx + (sw - w) / 2),
    y: Math.round(wy + sh - h - gap),
  });
}

function setHud(mode: HudMode) {
  if (!hudWindow) return;
  hudMode = mode;

  if (mode === "hidden") {
    hudWindow.setFocusable(false);
    hudWindow.hide();
    return;
  }

  placeHud();
  hudWindow.setFocusable(false);
  hudWindow.setIgnoreMouseEvents(false);
  hudWindow.showInactive();
}

function ensurePanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) return panelWindow;
  createPanelWindow();
  return panelWindow!;
}

function sendPanelShow(win: BrowserWindow) {
  if (!panelView) return;
  win.webContents.send("panel:show", {
    view: panelView,
    text: lastPanelText,
  });
}

function showPanel(view: PanelView, payload?: { text?: string }) {
  const win = ensurePanelWindow();
  panelView = view;
  lastPanelText = payload?.text ?? (view === "result" ? lastPanelText : "");
  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once("did-finish-load", () => sendPanelShow(win));
  } else {
    sendPanelShow(win);
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function hidePanel() {
  panelView = null;
  lastPanelText = "";
  if (!panelWindow || panelWindow.isDestroyed()) return;
  panelWindow.webContents.send("panel:hide");
  panelWindow.hide();
}

function createHudWindow() {
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;

  hudWindow = new BrowserWindow({
    width: 220,
    height: 52,
    x: Math.round(display.workArea.x + (sw - 220) / 2),
    y: Math.round(display.workArea.y + sh - 52 - 8),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    show: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  hudWindow.setAlwaysOnTop(true, "pop-up-menu");
  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  loadRenderer(hudWindow, "hud");

  hudWindow.once("ready-to-show", () => {
    setHud("hidden");
  });

  hudWindow.on("closed", () => {
    hudWindow = null;
  });
}

function createPanelWindow() {
  const display = screen.getPrimaryDisplay();
  const { x: wx, y: wy, width: sw, height: sh } = display.workArea;
  const w = 420;
  const h = 560;

  panelWindow = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 360,
    minHeight: 420,
    x: Math.round(wx + (sw - w) / 2),
    y: Math.round(wy + (sh - h) / 2),
    frame: true,
    transparent: false,
    backgroundColor: "#fafaf8",
    resizable: true,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    show: false,
    title: "Persian Speach Type",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  loadRenderer(panelWindow, "panel");

  panelWindow.webContents.on("did-finish-load", () => {
    if (panelView && panelWindow && !panelWindow.isDestroyed()) {
      sendPanelShow(panelWindow);
    }
  });

  panelWindow.on("close", (event) => {
    if (!isAppQuitting) {
      event.preventDefault();
      hidePanel();
    }
  });

  panelWindow.on("closed", () => {
    panelWindow = null;
    panelView = null;
    lastPanelText = "";
  });
}

function createTray() {
  tray = new Tray(
    nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMElEQVQ4T2NkYGD4z0AEYBxVMFRgsIKRgUEwGAyjYTAaBqNhMBoGo2EwGgajYTBKwwAAX8UBAeR8nVUAAAAASUVORK5CYII="
    )
  );
  tray.setToolTip("Persian Speach Type — تایپ با صدا (F8)");
  rebuildTrayMenu();
  tray.on("click", () => {
    if (panelWindow && panelWindow.isVisible() && panelView === "home") {
      hidePanel();
    } else {
      showPanel("home");
    }
  });
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "باز کردن Persian Speach Type",
        click: () => showPanel("home"),
      },
      {
        label: "شروع / توقف ضبط",
        accelerator: settings.hotkey,
        click: () => void toggleRecording(),
      },
      { type: "separator" },
      {
        label: "تنظیمات",
        click: () => showPanel("settings"),
      },
      {
        label: "تاریخچه",
        click: () => showPanel("history"),
      },
      { type: "separator" },
      {
        label: "خروج",
        click: () => {
          isAppQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

function registerHotkey(accelerator: string) {
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(accelerator, () => {
    void toggleRecording();
  });
  if (!ok) {
    console.error(`Failed to register hotkey: ${accelerator}`);
    sendToAll("app:toast", {
      type: "error",
      message: `ثبت شورتکات «${accelerator}» ناموفق بود.`,
    });
  }
  rebuildTrayMenu();
  return ok;
}

async function toggleRecording() {
  if (transcribing || pipelineBusy) return;

  if (recording) {
    recording = false;
    setHud("hud");
    sendToHud("dictation:stop");
    return;
  }

  // Only auto-paste when a real text field has the blinking caret / editable focus.
  // Merely being in Cursor/Chrome is not enough.
  const caret = await detectEditableFocus({ isOurs: isOurWindow });
  const fallbackHwnd = focusTracker?.captureTarget() ?? null;
  const targetHwnd = caret.focusHwnd ?? fallbackHwnd;
  const shouldInject = caret.editable;

  console.log(
    "[pst] start — editable=",
    shouldInject,
    "reason=",
    caret.reason,
    "type=",
    caret.controlType ?? "-",
    "hwnd=",
    String(targetHwnd),
    targetHwnd ? getWindowClassName(targetHwnd) || "?" : "(none)"
  );

  session = {
    targetHwnd,
    shouldInject,
  };

  recording = true;
  setHud("hud");
  sendToHud("dictation:start", {
    editableLikely: shouldInject,
  });
}

async function handleTranscript(text: string) {
  if (pipelineBusy) return;

  recording = false;
  transcribing = false;
  pipelineBusy = true;

  try {
    const trimmed = text.trim();
    if (!trimmed) {
      session = null;
      setHud("hud");
      sendToHud("dictation:feedback", {
        type: "info",
        message: "صدای قابل‌تشخیصی شنیده نشد.",
      });
      return;
    }

    const snap = session;
    session = null;

    let finalText = trimmed;
    let fallbackReason: string | undefined;
    if (settings.correctionProvider !== "none") {
      setHud("hud");
      sendToHud("dictation:polishing");
      const polished = await polishTranscript({
        text: trimmed,
        provider: settings.correctionProvider,
        codex,
      });
      finalText = polished.text;
      fallbackReason = polished.fallbackReason;
    }

    addHistoryEntry(finalText);

    // Hide HUD without stealing caret (showInactive counterpart).
    setHud("hidden");
    await new Promise((r) => setTimeout(r, 120));

    let injected = false;
    if (snap?.shouldInject && snap.targetHwnd) {
      // Re-check: user may have clicked away while speaking.
      const still = await detectEditableFocus({ isOurs: isOurWindow });
      if (still.editable) {
        const target = still.focusHwnd ?? snap.targetHwnd;
        console.log(
          "[pst] paste — editable ok",
          still.reason,
          String(target)
        );
        injected = await pasteViaClipboard(finalText, target);
      } else {
        console.log("[pst] paste — caret lost after dictation", still.reason);
        clipboard.writeText(finalText);
      }
    } else {
      console.log("[pst] paste — no editable field at start; clipboard only");
      clipboard.writeText(finalText);
    }

    console.log("[pst] paste result", injected);
    sendToAll("history:changed");

    if (!injected) {
      setHud("hud");
      sendToHud("dictation:feedback", {
        type: "success",
        message: fallbackReason
          ? "اصلاح نشد؛ متن کپی شد — Ctrl+V را بزنید."
          : "متن کپی شد — فیلد متنی را انتخاب کنید و Ctrl+V بزنید.",
      });
      return;
    }

    if (fallbackReason) {
      setHud("hud");
      sendToHud("dictation:feedback", {
        type: "info",
        message: "اصلاح انجام نشد؛ متن خام paste شد.",
      });
      return;
    }

    sendToHud("dictation:idle");
    setHud("hidden");
  } finally {
    pipelineBusy = false;
  }
}

function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle("settings:get", () => settings);

  ipcMain.handle("settings:set", (_event, patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    if (patch.hotkey && patch.hotkey !== settings.hotkey) {
      const ok = registerHotkey(patch.hotkey);
      if (!ok) {
        // registerHotkey unregisters all first; restore the previous binding.
        registerHotkey(settings.hotkey);
        return settings;
      }
    }
    if (typeof patch.launchAtLogin === "boolean") {
      app.setLoginItemSettings({
        openAtLogin: patch.launchAtLogin,
        openAsHidden: true,
      });
    }
    if (
      patch.correctionProvider !== undefined &&
      !isCorrectionProviderId(patch.correctionProvider)
    ) {
      next.correctionProvider = settings.correctionProvider;
    }
    if (typeof patch.codexModelId === "string") {
      codex?.setPreferredModel(patch.codexModelId || null);
    }
    settings = saveSettings(next);
    rebuildTrayMenu();
    return settings;
  });

  ipcMain.handle("codex:status", (_event, refreshToken?: boolean) =>
    codex
      ? codex.getAccountStatus(Boolean(refreshToken))
      : {
          state: "unavailable" as const,
          email: null,
          planType: null,
          message: "موتور Codex هنوز آماده نیست.",
        }
  );

  ipcMain.handle(
    "codex:login",
    async (_event, flow: "browser" | "device-code" = "browser") => {
      if (!codex) throw new Error("موتور Codex آماده نیست.");
      const result = await codex.startLogin(flow);
      if (result.type === "browser") {
        await shell.openExternal(result.authUrl);
      } else {
        await shell.openExternal(result.verificationUrl);
      }
      return result;
    }
  );

  ipcMain.handle("codex:login-cancel", async (_event, loginId: string) => {
    if (!codex) return;
    await codex.cancelLogin(String(loginId ?? ""));
  });

  ipcMain.handle("codex:logout", async () => {
    if (!codex) return;
    await codex.logout();
  });

  ipcMain.handle("history:list", () => loadHistory());
  ipcMain.handle("history:clear", () => {
    clearHistory();
    return [];
  });

  ipcMain.handle("shell:openExternal", async (_event, url: string) => {
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle(
    "shell:showItemInFolder",
    async (_event, targetPath: string) => {
      if (typeof targetPath !== "string" || !targetPath.trim()) return false;
      const resolved = path.resolve(targetPath);
      if (!shenava?.isAllowedModelPath(resolved)) return false;

      try {
        await access(resolved);
        shell.showItemInFolder(resolved);
        return true;
      } catch {
        const parent = path.dirname(resolved);
        if (!shenava?.isAllowedModelPath(parent)) return false;
        try {
          await mkdir(parent, { recursive: true });
          const error = await shell.openPath(parent);
          return error === "";
        } catch {
          return false;
        }
      }
    }
  );

  ipcMain.handle("clipboard:write", (_event, text: string) => {
    clipboard.writeText(text);
    return true;
  });

  /** HUD overlay: hidden | hud. "sheet" is accepted for compat → opens panel. */
  ipcMain.handle(
    "window:setPanel",
    (
      _event,
      mode: HudMode | "sheet",
      _opts?: { focusable?: boolean }
    ) => {
      if (mode === "sheet") {
        showPanel(panelView ?? "home");
        return;
      }
      setHud(mode);
    }
  );

  ipcMain.handle("window:hide", () => {
    setHud("hidden");
  });

  ipcMain.handle("window:showPanel", (_event, view: PanelView, payload?: { text?: string }) => {
    showPanel(view, payload);
  });

  ipcMain.handle("window:hidePanel", () => {
    hidePanel();
  });

  ipcMain.handle("panel:getState", () => ({
    view: panelView,
    text: lastPanelText,
  }));

  ipcMain.on("dictation:started", () => {
    recording = true;
    setHud("hud");
  });

  ipcMain.on("dictation:stopped", () => {
    recording = false;
  });

  ipcMain.on("dictation:transcribing", () => {
    transcribing = true;
    setHud("hud");
  });

  ipcMain.handle("dictation:transcript", async (_event, text: string) => {
    await handleTranscript(String(text ?? ""));
    return true;
  });

  ipcMain.handle("dictation:failed", (_event, message: string) => {
    recording = false;
    transcribing = false;
    pipelineBusy = false;
    session = null;
    setHud("hud");
    sendToHud("dictation:feedback", {
      type: "error",
      message: message || "تبدیل صدا ناموفق بود.",
    });
    return true;
  });

  ipcMain.handle("dictation:needs-model", () => {
    showPanel("needs-model");
    return true;
  });

  if (!shenava) return;

  ipcMain.handle("speech:shenava:status", () => shenava!.getStatus());
  ipcMain.handle("speech:shenava:download", (_e, modelKey) =>
    shenava!.download(modelKey)
  );
  ipcMain.handle("speech:shenava:cancelDownload", () => {
    shenava!.cancelDownload();
  });
  ipcMain.handle("speech:shenava:select", (_e, modelKey) =>
    shenava!.select(modelKey)
  );
  ipcMain.handle("speech:shenava:remove", (_e, modelKey) =>
    shenava!.remove(modelKey)
  );
  ipcMain.handle("speech:shenava:transcribe", async (_e, buffer: ArrayBuffer) => {
    const samples = new Float32Array(buffer);
    return shenava!.transcribe(samples);
  });

  shenava.onStatus((status) => {
    sendToAll("speech:shenava:status", status);
  });

  unsubscribeCodexStatus?.();
  unsubscribeCodexStatus =
    codex?.onStatusChanged(() => {
      void codex?.getAccountStatus().then((status) => {
        sendToAll("codex:status-changed", status);
      });
    }) ?? null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showPanel("home");
  });

  app.whenReady().then(() => {
    settings = loadSettings();
    const userData = app.getPath("userData");
    shenava = new ShenavaService({
      userDataPath: userData,
      workerScript: resolveWorkerScript(),
      sharedModelRoots: resolveNimruzModelRoots(app.getPath("appData")),
    });
    codex = new CodexService({
      codexHome: path.join(userData, "codex"),
      workspace: path.join(userData, "codex-workspace"),
      clientVersion: app.getVersion(),
      preferredModel: settings.codexModelId || null,
    });

    focusTracker = new FocusTracker(isOurWindow);
    focusTracker.start();
    warmCaretDetector();

    registerIpc();
    createHudWindow();
    createPanelWindow();
    createTray();
    registerHotkey(settings.hotkey);

    // Always sync OS login item with settings (default: on).
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtLogin,
      openAsHidden: true,
    });
  });

  app.on("before-quit", () => {
    isAppQuitting = true;
  });

  app.on("will-quit", () => {
    focusTracker?.stop();
    stopCaretDetector();
    globalShortcut.unregisterAll();
    unsubscribeCodexStatus?.();
    unsubscribeCodexStatus = null;
    codex?.dispose();
    codex = null;
  });

  app.on("window-all-closed", () => {
    // Keep running in tray.
  });
}
