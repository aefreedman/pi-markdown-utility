# Pi Markdown Utility

Small Pi extension package for opening generated Markdown outputs in VS Code.

## Features

- Tracks the most recent successful `.md` file written or edited in the current Pi session.
- `/open-last-md` opens the last tracked Markdown file in VS Code.
- `/open-md <path>` opens a specific Markdown file in VS Code.
- `open_markdown_output` lets the agent open a Markdown file when explicitly asked.

## Requirements

- Pi Coding Agent
- VS Code `code` CLI available on `PATH`

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
- The package is intentionally operator-focused and lightweight.

## License

MIT. See `LICENSE`.
