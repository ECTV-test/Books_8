#!/usr/bin/env python3
"""Generate books/index.json from books/*/book.json.

Usage:
  python3 tools/build_index.py

This script is NOT run automatically.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BOOKS_DIR = ROOT / "books"
OUT = BOOKS_DIR / "index.json"

KEEP = ["id", "series", "title_ua", "title_en", "level", "durationMin", "cover"]

items = []
if BOOKS_DIR.exists():
  for book_dir in sorted(BOOKS_DIR.iterdir()):
    if not book_dir.is_dir():
      continue
    book_json = book_dir / "book.json"
    if not book_json.exists():
      continue
    data = json.loads(book_json.read_text(encoding="utf-8"))
    item = {k: data.get(k) for k in KEEP if k in data}
    # fallback id from folder name
    item.setdefault("id", book_dir.name)
    items.append(item)

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote {OUT} ({len(items)} books)")
