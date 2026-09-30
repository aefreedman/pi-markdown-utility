import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const bash = process.platform === "win32" ? path.join(process.env.ProgramFiles, "Git", "bin", "bash.exe") : "bash";
function block(name) {
  const section = workflow.split(`      - name: ${name}\n`)[1];
  assert(section, name);
  const body = section.split("        run: |\n")[1].split("\n      - ")[0];
  return body.split("\n").map(line => line.replace(/^          /, "")).join("\n");
}
assert.match(workflow, /release:\s+types: \[published\]/);
assert.match(workflow, /if: github.event_name == 'workflow_dispatch' \|\| !github.event.release.prerelease/);
assert.match(workflow, /RELEASE_TAG: \$\{\{ github.event.release.tag_name \|\| inputs.tag }}/);
assert.match(workflow, /ref: refs\/tags\/\$\{\{ env.RELEASE_TAG }}/);
assert.match(workflow, /id-token: write/);
assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|secrets\.|environment:/);
const sha = "a".repeat(40);
const other = "b".repeat(40);
function run(script, env = {}) {
  return spawnSync(bash, ["-c", script], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_NAME: "release", RELEASE_TAG: `v${manifest.version}`, REQUESTED_COMMIT: "", EXPECTED_COMMIT: sha, MOCK_HEAD: sha, MOCK_TAG: sha, GITHUB_ENV: "/dev/null", ...env },
  });
}
{
  const identity = block("Verify requested immutable tag and package identity");
  const gitMock = 'git() { case "$*" in "rev-parse HEAD") echo "$MOCK_HEAD";; *) echo "$MOCK_TAG";; esac; };\n';
  for (const [name, env, pass] of [
    ["release without dispatch inputs", {}, true],
    ["dispatch exact commit", { GITHUB_EVENT_NAME: "workflow_dispatch", REQUESTED_COMMIT: sha }, true],
    ["dispatch wrong commit", { GITHUB_EVENT_NAME: "workflow_dispatch", REQUESTED_COMMIT: other }, false],
    ["dispatch missing commit", { GITHUB_EVENT_NAME: "workflow_dispatch" }, false],
    ["wrong tag", { RELEASE_TAG: "v0.0.0" }, false],
    ["empty tag", { RELEASE_TAG: "" }, false],
    ["tag source mismatch", { MOCK_TAG: other }, false],
    ["unexpected event", { GITHUB_EVENT_NAME: "push" }, false],
  ]) {
    const result = run(gitMock + 'GITHUB_ENV=$(mktemp); trap \'rm -f "$GITHUB_ENV"\' EXIT;\n' + identity + '\ncat "$GITHUB_ENV"', env);
    assert.equal(result.status === 0, pass, `${name}: ${result.stderr}`);
    if (pass) assert.match(result.stdout, new RegExp(`EXPECTED_COMMIT=${sha}`));
  }
  const registry = block("Reconcile registry identity, publish only if absent, and verify");
  const npmMock = `npm() {
    if [[ "$1" != view ]]; then
      if [[ "$MOCK_REGISTRY" == absent ]]; then published=1; return 0; fi
      echo 'unexpected publication' >&2; return 99
    fi
    case "$MOCK_REGISTRY" in
      absent)
        if [[ "\${published:-0}" == 1 ]]; then printf '{"version":"${manifest.version}","gitHead":"${sha}"}';
        else printf '{"error":{"code":"E404","summary":"No match found for version ${manifest.version}"}}'; return 1; fi;;
      same) printf '{"version":"${manifest.version}","gitHead":"${sha}"}';;
      mismatch) printf '{"version":"${manifest.version}","gitHead":"${other}"}';;
      version) printf '{"version":"0.0.0","gitHead":"${sha}"}';;
      malformed) echo 'not JSON';;
      network) printf '{"error":{"code":"ETIMEDOUT"}}'; return 1;;
      unauthorized) printf '{"error":{"code":"E401"}}'; return 1;;
    esac
  };\n`;
  for (const scenario of ["same", "absent", "mismatch", "version", "malformed", "network", "unauthorized"]) {
    const result = run(npmMock + registry, { MOCK_REGISTRY: scenario });
    assert.equal(result.status === 0, scenario === "same" || scenario === "absent", `${scenario}: ${result.stderr}`);
    assert.doesNotMatch(result.stderr, /unexpected publication/);
  }
  console.log("Release workflow validation passed: 8 event/tag/commit and 7 registry identity cases.");
}
