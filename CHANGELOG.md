# Changelog

## 0.2.1 - 2026-07-09

- Added `PI_MARKDOWN_UTILITY_CODE_EXECUTABLE` and `PI_MARKDOWN_UTILITY_GLOW_EXECUTABLE` overrides for Markdown opener executables.
- Added safe macOS fallback discovery for the standard VS Code application CLI and Homebrew `code`/`glow` paths.
- Added clear executable-missing diagnostics before opening VS Code or launching Glow.
- Launch Markdown openers with literal argument arrays on Windows instead of passing filenames through `cmd.exe`.
- Added macOS CI coverage for executable discovery tests and package validation.

## 0.2.0 - 2026-07-03

- Added configurable Markdown opener support via `markdownUtility.openWith`.
- Added `/markdown-settings [code|glow]` to configure the opener from Pi.
- Added `glow` opener support that launches the Markdown file in a separate terminal window using `glow --tui <file>`.
- On Windows, the Glow launcher prefers Windows Terminal with PowerShell 7 (`pwsh.exe`) and falls back when unavailable.
- Documented the known Windows Terminal/Glow initial word-wrap issue and manual reload workaround.
- Updated docs to describe opener configuration and requirements.

## 0.1.0 - 2026-07-02

- Initial package with Markdown output tracking and VS Code opening commands/tool.
