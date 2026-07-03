# Changelog

## 0.2.4 - 2026-07-02

- Fixed the Windows Terminal glow launcher by using PowerShell `-EncodedCommand`, avoiding Windows Terminal semicolon parsing errors.

## 0.2.3 - 2026-07-02

- Changed the `glow` opener back to opening the requested Markdown file directly, while keeping the spawned terminal open after rendering.

## 0.2.2 - 2026-07-02

- Changed the `glow` opener to launch Glow's browser in the Markdown file's containing folder with hidden files enabled, instead of rendering the file directly and exiting.

## 0.2.1 - 2026-07-02

- Changed the Windows Terminal glow launcher to prefer PowerShell 7 (`pwsh.exe`) and fall back to Windows PowerShell when unavailable.

## 0.2.0 - 2026-07-02

- Added configurable Markdown opener support via `markdownUtility.openWith`.
- Added `/markdown-settings [code|glow]` to configure the opener from Pi.
- Added `glow` opener support that launches the Markdown file in a separate terminal window.
- Updated docs to describe opener configuration and requirements.

## 0.1.0 - 2026-07-02

- Initial package with Markdown output tracking and VS Code opening commands/tool.
