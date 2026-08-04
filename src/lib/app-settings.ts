import type { CorrectionProviderId } from "./speech/correction";

/** Active Shenava model keys used in settings + IPC. */
export type ActiveModelKey = "rizeh" | "koochik";

/**
 * Canonical app settings — single source for main, preload, and renderer.
 * Persist/load lives in electron/settings.ts.
 */
export type AppSettings = {
  hotkey: string;
  launchAtLogin: boolean;
  websiteUrl: string;
  microphoneId: string;
  activeModelKey: ActiveModelKey;
  /** none = raw paste; codex = ChatGPT subscription polish (extensible). */
  correctionProvider: CorrectionProviderId;
  /** Optional Codex model id override; empty = auto default from account. */
  codexModelId: string;
  /** Bump to run one-time settings migrations. */
  settingsVersion?: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  hotkey: "F8",
  launchAtLogin: true,
  websiteUrl: "https://github.com",
  microphoneId: "default",
  activeModelKey: "rizeh",
  correctionProvider: "none",
  codexModelId: "",
  settingsVersion: 3,
};

/** Overlay HUD modes (settings/history live in the panel window). */
export type HudMode = "hidden" | "hud";

export type PanelView =
  | "home"
  | "settings"
  | "history"
  | "result"
  | "needs-model";

export type HistoryEntry = {
  id: string;
  text: string;
  createdAt: string;
};

export type ToastPayload = {
  type: string;
  message: string;
};
