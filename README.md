# Pi Markdown Utility

Small Pi extension package for opening generated Markdown outputs in a user-configured Markdown opener.

## Features

- Tracks the most recent successful `.md` file written or edited in the current Pi session.
- `/markdown-settings [code|glow]` configures the global Markdown opener.
- `/open-last-md` opens the last tracked Markdown file with the configured opener.
- `/open-md <path>` opens a specific Markdown file with the configured opener.
- `open_markdown_output` lets the agent open a Markdown file when explicitly asked.

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

## Requirements

- Pi Coding Agent
- For `openWith: "code"`: VS Code `code` CLI available on `PATH`
- For `openWith: "glow"`: `glow` CLI available on `PATH` and a terminal launcher available (`wt.exe`/Windows Terminal on Windows, Terminal on macOS, or a common Linux terminal such as `x-terminal-emulator`, `gnome-terminal`, `konsole`, or `xterm`). On Windows, the launcher prefers PowerShell 7 (`pwsh.exe`) and falls back to Windows PowerShell.

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

## Notes

- State is session-local; restarting Pi clears the last-output pointer.
- Known issue: on Windows Terminal, `glow --tui <file>` may initially render before terminal sizing has settled, so word wrap can be wrong until Glow reloads the document. Press `r` in Glow to reload/reflow the view.
- The package is intentionally operator-focused and lightweight.

## License

MIT. See `LICENSE`.
