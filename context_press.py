#!/usr/bin/env python3
"""ContextPress: package a project into one Markdown file for LLMs.

Single file, no dependencies beyond the Python standard library.
Works as a command line tool and can serve the ContextPress Studio web app.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import re
import shutil
import socketserver
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional

__version__ = "1.1.0"

DEFAULT_OUTPUT_NAME = "codebase_context.md"
DEFAULT_MAX_FILE_MB = 2.0

# Compiled files and binaries are useless to an LLM and usually large.
DEFAULT_BINARY_EXTENSIONS = {
    ".pyc", ".pyo", ".pyd", ".db", ".sqlite", ".exe", ".dll", ".so", ".dylib",
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp",
    ".mp4", ".mp3", ".wav", ".pdf",
    ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2", ".bin",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".map", ".wasm",
}

# Directories that almost never belong in a context capsule.
DEFAULT_IGNORE_DIRS = {
    ".git", ".github", "node_modules", ".venv", "venv", "env", "__pycache__",
    ".next", "dist", "build", "out", ".idea", ".vscode", ".expo", ".serverless",
}

# File extension to Markdown fence language.
LANGUAGE_OVERRIDES = {
    "py": "python", "pyi": "python",
    "js": "javascript", "jsx": "javascript", "mjs": "javascript", "cjs": "javascript",
    "ts": "typescript", "tsx": "typescript", "mts": "typescript", "cts": "typescript",
    "rs": "rust", "go": "go", "rb": "ruby", "cs": "csharp",
    "c": "c", "h": "c", "cpp": "cpp", "cc": "cpp", "cxx": "cpp", "hpp": "cpp",
    "java": "java", "kt": "kotlin", "swift": "swift", "php": "php",
    "sh": "bash", "bash": "bash", "zsh": "bash",
    "yml": "yaml", "toml": "toml", "md": "markdown",
    "css": "css", "scss": "scss", "less": "less", "html": "html", "xml": "xml",
    "sql": "sql", "vue": "vue", "svelte": "svelte", "lua": "lua", "pl": "perl",
    "proto": "protobuf", "graphql": "graphql", "dockerfile": "docker",
}


def human_size(num: float) -> str:
    """Format a byte count as a short human readable string."""
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if num < 1024 or unit == "TB":
            if unit == "B":
                return f"{int(num)} B"
            return f"{num:.1f} {unit}"
        num /= 1024
    return f"{num:.1f} TB"


def _glob_to_regex(pattern: str) -> re.Pattern:
    """Translate a gitignore style glob to a regular expression.

    ``*`` and ``?`` never cross a directory separator. ``**`` matches
    anything, including separators.
    """
    out: List[str] = []
    i, n = 0, len(pattern)
    while i < n:
        c = pattern[i]
        if c == "*":
            if i + 1 < n and pattern[i + 1] == "*":
                if i + 2 < n and pattern[i + 2] == "/":
                    out.append("(?:.*/)?")
                    i += 3
                else:
                    out.append(".*")
                    i += 2
            else:
                out.append("[^/]*")
                i += 1
        elif c == "?":
            out.append("[^/]")
            i += 1
        elif c == "[":
            j = i + 1
            if j < n and pattern[j] in "!^":
                j += 1
            if j < n and pattern[j] == "]":
                j += 1
            while j < n and pattern[j] != "]":
                j += 1
            if j >= n:
                out.append(re.escape(c))
                i += 1
            else:
                body = pattern[i + 1 : j]
                if body.startswith(("!", "^")):
                    body = "^" + body[1:]
                out.append("[" + body + "]")
                i = j + 1
        else:
            out.append(re.escape(c))
            i += 1
    return re.compile("^" + "".join(out) + "$")


class ContextPress:
    """Collects the files of a project and writes them to one Markdown file."""

    def __init__(
        self,
        root_dir: str = ".",
        output_file: Optional[str] = None,
        custom_ignores: Optional[List[str]] = None,
        max_file_mb: float = DEFAULT_MAX_FILE_MB,
        include_tree: bool = True,
    ) -> None:
        self.root_path = Path(root_dir).expanduser().resolve()
        if not self.root_path.is_dir():
            raise NotADirectoryError(f"'{root_dir}' is not a directory")

        self.output_file = output_file or DEFAULT_OUTPUT_NAME
        self.max_file_mb = max_file_mb
        self.include_tree = include_tree
        self.notes: List[str] = []

        self._output_abs = (
            Path(self.output_file).expanduser()
            if os.path.isabs(self.output_file)
            else (self.root_path / self.output_file)
        ).resolve()
        try:
            self._output_rel = self._output_abs.relative_to(self.root_path).as_posix()
        except ValueError:
            self._output_rel = None

        self.ignore_patterns: List[dict] = self._load_gitignore()
        for pattern in custom_ignores or []:
            self.add_ignore_pattern(pattern)

    # ------------------------------------------------------------------ #
    # Ignore rules
    # ------------------------------------------------------------------ #

    def _load_gitignore(self) -> List[dict]:
        patterns: List[dict] = []
        gitignore_path = self.root_path / ".gitignore"
        if gitignore_path.is_file():
            try:
                text = gitignore_path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                text = ""
            for raw in text.splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                negate = line.startswith("!")
                if negate:
                    line = line[1:]
                self._parse_pattern(line, negate, patterns)
        return patterns

    def add_ignore_pattern(self, line: str) -> None:
        negate = line.startswith("!")
        if negate:
            line = line[1:]
        self._parse_pattern(line, negate, self.ignore_patterns)

    @staticmethod
    def _parse_pattern(line: str, negate: bool, target: List[dict]) -> None:
        line = line.strip()
        if not line:
            return
        anchor = line.startswith("/")
        line = line.lstrip("/")
        if not line:
            return
        if line.endswith("/"):
            kind = "dir"
            line = line.rstrip("/")
        elif "/" in line:
            kind = "path"
        else:
            kind = "name"
        if not line:
            return
        target.append(
            {
                "pattern": line,
                "negate": negate,
                "anchor": anchor,
                "kind": kind,
                "regex": _glob_to_regex(line),
            }
        )

    def _match(self, rel: str, name: str, is_dir: bool) -> Optional[dict]:
        """Return the last ignore pattern that matches this path, if any."""
        matched = None
        parts = rel.split("/")
        for entry in self.ignore_patterns:
            regex = entry["regex"]
            if entry["kind"] == "name":
                if entry["anchor"]:
                    hit = regex.fullmatch(parts[0]) is not None
                else:
                    hit = regex.fullmatch(name) is not None
            elif entry["kind"] == "dir":
                if entry["anchor"]:
                    hit = regex.fullmatch(parts[0]) is not None
                else:
                    hit = any(regex.fullmatch(part) for part in parts)
            else:  # path
                hit = regex.fullmatch(rel) is not None
            if hit:
                matched = entry
        return matched

    def is_ignored(self, path: Path, is_dir: bool) -> Optional[str]:
        """Return a short reason when the path should be left out, else None."""
        rel = path.relative_to(self.root_path).as_posix()
        parts = rel.split("/")
        scope = parts if is_dir else parts[:-1]
        if any(part in DEFAULT_IGNORE_DIRS for part in scope):
            return "default"
        if self._output_rel is not None and rel == self._output_rel:
            return "output"
        if not is_dir:
            if path.suffix.lower() in DEFAULT_BINARY_EXTENSIONS:
                return "binary"
            if self.max_file_mb > 0:
                try:
                    size = path.stat().st_size
                except OSError:
                    size = 0
                if size > self.max_file_mb * 1024 * 1024:
                    return "size"
        entry = self._match(rel, path.name, is_dir)
        if entry is not None and not entry["negate"]:
            return "pattern"
        return None

    # ------------------------------------------------------------------ #
    # Walking and output
    # ------------------------------------------------------------------ #

    def walk(self):
        """Scan the tree and return (kept_files, ignored_count, skipped_large_count)."""
        kept: List[Path] = []
        ignored = 0
        skipped_large = 0
        for root, dirs, files in os.walk(self.root_path):
            root_path = Path(root)
            visible_dirs = []
            for name in sorted(dirs, key=str.lower):
                child = root_path / name
                reason = self.is_ignored(child, is_dir=True)
                if reason is None:
                    visible_dirs.append(name)
                else:
                    ignored += 1
            dirs[:] = visible_dirs

            for name in sorted(files, key=str.lower):
                file_path = root_path / name
                reason = self.is_ignored(file_path, is_dir=False)
                if reason == "size":
                    skipped_large += 1
                    rel = file_path.relative_to(self.root_path).as_posix()
                    self.notes.append(f"skipped {rel} (larger than {self.max_file_mb:g} MB)")
                elif reason is not None:
                    ignored += 1
                else:
                    kept.append(file_path)
        return kept, ignored, skipped_large

    def generate_tree(self) -> str:
        """Build the directory tree shown at the top of the capsule."""
        root_name = self.root_path.name or "/"
        lines = [root_name + "/"]

        def visit(path: Path, prefix: str) -> None:
            try:
                entries = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
            except OSError:
                lines.append(prefix + "[unreadable]")
                return
            visible = [e for e in entries if self.is_ignored(e, is_dir=e.is_dir()) is None]
            for index, entry in enumerate(visible):
                is_last = index == len(visible) - 1
                connector = "└── " if is_last else "├── "
                if entry.is_dir():
                    lines.append(prefix + connector + entry.name + "/")
                    visit(entry, prefix + ("    " if is_last else "│   "))
                else:
                    lines.append(prefix + connector + entry.name)

        visit(self.root_path, "")
        return "\n".join(lines)

    @staticmethod
    def _language(path: Path) -> str:
        if path.name.lower() == "dockerfile":
            return "docker"
        ext = path.suffix.lstrip(".").lower()
        return LANGUAGE_OVERRIDES.get(ext, ext)

    def _header(self, file_count: int, total_bytes: int, tokens: int) -> str:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return (
            "# Codebase Context\n\n"
            f"Generated: {now}\n"
            f"Files: {file_count}\n"
            f"Total size: {human_size(total_bytes)}\n"
            f"Estimated tokens: ~{tokens:,}\n"
        )

    def package(self) -> dict:
        """Write the capsule and return a small stats dict."""
        kept, ignored, skipped_large = self.walk()
        payload_chunks: List[str] = []
        total_chars = 0
        total_bytes = 0

        for file_path in kept:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            rel = file_path.relative_to(self.root_path).as_posix()
            total_chars += len(content)
            try:
                total_bytes += file_path.stat().st_size
            except OSError:
                total_bytes += len(content.encode("utf-8"))
            language = self._language(file_path)
            fence = f"```{language}" if language else "```"
            body = content if (not content or content.endswith("\n")) else content + "\n"
            payload_chunks.append(f"### {rel}\n{fence}\n{body}\n```\n\n")

        tokens = int(total_chars / 4)
        doc = self._header(len(kept), total_bytes, tokens) + "\n"
        if self.include_tree:
            doc += "## Directory tree\n\n```text\n" + self.generate_tree() + "\n```\n\n"
        doc += "## Files\n\n" + "".join(payload_chunks)

        self._output_abs.parent.mkdir(parents=True, exist_ok=True)
        self._output_abs.write_text(doc, encoding="utf-8")

        return {
            "files": len(kept),
            "chars": total_chars,
            "tokens": tokens,
            "bytes": total_bytes,
            "ignored": ignored,
            "skipped_large": skipped_large,
            "output": self._output_abs,
        }

    def list_files(self) -> None:
        """Print the files that would be packaged, one per line."""
        kept, ignored, skipped_large = self.walk()
        for file_path in kept:
            print(file_path.relative_to(self.root_path).as_posix())
        self.notes.append(
            f"total: {len(kept)} kept, {ignored} ignored, {skipped_large} skipped"
        )


# ---------------------------------------------------------------------- #
# Clipboard
# ---------------------------------------------------------------------- #

def copy_to_clipboard(text: str) -> bool:
    """Try the common native clipboard tools. Return True on success."""
    data = text.encode("utf-8")
    commands: List[List[str]] = []
    if sys.platform == "darwin" and shutil.which("pbcopy"):
        commands.append(["pbcopy"])
    elif sys.platform.startswith("win") and shutil.which("clip"):
        commands.append(["clip"])
    else:
        for candidate in (
            ["wl-copy"],
            ["xclip", "-selection", "clipboard"],
            ["xsel", "--clipboard", "--input"],
        ):
            if shutil.which(candidate[0]):
                commands.append(candidate)
    for command in commands:
        try:
            subprocess.run(command, input=data, check=True)
            return True
        except (OSError, subprocess.CalledProcessError):
            continue
    return False


# ---------------------------------------------------------------------- #
# Web app server
# ---------------------------------------------------------------------- #

def serve(host: str, port: int) -> None:
    """Serve the ContextPress Studio web app with the standard library."""
    web_dir = Path(__file__).resolve().parent / "web"
    if not (web_dir / "index.html").is_file():
        print("error: web/index.html not found next to context_press.py", file=sys.stderr)
        sys.exit(2)

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(web_dir))

    class Server(http.server.ThreadingHTTPServer):
        allow_reuse_address = True

    try:
        httpd = Server((host, port), handler)
    except OSError as error:
        print(f"error: could not bind {host}:{port} ({error.strerror})", file=sys.stderr)
        sys.exit(2)

    print(f"ContextPress Studio running at http://{host}:{port}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


# ---------------------------------------------------------------------- #
# CLI
# ---------------------------------------------------------------------- #

def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="context_press",
        description="Package a project directory into one Markdown file for LLMs.",
    )
    parser.add_argument("dir", nargs="?", default=".", help="project root (default: current directory)")
    parser.add_argument("-o", "--output", help=f"output file (default: {DEFAULT_OUTPUT_NAME})")
    parser.add_argument(
        "-i", "--ignore", nargs="*", default=None, metavar="PATTERN",
        help="extra patterns to ignore, e.g. -i secrets/ \"*.log\"",
    )
    parser.add_argument(
        "--max-file-size", type=float, default=DEFAULT_MAX_FILE_MB, metavar="MB",
        help="skip files larger than MB (default 2, use 0 for no limit)",
    )
    parser.add_argument("--no-tree", action="store_true", help="omit the directory tree section")
    parser.add_argument("--list", action="store_true", help="print the files that would be packaged and stop")
    parser.add_argument("--copy", action="store_true", help="also copy the result to the clipboard")
    parser.add_argument("--quiet", action="store_true", help="print nothing except errors")
    parser.add_argument("--serve", action="store_true", help="serve the ContextPress Studio web app")
    parser.add_argument("--host", default="127.0.0.1", help="bind host for --serve (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="port for --serve (default 8000)")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    args = parser.parse_args(argv)

    if args.serve:
        serve(args.host, args.port)
        return 0

    if not args.quiet:
        print(f"ContextPress {__version__}")
        print(f"Packaging {Path(args.dir).resolve()}")

    try:
        packager = ContextPress(
            args.dir,
            output_file=args.output,
            custom_ignores=args.ignore,
            max_file_mb=args.max_file_size,
            include_tree=not args.no_tree,
        )
    except NotADirectoryError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if args.list:
        packager.list_files()
        if not args.quiet:
            for note in packager.notes:
                print(note, file=sys.stderr)
        return 0

    stats = packager.package()

    if not args.quiet:
        print(f"Wrote {stats['output']}")
        print(f"  files:  {stats['files']}")
        print(f"  size:   {human_size(stats['bytes'])}")
        print(f"  tokens: ~{stats['tokens']:,} (estimate)")
        if stats["ignored"]:
            print(f"  ignored: {stats['ignored']}")
        for note in packager.notes[:5]:
            print(f"  {note}", file=sys.stderr)
        if len(packager.notes) > 5:
            print(f"  and {len(packager.notes) - 5} more skipped files", file=sys.stderr)

    if args.copy:
        text = stats["output"].read_text(encoding="utf-8")
        if copy_to_clipboard(text):
            if not args.quiet:
                print("Copied to clipboard.")
        else:
            print("Clipboard is not available on this system.", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
