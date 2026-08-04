import { app } from "electron";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
} from "../src/lib/app-settings";
import { isCorrectionProviderId } from "../src/lib/speech/correction";

export type { AppSettings } from "../src/lib/app-settings";
export { DEFAULT_SETTINGS } from "../src/lib/app-settings";

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

export function loadSettings(): AppSettings {
  try {
    const raw = readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      correctionProvider: isCorrectionProviderId(parsed.correctionProvider)
        ? parsed.correctionProvider
        : DEFAULT_SETTINGS.correctionProvider,
      codexModelId:
        typeof parsed.codexModelId === "string"
          ? parsed.codexModelId
          : DEFAULT_SETTINGS.codexModelId,
    };

    // v2: launch-at-login defaults to on (older builds saved false).
    if ((parsed.settingsVersion ?? 0) < 2) {
      merged.launchAtLogin = true;
    }
    // v3: correction provider fields.
    if ((parsed.settingsVersion ?? 0) < 3) {
      merged.correctionProvider = merged.correctionProvider ?? "none";
      merged.codexModelId = merged.codexModelId ?? "";
      merged.settingsVersion = 3;
      saveSettings(merged);
    }

    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): AppSettings {
  const dir = path.dirname(settingsPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const payload: AppSettings = {
    ...settings,
    settingsVersion: settings.settingsVersion ?? 3,
  };
  writeFileSync(settingsPath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}
