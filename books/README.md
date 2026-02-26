Books folder format

Each book lives in its own folder: /books/<bookId>/

Required files:
- book.json   (metadata)
- book.txt    (source text, line-based)

Optional translation text files (same line breaks as book.txt):
- book.uk.txt, book.ru.txt, book.pl.txt, book.de.txt, book.es.txt, book.fr.txt, book.it.txt, book.pt.txt ...

Optional description files (UI language dependent):
- desc.en.txt, desc.uk.txt, desc.ru.txt, desc.pl.txt, desc.de.txt, desc.es.txt, desc.fr.txt, desc.it.txt, desc.pt.txt

How descriptions are loaded:
1) desc.<uiLang>.txt (or desc.ua.txt for Ukrainian)
2) desc.en.txt
3) fallback to description fields inside book.json

Notes:
- Keep desc.*.txt as plain text. You may use new lines; the app will render them as line breaks.
- If a file is missing, the app will automatically fall back; nothing breaks.
