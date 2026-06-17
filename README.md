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
This generates a file named codebase_context.md in your root folder.
Advanced Options
Specify a target directory and a custom output file name:
code
Bash
python context_press.py /path/to/your/project -o output_capsule.md
Exclude additional custom directories on-the-fly:
code
Bash
python context_press.py -i "secrets/" "*.log" "temp/"
📄 Output Format Example
Your generated capsule file will be structured like this:
code
Markdown
# Codebase Context Capsule
Generated on: 2026-06-17 15:40:00
Total Files Packaged: 3
Estimated Token Count: ~1,250 tokens

## Directory Tree Overview
📁 my_project/
    ├── 📄 context_press.py
    └── src/
        ├── 📄 main.py
        └── 📄 utils.py

## Codebase Context Payload
### File: src/main.py
```python
def main():
    print("Hello world")
code
Code
---

## 🤝 Contributing
Contributions are highly welcome! Feel free to fork this project, submit issues, or open a pull request to add features like automatic clipboard copying or custom JSON output structures.

## 📝 License
This project is licensed under the [MIT License](LICENSE).
