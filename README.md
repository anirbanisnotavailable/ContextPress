# ContextPress 📦🧠

A lightweight, zero-dependency command-line utility to compile your project's codebase into a clean, structured Markdown capsule perfect for pasting into LLMs (ChatGPT, Gemini, Claude).

## 🚀 Why ContextPress?
When working with AI coding tools, passing code context file-by-file is exhausting. **ContextPress** automatically packages your files into a single document while:
* **Respecting your `.gitignore`** rules so you don't leak private tokens, build folders, or binaries.
* **Generating a visual tree** directory mapping so the AI understands the architecture of your app.
* **Providing token approximations** to let you know if your codebase fits inside the AI model's context window.
* **Requiring absolutely zero installations** or external dependencies. It runs on pure, native Python 3.

---

## 🛠️ Installation & Usage

No installation or `pip install` required. Simply download `context_press.py` and run it.

### Basic Usage
To package your current directory:
```bash
python context_press.py
