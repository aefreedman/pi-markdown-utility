import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const hostManifest = JSON.parse(await readFile(path.join(path.dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "../package.json"), "utf8"));
assert.equal(hostManifest.version, manifest.devDependencies["@earendil-works/pi-coding-agent"]);
const root = await mkdtemp(path.join(tmpdir(), "markdown-host-"));
const previousDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = path.join(root, "agent");
let session;
try {
  const fixture = path.join(root, "fixture.md");
  const before = "A synthetic paragraph\nwrapped across lines.\n";
  await writeFile(fixture, before);
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const dispatches = [];
  const loader = new DefaultResourceLoader({
    cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR, settingsManager,
    additionalExtensionPaths: [fileURLToPath(new URL("../index.ts", import.meta.url))],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionsOverride(result) {
      assert.deepEqual(result.errors, []);
      assert.equal(result.extensions.length, 1);
      for (const extension of result.extensions) {
        for (const { definition } of extension.tools.values()) {
          // Inventory the actual host-loaded schemas: ordinary JSON Schema only.
          assert.equal(definition.parameters.type, "object");
          const execute = definition.execute;
          definition.execute = async (id, args, ...rest) => {
            dispatches.push({ name: definition.name, args: structuredClone(args) });
            return execute(id, args, ...rest);
          };
        }
      }
      return result;
    },
  });
  await loader.reload();
  const runtime = await ModelRuntime.create({
    authPath: path.join(root, "auth.json"), modelsPath: null, refreshOnCreate: false,
  });
  let nextCall;
  let firstTurn;
  runtime.registerProvider("synthetic-markdown", {
    api: "openai-completions", apiKey: "synthetic-not-a-credential", baseUrl: "http://127.0.0.1:1",
    models: [{ id: "fixture", name: "Fixture", reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32000, maxTokens: 1024 }],
    streamSimple(model) {
      const stream = createAssistantMessageEventStream();
      const content = firstTurn ? [{ type: "toolCall", id: "synthetic-call", name: nextCall.name, arguments: nextCall.args }] : [{ type: "text", text: "Done" }];
      const message = { role: "assistant", content, api: model.api, provider: model.provider, model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: firstTurn ? "toolUse" : "stop", timestamp: Date.now() };
      firstTurn = false;
      stream.push({ type: "done", reason: message.stopReason, message });
      stream.end();
      return stream;
    },
  });
  ({ session } = await createAgentSession({
    cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR, resourceLoader: loader, settingsManager,
    sessionManager: SessionManager.inMemory(root), modelRuntime: runtime,
    model: runtime.getModel("synthetic-markdown", "fixture"), noTools: "builtin",
  }));
  async function call(name, args, expectedDispatches, isError) {
    nextCall = { name, args }; firstTurn = true;
    const count = dispatches.length;
    const oldMessages = session.messages.length;
    await session.prompt("Run the synthetic fixture call.");
    const results = session.messages.slice(oldMessages).filter(message => message.role === "toolResult");
    assert.equal(results.length, 1, JSON.stringify(session.messages.slice(oldMessages)));
    assert.equal(results[0].isError, isError, JSON.stringify(results[0]));
    assert.equal(dispatches.length - count, expectedDispatches);
    return results[0];
  }
  for (const args of [{ mode: "write" }, { paths: [], mode: "write" }, { paths: ["fixture.md"], mode: "invalid" }, { paths: [{}], mode: "write" }]) {
    await call("unwrap_markdown", args, 0, true);
    assert.equal(await readFile(fixture, "utf8"), before, "Invalid mutation must not write");
  }
  await call("unwrap_markdown", { paths: "fixture.md", mode: null }, 1, false);
  assert.deepEqual(dispatches.at(-1).args, { paths: ["fixture.md"] });
  assert.equal(await readFile(fixture, "utf8"), before);
  await call("unwrap_markdown", { paths: ["fixture.md"], mode: "check" }, 1, false);
  await call("unwrap_markdown", { paths: ["../outside.md"], mode: "write" }, 1, true);
  assert.equal(await readFile(fixture, "utf8"), before, "Semantic boundary guard must not write");
  await call("open_markdown_output", { path: {}, use_last: false }, 0, true);
  await call("open_markdown_output", { use_last: "not-a-boolean" }, 0, true);
  // These execute the path guard and never reach an editor/terminal or exec.
  await call("open_markdown_output", { path: null, use_last: "false" }, 1, true);
  assert.deepEqual(dispatches.at(-1).args, { use_last: false });
  await call("open_markdown_output", { path: null, use_last: "true" }, 1, true);
  assert.deepEqual(dispatches.at(-1).args, { use_last: true });
  await call("unwrap_markdown", { paths: "fixture.md", mode: "write" }, 1, false);
  assert.equal(await readFile(fixture, "utf8"), "A synthetic paragraph wrapped across lines.\n");
  console.log(`PASS: Pi ${hostManifest.version} actual extension load and session schema boundary: valid/invalid, singleton arrays, boolean strings, optional null, zero invalid mutation dispatch; semantic workspace guard; synthetic transport only`);
} finally {
  session?.dispose();
  if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
  await rm(root, { recursive: true, force: true });
}
