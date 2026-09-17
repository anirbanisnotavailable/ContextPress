/* ContextPress Studio
   All processing happens in the browser. Files never leave the machine.
   Ignore rules and capsule format mirror context_press.py.
*/

"use strict";

/* ---------------- helpers ---------------- */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function humanSize(n) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function formatDate(d) {
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* ---------------- icons ---------------- */

const ICONS = {
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>',
  "folder-open": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>',
  terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>',
  "arrow-right": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  github: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6H22l-6.2 4.5 2.4 7.6-6.2-4.5-6.2 4.5 2.4-7.6L2 9.6h7.6z"/></svg>',
};

/* ---------------- constants (keep in sync with context_press.py) ---------------- */

const IGNORE_DIRS = new Set([
  ".git", ".github", "node_modules", ".venv", "venv", "env", "__pycache__",
  ".next", "dist", "build", "out", ".idea", ".vscode", ".expo", ".serverless",
]);

const BINARY_EXTS = new Set([
  ".pyc", ".pyo", ".pyd", ".db", ".sqlite", ".exe", ".dll", ".so", ".dylib",
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp",
  ".mp4", ".mp3", ".wav", ".pdf",
  ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2", ".bin",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".map", ".wasm",
]);

const LANGUAGE_OVERRIDES = {
  py: "python", pyi: "python",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  rs: "rust", go: "go", rb: "ruby", cs: "csharp",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp", hpp: "cpp",
  java: "java", kt: "kotlin", swift: "swift", php: "php",
  sh: "bash", bash: "bash", zsh: "bash",
  yml: "yaml", toml: "toml", md: "markdown",
  css: "css", scss: "scss", less: "less", html: "html", xml: "xml",
  sql: "sql", vue: "vue", svelte: "svelte", lua: "lua", pl: "perl",
  proto: "protobuf", graphql: "graphql",
};

/* ---------------- ignore engine (mirrors context_press.py) ---------------- */

function globToRegExp(pattern) {
  let out = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") { out += "(?:.*/)?"; i += 3; }
        else { out += ".*"; i += 2; }
      } else { out += "[^/]*"; i += 1; }
    } else if (c === "?") {
      out += "[^/]"; i += 1;
    } else if (c === "[") {
      let j = i + 1;
      if (pattern[j] === "!" || pattern[j] === "^") j++;
      if (pattern[j] === "]") j++;
      while (j < pattern.length && pattern[j] !== "]") j++;
      if (j >= pattern.length) { out += "\\["; i += 1; }
      else {
        let body = pattern.slice(i + 1, j);
        if (body.startsWith("!") || body.startsWith("^")) body = "^" + body.slice(1);
        out += "[" + body + "]";
        i = j + 1;
      }
    } else {
      out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(out + "$");
}

function parsePattern(line, negate, target) {
  line = line.trim();
  if (!line) return;
  const anchor = line.startsWith("/");
  line = line.replace(/^\/+/, "");
  if (!line) return;
  let kind;
  if (line.endsWith("/")) { kind = "dir"; line = line.replace(/\/+$/, ""); }
  else if (line.includes("/")) kind = "path";
  else kind = "name";
  if (!line) return;
  target.push({ pattern: line, negate, anchor, kind, regex: globToRegExp(line) });
}

function parsePatternsText(text, target) {
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    if (negate) line = line.slice(1);
    parsePattern(line, negate, target);
  }
}

function matchPattern(patterns, rel, name, isDir) {
  const parts = rel.split("/");
  let matched = null;
  for (const entry of patterns) {
    let hit;
    if (entry.kind === "name") {
      hit = entry.anchor
        ? entry.regex.test(parts[0])
        : entry.regex.test(name);
    } else if (entry.kind === "dir") {
      hit = entry.anchor
        ? entry.regex.test(parts[0])
        : parts.some((part) => entry.regex.test(part));
    } else {
      hit = entry.regex.test(rel);
    }
    if (hit) matched = entry;
  }
  return matched;
}

