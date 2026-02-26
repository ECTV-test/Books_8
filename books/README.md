# Books — як додавати книги

Ця папка містить:
- `index.json` — каталог (використовується для меню/бібліотеки; один запит)
- `/<bookId>/` — папка конкретної книги

## 1) Структура книги

```text
books/<bookId>/
  book.json           # метадані (обов’язково)
  book.txt            # текст оригіналу (обов’язково)
  cover.jpg|png       # обкладинка (рекомендовано)
  book.ru.txt         # переклад (опційно)
  book.pl.txt
  book.de.txt
  ...
  desc.en.txt         # опис для UI-мови (опційно)
  desc.uk.txt
  desc.ru.txt
  ...
  images/             # (опційно) ілюстрації/картинки
```

### Важливо про рядки
Усі файли `book.<lang>.txt` повинні мати **однакову кількість рядків** з `book.txt`.
Це критично для синхронного відображення “рядок‑в‑рядок” і для прогресу.

## 2) book.json — рекомендований мінімальний шаблон

```json
{
  "id": "invisible-sandwich",
  "author": "English Club TV Group",
  "series": "NEW",
  "cover": "cover.jpg",
  "textFile": "book.txt",

  "title_en": "The Invisible Sandwich",
  "title_uk": "Невидимий сендвіч",
  "title_ru": "Невидимый сэндвич",
  "title_pl": "Niewidzialna kanapka",
  "title_de": "Das unsichtbare Sandwich",
  "title_es": "El sándwich invisible",
  "title_fr": "Le sandwich invisible",
  "title_it": "Il Panino Invisibile",
  "title_pt": "O Sanduíche Invisível"
}
```

### Про `title_<lang>`
- Назва книги в UI береться по **мові інтерфейсу**: `title_<uiLang>`.
- Якщо `title_<uiLang>` нема — fallback на `title_en` (або інший доступний).

> Старий ключ `title_ua` (ua) більше не додаємо в нові книги. Стандарт — `title_uk`.

## 3) Опис книги: `desc.<lang>.txt`

Логіка завантаження опису:
1) `desc.<uiLang>.txt` (наприклад `desc.uk.txt`)
2) fallback: `desc.en.txt`
3) fallback: поле `description` з `book.json` (якщо воно взагалі є)

Рекомендація: тримати описи в `desc.*.txt`, а не в `book.json`.

## 4) Переклади: `book.<lang>.txt`
Додаток автоматично шукає файл перекладу за правилом:
- `book.<lang>.txt` (наприклад `book.pl.txt`)
- якщо файла немає → береться `book.txt` (fallback на оригінал)

У `book.json` не треба перелічувати файли перекладу — достатньо конвенції імен.

## 5) Оновлення каталогу: index.json
Після додавання/зміни книги обов’язково згенеруй новий `books/index.json`:

```bash
python3 tools/build_index.py
```

`index.json` потрібен для швидкого меню (один запит замість fetch до кожної книги).

## 6) Ілюстрації (майбутнє)
Можна вже зараз класти картинки в `books/<id>/images/…` — це нічого не ламає.
Щоб **показувати** картинки всередині тексту, потрібна домовленість про маркери (буде реалізовано окремо).

## 7) Рівні (A1/A2/B1)
Поточна версія додатку використовує selector “Рівень”, але реально працює як “Original”.
Файли типу `book.a1.txt` / `book.a2.txt` ще не підключені в коді.
Коли будемо додавати рівні, найменш ризиковий шлях:
- або окремі bookId для кожного рівня,
- або правило імен файлів (`book.a1.txt`) + мінімальна правка завантаження.
