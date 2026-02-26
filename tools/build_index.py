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

# Keep a stable minimal set, plus any title_* keys (so UI-language titles can render from index.json)
BASE_KEEP = ["id", "series", "author", "level", "durationMin", "cover"]

items = []
if BOOKS_DIR.exists():
  for book_dir in sorted(BOOKS_DIR.iterdir()):
    if not book_dir.is_dir():
      continue
    book_json = book_dir / "book.json"
    if not book_json.exists():
      continue
    data = json.loads(book_json.read_text(encoding="utf-8"))

    item = {}
    # base fields (if present)
    for k in BASE_KEEP:
      if k in data:
        item[k] = data.get(k)

    # all localized titles
    for k, v in (data or {}).items():
      if isinstance(k, str) and k.startswith("title_") and v is not None:
        item[k] = v

    # fallback id from folder name
    item.setdefault("id", book_dir.name)
    items.append(item)

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote {OUT} ({len(items)} books)")