function ignoreReason(rel, name, size, isDir, patterns, maxFileMB) {
  const parts = rel.split("/");
  const scope = isDir ? parts : parts.slice(0, -1);
  if (scope.some((p) => IGNORE_DIRS.has(p))) return "default";
  if (!isDir) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
    if (BINARY_EXTS.has(ext)) return "binary";
    if (maxFileMB > 0 && size > maxFileMB * 1024 * 1024) return "size";
  }
  const m = matchPattern(patterns, rel, name, isDir);
  if (m && !m.negate) return "pattern";
  return null;
}

/* ---------------- state ---------------- */

const state = {
  project: "project",
  files: [],       // {rel, name, size, content, lang, reason}
  gitignorePatterns: [],
  patterns: [],
  maxFileMB: 2,
  includeTree: true,
  capsule: "",
  totalBytes: 0,
  totalChars: 0,
  ignoredCount: 0,
  ignoredNames: [],
};

/* ---------------- DOM refs (assigned in init) ---------------- */

let home, studio, dropzone, folderInput, treeEl, previewEl, statusEl,
  projectNameEl, ignoredNoteEl, copyBtn, downloadBtn, startOverBtn,
  chooseBtn, ignoreInput, sizeLimitSel, treeToggle;

/* ---------------- file loading ---------------- */

async function fileToText(file) {
  const buf = await file.arrayBuffer();
  return new TextDecoder("utf-8").decode(buf);
}

function extOf(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function langOf(name) {
  if (name.toLowerCase() === "dockerfile") return "docker";
  return LANGUAGE_OVERRIDES[extOf(name)] || extOf(name);
}

function setStatus(msg) {
  if (msg) { statusEl.textContent = msg; statusEl.hidden = false; }
  else { statusEl.hidden = true; }
}

async function loadFiles(items, project) {
  state.project = project;
  state.files = [];
  state.gitignorePatterns = [];
  setStatus(`Reading ${items.length} files`);
  renderView();

  for (const item of items) {
    try {
      state.files.push({
        rel: item.rel,
        name: item.name,
        size: item.file.size,
        content: await fileToText(item.file),
        lang: langOf(item.name),
        reason: null,
      });
    } catch {
      state.files.push({
        rel: item.rel, name: item.name, size: item.file.size,
        content: "", lang: "", reason: "binary",
      });
    }
  }

  const gitignore = state.files.find((f) => f.rel === ".gitignore");
  if (gitignore) parsePatternsText(gitignore.content, state.gitignorePatterns);

  rebuild();
  setStatus(null);
}

function fromInput(list) {
  const items = [];
  let project = "Files";
  for (const file of list) {
    const full = file.webkitRelativePath || file.name;
    const segs = full.split("/");
    if (segs.length > 1) {
      if (project === "Files") project = segs[0];
      items.push({ file, rel: segs.slice(1).join("/"), name: file.name });
    } else {
      items.push({ file, rel: segs[0], name: file.name });
    }
  }
  return { items, project };
}

function fromEntries(entries) {
  const items = [];
  let project = "Files";
  for (const entry of entries) {
    if (entry.isFile) {
      const file = entry.file;
      items.push({ file, rel: file.name, name: file.name });
    } else if (entry.isDirectory) {
      project = entry.name;
      collectDir(entry, "", items);
    }
  }
  return { items, project };
}

function collectDir(entry, prefix, out) {
  return new Promise((resolve) => {
    const reader = entry.createReader();
    const readBatch = () => {
      reader.readEntries(async (batch) => {
        if (!batch.length) { resolve(); return; }
        for (const e of batch) {
          if (e.isFile) {
            const file = await new Promise((res) => e.file(res, () => res(null)));
            if (file) out.push({ file, rel: prefix + e.name, name: e.name });
          } else if (e.isDirectory) {
            await collectDir(e, prefix + e.name + "/", out);
          }
        }
        readBatch();
      }, () => resolve());
    };
    readBatch();
  });
}

/* ---------------- tree building ---------------- */

function buildFullTree(files) {
  const root = { name: "", rel: "", dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.rel.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!node.dirs.has(key)) {
        node.dirs.set(key, {
          name: key,
          rel: parts.slice(0, i + 1).join("/"),
          dirs: new Map(),
          files: [],
        });
      }
      node = node.dirs.get(key);
    }
    node.files.push(f);
  }
  return root;
}

