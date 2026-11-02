import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Version probes and GUI launchers should never produce large captured output.
export const MARKDOWN_EXEC_MAX_BUFFER = 16 * 1024;
type ExecResult = Awaited<ReturnType<ExtensionAPI["exec"]>>;

export function markdownCommandFailure(command: string, result: ExecResult): Error {
  const reason = result.truncated ? "output truncated at 16 KiB" : result.killed ? "command terminated (timeout or abort)" : `exit code ${result.code}`;
  const stderr = result.stderr.trim();
  return new Error(`${command} failed: ${reason}${stderr ? `; ${stderr}` : ""}`);
}

export async function findWindowsPowerShell(exec: ExtensionAPI["exec"], signal?: AbortSignal): Promise<string> {
  try {
    const result = await exec("cmd.exe", ["/d", "/c", "where", "pwsh.exe"], {
      timeout: 2000, signal, maxBuffer: MARKDOWN_EXEC_MAX_BUFFER,
    });
    if (result.truncated || result.killed) throw markdownCommandFailure("PowerShell probe", result);
    return result.code === 0 ? "pwsh.exe" : "powershell.exe";
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return "powershell.exe";
    throw error;
  }
}

export type MarkdownExecutableKind = "code" | "glow";

export const MARKDOWN_UTILITY_EXECUTABLE_ENV: Record<MarkdownExecutableKind, string> = {
  code: "PI_MARKDOWN_UTILITY_CODE_EXECUTABLE",
  glow: "PI_MARKDOWN_UTILITY_GLOW_EXECUTABLE",
};

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function getMarkdownExecutableCandidates(
  kind: MarkdownExecutableKind,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const override = env[MARKDOWN_UTILITY_EXECUTABLE_ENV[kind]]?.trim();
  if (override) {
    return [override];
  }

  if (platform === "win32") {
    if (kind === "code") {
      return uniqueNonEmpty([
        "Code.exe",
        env.LOCALAPPDATA ? path.win32.join(env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe") : "",
        env.ProgramFiles ? path.win32.join(env.ProgramFiles, "Microsoft VS Code", "Code.exe") : "",
        env["ProgramFiles(x86)"] ? path.win32.join(env["ProgramFiles(x86)"], "Microsoft VS Code", "Code.exe") : "",
      ]);
    }
    return ["glow.exe"];
  }

  const candidates = [kind];
  if (platform === "darwin") {
    if (kind === "code") {
      candidates.push(
        "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
        "/opt/homebrew/bin/code",
        "/usr/local/bin/code",
      );
    } else {
      candidates.push("/opt/homebrew/bin/glow", "/usr/local/bin/glow");
    }
  }

  return uniqueNonEmpty(candidates);
}

export function missingMarkdownExecutableError(kind: MarkdownExecutableKind): Error {
  const variable = MARKDOWN_UTILITY_EXECUTABLE_ENV[kind];
  const label = kind === "code" ? "VS Code `code` CLI" : "Glow `glow` CLI";
  return new Error(
    `${label} was not found. Install it and add it to PATH, or set ${variable} to its executable path.`,
  );
}
