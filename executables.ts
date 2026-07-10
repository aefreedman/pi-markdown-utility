import path from "node:path";

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