const byName = (a, b) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

function visibleTree(node) {
  const out = { name: node.name, dirs: [], files: [] };
  for (const dir of [...node.dirs.values()].sort(byName)) {
    if (ignoreReason(dir.rel, dir.name, 0, true, state.patterns, state.maxFileMB)) continue;
    out.dirs.push(visibleTree(dir));
  }
  for (const f of [...node.files].sort(byName)) {
    if (!f.reason) out.files.push(f);
  }
  return out;
}

function buildTreeText(node) {
  const lines = [`${state.project}/`];
  (function visit(dir, prefix) {
    // Directories first, then files, each group sorted by name.
    // This matches the ordering in context_press.py.
    const entries = [
      ...dir.dirs.map((d) => ({ isDir: true, name: d.name, dir: d })),
      ...dir.files.map((f) => ({ isDir: false, name: f.name })),
    ];
    entries.forEach((e, i) => {
      const isLast = i === entries.length - 1;
      const conn = isLast ? "└── " : "├── ";
      if (e.isDir) {
        lines.push(prefix + conn + e.name + "/");
        visit(e.dir, prefix + (isLast ? "    " : "│   "));
      } else {
        lines.push(prefix + conn + e.name);
      }
    });
  })(node, "");
  return lines.join("\n");
}

function walkOrder(node) {
  // Files of each directory first, then its subdirectories, matching
  // the top-down order produced by os.walk in context_press.py.
  const out = [];
  (function visit(dir) {
    for (const f of dir.files) out.push(f);
    for (const d of dir.dirs) visit(d);
  })(node);
  return out;
}

function countFiles(node) {
  let n = node.files.length;
  for (const d of node.dirs) n += countFiles(d);
  return n;
}

function renderHtmlTree() {
  const node = state.visible;
  treeEl.innerHTML = "";
  treeEl.appendChild(renderNode(node, 0));
  if (!node.dirs.length && !node.files.length) {
    treeEl.innerHTML = '<div class="tree-file">No files matched the current filters.</div>';
  }
}

function renderNode(node, depth) {
  const frag = document.createDocumentFragment();
  for (const dir of node.dirs) {
    const details = document.createElement("details");
    details.open = true;
    const summary = document.createElement("summary");
    summary.innerHTML =
      `<span class="caret">${ICONS.chevron}</span>` +
      `<span class="dir-name">${escapeHtml(dir.name)}/</span>` +
      `<span class="count">${countFiles(dir)}</span>`;
    const children = document.createElement("div");
    children.className = "tree-children";
    children.appendChild(renderNode(dir, depth + 1));
    details.append(summary, children);
    frag.appendChild(details);
  }
  for (const f of node.files) {
    const div = document.createElement("div");
    div.className = "tree-file";
    div.style.setProperty("--depth", depth);
    div.innerHTML =
      `<span class="dot"></span>` +
      `<span>${escapeHtml(f.name)}</span>` +
      `<span class="size">${humanSize(f.size)}</span>`;
    frag.appendChild(div);
  }
  return frag;
}

/* ---------------- capsule ---------------- */

function buildCapsule() {
  const kept = state.files.filter((f) => !f.reason);
  state.totalBytes = kept.reduce((s, f) => s + f.size, 0);
  state.totalChars = kept.reduce((s, f) => s + f.content.length, 0);
  const tokens = Math.floor(state.totalChars / 4);

  let out = "# Codebase Context\n\n";
  out += `Generated: ${formatDate(new Date())}\n`;
  out += `Files: ${kept.length}\n`;
  out += `Total size: ${humanSize(state.totalBytes)}\n`;
  out += `Estimated tokens: ~${tokens.toLocaleString("en-US")}\n\n`;

  if (state.includeTree) {
    out += "## Directory tree\n\n```text\n" + buildTreeText(state.visible) + "\n```\n\n";
  }

  out += "## Files\n\n";
  const sorted = walkOrder(state.visible);
  for (const f of sorted) {
    const fence = f.lang ? "```" + f.lang : "```";
    const body = f.content && !f.content.endsWith("\n") ? f.content + "\n" : f.content;
    out += `### ${f.rel}\n${fence}\n${body}\n\`\`\`\n\n`;
  }
  return out;
}

