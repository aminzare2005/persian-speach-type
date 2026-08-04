import type {
  AppSettings,
  PanelView,
  ToastPayload,
} from "./lib/app-settings";
import type { CodexAccountStatus, CodexLoginResult } from "./lib/codex";
import type {
  ShenavaModelKey,
  ShenavaStatus,
  ShenavaTranscription,
} from "./lib/speech/shenava";

type HudMode = "hidden" | "hud" | "sheet";

type PstApi = {
  settings: {
    get: () => Promise<AppSettings>;
    set: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  };
  history: {
    list: () => Promise<
      Array<{ id: string; text: string; createdAt: string }>
    >;
    clear: () => Promise<Array<{ id: string; text: string; createdAt: string }>>;
    onChanged: (cb: () => void) => () => void;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
    showItemInFolder: (targetPath: string) => Promise<boolean>;
  };
  clipboard: { write: (text: string) => Promise<boolean> };
  window: {
    setPanel: (
      mode: HudMode,
      opts?: { focusable?: boolean }
    ) => Promise<void>;
    hide: () => Promise<void>;
    showPanel: (
      view: PanelView,
      payload?: { text?: string }
    ) => Promise<void>;
    hidePanel: () => Promise<void>;
  };
  panel: {
    getState: () => Promise<{ view: PanelView | null; text: string }>;
    onShow: (
      cb: (payload: { view: PanelView; text: string }) => void
    ) => () => void;
    onHide: (cb: () => void) => () => void;
  };
  codex: {
    getStatus: (refreshToken?: boolean) => Promise<CodexAccountStatus>;
    startLogin: (
      flow?: "browser" | "device-code"
    ) => Promise<CodexLoginResult>;
    cancelLogin: (loginId: string) => Promise<void>;
    logout: () => Promise<void>;
    onStatusChanged: (cb: (status: CodexAccountStatus) => void) => () => void;
  };
  dictation: {
    onStart: (cb: (payload: { editableLikely: boolean }) => void) => () => void;
    onStop: (cb: () => void) => () => void;
    onIdle: (cb: () => void) => () => void;
    onPolishing: (cb: () => void) => () => void;
    onFeedback: (cb: (payload: ToastPayload) => void) => () => void;
    notifyStarted: () => void;
    notifyStopped: () => void;
    notifyTranscribing: () => void;
    submitTranscript: (text: string) => Promise<boolean>;
    notifyFailed: (message: string) => Promise<boolean>;
    notifyNeedsModel: () => Promise<boolean>;
  };
  toast: {
    on: (cb: (payload: ToastPayload) => void) => () => void;
  };
  speech: {
    shenava: {
      getStatus: () => Promise<ShenavaStatus>;
      download: (modelKey: ShenavaModelKey) => Promise<ShenavaStatus>;
      cancelDownload: () => Promise<void>;
      select: (modelKey: ShenavaModelKey) => Promise<ShenavaStatus>;
      remove: (modelKey: ShenavaModelKey) => Promise<ShenavaStatus>;
      transcribe: (pcm: ArrayBuffer) => Promise<ShenavaTranscription>;
      onStatus: (cb: (status: ShenavaStatus) => void) => () => void;
    };
  };
};

declare global {
  interface Window {
    pst: PstApi;
  }
}

export {};
