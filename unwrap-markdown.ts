import * as fs from "node:fs";
import * as path from "node:path";

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_RE = /^(\s*)(?:[-+*]|\d+[.)])\s+/;
const HEADING_RE = /^ {0,3}#{1,6}(?:\s+|$)/;
const SETEXT_RE = /^ {0,3}(?:=+|-+)\s*$/;
const THEMATIC_RE = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const REFERENCE_RE = /^ {0,3}\[[^\]]+\]:\s+/;
const FOOTNOTE_RE = /^ {0,3}\[\^[^\]]+\]:\s*/;
const HTML_RE = /^\s*(?:<!--|<\/?[A-Za-z][^>]*>|<![A-Z])/;

export type MarkdownUnwrapMode = "preview" | "check" | "write";

export type MarkdownUnwrapResult = {
  scannedFiles: string[];
  changedFiles: string[];
  writtenFiles: string[];
};

function hasHardBreak(line: string): boolean {
  return line.endsWith("  ") || line.endsWith("\\");
}

function unwrapPlainLines(lines: string[]): string[] {
  const output: string[] = [];
  let pending: string[] = [];

  for (const line of lines) {
    let cleaned = line.trim();
    if (line.endsWith("  ")) {
      cleaned += "  ";
    }
    pending.push(cleaned);
    if (hasHardBreak(line)) {
      output.push(pending.join(" "));
      pending = [];
    }
  }

  if (pending.length > 0) {
    output.push(pending.join(" "));
  }
  return output;
}

function unwrapList(lines: string[]): string[] {
  const output: string[] = [];
  let continuationIndent = "";

  for (const line of lines) {
    const match = LIST_RE.exec(line);
    if (match) {
      output.push(line.trimEnd());
      continuationIndent = `${match[1]}  `;
      continue;
    }

    const stripped = line.trimStart();
    if (
      line.startsWith("    ")
      && (FENCE_RE.test(stripped) || stripped.startsWith(">") || stripped.startsWith("|") || stripped.startsWith("<"))
    ) {
      output.push(line.trimEnd());
      continue;
    }

    if (output.length === 0) {
      return lines;
    }

    const last = output.length - 1;
    if (hasHardBreak(line)) {
      output[last] = `${output[last].trimEnd()} ${stripped}`;
      output.push(continuationIndent.trimEnd());
    } else if (output[last].trim()) {
      output[last] = `${output[last].trimEnd()} ${stripped}`;
    } else {
      output[last] = `${continuationIndent}${stripped}`;
    }
  }

  if (output.length > 0 && !output[output.length - 1].trim()) {
    output.pop();
  }
  return output;
}

function unwrapBlock(lines: string[]): string[] {
  if (lines.length === 0) {
    return lines;
  }

  if (LIST_RE.test(lines[0])) {
    return unwrapList(lines);
  }

  if (lines.some((line) => LIST_RE.test(line))) {
    return lines;
  }

  const structured = lines.some((line) => HEADING_RE.test(line))
    || lines.slice(1).some((line) => SETEXT_RE.test(line))
    || lines.some((line) => THEMATIC_RE.test(line))
    || lines.some((line) => {
      const trimmed = line.trimStart();
      return trimmed.startsWith(">") || trimmed.startsWith("|");
    })
    || lines.some((line) => REFERENCE_RE.test(line) || FOOTNOTE_RE.test(line))
    || lines.some((line) => HTML_RE.test(line))
    || lines.some((line) => line.startsWith("    ") || line.startsWith("\t"))
    || lines.some((line) => ["$$", "\\[", "\\]"].includes(line.trim()));

  return structured ? lines : unwrapPlainLines(lines);
}

function isClosingFence(line: string, marker: string, minimumLength: number): boolean {
  const trimmed = line.startsWith("   ") ? line.slice(3) : line.startsWith("  ") ? line.slice(2) : line.startsWith(" ") ? line.slice(1) : line;
  const match = new RegExp(`^${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}{${minimumLength},}\\s*$`).exec(trimmed);
  return Boolean(match);
}

