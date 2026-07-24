# Pi Markdown Utility

Small Pi extension package for opening generated Markdown outputs and removing baked-in column wrapping without disturbing Markdown structure.

## Features

- Tracks the most recent successful `.md` file written or edited in the current Pi session.
- `/markdown-settings [code|glow]` configures the global Markdown opener.
- `/open-last-md` opens the last tracked Markdown file with the configured opener.
- `/open-md <path>` opens a specific Markdown file with the configured opener.
- `open_markdown_output` lets the agent open a Markdown file when explicitly asked.
- `unwrap_markdown` previews, checks, or removes column-width wrapping from Markdown prose inside the active workspace.
- A reusable CLI supports the same preview/check/write workflow for manual use and CI.

## Configuration

The opener defaults to VS Code. Run `/markdown-settings` to choose interactively, `/markdown-settings glow` to set it directly, or edit `markdownUtility.openWith` in `~/.pi/agent/settings.json` or trusted project `.pi/settings.json`:

```json
{
  "markdownUtility": {
    "openWith": "glow"
  }
}
```

Supported values:

- `"code"` (default): opens the file with the VS Code `code` CLI.
- `"glow"`: opens a new terminal window, runs `glow --tui <file>`, and keeps the terminal open after Glow exits.

### Executable overrides and macOS discovery

Set `PI_MARKDOWN_UTILITY_CODE_EXECUTABLE` or `PI_MARKDOWN_UTILITY_GLOW_EXECUTABLE` to an executable path when the corresponding command is not available on `PATH`. An override is used instead of automatic discovery. On Windows, point the VS Code override at `Code.exe`, not a `.cmd` wrapper; Markdown filenames are always passed as literal process arguments and never through `cmd.exe` parsing.

On macOS, without an override, the package tries the bare `code` or `glow` command first. For VS Code it then tries the standard application CLI at `/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code` and Homebrew locations `/opt/homebrew/bin/code` and `/usr/local/bin/code`. For Glow it also tries the standard Homebrew locations `/opt/homebrew/bin/glow` and `/usr/local/bin/glow`. Missing executables report the applicable PATH/override remedy before an opener or terminal is launched.

## Markdown unwrapping

The formatter joins ordinary prose within existing paragraph boundaries. It preserves YAML frontmatter, headings, list structure, tables, blockquotes, fenced and indented code, reference definitions, explicit hard breaks, and other structural blocks. Ambiguous structured blocks are left unchanged rather than rewritten speculatively.

The agent-facing `unwrap_markdown` tool accepts workspace-relative Markdown files or directories and supports:

- `preview`: report files that would change without writing;
- `check`: perform the same read-only check for validation workflows; and
- `write`: update files, only when explicitly requested.

For direct command-line use from the package root:

```bash
npm run unwrap -- --root <workspace> --preview <workspace-relative-path>
npm run unwrap -- --root <workspace> --check <workspace-relative-path>
npm run unwrap -- --root <workspace> --write <workspace-relative-path>
```

The CLI uses `--root` as its workspace boundary, defaulting to its current working directory when omitted. Paths may not escape that boundary, and recursive scans ignore symbolic links.

## Requirements

- Pi Coding Agent
- For `openWith: "code"`: VS Code `code` CLI available on `PATH`, discoverable at a standard macOS location, or set through `PI_MARKDOWN_UTILITY_CODE_EXECUTABLE`.
- For `openWith: "glow"`: `glow` CLI available on `PATH`, discoverable at a standard macOS Homebrew location, or set through `PI_MARKDOWN_UTILITY_GLOW_EXECUTABLE`; and a terminal launcher available (`wt.exe`/Windows Terminal on Windows, Terminal on macOS, or a common Linux terminal such as `x-terminal-emulator`, `gnome-terminal`, `konsole`, or `xterm`). On Windows, the launcher prefers PowerShell 7 (`pwsh.exe`) and falls back to Windows PowerShell.

## Install

From GitHub:

```bash
pi install git:git@github.com:aefreedman/pi-markdown-utility.git
```

Local development install:

```bash
pi install <path-to-pi-markdown-utility>
```

Project-local install:

```bash
pi install -l <path-to-pi-markdown-utility>
```

## Testing

```bash
npm test
```

The test suite covers executable discovery, prose transformation, Markdown structure preservation, line-ending retention, idempotence, recursive path handling, write behavior, and workspace-boundary enforcement.

## Notes

- State is session-local; restarting Pi clears the last-output pointer.
- Known issue: on Windows Terminal, `glow --tui <file>` may initially render before terminal sizing has settled, so word wrap can be wrong until Glow reloads the document. Press `r` in Glow to reload/reflow the view.
- The package is intentionally operator-focused and lightweight.

## License

MIT. See `LICENSE`.
