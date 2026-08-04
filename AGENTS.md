# Agent guide — Persian Speach Type

Short orientation for AI coding agents working in this repo.

## Layout

| Path | Role |
| --- | --- |
| `electron/` | Main process: windows, tray, hotkey, paste, Shenava, Codex |
| `src/` | React renderer (HUD + panel share one Vite app) |
| `dist-electron/` | Built main/preload/worker (esbuild; gitignored) |
| `dist/` | Built renderer (Vite; gitignored) |
| `scripts/` | `esbuild.mjs`, Electron runners |
| `assets/` | App icon / packaging assets |

## Windows

The renderer chooses a role from the URL hash (`src/App.tsx`):

- **`#hud`** — transparent overlay pill (listening / busy / feedback). Hidden when idle.
- **`#panel`** — opaque app shell: home, settings, history, result, needs-model.

Main process owns:

- `hudWindow` — always-on-top overlay
- `panelWindow` — settings/history UI
- Tray menu + global shortcut

Key files:

- `electron/main.ts` — lifecycle, IPC, hotkey, tray
- `electron/preload.ts` — `window.pst` bridge
- `electron/inject.ts` — focus tracking + paste
- `electron/shenava/` — local STT service + downloads
- `electron/codex/` — ChatGPT subscription correction runtime
- `electron/correction/index.ts` — provider registry (`polishTranscript`)
- `src/hooks/use-dictation.ts` — mic capture + phase machine
- `src/lib/speech/correction.ts` — provider ids / prompts (shared with main)
- `src/lib/app-settings.ts` — canonical settings type

## Correction providers

Transcript polish is pluggable:

1. Add an id in `src/lib/speech/correction.ts` (`CorrectionProviderId` + `CORRECTION_PROVIDERS`).
2. Implement a handler in `electron/correction/index.ts` (`registerCorrectionProvider` / `providers` map).
3. Wire settings UI in `src/components/CorrectionSettingsSection.tsx` if needed.

Fail-open: on provider errors, paste the raw transcript.

## Dev commands

```bash
pnpm install
pnpm dev          # Vite :5173 + esbuild watch + Electron
pnpm typecheck
pnpm build
pnpm dist         # Windows installer via electron-builder
```

Package manager: **pnpm** (see `package.json` `engines`).

## Conventions

- TypeScript throughout; match existing style and naming.
- Prefer extending the correction registry over hard-coding Codex in call sites.
- UI copy for the product shell is Persian; keep agent/docs English unless editing UI strings.
- Do not commit secrets, `.env*`, or user data under `%APPDATA%\persian-speach-type`.

## Important Electron notes

- **Main / preload changes need a full Electron restart** — Vite HMR only updates the renderer.
- After editing `electron/**` or preload, restart `pnpm dev` (or at least the Electron process).
- Preload is built to `dist-electron/preload.cjs`; main to `dist-electron/main.js`.
- Dictation/paste depends on real Windows focus — browser-only Vite previews cannot exercise inject.

## Do

- Run `pnpm typecheck` after non-trivial TS changes.
- Keep IPC surface in preload typed and mirrored in `src/global.d.ts`.
- Preserve tray-quit behavior (closing the panel hides; quit from tray).

## Don’t

- Don’t commit `dist/`, `dist-electron/`, `release/`, or `node_modules/`.
- Don’t add API keys for Codex correction — it uses subscription login.
- Don’t assume macOS/Linux APIs; this app targets Windows.
- Don’t bloated docs or drive-by refactors outside the task.
