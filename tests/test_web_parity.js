/* Parity check: the web app's ignore engine and capsule format must match
   the Python CLI on the same fixture project.
   Run: node tests/test_web_parity.js
*/

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const app = require(path.join(ROOT, "web", "app.js"));

const GITIGNORE = [
  "dist/",
  "*.log",
  "!keep.log",
  ".env",
  "docs/*.md",
  "!docs/keepme.md",
  "",
].join("\n");

const FILES = {
  "README.md": "# Demo\n",
  "main.py": "print('hi')\n",
  ".env": "SECRET=1\n",
  ".gitignore": GITIGNORE,
  "src/app.js": "console.log(1)\n",
  "src/lib/helper.ts": "export const x = 1;\n",
  "dist/bundle.js": "var x = 1\n",
  "node_modules/pkg/index.js": "module.exports = {}\n",
  "docs/guide.md": "a guide\n",
  "docs/keepme.md": "kept by negation\n",
  "debug.log": "log line\n",
  "keep.log": "kept log\n",
  "data.bin": "not really binary\n",
};

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpx-"));
  for (const [rel, content] of Object.entries(FILES)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
  return dir;
}

const PYTHON = process.env.PYTHON || "python3";

function pythonListedFiles(dir) {
  const out = execFileSync(
    PYTHON,
    [path.join(ROOT, "context_press.py"), dir, "--list", "--quiet"],
    { encoding: "utf8" }
  );
  return new Set(out.trim().split("\n").filter(Boolean));
}

function pythonCapsule(dir, outFile) {
  execFileSync(
    PYTHON,
    [path.join(ROOT, "context_press.py"), dir, "-o", outFile, "--quiet"],
    { encoding: "utf8" }
  );
  return fs.readFileSync(outFile, "utf8");
}

function jsFileModel(dir) {
  const files = [];
  for (const [rel, content] of Object.entries(FILES)) {
    const size = fs.statSync(path.join(dir, rel)).size;
    const name = rel.split("/").pop();
    files.push({ rel, name, size, content, lang: app.langOf(name), reason: null });
  }
  return files;
}

function main() {
  const dir = makeFixture();
  try {
    const pyFiles = pythonListedFiles(dir);

    // Set up the JS engine exactly like the web app does.
    const appState = app.state;
    appState.project = path.basename(dir);
    appState.maxFileMB = 2;
    appState.includeTree = true;
    appState.files = jsFileModel(dir);
    appState.gitignorePatterns = [];
    const gitignore = appState.files.find((f) => f.rel === ".gitignore");
    app.parsePatternsText(gitignore.content, appState.gitignorePatterns);
    appState.patterns = [...appState.gitignorePatterns];
    for (const f of appState.files) {
      f.reason = app.ignoreReason(f.rel, f.name, f.size, false, appState.patterns, appState.maxFileMB);
    }
    const jsKept = new Set(
      appState.files.filter((f) => !f.reason).map((f) => f.rel)
    );

    // 1. Same files kept.
    for (const f of pyFiles) assert.ok(jsKept.has(f), `JS missing file kept by Python: ${f}`);
    for (const f of jsKept) assert.ok(pyFiles.has(f), `JS kept a file Python ignored: ${f}`);
    console.log(`kept set matches: ${pyFiles.size} files`);

    // 2. Same tree text.
    appState.visible = app.visibleTree(app.buildFullTree(appState.files));
    const jsTree = app.buildTreeText(appState.visible);
    const pyCapsule = pythonCapsule(dir, path.join(dir, "py_capsule.md"));
    const pyTree = pyCapsule.split("```text\n")[1].split("\n```")[0];
    assert.strictEqual(jsTree, pyTree, "tree text differs\nJS:\n" + jsTree + "\nPY:\n" + pyTree);
    console.log("tree text matches");

    // 3. Same file payload section (### headers + fences, same order).
    const jsCapsule = app.buildCapsule();
    const jsPayload = jsCapsule.split("## Files\n\n")[1];
    const pyPayload = pyCapsule.split("## Files\n\n")[1];
    const jsHeaders = [...jsPayload.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    const pyHeaders = [...pyPayload.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    assert.deepStrictEqual(jsHeaders, pyHeaders, "payload order/headers differ");
    const jsFences = [...jsPayload.matchAll(/^```(\w+)$/gm)].map((m) => m[1]);
    const pyFences = [...pyPayload.matchAll(/^```(\w+)$/gm)].map((m) => m[1]);
    assert.deepStrictEqual(jsFences, pyFences, "fence languages differ");
    console.log(`payload matches: ${pyHeaders.length} files, fences aligned`);

    // 4. Same stats.
    const jsCount = jsKept.size;
    const pyCount = Number(pyCapsule.match(/^Files: (\d+)$/m)[1]);
    assert.strictEqual(jsCount, pyCount, "file count differs");
    const jsSize = app.humanSize(appState.totalBytes);
    const pySize = pyCapsule.match(/^Total size: (.+)$/m)[1];
    assert.strictEqual(jsSize, pySize, `size differs: ${jsSize} vs ${pySize}`);
    console.log(`stats match: ${pyCount} files, ${pySize}`);

    // 5. Ignored entries are tracked (dist, node_modules, .env, *.log, data.bin, guide.md).
    const ignoredInfo = app.collectIgnoredInfo(app.buildFullTree(appState.files));
    assert.ok(ignoredInfo.ignored >= 6, `expected at least 6 ignored entries, got ${ignoredInfo.ignored}`);
    assert.ok(ignoredInfo.names.includes("node_modules"), "node_modules should be listed");
    console.log(`ignored entries tracked: ${ignoredInfo.ignored} (${ignoredInfo.names.join(", ")})`);

    console.log("\nAll parity checks passed.");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main();
