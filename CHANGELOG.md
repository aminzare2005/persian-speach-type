# Changelog

All notable changes to Persian Speach Type are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.2] - 2026-08-04

### Changed

- New app icon (black background + orange mic) for window, installer, and shortcuts
- Visible system tray icon (no more blank tray square)

### Fixed

- Packaged Windows UI white screen (from 1.0.1) remains included in this release line

## [1.0.1] - 2026-08-04

### Fixed

- White screen in the packaged Windows app — Vite asset URLs are now relative (`base: './'`) so `file://` loads work inside the installer build

## [1.0.0] - 2026-08-04

### Added

- Global hotkey dictation with local Shenava / sherpa-onnx speech-to-text
- Paste into the focused text field when a real caret/editable control is active
- Clipboard fallback with HUD feedback when no editable field is focused
- Soft focus restore that does not yank apps out of fullscreen
- Optional Codex / ChatGPT transcript correction
- Tray shell with home, settings, and history panels
- Windows NSIS installer (`Persian Speach Type-Setup-1.0.0.exe`)

[1.0.2]: https://github.com/aminzare2005/persian-speach-type/releases/tag/v1.0.2
[1.0.1]: https://github.com/aminzare2005/persian-speach-type/releases/tag/v1.0.1
[1.0.0]: https://github.com/aminzare2005/persian-speach-type/releases/tag/v1.0.0
