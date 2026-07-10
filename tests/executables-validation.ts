import { readFileSync } from "node:fs";
import {
  getMarkdownExecutableCandidates,
  missingMarkdownExecutableError,
} from "../executables.ts";

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const main = (): void => {
  assert(
    JSON.stringify(getMarkdownExecutableCandidates("code", { PI_MARKDOWN_UTILITY_CODE_EXECUTABLE: "/tools/code" }, "darwin")) === JSON.stringify(["/tools/code"]),
    "Expected the code environment override to take precedence over discovery.",
  );
  assert(
    JSON.stringify(getMarkdownExecutableCandidates("glow", { PI_MARKDOWN_UTILITY_GLOW_EXECUTABLE: "/tools/glow" }, "darwin")) === JSON.stringify(["/tools/glow"]),
    "Expected the glow environment override to take precedence over discovery.",
  );

  const macCode = getMarkdownExecutableCandidates("code", {}, "darwin");
  assert(
    macCode.includes("/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code")
      && macCode.includes("/opt/homebrew/bin/code")
      && macCode.includes("/usr/local/bin/code"),
    "Expected standard macOS VS Code and Homebrew code fallbacks.",
  );

  const windowsCode = getMarkdownExecutableCandidates(
    "code",
    { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local", ProgramFiles: "C:\\Program Files" },
    "win32",
  );
  assert(
    windowsCode.includes("Code.exe")
      && windowsCode.some((candidate) => candidate.endsWith("Microsoft VS Code\\Code.exe"))
      && !windowsCode.some((candidate) => candidate.toLowerCase().endsWith(".cmd")),
    "Expected Windows discovery to use direct executables rather than cmd.exe wrappers.",
  );

  const macGlow = getMarkdownExecutableCandidates("glow", {}, "darwin");
  assert(
    macGlow.includes("/opt/homebrew/bin/glow") && macGlow.includes("/usr/local/bin/glow"),
    "Expected standard macOS Homebrew glow fallbacks.",
  );

  const indexSource = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  assert(
    !/cmd\.exe[\s\S]{0,120}absolutePath/.test(indexSource),
    "Markdown paths must never be passed through cmd.exe command parsing.",
  );

  const error = missingMarkdownExecutableError("glow");
  assert(
    error.message.includes("PATH") && error.message.includes("PI_MARKDOWN_UTILITY_GLOW_EXECUTABLE"),
    "Expected a clear glow PATH/override diagnostic.",
  );

  console.log("PASS: markdown executable discovery validation succeeded");
};

main();