function collectIgnoredInfo(fullTree) {
  let ignored = 0;
  const names = [];
  (function visit(node, top) {
    for (const dir of [...node.dirs.values()].sort(byName)) {
      const reason = ignoreReason(dir.rel, dir.name, 0, true, state.patterns, state.maxFileMB);
      if (reason) {
        ignored += 1;
        const label = top ? dir.name : dir.rel;
        if (names.length < 6) names.push(label);
      } else {
        visit(dir, top);
      }
    }
    for (const f of node.files) {
      if (f.reason) {
        ignored += 1;
        const label = top ? f.name : f.rel;
        if (names.length < 6) names.push(label);
      }
    }
  })(fullTree, true);
  return { ignored, names };
}

/* ---------------- rebuild and render ---------------- */

function renderView() {
  home.hidden = true;
  studio.hidden = false;
}

function rebuild() {
  state.patterns = [...state.gitignorePatterns];
  for (const raw of ignoreInput.value.split(",")) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith("!")) parsePattern(t.slice(1), true, state.patterns);
    else parsePattern(t, false, state.patterns);
  }

  for (const f of state.files) {
    f.reason = ignoreReason(f.rel, f.name, f.size, false, state.patterns, state.maxFileMB);
  }

  const fullTree = buildFullTree(state.files);
  state.visible = visibleTree(fullTree);

  const info = collectIgnoredInfo(fullTree);
  state.ignoredCount = info.ignored;
  state.ignoredNames = info.names;

  state.capsule = buildCapsule();

  $("#statFiles").textContent = state.files.filter((f) => !f.reason).length.toLocaleString("en-US");
  $("#statSize").textContent = humanSize(state.totalBytes);
  $("#statTokens").textContent = "~" + Math.floor(state.totalChars / 4).toLocaleString("en-US");
  $("#statIgnored").textContent = state.ignoredCount.toLocaleString("en-US");

  projectNameEl.textContent = state.project;
  ignoredNoteEl.textContent = state.ignoredNames.length
    ? "hidden: " + state.ignoredNames.join(", ")
    : "";

  renderHtmlTree();
  previewEl.textContent = state.capsule;
}

/* ---------------- actions ---------------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

let copyTimer = null;

function onCopy() {
  copyText(state.capsule).then((ok) => {
    if (ok) {
      copyBtn.classList.add("is-active");
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => copyBtn.classList.remove("is-active"), 1800);
    } else {
      setStatus("Clipboard was blocked by the browser");
      setTimeout(() => setStatus(null), 2200);
    }
  });
}

function onDownload() {
  const blob = new Blob([state.capsule], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "codebase_context.md";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function startOver() {
  state.files = [];
  state.project = "project";
  state.capsule = "";
  folderInput.value = "";
  ignoreInput.value = "";
  sizeLimitSel.value = "2";
  treeToggle.checked = true;
  home.hidden = false;
  studio.hidden = true;
  window.scrollTo({ top: 0 });
}

/* ---------------- Amicro behaviors ---------------- */

function initMagnetic(el) {
  const STRENGTH = 0.35;
  el.addEventListener("mousemove", (e) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const reach = 45 + Math.max(r.width, r.height) / 2;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) < reach) {
      el.style.setProperty("--mx", ((e.clientX - cx) * STRENGTH).toFixed(1) + "px");
      el.style.setProperty("--my", ((e.clientY - cy) * STRENGTH).toFixed(1) + "px");
    }
  });
  el.addEventListener("mouseleave", () => {
    el.style.setProperty("--mx", "0px");
    el.style.setProperty("--my", "0px");
  });
}

function initGlow(el) {
  const glow = $(".btn-glow", el);
  if (!glow) return;
  el.addEventListener("mousemove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--gx", (e.clientX - r.left).toFixed(0) + "px");
    el.style.setProperty("--gy", (e.clientY - r.top).toFixed(0) + "px");
  });
}

/* ---------------- drag and drop ---------------- */

let dragDepth = 0;

function eventHasFiles(e) {
  return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
}

