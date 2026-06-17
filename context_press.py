#!/usr/bin/env python3
"""
ContextPress - Codebase Context Packager for AI LLMs
Author: Anirban Mandal (https://github.com/anirbanisnotavailable)
License: MIT
"""

import os
import argparse
import fnmatch
from pathlib import Path
import datetime

# Standard binary/compiled file extensions to always ignore
DEFAULT_BINARY_EXTENSIONS = {
    '.pyc', '.pyo', '.pyd', '.db', '.sqlite', '.exe', '.dll', '.so', '.dylib',
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.mp4', '.mp3', '.pdf',
    '.zip', '.tar', '.gz', '.rar', '.7z', '.woff', '.woff2', '.ttf', '.eot',
    '.map', '.wasm'
}

# Standard directories to always ignore
DEFAULT_IGNORE_DIRS = {
    '.git', '.github', 'node_modules', '.venv', 'venv', 'env', '__pycache__',
    '.next', 'dist', 'build', 'out', '.idea', '.vscode', '.expo', '.serverless'
}

class ContextPress:
    def __init__(self, root_dir, output_file=None, custom_ignores=None):
        self.root_path = Path(root_dir).resolve()
        self.output_file = output_file or "codebase_context.md"
        self.ignore_patterns = self._load_gitignore()
        if custom_ignores:
            self.ignore_patterns.extend(custom_ignores)

    def _load_gitignore(self):
        """Loads patterns from .gitignore if present in root directory."""
        patterns = []
        gitignore_path = self.root_path / '.gitignore'
        if gitignore_path.exists():
            with open(gitignore_path, 'r', encoding='utf-8', errors='ignore') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        patterns.append(line)
        return patterns

    def should_ignore(self, path: Path) -> bool:
        """Determines if a path should be ignored based on various rules."""
        # Check against standard directories
        for part in path.parts:
            if part in DEFAULT_IGNORE_DIRS:
                return True

        # Check against binary file extensions
        if path.is_file() and path.suffix.lower() in DEFAULT_BINARY_EXTENSIONS:
            return True

        # Check if output file itself
        if path.name == self.output_file:
            return True

        # Check gitignore glob patterns
        relative_path = str(path.relative_to(self.root_path)).replace(os.sep, '/')
        for pattern in self.ignore_patterns:
            if fnmatch.fnmatch(relative_path, pattern) or fnmatch.fnmatch(path.name, pattern):
                return True
            # Match directories
            if pattern.endswith('/') and fnmatch.fnmatch(relative_path + '/', pattern):
                return True
                
        return False

    def generate_tree(self, path: Path, prefix="") -> str:
        """Generates a visual directory tree structure."""
        if self.should_ignore(path):
            return ""

        tree_str = ""
        if path == self.root_path:
            tree_str += f"📁 {path.name}/\n"
        else:
            tree_str += f"{prefix}└── {path.name}/\n" if prefix else f"└── {path.name}/\n"

        if path.is_dir():
            try:
                items = sorted(list(path.iterdir()), key=lambda x: (not x.is_dir(), x.name.lower()))
                # Filter out ignored items
                visible_items = [item for item in items if not self.should_ignore(item)]
                
                for i, item in enumerate(visible_items):
                    is_last = (i == len(visible_items) - 1)
                    new_prefix = prefix + ("    " if is_last else "│   ")
                    if item.is_dir():
                        tree_str += self.generate_tree(item, prefix=prefix + "    ")
                    else:
                        tree_str += f"{new_prefix}├── 📄 {item.name}\n"
            except PermissionError:
                tree_str += f"{prefix}    [Permission Denied]\n"
        return tree_str

    def package(self):
        """Processes the repository and generates the Markdown payload."""
        payload_data = []
        file_count = 0
        total_chars = 0

        # Recursively scan files
        for root, dirs, files in os.walk(self.root_path):
            # Prune ignored directories in-place to optimize traversal
            dirs[:] = [d for d in dirs if not self.should_ignore(Path(root) / d)]
            
            for file in files:
                file_path = Path(root) / file
                if self.should_ignore(file_path):
                    continue

                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                        
                    relative_path = file_path.relative_to(self.root_path)
                    total_chars += len(content)
                    file_count += 1
                    
                    # Detect extension for markdown formatting
                    ext = file_path.suffix.lstrip('.')
                    if ext == 'py': ext = 'python'
                    elif ext in ['js', 'jsx']: ext = 'javascript'
                    elif ext in ['ts', 'tsx']: ext = 'typescript'
                    
                    file_payload = f"### File: {relative_path}\n"
                    file_payload += f"```{ext}\n"
                    file_payload += content
                    if not content.endswith('\n'):
                        file_payload += "\n"
                    file_payload += "```\n\n"
                    
                    payload_data.append(file_payload)
                except Exception as e:
                    print(f"Skipping {file}: {e}")

        # Construct final Markdown file
        approx_tokens = int(total_chars / 4) # Standard linguistic approximation (4 chars per token)
        
        with open(self.root_path / self.output_file, 'w', encoding='utf-8') as out:
            out.write("# Codebase Context Capsule\n")
            out.write(f"Generated on: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            out.write(f"Total Files Packaged: {file_count}\n")
            out.write(f"Estimated Token Count: ~{approx_tokens:,} tokens\n\n")
            
            out.write("## Directory Tree Overview\n")
            out.write("```text\n")
            out.write(self.generate_tree(self.root_path))
            out.write("```\n\n")
            
            out.write("## Codebase Context Payload\n")
            out.write("Below is the raw source code of the files in this project.\n\n")
            out.write("".join(payload_data))

        print(f"🎉 Success! Context capsule compiled to: {self.output_file}")
        print(f"📦 Files Packaged: {file_count}")
        print(f"🧠 Estimated Token Count: ~{approx_tokens:,} tokens")

def main():
    parser = argparse.ArgumentParser(description="Package a project directory into an structured LLM-friendly Markdown file.")
    parser.add_argument("dir", nargs="?", default=".", help="Root directory of the project (default: current directory)")
    parser.add_argument("-o", "--output", help="Output file path (default: codebase_context.md)")
    parser.add_argument("-i", "--ignore", nargs="*", help="Additional patterns to ignore (space-separated)")
    args = parser.parse_args()

    packager = ContextPress(args.dir, output_file=args.output, custom_ignores=args.ignore)
    packager.package()

if __name__ == "__main__":
    main()
