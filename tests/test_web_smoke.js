"use strict";
/* jsdom smoke test for the web app (requires the jsdom dev dependency).
   Loads the real page and app.js, checks it boots cleanly, and simulates
   a folder load end to end.
   Run: node tests/test_web_smoke.js
*/

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const WEB = path.resolve(__dirname, "..", "web");
let html = fs.readFileSync(path.join(WEB, "index.html"), "utf8");
const js = fs.readFileSync(path.join(WEB, "app.js"), "utf8");
html = html.replace(
  '<script src="app.js"></script>',
  () => "<script>" + js + "</script>"
);

const jsErrors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => jsErrors.push(String(e.message || e)));

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.TextDecoder = TextDecoder;
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    window.URL.createObjectURL = () => "blob:fake";
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () {};
    window.File = class File {
      constructor(parts, name, opts = {}) {
        this._buf = Buffer.from(typeof parts === "string" ? parts : parts[0] || "");
        this.name = name;
        this.size = this._buf.length;
        this.webkitRelativePath = opts.webkitRelativePath || "";
      }
      arrayBuffer() {
        const ab = new ArrayBuffer(this._buf.length);
        new Uint8Array(ab).set(this._buf);
        return ab;
      }
    };
  },
});

const { window } = dom;
const { document } = window;

function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
  else console.log("ok  -", msg);
}

window.addEventListener("load", async () => {
  try {
    await new Promise((r) => setTimeout(r, 100));

    assert(!document.getElementById("home").hidden, "home visible on boot");
    assert(document.getElementById("studio").hidden, "studio hidden on boot");
    assert(document.querySelector("#choose .lbl").textContent === "Choose folder", "CTA label present");
    assert(!!document.querySelector(".btn-magnetic"), "magnetic CTA present");
    assert(document.querySelectorAll("[data-icon] svg").length >= 4, "icons injected");

    const files = [
      new window.File("# Demo project\n", "README.md"),
      new window.File("print('hi')\n", "main.py"),
      new window.File("console.log(1)\n", "app.js"),
      new window.File("var x = 1\n", "bundle.js"),
    ];
    files[0].webkitRelativePath = "demo/README.md";
    files[1].webkitRelativePath = "demo/main.py";
    files[2].webkitRelativePath = "demo/src/app.js";
    files[3].webkitRelativePath = "demo/dist/bundle.js";

    const fromInput = window.eval("fromInput");
    const { items, project } = fromInput(files);
    assert(project === "demo", "project name derived: " + project);
    assert(items.length === 4, "all four items collected");

    const loadFiles = window.eval("loadFiles");
    await loadFiles(items, project);

    assert(!document.getElementById("studio").hidden, "studio visible after load");
    assert(document.getElementById("home").hidden, "home hidden after load");
    assert(document.getElementById("projectName").textContent === "demo", "project title set");

    const kept = document.getElementById("statFiles").textContent;
    assert(kept === "3", "kept files = 3 (dist pruned), got " + kept);

    const preview = document.getElementById("preview").textContent;
    assert(preview.startsWith("# Codebase Context"), "preview starts with capsule header");
    assert(preview.includes("## Directory tree"), "preview has tree section");
    assert(preview.includes("```python"), "python fence present");
    assert(preview.includes("```javascript"), "javascript fence present");
    assert(!preview.includes("bundle.js"), "dist/bundle.js excluded from preview");

    const tree = document.getElementById("tree").innerHTML;
    assert(tree.includes("src/"), "tree shows src/ dir");
    assert(tree.includes("app.js"), "tree shows app.js");
    assert(!tree.includes("bundle.js"), "tree hides dist");

    document.getElementById("ignoreInput").value = "*.js";
    window.eval("rebuild")();
    const kept2 = document.getElementById("statFiles").textContent;
    assert(kept2 === "2", "custom ignore drops app.js, kept = 2, got " + kept2);

    const toggle = document.getElementById("treeToggle");
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event("change"));
    assert(!document.getElementById("preview").textContent.includes("## Directory tree"), "tree omitted when toggled off");

    let downloadOk = true;
    try {
      document.getElementById("downloadBtn").click();
    } catch { downloadOk = false; }
    assert(downloadOk, "download click does not throw");

    if (jsErrors.length) {
      console.error("JS errors captured:", jsErrors);
      process.exitCode = 1;
    } else {
      console.log("ok  - no jsdom JS errors");
    }
    console.log("\nSmoke test complete.");
    process.exit(process.exitCode || 0);
  } catch (e) {
    console.error("SMOKE CRASH:", e);
    process.exit(1);
  }
});