async function onDrop(e) {
  if (!eventHasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropzone.hidden = true;
  const items = Array.from(e.dataTransfer.items || []);
  const entries = items
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (entries.length) {
    await loadFromEntries(entries);
    return;
  }
  const files = items
    .map((i) => (i.getAsFile ? i.getAsFile() : null))
    .filter(Boolean);
  if (files.length) {
    await loadFiles(
      files.map((file) => ({ file, rel: file.name, name: file.name })),
      "Files"
    );
  }
}

async function loadFromEntries(entries) {
  const items = [];
  let project = "Files";
  let sawDir = false;
  for (const entry of entries) {
    if (entry.isFile) {
      const file = await new Promise((res) => entry.file(res, () => res(null)));
      if (file) items.push({ file, rel: file.name, name: file.name });
    } else if (entry.isDirectory) {
      if (!sawDir) { project = entry.name; sawDir = true; }
      await collectDir(entry, "", items);
    }
  }
  if (items.length) await loadFiles(items, project);
}

/* ---------------- wiring ---------------- */

function init() {
  home = $("#home");
  studio = $("#studio");
  dropzone = $("#dropzone");
  folderInput = $("#folderInput");
  treeEl = $("#tree");
  previewEl = $("#preview");
  statusEl = $("#status");
  projectNameEl = $("#projectName");
  ignoredNoteEl = $("#ignoredNote");
  copyBtn = $("#copyBtn");
  downloadBtn = $("#downloadBtn");
  startOverBtn = $("#startOver");
  chooseBtn = $("#choose");
  ignoreInput = $("#ignoreInput");
  sizeLimitSel = $("#sizeLimit");
  treeToggle = $("#treeToggle");

  $$("[data-icon]").forEach((el) => {
    el.innerHTML = ICONS[el.dataset.icon] || "";
  });

  $$(".btn-magnetic").forEach(initMagnetic);
  $$(".btn").forEach(initGlow);

  chooseBtn.addEventListener("click", () => folderInput.click());

  folderInput.addEventListener("change", async () => {
    if (!folderInput.files.length) return;
    const { items, project } = fromInput(Array.from(folderInput.files));
    await loadFiles(items, project);
  });

  copyBtn.addEventListener("click", onCopy);
  downloadBtn.addEventListener("click", onDownload);
  startOverBtn.addEventListener("click", startOver);

  let ignoreTimer = null;
  ignoreInput.addEventListener("input", () => {
    clearTimeout(ignoreTimer);
    ignoreTimer = setTimeout(rebuild, 250);
  });
  sizeLimitSel.addEventListener("change", () => {
    state.maxFileMB = Number(sizeLimitSel.value);
    rebuild();
  });
  treeToggle.addEventListener("change", () => {
    state.includeTree = treeToggle.checked;
    rebuild();
  });

  // Links that live on the home screen should go back home first.
  $$("[data-home-link]").forEach((link) => {
    link.addEventListener("click", (e) => {
      if (!studio.hidden) {
        e.preventDefault();
        startOver();
        const target = $(link.getAttribute("href") || "#top");
        requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: "smooth" });
        });
      }
    });
  });

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15 }
  );
  $$(".reveal").forEach((el) => io.observe(el));

  window.addEventListener("dragenter", (e) => {
    if (!eventHasFiles(e)) return;
    e.preventDefault();
    dragDepth += 1;
    dropzone.hidden = false;
  });
  window.addEventListener("dragover", (e) => {
    if (eventHasFiles(e)) e.preventDefault();
  });
  window.addEventListener("dragleave", (e) => {
    if (!eventHasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropzone.hidden = true;
  });
  window.addEventListener("drop", onDrop);
}

if (typeof document !== "undefined") {
  init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    state,
    langOf,
    globToRegExp,
    parsePattern,
    parsePatternsText,
    matchPattern,
    ignoreReason,
    buildFullTree,
    visibleTree,
    buildTreeText,
    buildCapsule,
    collectIgnoredInfo,
    humanSize,
    IGNORE_DIRS,
    BINARY_EXTS,
    LANGUAGE_OVERRIDES,
  };
}
