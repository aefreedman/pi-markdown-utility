import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import markdownTools from "../index.ts";
import { findWindowsPowerShell, getMarkdownExecutableCandidates, MARKDOWN_EXEC_MAX_BUFFER } from "../executables.ts";

const root = await mkdtemp(path.join(tmpdir(), "markdown-exec-"));
const previousDir = process.env.PI_CODING_AGENT_DIR;
const previousOverride = process.env.PI_MARKDOWN_UTILITY_CODE_EXECUTABLE;
process.env.PI_CODING_AGENT_DIR = root;
delete process.env.PI_MARKDOWN_UTILITY_CODE_EXECUTABLE;
const ok = { code: 0, stdout: "version", stderr: "", killed: false, truncated: false };
const missing = Object.assign(new Error("synthetic missing executable"), { code: "ENOENT" });
try {
  const file = path.join(root, "literal & café.md");
  await writeFile(file, "fixture\n");
  const signal = new AbortController().signal;
  const candidates = getMarkdownExecutableCandidates("code");
  const calls: any[] = [];
  let replies: any[] = [];
  let tool: any;
  markdownTools({
    on() {}, registerCommand() {},
    registerTool(value: any) { if (value.name === "open_markdown_output") tool = value; },
    async exec(command: string, args: string[], options: any) {
      calls.push({ command, args, options });
      assert.equal(options.maxBuffer, MARKDOWN_EXEC_MAX_BUFFER);
      assert.equal(options.signal, signal);
      assert.equal(options.timeout, 5000);
      assert(replies.length, "Unexpected exec call");
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      return reply;
    },
  } as any);
  async function run(sequence: any[]) {
    calls.length = 0;
    replies = [...sequence];
    return tool.execute("open", { path: file }, signal, undefined, { cwd: root });
  }
  const result = await run([ok, ok]);
  assert.match(result.content[0].text, /Opened/);
  assert.deepEqual(calls[1].args, ["-g", file]);
  for (const phase of ["probe", "open"]) {
    for (const failure of [
      { ...ok, code: 1, stderr: "useful café diagnostic" },
      { ...ok, truncated: true, stderr: "not found: partial café output" },
      { ...ok, killed: true, stderr: "timeout café" },
    ]) {
      await assert.rejects(run(phase === "probe" ? [failure] : [ok, failure]), /failed:.*café/);
      assert.equal(calls.length, phase === "probe" ? 1 : 2);
    }
  }
  await assert.rejects(run(candidates.map(() => missing)), /not found.*PI_MARKDOWN_UTILITY_CODE_EXECUTABLE/);
  assert.equal(calls.length, candidates.length);
  if (candidates.length > 1) {
    await run([missing, ok, ok]);
    assert.equal(calls[1].command, candidates[1]);
    await run([{ ...ok, code: 1, stderr: "ENOENT" }, ok, ok]);
    assert.equal(calls[1].command, candidates[1]);
  }
  await assert.rejects(run([Object.assign(new Error("permission denied"), { code: "EACCES" })]), /permission denied/);
  assert.equal(calls.length, 1);

  for (const [reply, expected] of [[ok, "pwsh.exe"], [{ ...ok, code: 1 }, "powershell.exe"], [missing, "powershell.exe"]] as const) {
    assert.equal(await findWindowsPowerShell(async (command, args, options) => {
      assert.equal(command, "cmd.exe");
      assert.deepEqual(args, ["/d", "/c", "where", "pwsh.exe"]);
      assert.equal(options?.maxBuffer, MARKDOWN_EXEC_MAX_BUFFER);
      assert.equal(options?.timeout, 2000);
      assert.equal(options?.signal, signal);
      if (reply instanceof Error) throw reply;
      return reply;
    }, signal), expected);
  }
  for (const failure of [{ ...ok, truncated: true }, { ...ok, killed: true }]) {
    await assert.rejects(findWindowsPowerShell(async () => failure), /PowerShell probe failed/);
  }
  await assert.rejects(findWindowsPowerShell(async () => { throw new Error("probe permission denied"); }), /permission denied/);
  console.log("PASS: bounded opener/probe exec, truncation, termination, stderr, missing-executable fallback; no processes launched");
} finally {
  if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
  if (previousOverride === undefined) delete process.env.PI_MARKDOWN_UTILITY_CODE_EXECUTABLE; else process.env.PI_MARKDOWN_UTILITY_CODE_EXECUTABLE = previousOverride;
  await rm(root, { recursive: true, force: true });
}
