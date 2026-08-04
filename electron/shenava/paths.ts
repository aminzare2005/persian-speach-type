import path from "node:path";

/** Packaged Nimruz uses productName; Electron dev may use package name. */
const NIMRUZ_APP_FOLDER_CANDIDATES = ["Nimruz", "nimruz-desktop"] as const;

/**
 * Resolve folders where Nimruz may keep Shenava models.
 * Windows packaged: `%APPDATA%\\Nimruz\\models`
 */
export function resolveNimruzModelRoots(appDataPath: string): string[] {
  return NIMRUZ_APP_FOLDER_CANDIDATES.map((folder) =>
    path.join(appDataPath, folder, "models")
  );
}
