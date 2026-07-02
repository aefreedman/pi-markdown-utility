import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

type MarkdownOutputRecord = {
  absolutePath: string;
  sourceTool: string;
  timestamp: number;
};

type MarkdownOpenWith = "code" | "glow";

type MarkdownUtilitySettings = {
  openWith: MarkdownOpenWith;
};

type MarkdownOpenResult = {
  opener: MarkdownOpenWith;
  output?: string;
  stderr?: string;
  truncated?: boolean;
};

type MarkdownSettingsContext = {
  cwd: string;
  isProjectTrusted?: () => boolean;
};

const TRACKING_ENTRY_TYPE = "pi-markdown-utility:last-output";
const SETTINGS_NAMESPACE = "markdownUtility";
const DEFAULT_MARKDOWN_UTILITY_SETTINGS: MarkdownUtilitySettings = { openWith: "code" };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}

async function readJsonFileForWrite(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw new Error(`${filePath} must contain a JSON object.`);
    }
    return parsed;
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return {};
    }
    throw error;
  }
}

async function writeJsonFile(filePath: string, value: Record<string, unknown>): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getGlobalSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  const configuredAgentDir = env.PI_CODING_AGENT_DIR?.trim();
  const agentDir = configuredAgentDir && configuredAgentDir.length > 0
    ? configuredAgentDir
    : path.join(homedir(), ".pi", "agent");
  return path.join(agentDir, "settings.json");
}

function getProjectSettingsPath(cwd: string): string {
  return path.join(cwd, ".pi", "settings.json");
}

function getMarkdownUtilitySettingsRecord(settings: Record<string, unknown>): Record<string, unknown> {
  return isRecord(settings[SETTINGS_NAMESPACE]) ? settings[SETTINGS_NAMESPACE] : {};
}

function normalizeMarkdownUtilitySettings(raw: Record<string, unknown>): MarkdownUtilitySettings {
  const openWith = raw.openWith === "glow" ? "glow" : DEFAULT_MARKDOWN_UTILITY_SETTINGS.openWith;
  return { openWith };
}

async function loadMarkdownUtilitySettings(ctx: MarkdownSettingsContext): Promise<MarkdownUtilitySettings> {
  const globalSettings = getMarkdownUtilitySettingsRecord(await readJsonFile(getGlobalSettingsPath()));
  let mergedSettings: Record<string, unknown> = { ...globalSettings };

  if (ctx.isProjectTrusted?.() === true) {
    const projectSettings = getMarkdownUtilitySettingsRecord(await readJsonFile(getProjectSettingsPath(ctx.cwd)));
    mergedSettings = { ...mergedSettings, ...projectSettings };
  }

  return normalizeMarkdownUtilitySettings(mergedSettings);
}

async function saveGlobalMarkdownOpenWith(openWith: MarkdownOpenWith): Promise<string> {
  const settingsPath = getGlobalSettingsPath();
  const settings = await readJsonFileForWrite(settingsPath);
  const currentNamespace = getMarkdownUtilitySettingsRecord(settings);
  settings[SETTINGS_NAMESPACE] = { ...currentNamespace, openWith };
  await writeJsonFile(settingsPath, settings);
  return settingsPath;
}

function parseMarkdownOpenWith(value: string): MarkdownOpenWith | undefined {
  const normalized = value.trim().toLowerCase();
  return normalized === "code" || normalized === "glow" ? normalized : undefined;
}

function formatOpenResultForUser(cwd: string, absolutePath: string, result: MarkdownOpenResult): string {
  const displayPath = formatPathForUser(cwd, absolutePath);
  return result.opener === "glow" ? `Opened ${displayPath} with glow in a new terminal.` : `Opened ${displayPath} in VS Code.`;
}

function posixShellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function powershellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function spawnDetached(command: string, args: string[], cwd?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function trySpawnDetached(commands: Array<{ command: string; args: string[] }>, cwd?: string): Promise<void> {
  let lastError: unknown;

  for (const candidate of commands) {
    try {
      await spawnDetached(candidate.command, candidate.args, cwd);
      return;
    } catch (error) {
      lastError = error;
      if (!isNodeErrorWithCode(error, "ENOENT")) {
        throw error;
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError ?? "no terminal launcher found");
  throw new Error(`Could not launch a terminal for glow: ${message}`);
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

  async function execOpenCommand(command: string, args: string[], signal: AbortSignal | undefined, timeout: number) {
    if (process.platform === "win32") {
      return pi.exec("cmd.exe", ["/d", "/c", command, ...args], { timeout, signal });
    }

    return pi.exec(command, args, { timeout, signal });
  }

  async function openInVsCode(absolutePath: string, signal?: AbortSignal): Promise<MarkdownOpenResult> {
    const result = await execOpenCommand("code", ["-g", absolutePath], signal, 5000);
    if (result.code !== 0) {
      const stderr = result.stderr?.trim();
      const commandLabel = process.platform === "win32" ? "cmd.exe/code" : "code";
      throw new Error(stderr ? `${commandLabel} failed: ${stderr}` : `${commandLabel} failed with exit code ${result.code}`);
    }

    return { opener: "code" };
  }

  async function openWithGlow(absolutePath: string): Promise<MarkdownOpenResult> {
    const cwd = path.dirname(absolutePath);

    if (process.platform === "win32") {
      await trySpawnDetached([
        {
          command: "wt.exe",
          args: ["-d", cwd, "powershell.exe", "-NoExit", "-Command", `glow ${powershellSingleQuote(absolutePath)}`],
        },
        {
          command: "cmd.exe",
          args: ["/d", "/c", "start", "", "cmd.exe", "/k", "glow", absolutePath],
        },
      ], cwd);
      return { opener: "glow" };
    }

    if (process.platform === "darwin") {
      const script = `tell application "Terminal" to do script ${appleScriptString(`glow ${posixShellQuote(absolutePath)}`)}`;
      await spawnDetached("osascript", ["-e", script], cwd);
      return { opener: "glow" };
    }

    const shellScript = `glow ${posixShellQuote(absolutePath)}; printf '\\nPress Enter to close...'; read _`;
    const terminalFromEnv = process.env.PI_MARKDOWN_UTILITY_TERMINAL?.trim() || process.env.TERMINAL?.trim();
    const commands = [
      ...(terminalFromEnv ? [{ command: terminalFromEnv, args: ["-e", "sh", "-lc", shellScript] }] : []),
      { command: "x-terminal-emulator", args: ["-e", "sh", "-lc", shellScript] },
      { command: "gnome-terminal", args: ["--", "sh", "-lc", shellScript] },
      { command: "konsole", args: ["-e", "sh", "-lc", shellScript] },
      { command: "xterm", args: ["-e", "sh", "-lc", shellScript] },
    ];

    await trySpawnDetached(commands, cwd);
    return { opener: "glow" };
  }

  async function openMarkdownFile(absolutePath: string, ctx: ExtensionContext, signal?: AbortSignal): Promise<MarkdownOpenResult> {
    const settings = await loadMarkdownUtilitySettings(ctx);
    return settings.openWith === "glow" ? openWithGlow(absolutePath) : openInVsCode(absolutePath, signal);
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

  pi.registerCommand("markdown-settings", {
    description: "Configure the Markdown opener: /markdown-settings [code|glow]",
    handler: async (args, ctx) => {
      try {
        let openWith = parseMarkdownOpenWith(args);
        if (!openWith) {
          if (args.trim()) {
            ctx.ui.notify("Usage: /markdown-settings [code|glow]", "warning");
            return;
          }

          if (!ctx.hasUI) {
            ctx.ui.notify("Usage: /markdown-settings <code|glow>", "warning");
            return;
          }

          const current = await loadMarkdownUtilitySettings(ctx);
          const selected = await ctx.ui.select(`Markdown opener (current: ${current.openWith})`, ["code", "glow"]);
          if (!selected) {
            return;
          }

          openWith = parseMarkdownOpenWith(selected);
          if (!openWith) {
            return;
          }
        }

        const settingsPath = await saveGlobalMarkdownOpenWith(openWith);
        ctx.ui.notify(`Markdown opener set to ${openWith} in ${settingsPath}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
      }
    },
  });

  pi.registerCommand("open-last-md", {
    description: "Open the last tracked markdown output with the configured Markdown opener",
    handler: async (_args, ctx) => {
      try {
        const absolutePath = await resolveRequestedMarkdownPath(ctx.cwd, undefined, true);
        const result = await openMarkdownFile(absolutePath, ctx);
        const message = formatOpenResultForUser(ctx.cwd, absolutePath, result);
        if (result.opener === "glow" && result.output) {
          pi.sendMessage({ customType: "pi-markdown-utility:glow-output", content: message, display: true });
        } else {
          ctx.ui.notify(message, "info");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
      }
    },
  });

  pi.registerCommand("open-md", {
    description: "Open a markdown file with the configured Markdown opener: /open-md <path>",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /open-md <path-to-markdown-file>", "warning");
        return;
      }

      try {
        const absolutePath = await resolveRequestedMarkdownPath(ctx.cwd, args, false);
        const result = await openMarkdownFile(absolutePath, ctx);
        const message = formatOpenResultForUser(ctx.cwd, absolutePath, result);
        if (result.opener === "glow" && result.output) {
          pi.sendMessage({ customType: "pi-markdown-utility:glow-output", content: message, display: true });
        } else {
          ctx.ui.notify(message, "info");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
      }
    },
  });

  pi.registerTool({
    name: "open_markdown_output",
    label: "Open Markdown Output",
    description: "Open a markdown file with the configured Markdown opener, or open the last tracked markdown output from this Pi session.",
    promptSnippet: "Open a generated markdown file with the configured Markdown opener when the user explicitly asks to open it.",
    promptGuidelines: [
      "Use this tool only when the user explicitly asks to open a markdown file or the last generated plan/doc in the configured opener.",
      "Prefer the last tracked markdown output when the user refers to the most recently generated plan or doc.",
    ],
    parameters: OPEN_MARKDOWN_OUTPUT_PARAMS,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const absolutePath = await resolveRequestedMarkdownPath(ctx.cwd, params.path, params.use_last ?? true);
      const result = await openMarkdownFile(absolutePath, ctx, signal);

      return {
        content: [{ type: "text", text: formatOpenResultForUser(ctx.cwd, absolutePath, result) }],
        details: {
          absolutePath,
          opener: result.opener,
          outputTruncated: result.truncated,
          stderr: result.stderr,
          sourceTool: lastMarkdownOutput?.absolutePath === absolutePath ? lastMarkdownOutput.sourceTool : undefined,
          trackedAt: lastMarkdownOutput?.absolutePath === absolutePath ? lastMarkdownOutput.timestamp : undefined,
        },
      };
    },
  });
}
