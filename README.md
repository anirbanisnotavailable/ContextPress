# ContextPress

Package your project into one clean Markdown file your AI assistant can read.

ContextPress walks your codebase, keeps the files that matter, and writes a single capsule: a short header with file count and token estimate, a directory tree, and every source file in a labeled code block. Paste it into your assistant and skip the copy, paste, repeat.

Two ways to run it, no dependencies either way:

- **CLI**: one Python file, standard library only.
- **Web Studio**: a static page that runs entirely in your browser. Files never leave your machine.

## CLI

Nothing to install. Get `context_press.py` and run it:

```bash
python context_press.py
```

That packages the current directory and writes `codebase_context.md` next to it.

Point it at a project and choose the output file:

```bash
python context_press.py ./my-project -o capsule.md
```

Add extra ignore patterns on the fly:

```bash
python context_press.py -i "secrets/" "*.log"
```

### Options

| Flag | What it does |
| --- | --- |
| `dir` | Project root. Defaults to the current directory. |
| `-o, --output` | Output file. Defaults to `codebase_context.md`. |
| `-i, --ignore` | Extra patterns to ignore, e.g. `-i "secrets/" "*.log"`. |
| `--max-file-size` | Skip files larger than N MB. Default 2, use 0 for no limit. |
| `--no-tree` | Leave the directory tree section out of the capsule. |
| `--list` | Print the files that would be packaged, then stop. |
| `--copy` | Also copy the capsule to your clipboard. |
| `--quiet` | Print nothing except errors. |
| `--serve` | Serve the Web Studio locally. Adjust with `--host` and `--port`. |
| `--version` | Print the version. |

## Web Studio

Open `web/index.html` in a browser, or serve it from the CLI:

```bash
python context_press.py --serve
```

Choose a folder, or drop one anywhere on the page. The Studio shows the files that will be packaged, the directory tree, live stats, and the capsule itself. Copy it to your clipboard or download it as `codebase_context.md`. Extra ignore patterns and the per file size limit apply instantly.

The page is plain HTML, CSS, and JavaScript. No build step, no network calls, no accounts.

## What the capsule looks like

````markdown
# Codebase Context

Generated: 2026-09-17 18:05:12
Files: 4
Total size: 12.4 KB
Estimated tokens: ~1,204

## Directory tree

```text
my-project/
├── src/
│   └── main.py
└── README.md
```

## Files

### README.md
```markdown
# My project
...
```

### src/main.py
```python
print("hello")
```
````

The token estimate divides total characters by four, which tracks closely with how most tokenizers count code.

## How files are picked

A file lands in the capsule only if it clears every rule:

1. It sits outside the directories ContextPress always skips: `.git`, `node_modules`, virtualenvs, build output, IDE folders.
2. It is not a compiled or binary file: images, audio, fonts, archives.
3. Your `.gitignore` does not exclude it. Patterns, negations with `!`, and `**` are honored.
4. It is within the size limit, 2 MB per file by default.

The capsule also never packages its own output file.

## Development

Python tests use the standard library test runner:

```bash
python -m unittest discover -s tests -p "test_context_press.py" -v
```

Web tests first check that the browser engine and the Python engine produce the same capsule for the same project, then load the page in jsdom and drive a full folder load. They need Node plus one dev dependency:

```bash
npm install
npm test
```

## Credits

The animated buttons and micro-interactions in the Web Studio are adapted from [Amicro](https://amicro.vercel.app).

## License

MIT. See [LICENSE](LICENSE).
