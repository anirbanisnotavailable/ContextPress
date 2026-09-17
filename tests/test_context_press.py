"""Unit tests for ContextPress."""

import contextlib
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from context_press import ContextPress, human_size  # noqa: E402

CLIP = ROOT / "context_press.py"

GITIGNORE = (
    "dist/\n"
    "*.log\n"
    "!keep.log\n"
    ".env\n"
    "docs/*.md\n"
    "!docs/keepme.md\n"
)


def make_project(base: Path) -> Path:
    project = base / "demo"
    (project / "src" / "lib").mkdir(parents=True)
    (project / "dist").mkdir()
    (project / "node_modules" / "pkg").mkdir(parents=True)
    (project / "docs").mkdir()
    files = {
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
        "data.bin": "not really binary, but the extension says so\n",
    }
    for rel, content in files.items():
        path = project / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return project


class TestContextPress(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.project = make_project(self.base)
        self.out = self.base / "capsule.md"

    def tearDown(self):
        self._tmp.cleanup()

    def build(self, **kwargs) -> str:
        packager = ContextPress(self.project, output_file=str(self.out), **kwargs)
        packager.package()
        return self.out.read_text(encoding="utf-8")

    def test_gitignore_and_defaults(self):
        text = self.build()
        self.assertIn("### main.py", text)
        self.assertIn("### src/app.js", text)
        self.assertIn("### src/lib/helper.ts", text)
        self.assertIn("### keep.log", text)
        self.assertIn("### docs/keepme.md", text)
        self.assertNotIn("### dist/bundle.js", text)
        self.assertNotIn("### .env", text)
        self.assertNotIn("### node_modules/pkg/index.js", text)
        self.assertNotIn("### debug.log", text)
        self.assertNotIn("### docs/guide.md", text)
        self.assertNotIn("### data.bin", text)

    def test_output_file_is_excluded(self):
        packager = ContextPress(self.project, output_file="codebase_context.md")
        packager.package()
        text = (self.project / "codebase_context.md").read_text(encoding="utf-8")
        self.assertNotIn("### codebase_context.md", text)

    def test_tree_section(self):
        text = self.build()
        self.assertIn("## Directory tree", text)
        self.assertIn("demo/", text)
        self.assertIn("├── src/", text)
        self.assertIn("└── README.md", text)
        self.assertIn("└── app.js", text)
        tree_part = text.split("## Files")[0]
        self.assertNotIn("node_modules", tree_part)

    def test_header_stats(self):
        text = self.build()
        self.assertTrue(text.startswith("# Codebase Context"))
        self.assertIn("Files: 7", text)
        self.assertIn("Estimated tokens: ~", text)
        self.assertIn("Total size:", text)

    def test_custom_ignores(self):
        text = self.build(custom_ignores=["main.py", "docs/"])
        self.assertNotIn("### main.py", text)
        self.assertNotIn("### docs/keepme.md", text)
        self.assertIn("### src/app.js", text)

    def test_custom_ignore_negation_is_honored(self):
        # Negation re-includes, so the last matching pattern wins.
        text = self.build(custom_ignores=["*.py", "!main.py"])
        self.assertIn("### main.py", text)

    def test_max_file_size(self):
        (self.project / "big.txt").write_bytes(b"x" * (3 * 1024 * 1024))
        packager = ContextPress(self.project, output_file=str(self.out), max_file_mb=2)
        stats = packager.package()
        self.assertEqual(stats["skipped_large"], 1)
        self.assertNotIn("### big.txt", self.out.read_text(encoding="utf-8"))

    def test_max_file_size_unlimited(self):
        (self.project / "big.txt").write_bytes(b"x" * (3 * 1024 * 1024))
        text = self.build(max_file_mb=0)
        self.assertIn("### big.txt", text)

    def test_no_tree(self):
        text = self.build(include_tree=False)
        self.assertNotIn("## Directory tree", text)
        self.assertIn("## Files", text)

    def test_language_fences(self):
        text = self.build()
        self.assertIn("### main.py\n```python", text)
        self.assertIn("### src/app.js\n```javascript", text)
        self.assertIn("### src/lib/helper.ts\n```typescript", text)
        self.assertIn("### README.md\n```markdown", text)

    def test_list_files(self):
        packager = ContextPress(self.project, output_file=str(self.out))
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            packager.list_files()
        lines = buffer.getvalue().split()
        self.assertIn("main.py", lines)
        self.assertIn("docs/keepme.md", lines)
        self.assertNotIn("dist/bundle.js", lines)
        self.assertNotIn("node_modules/pkg/index.js", lines)

    def test_bad_root_raises(self):
        with self.assertRaises(NotADirectoryError):
            ContextPress(self.base / "does-not-exist")

    def test_human_size(self):
        self.assertEqual(human_size(512), "512 B")
        self.assertEqual(human_size(2048), "2.0 KB")
        self.assertEqual(human_size(1536), "1.5 KB")
        self.assertEqual(human_size(5 * 1024 * 1024), "5.0 MB")


class TestGlobToRegex(unittest.TestCase):
    def test_star_does_not_cross_slash(self):
        from context_press import _glob_to_regex

        regex = _glob_to_regex("docs/*.md")
        self.assertIsNotNone(regex.fullmatch("docs/guide.md"))
        self.assertIsNone(regex.fullmatch("docs/sub/guide.md"))

    def test_double_star_crosses_slash(self):
        from context_press import _glob_to_regex

        regex = _glob_to_regex("**/logs")
        self.assertIsNotNone(regex.fullmatch("logs"))
        self.assertIsNotNone(regex.fullmatch("a/b/logs"))

    def test_question_mark(self):
        from context_press import _glob_to_regex

        regex = _glob_to_regex("file?.txt")
        self.assertIsNotNone(regex.fullmatch("file1.txt"))
        self.assertIsNone(regex.fullmatch("file12.txt"))


class TestCLI(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.project = make_project(self.base)
        self.out = self.base / "capsule.md"

    def tearDown(self):
        self._tmp.cleanup()

    def run_cli(self, *args) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(CLIP), *map(str, args)],
            capture_output=True,
            text=True,
            timeout=60,
        )

    def test_basic_run(self):
        result = self.run_cli(self.project, "-o", self.out)
        self.assertEqual(result.returncode, 0, result.stderr)
        text = self.out.read_text(encoding="utf-8")
        self.assertIn("# Codebase Context", text)
        self.assertIn("### main.py", text)
        self.assertIn("Wrote", result.stdout)

    def test_list(self):
        result = self.run_cli(self.project, "--list")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("main.py", result.stdout)
        self.assertNotIn("dist/bundle.js", result.stdout)

    def test_bad_dir_exits_2(self):
        result = self.run_cli(self.base / "missing", "-o", self.out)
        self.assertEqual(result.returncode, 2)
        self.assertIn("error", result.stderr)

    def test_version(self):
        result = self.run_cli("--version")
        self.assertEqual(result.returncode, 0)
        self.assertIn("1.1.0", result.stdout)

    def test_custom_ignore_flag(self):
        result = self.run_cli(self.project, "-o", self.out, "-i", "main.py")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("### main.py", self.out.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
