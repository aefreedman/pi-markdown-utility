import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

type MarkdownOutputRecord = {
  absolutePath: string;
  sourceTool: string;
  timestamp: number;
};

const TRACKING_ENTRY_TYPE = "pi-markdown-utility:last-output";

const OPEN_MARKDOWN_OUTPUT_PARAMS = Type.Object({
  path: Type.Optional(Type.String({ description: "Workspace-relative or absolute markdown file path" })),
  use_last: Type.Optional(Type.Boolean({ description: "Open the last tracked markdown output when path is omitted", default: true })),
});

function normalizeUserPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

function resolveAbsolutePath(cwd: string, rawPath: string): string {
  const normalized = normalizeUserPath(rawPath);
  return path.isAbsolute(normalized) ? path.normalize(normalized) : path.resolve(cwd, normalized);
}

function isMarkdownPath(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".md");
}

async function ensureReadableMarkdown(filePath: string): Promise<void> {
  if (!isMarkdownPath(filePath)) {
    throw new Error(`Expected a .md file, got: ${filePath}`);
  }

  await fs.promises.access(filePath, fs.constants.R_OK);
}

function formatPathForUser(cwd: string, absolutePath: string): string {
  const relative = path.relative(cwd, absolutePath);
  if (!relative || relative.startsWith("..")) {
    return absolutePath;
  }
  return relative.split(path.sep).join("/");
}

export default function markdownOutputTools(pi: ExtensionAPI) {
  let lastMarkdownOutput: MarkdownOutputRecord | null = null;

  function setLastMarkdownOutput(record: MarkdownOutputRecord): void {
    lastMarkdownOutput = record;
    pi.appendEntry<MarkdownOutputRecord>(TRACKING_ENTRY_TYPE, record);
  }

  function restoreLastMarkdownOutput(ctx: ExtensionContext): void {
    let restored: MarkdownOutputRecord | null = null;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== TRACKING_ENTRY_TYPE) {
        continue;
      }

      const data = entry.data as MarkdownOutputRecord | undefined;
      if (!data?.absolutePath || !data?.sourceTool || typeof data.timestamp !== "number") {
        continue;
      }

      restored = data;
    }

    lastMarkdownOutput = restored;
  }

  async function openInVsCode(absolutePath: string, signal?: AbortSignal): Promise<void> {
    if (process.platform === "win32") {
      const result = await pi.exec("cmd.exe", ["/d", "/c", "code", "-g", absolutePath], { timeout: 5000, signal });
      if (result.code === 0) {
        return;
      }

      const stderr = result.stderr?.trim();
      throw new Error(stderr ? `cmd.exe/code failed: ${stderr}` : `cmd.exe/code failed with exit code ${result.code}`);
    }

    const result = await pi.exec("code", ["-g", absolutePath], { timeout: 5000, signal });
    if (result.code !== 0) {
      const stderr = result.stderr?.trim();
      throw new Error(stderr ? `code failed: ${stderr}` : `code failed with exit code ${result.code}`);
    }
  }

  async function resolveRequestedMarkdownPath(cwd: string, requestedPath: string | undefined, useLast: boolean | undefined): Promise<string> {
    if (requestedPath?.trim()) {
      const absolutePath = resolveAbsolutePath(cwd, requestedPath);
      await ensureReadableMarkdown(absolutePath);
      return absolutePath;
    }

    if (useLast === false) {
      throw new Error("No markdown path was provided.");
    }

    if (!lastMarkdownOutput) {
      throw new Error("No markdown output has been tracked in this Pi session yet.");
    }

    await ensureReadableMarkdown(lastMarkdownOutput.absolutePath);
    return lastMarkdownOutput.absolutePath;
  }

  pi.on("session_start", async (event, ctx) => {
    switch (event.reason) {
      case "startup":
      case "reload":
      case "new":
      case "resume":
      case "fork":
        restoreLastMarkdownOutput(ctx);
        break;
      default:
        restoreLastMarkdownOutput(ctx);
        break;
    }
  });

  pi.on("session_tree", async (_event, ctx) => {
    restoreLastMarkdownOutput(ctx);
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.isError) {
      return;
    }

    if (event.toolName !== "write" && event.toolName !== "edit") {
      return;
    }

    const input = (event.input ?? {}) as { path?: string; file_path?: string };
    const rawPath = input.path ?? input.file_path;
    if (!rawPath?.trim()) {
      return;
    }

    const absolutePath = resolveAbsolutePath(ctx.cwd, rawPath);
    if (!isMarkdownPath(absolutePath)) {
      return;
    }

    setLastMarkdownOutput({
      absolutePath,
      sourceTool: event.toolName,
      timestamp: Date.now(),
    });
  });

  pi.registerCommand("open-last-md", {
    description: "Open the last tracked markdown output in VS Code",
    handler: async (_args, ctx) => {
      try {
        const absolutePath = await resolveRequestedMarkdownPath(ctx.cwd, undefined, true);
        await openInVsCode(absolutePath);
        ctx.ui.notify(`Opened ${formatPathForUser(ctx.cwd, absolutePath)}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
      }
    },
  });

  pi.registerCommand("open-md", {
    description: "Open a markdown file in VS Code: /open-md <path>",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /open-md <path-to-markdown-file>", "warning");
        return;
      }

      try {
        const absolutePath = await resolveRequestedMarkdownPath(ctx.cwd, args, false);
        await openInVsCode(absolutePath);
        ctx.ui.notify(`Opened ${formatPathForUser(ctx.cwd, absolutePath)}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
      }
    },
  });

  pi.registerTool({
    name: "open_markdown_output",
    label: "Open Markdown Output",
    description: "Open a markdown file in VS Code, or open the last tracked markdown output from this Pi session.",
    promptSnippet: "Open a generated markdown file in VS Code when the user explicitly asks to open it.",
    promptGuidelines: [
      "Use this tool only when the user explicitly asks to open a markdown file or the last generated plan/doc in the editor.",
      "Prefer the last tracked markdown output when the user refers to the most recently generated plan or doc.",
    ],
    parameters: OPEN_MARKDOWN_OUTPUT_PARAMS,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const absolutePath = await resolveRequestedMarkdownPath(ctx.cwd, params.path, params.use_last ?? true);
      await openInVsCode(absolutePath, signal);

      return {
        content: [{ type: "text", text: `Opened ${formatPathForUser(ctx.cwd, absolutePath)} in VS Code.` }],
        details: {
          absolutePath,
          sourceTool: lastMarkdownOutput?.absolutePath === absolutePath ? lastMarkdownOutput.sourceTool : undefined,
          trackedAt: lastMarkdownOutput?.absolutePath === absolutePath ? lastMarkdownOutput.timestamp : undefined,
        },
      };
    },
  });
}
