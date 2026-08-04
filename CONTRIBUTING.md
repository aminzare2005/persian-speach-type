# Contributing to Persian Speach Type

Thanks for helping improve Persian voice-to-text on Windows.

## Workflow

1. Fork the repo and create a branch from `main`.
2. Make focused changes with a clear purpose.
3. Open a pull request describing **what** changed and **why**.
4. Keep PRs small when possible (easier review).

## Development setup

Requirements:

- Windows
- Node.js `>= 22.13`
- pnpm `>= 9`

```bash
pnpm install
pnpm dev
```

Useful scripts:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Local Electron + Vite |
| `pnpm typecheck` | TypeScript check |
| `pnpm build` | Production bundles |
| `pnpm dist` | Windows installer |

First-time STT: open the tray panel → **Settings** → download **Shenava Rizeh**, or use a model already present from Nimruz.

## Code style

- TypeScript + React; follow patterns already in `src/` and `electron/`.
- Prefer small, readable changes over large rewrites.
- Product UI strings are Persian; don’t mix languages in the same string without reason.
- After changing `electron/` or `preload.ts`, **restart Electron** (renderer HMR will not reload main/preload).

See [AGENTS.md](AGENTS.md) for architecture notes.

## PR tips

- Mention Windows behavior that reviewers should verify (hotkey, paste, tray).
- Include screenshots for UI changes when practical.
- Do not commit secrets, local models, or `%APPDATA%` paths with personal data.
- Run `pnpm typecheck` before requesting review.

## Manual test plan (dictation / paste)

Use this checklist for changes that touch dictation, inject, or settings:

- [ ] `pnpm dev` starts; tray icon appears
- [ ] Panel opens (tray click / menu): home, settings, history
- [ ] Hotkey (default `F8`) starts listening HUD, second press stops
- [ ] With a text field focused, transcript is pasted into that app
- [ ] Without a focus target, result UI / copy path still works
- [ ] Shenava model status shows installed / Nimruz-shared correctly
- [ ] Correction provider `none` pastes raw text
- [ ] (If testing Codex) provider `codex` polishes when logged in; fails open to raw on error
- [ ] Launch-at-login toggle persists after restart
- [ ] Quit only via tray (closing panel does not exit the app)

## License

By contributing, you agree that your contributions are licensed under the MIT License.