export function unwrapMarkdown(text: string): string {
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const source = bom ? text.slice(1) : text;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const normalized = source.replace(/\r\n/g, "\n");
  const trailingNewline = normalized.endsWith("\n");
  const lines = normalized.split("\n");
  if (trailingNewline) {
    lines.pop();
  }

  const output: string[] = [];
  let index = 0;

  if (lines[0] === "---") {
    let end = 1;
    while (end < lines.length && lines[end] !== "---") {
      end += 1;
    }
    if (end < lines.length) {
      output.push(...lines.slice(0, end + 1));
      index = end + 1;
    }
  }

  while (index < lines.length) {
    const line = lines[index];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[1][0];
      const minimumLength = fence[1].length;
      output.push(line);
      index += 1;
      while (index < lines.length) {
        output.push(lines[index]);
        const closes = isClosingFence(lines[index], marker, minimumLength);
        index += 1;
        if (closes) {
          break;
        }
      }
      continue;
    }

    if (line === "") {
      output.push(line);
      index += 1;
      continue;
    }

    let end = index;
    while (end < lines.length && lines[end] !== "" && !FENCE_RE.test(lines[end])) {
      end += 1;
    }
    output.push(...unwrapBlock(lines.slice(index, end)));
    index = end;
  }

  let result = output.join("\n");
  if (trailingNewline) {
    result += "\n";
  }
  if (newline === "\r\n") {
    result = result.replace(/\n/g, "\r\n");
  }
  return `${bom}${result}`;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function collectFromPath(workspaceRoot: string, requestedPath: string, files: Set<string>): Promise<void> {
  const absolutePath = path.resolve(workspaceRoot, requestedPath);
  if (!isInside(workspaceRoot, absolutePath)) {
    throw new Error(`Markdown path must stay inside the workspace: ${requestedPath}`);
  }

  let realPath: string;
  try {
    realPath = await fs.promises.realpath(absolutePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Markdown path does not exist: ${requestedPath}`);
    }
    throw error;
  }
  if (!isInside(workspaceRoot, realPath)) {
    throw new Error(`Markdown path resolves outside the workspace: ${requestedPath}`);
  }

  const stat = await fs.promises.stat(realPath);
  if (stat.isFile()) {
    if (path.extname(realPath).toLowerCase() !== ".md") {
      throw new Error(`Expected a Markdown file or directory: ${requestedPath}`);
    }
    files.add(realPath);
    return;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Expected a Markdown file or directory: ${requestedPath}`);
  }

  const entries = await fs.promises.readdir(realPath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const child = path.join(realPath, entry.name);
    if (entry.isDirectory()) {
      await collectFromPath(workspaceRoot, child, files);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") {
      files.add(child);
    }
  }
}

function displayPath(workspaceRoot: string, filePath: string): string {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/") || ".";
}

export async function unwrapMarkdownPaths(
  workspaceRootInput: string,
  requestedPaths: string[],
  mode: MarkdownUnwrapMode = "preview",
): Promise<MarkdownUnwrapResult> {
  if (requestedPaths.length === 0) {
    throw new Error("At least one Markdown file or directory is required.");
  }

  const workspaceRoot = await fs.promises.realpath(workspaceRootInput);
  const files = new Set<string>();
  for (const requestedPath of requestedPaths) {
    await collectFromPath(workspaceRoot, requestedPath, files);
  }

  const scannedFiles = [...files].sort().map((filePath) => displayPath(workspaceRoot, filePath));
  const changedFiles: string[] = [];
  const writtenFiles: string[] = [];

  for (const filePath of [...files].sort()) {
    const before = await fs.promises.readFile(filePath, "utf8");
    const after = unwrapMarkdown(before);
    if (before === after) {
      continue;
    }
    const displayed = displayPath(workspaceRoot, filePath);
    changedFiles.push(displayed);
    if (mode === "write") {
      await fs.promises.writeFile(filePath, after, "utf8");
      writtenFiles.push(displayed);
    }
  }

  return { scannedFiles, changedFiles, writtenFiles };
}
