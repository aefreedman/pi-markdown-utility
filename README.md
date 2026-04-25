# Pi Markdown Utility

Small Pi extension package for opening generated Markdown outputs in VS Code.

Current features:
- tracks the most recent successful `.md` file written or edited in the current Pi session
- `/open-last-md` opens the last tracked markdown file in VS Code
- `/open-md <path>` opens a specific markdown file in VS Code
- `open_markdown_output` lets the agent open a markdown file when explicitly asked

Notes:
- version 1 keeps state only for the current session
- this package is intentionally operator-focused and lightweight
- it assumes the `code` CLI is available on the machine

## License

MIT. See `LICENSE`.
