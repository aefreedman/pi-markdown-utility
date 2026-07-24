import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { unwrapMarkdown, unwrapMarkdownPaths } from "../unwrap-markdown.ts";

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const assertEqual = (actual: string, expected: string, message: string): void => {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${JSON.stringify(expected)}\nActual:   ${JSON.stringify(actual)}`);
  }
};

async function main(): Promise<void> {
  assertEqual(
    unwrapMarkdown("A wrapped\nparagraph with a [link](target.md).\n"),
    "A wrapped paragraph with a [link](target.md).\n",
    "Expected ordinary prose to unwrap.",
  );

  const structured = `---
title: Example
tags:
  - test
---
# Heading

Wrapped prose
continues here.

\`\`\`text
code stays
split
\`\`\`
`;
  assertEqual(
    unwrapMarkdown(structured),
    `---
title: Example
tags:
  - test
---
# Heading

Wrapped prose continues here.

\`\`\`text
code stays
split
\`\`\`
`,
    "Expected frontmatter, headings, and fenced code to remain structured.",
  );

  assertEqual(
    unwrapMarkdown("- first item wraps\n  onto another line;\n- second item\n  - nested item stays separate\n    but its prose joins\n"),
    "- first item wraps onto another line;\n- second item\n  - nested item stays separate but its prose joins\n",
    "Expected list continuations to unwrap without collapsing list items.",
  );

  const preserved = "| A | B |\n| - | - |\n| x | y |\n\n> quoted\n> lines\n\n    indented\n    code\n";
  assertEqual(unwrapMarkdown(preserved), preserved, "Expected tables, blockquotes, and indented code to remain unchanged.");

  assertEqual(
    unwrapMarkdown("first wrapped\nline ends here  \nnext line\n"),
    "first wrapped line ends here  \nnext line\n",
    "Expected explicit Markdown hard breaks to remain intact.",
  );

  const crlf = "Wrapped prose\r\ncontinues.\r\n";
  assertEqual(unwrapMarkdown(crlf), "Wrapped prose continues.\r\n", "Expected CRLF line endings to be retained.");

  const once = unwrapMarkdown("Wrapped prose\ncontinues.\n\n- list item\n  continues\n");
  assertEqual(unwrapMarkdown(once), once, "Expected formatting to be idempotent.");

  const workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-markdown-utility-"));
  try {
    const docs = path.join(workspace, "docs");
    await fs.promises.mkdir(docs);
    const wrappedPath = path.join(docs, "wrapped.md");
    const cleanPath = path.join(docs, "clean.md");
    await fs.promises.writeFile(wrappedPath, "Wrapped\nparagraph.\n", "utf8");
    await fs.promises.writeFile(cleanPath, "Already unwrapped.\n", "utf8");

    const preview = await unwrapMarkdownPaths(workspace, ["docs"], "preview");
    assert(preview.scannedFiles.length === 2, "Expected directory scanning to find Markdown files.");
    assert(preview.changedFiles.length === 1 && preview.writtenFiles.length === 0, "Expected preview mode not to write.");
    assertEqual(await fs.promises.readFile(wrappedPath, "utf8"), "Wrapped\nparagraph.\n", "Preview must not mutate files.");

    const write = await unwrapMarkdownPaths(workspace, ["docs"], "write");
    assert(write.changedFiles.length === 1 && write.writtenFiles.length === 1, "Expected write mode to report its mutation.");
    assertEqual(await fs.promises.readFile(wrappedPath, "utf8"), "Wrapped paragraph.\n", "Expected write mode to unwrap prose.");

    const check = await unwrapMarkdownPaths(workspace, ["docs"], "check");
    assert(check.changedFiles.length === 0, "Expected a clean idempotence check after writing.");

    let rejectedEscape = false;
    try {
      await unwrapMarkdownPaths(workspace, [".."], "preview");
    } catch (error) {
      rejectedEscape = error instanceof Error && error.message.includes("inside the workspace");
    }
    assert(rejectedEscape, "Expected workspace escape attempts to be rejected.");
  } finally {
    await fs.promises.rm(workspace, { recursive: true, force: true });
  }

  console.log("PASS: Markdown unwrap validation succeeded");
}

main();
