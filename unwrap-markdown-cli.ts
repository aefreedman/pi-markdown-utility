#!/usr/bin/env node

import { unwrapMarkdownPaths, type MarkdownUnwrapMode } from "./unwrap-markdown.ts";

function usage(): never {
  console.error("Usage: unwrap-markdown [--root <workspace>] [--preview|--check|--write] <markdown-file-or-directory> [...]");
  process.exit(2);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  let mode: MarkdownUnwrapMode = "preview";
  let workspaceRoot = process.cwd();
  const paths: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--root") {
      const root = args[index + 1];
      if (!root) {
        usage();
      }
      workspaceRoot = root;
      index += 1;
    } else if (argument === "--preview") {
      mode = "preview";
    } else if (argument === "--check") {
      mode = "check";
    } else if (argument === "--write") {
      mode = "write";
    } else if (argument.startsWith("-")) {
      usage();
    } else {
      paths.push(argument);
    }
  }

  if (paths.length === 0) {
    usage();
  }

  const result = await unwrapMarkdownPaths(workspaceRoot, paths, mode);
  if (result.changedFiles.length === 0) {
    console.log(`All ${result.scannedFiles.length} Markdown files are unwrapped.`);
    return 0;
  }

  const verb = mode === "write" ? "Unwrapped" : "Would unwrap";
  console.log(`${verb} ${result.changedFiles.length} of ${result.scannedFiles.length} Markdown files:`);
  for (const filePath of result.changedFiles) {
    console.log(filePath);
  }

  return mode === "check" ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
