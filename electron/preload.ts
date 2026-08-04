import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  HistoryEntry,
  PanelView,
  ToastPayload,
} from "../src/lib/app-settings";
import type { CodexAccountStatus, CodexLoginResult } from "../src/lib/codex";
import type {
  ShenavaModelKey,
  ShenavaStatus,
  ShenavaTranscription,
} from "../src/lib/speech/shenava";

export type { AppSettings, HistoryEntry, PanelView } from "../src/lib/app-settings";

const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      ipcRenderer.invoke("settings:set", patch),
  },
  history: {
    list: (): Promise<HistoryEntry[]> => ipcRenderer.invoke("history:list"),
    clear: (): Promise<HistoryEntry[]> => ipcRenderer.invoke("history:clear"),
    onChanged: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on("history:changed", handler);
      return () => ipcRenderer.removeListener("history:changed", handler);
    },
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
    showItemInFolder: (targetPath: string): Promise<boolean> =>
      ipcRenderer.invoke("shell:showItemInFolder", targetPath),
  },
  clipboard: {
    write: (text: string) => ipcRenderer.invoke("clipboard:write", text),
  },
  window: {
    setPanel: (
      mode: "hidden" | "hud" | "sheet",
      opts?: { focusable?: boolean }
    ) => ipcRenderer.invoke("window:setPanel", mode, opts),
    hide: () => ipcRenderer.invoke("window:hide"),
    showPanel: (view: PanelView, payload?: { text?: string }) =>
      ipcRenderer.invoke("window:showPanel", view, payload),
    hidePanel: () => ipcRenderer.invoke("window:hidePanel"),
  },
  panel: {
    getState: (): Promise<{ view: PanelView | null; text: string }> =>
      ipcRenderer.invoke("panel:getState"),
    onShow: (cb: (payload: { view: PanelView; text: string }) => void) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        payload: { view: PanelView; text: string }
      ) => cb(payload);
      ipcRenderer.on("panel:show", handler);
      return () => ipcRenderer.removeListener("panel:show", handler);
    },
    onHide: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on("panel:hide", handler);
      return () => ipcRenderer.removeListener("panel:hide", handler);
    },
  },
  codex: {
    getStatus: (refreshToken = false): Promise<CodexAccountStatus> =>
      ipcRenderer.invoke("codex:status", refreshToken),
    startLogin: (
      flow: "browser" | "device-code" = "browser"
    ): Promise<CodexLoginResult> => ipcRenderer.invoke("codex:login", flow),
    cancelLogin: (loginId: string) =>
      ipcRenderer.invoke("codex:login-cancel", loginId),
    logout: () => ipcRenderer.invoke("codex:logout"),
    onStatusChanged: (cb: (status: CodexAccountStatus) => void) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        status: CodexAccountStatus
      ) => cb(status);
      ipcRenderer.on("codex:status-changed", handler);
      return () => ipcRenderer.removeListener("codex:status-changed", handler);
    },
  },
  dictation: {
    onStart: (cb: (payload: { editableLikely: boolean }) => void) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        payload: { editableLikely: boolean }
      ) => cb(payload);
      ipcRenderer.on("dictation:start", handler);
      return () => ipcRenderer.removeListener("dictation:start", handler);
    },
    onStop: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on("dictation:stop", handler);
      return () => ipcRenderer.removeListener("dictation:stop", handler);
    },
    onIdle: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on("dictation:idle", handler);
      return () => ipcRenderer.removeListener("dictation:idle", handler);
    },
    onPolishing: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on("dictation:polishing", handler);
      return () => ipcRenderer.removeListener("dictation:polishing", handler);
    },
    onFeedback: (cb: (payload: ToastPayload) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: ToastPayload) =>
        cb(payload);
      ipcRenderer.on("dictation:feedback", handler);
      return () => ipcRenderer.removeListener("dictation:feedback", handler);
    },
    notifyStarted: () => ipcRenderer.send("dictation:started"),
    notifyStopped: () => ipcRenderer.send("dictation:stopped"),
    notifyTranscribing: () => ipcRenderer.send("dictation:transcribing"),
    submitTranscript: (text: string) =>
      ipcRenderer.invoke("dictation:transcript", text),
    notifyFailed: (message: string) =>
      ipcRenderer.invoke("dictation:failed", message),
    notifyNeedsModel: () => ipcRenderer.invoke("dictation:needs-model"),
  },
  toast: {
    on: (cb: (payload: ToastPayload) => void) => {
      const handler = (_: Electron.IpcRendererEvent, payload: ToastPayload) =>
        cb(payload);
      ipcRenderer.on("app:toast", handler);
      return () => ipcRenderer.removeListener("app:toast", handler);
    },
  },
  speech: {
    shenava: {
      getStatus: (): Promise<ShenavaStatus> =>
        ipcRenderer.invoke("speech:shenava:status"),
      download: (modelKey: ShenavaModelKey): Promise<ShenavaStatus> =>
        ipcRenderer.invoke("speech:shenava:download", modelKey),
      cancelDownload: () => ipcRenderer.invoke("speech:shenava:cancelDownload"),
      select: (modelKey: ShenavaModelKey): Promise<ShenavaStatus> =>
        ipcRenderer.invoke("speech:shenava:select", modelKey),
      remove: (modelKey: ShenavaModelKey): Promise<ShenavaStatus> =>
        ipcRenderer.invoke("speech:shenava:remove", modelKey),
      transcribe: (pcm: ArrayBuffer): Promise<ShenavaTranscription> =>
        ipcRenderer.invoke("speech:shenava:transcribe", pcm),
      onStatus: (cb: (status: ShenavaStatus) => void) => {
        const handler = (_: Electron.IpcRendererEvent, status: ShenavaStatus) =>
          cb(status);
        ipcRenderer.on("speech:shenava:status", handler);
        return () =>
          ipcRenderer.removeListener("speech:shenava:status", handler);
      },
    },
  },
};

contextBridge.exposeInMainWorld("pst", api);

export type PstApi = typeof api;
