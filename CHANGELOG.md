# Changelog

## Unreleased

### Fixed

- Stop gating trusted-publication success on immediate npm visibility; keep pre-publish identity reconciliation and fail closed on a failed publish response.

## 0.4.0 - 2026-09-29

### Changed

- Run offline tests with native Node and require Node >=22.19.0. Retain the pinned tsx CLI runtime so npm-installed TypeScript executes inside node_modules.
- Align development and deterministic validation with Pi 0.99.1. Use the host-provided TypeBox peer instead of a production copy.
- Document the Pi/TypeBox extension host contract and the standalone CLI's Node/tsx requirements.
- Validate immutable release tags with a locked install, offline tests, and pack inspection on Node 22.19.0; reconcile matching npm retries and verify published version/commit identity.
- Automatically publish stable GitHub releases through the existing trusted publisher, retaining exact tag/commit manual recovery and fail-closed npm identity checks.

## 0.3.4 - 2026-09-21

### Changed

- Update Pi development dependencies and validation baseline to 0.87.0.


## 0.3.3 - 2026-09-20

### Changed

- Pin the Pi development validation dependency to 0.86.1 while retaining the optional wildcard runtime peer.

## 0.3.2 - 2026-08-06

### Changed

- Prepared the package for its initial public npm distribution with public access metadata, npm installation guidance, a runtime TypeBox dependency, and a runtime-only tarball allowlist.
- Added a manually dispatched, tag-verified OIDC npm publishing workflow for releases after the initial manual npm publication.
- Included a pinned TypeScript runner so the packaged CLI and repository validation work without dynamic tool downloads.

## 0.3.1 - 2026-07-24

### Changed

- Marked Pi-bundled core dependencies as optional peers so Pi git installs do not create redundant per-package `node_modules` directories.

## 0.3.0 - 2026-07-22

- Added the `unwrap_markdown` agent tool with preview, check, and write modes scoped to the active workspace.
- Added a reusable CLI for removing column-width wrapping from Markdown prose.
- Preserve Markdown structure, explicit hard breaks, UTF-8 BOMs, and LF or CRLF line endings while formatting.
- Added transformation, idempotence, filesystem, and workspace-boundary validation.

## 0.2.2 - 2026-07-10

- Migrated Pi extension imports and peer dependencies to the `@earendil-works` package scope.

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
