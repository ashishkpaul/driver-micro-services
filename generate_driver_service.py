#!/usr/bin/env python3
"""
Driver Microservice Project Generator
Compatible with fish shell
Parses driver-microservices-project-code.txt exactly
"""

import os
import re
import sys
from pathlib import Path

FILE_MARKER = "// 📄 "

def extract_files(text: str):
    """
    Extract (filepath, content) pairs from markdown-style code blocks.
    Handles language-tagged blocks and emoji markers.
    """
    files = []

    # Match ```lang? \n ... ```
    blocks = re.findall(
        r"```(?:[a-zA-Z0-9]+)?\n(.*?)```",
        text,
        re.DOTALL
    )

    for block in blocks:
        lines = block.splitlines()

        if not lines:
            continue

        if not lines[0].startswith(FILE_MARKER):
            continue

        file_path = lines[0].replace(FILE_MARKER, "").strip()
        content = "\n".join(lines[1:]).rstrip() + "\n"

        files.append((file_path, content))

    return files


def write_files(files):
    for path, content in files:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(f"✅ Created: {path}")


def main():
    if len(sys.argv) != 2:
        print("Usage:")
        print("  python3 generate_driver_service.py driver-microservices-project-code.txt")
        sys.exit(1)

    source_file = Path(sys.argv[1])

    if not source_file.exists():
        print(f"❌ File not found: {source_file}")
        sys.exit(1)

    text = source_file.read_text(encoding="utf-8")

    files = extract_files(text)

    if not files:
        print("❌ No files found — check file markers (// 📄)")
        sys.exit(1)

    print(f"📦 Found {len(files)} files\n")

    write_files(files)

    project_root = files[0][0].split("/")[0]

    print("\n" + "=" * 60)
    print("🚀 PROJECT GENERATED SUCCESSFULLY!")
    print("=" * 60)
    print(f"📁 Project Root: {Path(project_root).resolve()}")
    print(f"⚡ Next:")
    print(f"   cd {project_root}")
    print(f"   npm install")
    print(f"   docker-compose up --build")
    print("=" * 60)


if __name__ == "__main__":
    main()
