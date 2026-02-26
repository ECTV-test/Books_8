(function(){
  function showCrash(title, msg, stack){
    try{
      var el=document.getElementById('app_crash_overlay');
      if(!el){
        el=document.createElement('div');
        el.id='app_crash_overlay';
        el.style.cssText='position:fixed;inset:0;z-index:999999;background:#0b0b0f;color:#fff;padding:16px;overflow:auto;font:14px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;';
        document.body.appendChild(el);
      }
      el.innerHTML='';
      var h=document.createElement('div');
      h.style.cssText='font-size:16px;font-weight:700;margin-bottom:10px;';
      h.textContent=title||'App crashed';
      var p=document.createElement('pre');
      p.style.cssText='white-space:pre-wrap;word-break:break-word;background:rgba(255,255,255,.06);padding:12px;border-radius:10px;';
      p.textContent=(msg||'') + (stack?"\n\n"+stack:'');
      el.appendChild(h);
      el.appendChild(p);
    }catch(e){}
  }
  window.addEventListener('error', function(ev){
    try{ showCrash('JS Error', String(ev.message||ev.error||'Unknown error'), ev.error && ev.error.stack ? String(ev.error.stack) : ''); }catch(e){}
  });
  window.addEventListener('unhandledrejection', function(ev){
    try{ var r=ev.reason; showCrash('Unhandled Promise Rejection', String(r && (r.message||r) || 'Unknown rejection'), r && r.stack ? String(r.stack) : ''); }catch(e){}
  });
})();

/* ===========================
   LibreTranslate (public)
=========================== */
const LIBRETRANSLATE_URL = "https://libretranslate.com/translate";
/* Если у тебя будет ключ — вставишь сюда. Иначе оставь "" */
const LIBRETRANSLATE_API_KEY = "";

/* ===========================
   Cloudflare Worker endpoints
   (keep OpenAI key ONLY in Worker secrets)
=========================== */
// Example: "https://your-worker.your-subdomain.workers.dev/translate"
const WORKER_TRANSLATE_URL = "https://books-4git-hab.englishclubsales.workers.dev/translate";
// Example: "https://your-worker.your-subdomain.workers.dev/tts"
const WORKER_TTS_URL = "https://books-4git-hab.englishclubsales.workers.dev/tts";

/* 6 языков (обязательно RU+UK) */
const TARGET_LANGS = [
  { code:"en", label:"English (EN)" },
{ code:"uk", label:"Українська (UK)" },
  { code:"ru", label:"Русский (RU)" },
  { code:"pl", label:"Polski (PL)" },
  { code:"de", label:"Deutsch (DE)" },
  { code:"es", label:"Español (ES)" },
  { code:"fr", label:"Français (FR)" },
  { code:"it", label:"Italiano (IT)" },
  { code:"pt", label:"Português (PT)" }
];

const LEVELS = [
  { code:"original", label:"Original" },
  { code:"A1", label:"A1" },
  { code:"A2", label:"A2" },
  { code:"B1", label:"B1" },
];

function formatLevelLabel(code){
  const c = String(code||"original").trim();
  // "Original" is a UI string and must follow interface language.
  if(c.toLowerCase()==="original") return (typeof t==="function" ? t("level_original") : "Original");
  const found = LEVELS.find(x => String(x.code).toLowerCase() === c.toLowerCase());
  if(found) return found.label || found.code;
  return c.toUpperCase();
}

function normalizeLevel(x){
  const v = String(x||"original").trim();
  if(!v) return "original";
  const up = v.toUpperCase();
  if(up==="A1"||up==="A2"||up==="B1") return up;
  return "original";
}

/* Мови книги (оригіналу) */
function uniqLangs(list){
  const seen = new Set();
  return (list||[]).filter(it=>{
    if(!it || !it.code) return false;
    const c = String(it.code).toLowerCase();
    if(seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

const SOURCE_LANGS = uniqLangs([
  { code:"en", label:"English (EN)" },
  ...TARGET_LANGS
]);

// Flags for language picker UI
const FLAG_BY_LANG = {
  en: "🇬🇧",
  uk: "🇺🇦",
  ru: "🇷🇺",
  pl: "🇵🇱",
  de: "🇩🇪",
  es: "🇪🇸",
  fr: "🇫🇷",
  it: "🇮🇹",
  pt: "🇵🇹"
};
function flagFor(code){
  return FLAG_BY_LANG[code] || "🏳️";
}

function formatPkgLabel(sourceLang, targetLang, mode){
  const src = String(sourceLang||"").toLowerCase();
  const trg = String(targetLang||"").toLowerCase();
  const m = String(mode||"").toLowerCase();
  // use global i18n translator t()
  const modeLabel = (typeof t === "function") ? t(m==="listen" ? "mode_listen" : "mode_read") : (m==="listen" ? "Listen" : "Read");
  return `${flagFor(src)} ${src.toUpperCase()}→${flagFor(trg)} ${trg.toUpperCase()} (${modeLabel})`;
}


/* Мапа коду -> locale для browser TTS */
const LANG_LOCALE = {
  en: "en-US",
  uk: "uk-UA",
  ru: "ru-RU",
  pl: "pl-PL",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR"
};
function langToLocale(code){
  return LANG_LOCALE[code] || "en-US";
}


/* OpenAI built-in TTS voices */
const OPENAI_TTS_VOICES = [
  {id:"alloy", gender:"male"},
  {id:"ash", gender:"male"},
  {id:"ballad", gender:"male"},
  {id:"coral", gender:"female"},
  {id:"echo", gender:"male"},
  {id:"fable", gender:"male"},
  {id:"onyx", gender:"male"},
  {id:"nova", gender:"female"},
  {id:"sage", gender:"male"},
  {id:"shimmer", gender:"female"},
  {id:"verse", gender:"male"}
];

/* ===========================
   Books loading:
   /books/index.json
   /books/<id>/book.json
   Fallback-book is embedded.
=========================== */
const BOOKS_INDEX_URL = "books/index.json";

/* --------- Fallback book (твоя книга остается) --------- */
const FALLBACK_BOOKS = [
  {
    id: "invisible-sandwich",
    series: "NEW",
    title_ua: "The Invisible Sandwich",
    title_en: "The Invisible Sandwich",
    level: "A1 English Learners",
    narrator: "Диктор",
    durationMin: 12,
    sourceLang: "en",
    cover: "https://picsum.photos/seed/invisible-sandwich/800/900",
    description:
`The Invisible Sandwich

Уровень - A1 English Learners

Enjoy a fun and simple English story made especially for A1 level learners.
The Invisible Sandwich is a short audio book with clear text and easy vocabulary. It is perfect for beginners who want to read and listen at the same time.
In this story, Tim makes a very strange sandwich. When he comes back to eat it, the sandwich is gone! Tim looks everywhere and becomes a Sandwich Detective. Step by step, he follows clues and tries to solve the mystery.`,
    text: [
      "The Invisible Sandwich",
      "Chapter 1: The Best Sandwich",
      "Tim is hungry, so he goes to the kitchen.",
      "“I want a big sandwich!” he says.",
      "He gets some bread and adds cheese, tomato, and lettuce.",
      "The end."
    ]
  }
];

/* ---------------------------
   State
--------------------------- */
const state = {
  route: { name:"catalog", bookId:null },
  navStack: [],
  catalog: [],
  bookCache: new Map(),
  book: null,
  dev: {
    enabled: true,       // set false to hide dev menu completely
    open: false,

    // Providers
    translationProvider: "openai", // "openai" | "libre" (READ mode line translation + swap)
    ttsProvider: "openai",

    // TTS defaults
    ttsGender: "male",             // "male" | "female"
    ttsVoice: "onyx",              // OpenAI built-in voice
    ttsInstructions: "Deep calm narrator. Slow pace. Warm tone. Clear articulation. Pause briefly between sentences and a longer pause between paragraphs. Avoid sounding robotic.",
    speakTranslated: false,

    // Worker cache controls
    noCache: false
  },

  reading: {
    isPlaying:false,
    // TTS speed multiplier (OpenAI)
    speed: 1.0,
    fontSize: 22,
    showTranslation: true,
    lineTranslation: true,
    // READ mode: when true, translation becomes "primary" line
    swapLang: false,
    // LISTEN mode: what to speak: "source" | "target"
    listenLang: "source",
    night: false,
    highlight: true,
    highlightTheme: "default",
    targetLang: "uk",
    sourceLang: "en",
    listenMode: "original", // original | translation
    level: "original", // original | A1 | A2 | B1

    progress: 0,
    activeTokenIndex: -1,
    tokenMap: [],
    wordCount: 0,
    timer: null,

    // translation protection
    translateCache: new Map(),
    inFlight: false,
    lastReqAt: 0,
    cooldownUntil: 0
  }
};


/* ---------------------------
   UI language / i18n (stage 1)
--------------------------- */
const UI_STR = {
  en: {
    tabs_books: "Books",
    tabs_library: "My Library",
    lib_in_progress: "In progress",
    lib_finished: "Finished",
    lib_bookmarks: "Bookmarks",
    btn_back: "Back",
    btn_all: "All",
    all_bookmarks_title: "All bookmarks",
    btn_play_from_here: "Play from here",
    settings_title: "Settings",
    settings_text: "Text",
    settings_audio: "Audio",
    ui_lang_label: "Interface language",
    ui_lang_hint: "",
    bookmark: "Bookmark",
    speak: "Speak",
    modal_continue: "Continue from last stop",
    modal_start_bookmark: "Start from bookmark",
    modal_cancel: "Cancel",
    continue_reading: "Continue reading",
    genre_fantasy: "Fantasy",
    genre_detectives: "Detectives",
    genre_science: "Science",
    genre_romance: "Romance",
    genre_history: "History",
    genre_kids: "Kids",
    details_btn_read: "Read",
    details_btn_listen: "Listen",
    details_level: "Level",
    details_book_lang: "Book language",
    details_trans_lang: "Translation language",
    start_playback_title: "Start playback",
    start_playback_desc: "You opened a bookmark. Where should we start?",
    bookmarks_all: "All",
    ui_language: "Interface language",
    ui_language_hint: "",
    settings_tab_text: "Text",
    settings_tab_audio: "Audio",
    mode_listen: "Listen",
    mode_read: "Read",
    level_original: "Original",
    pages: "pages",
    admin_title: "Dev / Admin",
    admin_translation_provider: "Translation provider",
    admin_translation_provider_hint: "for line translations",
    admin_voice_gender: "Voice gender",
    admin_voice_gender_hint: "male / female",
    admin_voice: "Voice",
    admin_voice_hint: "built-in OpenAI",
    admin_voice_prompt: "Voice prompt",
    admin_voice_prompt_hint: "instructions",
    admin_no_cache: "No cache",
    admin_no_cache_hint: "ignore Worker cache",
    admin_clear_tts_cache: "Clear TTS cache",
        chapters_title: "Chapters",
    btn_close: "Close",
    no_chapters: "No chapters in this book.",
admin_clear_tr_cache: "Clear translation cache",
  
    translation_lang_label: "Translation language",
    translation_lang_hint: "LibreTranslate target",
    font_size_label: "Text size",
    font_size_hint: "A− / A+",
    hl_color_label: "Highlight color",
    hl_color_hint: "Default / Yellow",
    tap_translate_label: "Translation",
    tap_translate_hint: "on tap / click",
    line_translate_label: "Line translation",
    line_translate_hint: "show under text",
    theme_label: "Theme",
    theme_hint: "night mode",
    active_row_label: "Highlight",
    active_row_hint: "active row",
    swap_lang_label: "Swap languages",
    swap_lang_hint: "Read mode only",
    voice_gender_label: "Voice gender",
    voice_gender_hint: "male / female",
    male: "Male",
    female: "Female",
    speed_label: "Reading speed",
    slow: "Slow",
    normal: "Normal",
    fast: "Fast",
    normal_speed_hint: "Normal speed is your current value (100).",
    close: "Close",
    dev_clear_tts: "🧹 Clear voice cache",
    dev_clear_tr: "🧹 Clear translation cache",
    no_cache_label: "No cache",
    no_cache_hint: "ignore Worker cache",
    voice_label: "Voice",
    voice_hint: "built-in OpenAI",
    voice_prompt_label: "Voice prompt",
    voice_prompt_hint: "instructions",
    translation_provider_label: "Translation provider",
    translation_provider_hint: "for line translation",
    dev_hint_1: "Translation: LibreTranslate (public service). If you see 429 — that’s a limit. The code pauses and asks you to wait.",
    dev_hint_2: "For security, the OpenAI key is stored in Worker (secret). GitHub Pages stays static.",
    hl_color_default: "Default",
    hl_color_yellow: "Yellow",
    all_bookmarks_title: "All bookmarks",
},
  uk: {
    tabs_books: "Книги",
    tabs_library: "Моя бібліотека",
    lib_in_progress: "В процесі",
    lib_finished: "Завершено",
    lib_bookmarks: "Закладки",
    btn_back: "Назад",
    btn_all: "Усі",
    all_bookmarks_title: "Усі закладки",
    btn_play_from_here: "Грати звідси",
    settings_title: "Налаштування",
    settings_text: "Текст",
    settings_audio: "Аудіо",
    ui_lang_label: "Мова інтерфейсу",
    ui_lang_hint: "",
    bookmark: "Закладка",
    speak: "Озвучити",
    modal_continue: "Продовжити з місця зупинки",
    modal_start_bookmark: "Почати із закладки",
    modal_cancel: "Скасувати",
    continue_reading: "Продовжити читання",
    genre_fantasy: "Фентезі",
    genre_detectives: "Детективи",
    genre_science: "Наука",
    genre_romance: "Романтика",
    genre_history: "Історія",
    genre_kids: "Дитяче",
    details_btn_read: "Читати",
    details_btn_listen: "Слухати",
    details_level: "Рівень",
    details_book_lang: "Мова книги",
    details_trans_lang: "Мова перекладу",
    start_playback_title: "Почати відтворення",
    start_playback_desc: "Ви відкрили закладку. Звідки почати?",
    bookmarks_all: "Усі",
    ui_language: "Мова інтерфейсу",
    ui_language_hint: "",
    settings_tab_text: "Текст",
    settings_tab_audio: "Аудіо",
    mode_listen: "Слухати",
    mode_read: "Читати",
    level_original: "Оригінал",
    pages: "стор.",
    admin_title: "Dev / Адмін",
    admin_translation_provider: "Провайдер перекладу",
    admin_translation_provider_hint: "для перекладу рядків",
    admin_voice_gender: "Стать голосу",
    admin_voice_gender_hint: "чоловічий / жіночий",
    admin_voice: "Голос",
    admin_voice_hint: "вбудовані OpenAI",
    admin_voice_prompt: "Промпт голосу",
    admin_voice_prompt_hint: "інструкції",
    admin_no_cache: "Без кешу",
    admin_no_cache_hint: "ігнорувати кеш Worker",
    admin_clear_tts_cache: "Очистити кеш озвучення",
    admin_clear_tr_cache: "Очистити кеш перекладу",
    chapters_title: "Глави",
    btn_close: "Закрити",
    no_chapters: "У цій книзі немає глав.",
  
    translation_lang_label: "Мова перекладу",
    translation_lang_hint: "LibreTranslate target",
    font_size_label: "Розмір тексту",
    font_size_hint: "A− / A+",
    hl_color_label: "Колір підсвітки",
    hl_color_hint: "Звичайна / Жовта",
    tap_translate_label: "Переклад",
    tap_translate_hint: "по кліку / тапу",
    line_translate_label: "Переклад рядком",
    line_translate_hint: "показувати під текстом",
    theme_label: "Тема",
    theme_hint: "нічний режим",
    active_row_label: "Підсвітка",
    active_row_hint: "активний рядок",
    swap_lang_label: "Поміняти мови",
    swap_lang_hint: "лише режим “Читати”",
    voice_gender_label: "Стать голосу",
    voice_gender_hint: "чоловічий / жіночий",
    male: "Чоловічий",
    female: "Жіночий",
    speed_label: "Швидкість читання",
    slow: "Повільно",
    normal: "Нормально",
    fast: "Швидко",
    normal_speed_hint: "Нормальна швидкість — це поточне значення (100).",
    close: "Закрити",
    dev_clear_tts: "🧹 Очистити кеш озвучення",
    dev_clear_tr: "🧹 Очистити кеш перекладу",
    no_cache_label: "Без кешу",
    no_cache_hint: "ігнорувати кеш Worker",
    voice_label: "Голос",
    voice_hint: "вбудовані OpenAI",
    voice_prompt_label: "Промпт голосу",
    voice_prompt_hint: "інструкції",
    translation_provider_label: "Провайдер перекладу",
    translation_provider_hint: "для перекладу рядків",
    dev_hint_1: "Переклад: LibreTranslate (публічний сервіс). Якщо бачиш 429 — це ліміт. Код ставить паузу і просить зачекати.",
    dev_hint_2: "Для безпеки ключ OpenAI зберігається у Worker (secret). GitHub Pages залишається статичним.",
    hl_color_default: "Звичайна",
    hl_color_yellow: "Жовта",
    all_bookmarks_title: "Усі закладки",
},
  ru: {
    tabs_books: "Книги",
    tabs_library: "Моя библиотека",
    lib_in_progress: "В процессе",
    lib_finished: "Завершено",
    lib_bookmarks: "Закладки",
    btn_back: "Назад",
    btn_all: "Все",
    all_bookmarks_title: "Все закладки",
    btn_play_from_here: "Играть отсюда",
    settings_title: "Настройки",
    settings_text: "Текст",
    settings_audio: "Аудио",
    ui_lang_label: "Язык интерфейса",
    ui_lang_hint: "",
    bookmark: "Закладка",
    speak: "Озвучить",
    modal_continue: "Продолжить с места остановки",
    modal_start_bookmark: "Начать с закладки",
    modal_cancel: "Отмена",
    continue_reading: "Продолжить чтение",
    genre_fantasy: "Фэнтези",
    genre_detectives: "Детективы",
    genre_science: "Наука",
    genre_romance: "Романтика",
    genre_history: "История",
    genre_kids: "Детское",
    details_btn_read: "Читать",
    details_btn_listen: "Слушать",
    details_level: "Уровень",
    details_book_lang: "Язык книги",
    details_trans_lang: "Язык перевода",
    start_playback_title: "Начать воспроизведение",
    start_playback_desc: "Вы открыли закладку. Откуда начать?",
    bookmarks_all: "Все",
    ui_language: "Язык интерфейса",
    ui_language_hint: "",
    settings_tab_text: "Текст",
    settings_tab_audio: "Аудио",
    mode_listen: "Слушать",
    mode_read: "Читать",
    level_original: "Оригинал",
    pages: "стр.",
    admin_title: "Dev / Админ",
    admin_translation_provider: "Провайдер перевода",
    admin_translation_provider_hint: "для перевода строк",
    admin_voice_gender: "Пол голоса",
    admin_voice_gender_hint: "мужской / женский",
    admin_voice: "Голос",
    admin_voice_hint: "встроенные OpenAI",
    admin_voice_prompt: "Промпт голоса",
    admin_voice_prompt_hint: "инструкции",
    admin_no_cache: "Без кеша",
    admin_no_cache_hint: "игнорировать кеш Worker",
    admin_clear_tts_cache: "Очистить кеш озвучки",
    admin_clear_tr_cache: "Очистить кеш перевода",
  
    translation_lang_label: "Язык перевода",
    translation_lang_hint: "LibreTranslate target",
    font_size_label: "Размер текста",
    font_size_hint: "A− / A+",
    hl_color_label: "Цвет подсветки",
    hl_color_hint: "Обычная / Жёлтая",
    tap_translate_label: "Перевод",
    tap_translate_hint: "по клику / тапу",
    line_translate_label: "Перевод строкой",
    line_translate_hint: "показывать под текстом",
    theme_label: "Тема",
    theme_hint: "ночной режим",
    active_row_label: "Подсветка",
    active_row_hint: "активная строка",
    swap_lang_label: "Поменять языки",
    swap_lang_hint: "только режим “Читать”",
    voice_gender_label: "Пол голоса",
    voice_gender_hint: "мужской / женский",
    male: "Мужской",
    female: "Женский",
    speed_label: "Скорость чтения",
    slow: "Медленно",
    normal: "Нормально",
    fast: "Быстро",
    normal_speed_hint: "Нормальная скорость — это текущее значение (100).",
    chapters_title: "Главы",
    close: "Закрыть",
    dev_clear_tts: "🧹 Очистить кеш озвучки",
    dev_clear_tr: "🧹 Очистити кеш перевода",
    no_cache_label: "Без кеша",
    no_cache_hint: "игнорировать кеш Worker",
    voice_label: "Голос",
    voice_hint: "встроенные OpenAI",
    voice_prompt_label: "Промпт голоса",
    voice_prompt_hint: "инструкции",
    translation_provider_label: "Провайдер перевода",
    translation_provider_hint: "для перевода строк",
    dev_hint_1: "Перевод: LibreTranslate (публичный сервис). Если видишь 429 — это лимит. Код ставит паузу и просит подождать.",
    dev_hint_2: "Для безопасности ключ OpenAI хранится в Worker (secret). GitHub Pages остаётся статичным.",
    hl_color_default: "Обычная",
    hl_color_yellow: "Жёлтая",
    all_bookmarks_title: "Все закладки",
}
};

function getDefaultUiLang(){
  try{
    const n = (navigator.language||"").toLowerCase();
    if(n.startsWith("uk")) return "uk";
    if(n.startsWith("ru")) return "ru";
  }catch(e){}
  return "en";
}

function getUiLang(){
  try{
    const ls = localStorage.getItem("uiLang");
    if(ls && UI_STR[ls]) return ls;
  }catch(e){}
  return state?.ui?.lang && UI_STR[state.ui.lang] ? state.ui.lang : getDefaultUiLang();
}


function getBookTitle(book){
  if(!book) return "Book";
  const uiLang = (typeof getUiLang==="function" ? getUiLang() : "en");
  const keys = [];
  // exact match for UI language
  keys.push("title_" + uiLang);

  // legacy mapping (some older data used title_ua for Ukrainian)
  if(uiLang === "uk") keys.push("title_ua");

  // common fallbacks
  keys.push("title_en");
  keys.push("title_ua");

  for(const k of keys){
    const v = book[k];
    if(typeof v === "string" && v.trim()) return v.trim();
  }

  // any title_*
  try{
    for(const k in book){
      if(k && k.startsWith("title_")){
        const v = book[k];
        if(typeof v === "string" && v.trim()) return v.trim();
      }
    }
  }catch(e){}

  // last resort
  const v = book.title;
  return (typeof v === "string" && v.trim()) ? v.trim() : "Book";
}


function formatMetaAuthorSeries(b){
  try{
    const author = String((b && b.author) ? b.author : "").trim();
    const series = String((b && b.series) ? b.series : "").trim();
    if(author && series) return `${author} • ${series}`;
    return author || series || "";
  }catch(e){
    return "";
  }
}


function t(key, vars){
  const lang = getUiLang();
  const dict = UI_STR[lang] || UI_STR.en;
  let s = dict[key] ?? UI_STR.en[key] ?? key;
  if(vars && typeof vars === "object"){
    for(const k in vars){
      s = s.replaceAll("{"+k+"}", String(vars[k]));
    }
  }
  return s;
}

function tGenre(name){
  const raw = String(name||"").trim();
  if(!raw) return raw;
  const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g,"");
  const key = "genre_" + slug;
  const lang = getUiLang();
  const dict = UI_STR[lang] || UI_STR.en;
  if(dict && dict[key]) return dict[key];
  // common uppercase names like FANTASY / DETECTIVES
  // try also without underscores
  return raw;
}


function setUiLang(lang){
  if(!UI_STR[lang]) lang = "en";
  state.ui = state.ui || {};
  state.ui.lang = lang;
  try{ localStorage.setItem("uiLang", lang); }catch(e){}
  applyUiLang();
  try{ go(state.route); }catch(e){ try{ renderLibrary?.(); }catch(e2){} }
}

function applyUiLang(){
  const lang = getUiLang();
  try{ document.documentElement.lang = lang; }catch(e){}

  // Popover
  try{
    const btn = document.getElementById("popPlayFromHere");
    if(btn) btn.textContent = t("btn_play_from_here");
    if(btn) btn.title = t("btn_play_from_here");
  }catch(e){}
  try{
    const b = document.getElementById("popBookmark");
    if(b) b.title = t("bookmark");
    const s = document.getElementById("popSpeak");
    if(s) s.title = t("speak");
  }catch(e){}

  // Settings sheet static labels
  try{
    const st = document.querySelector("#settings .setTitle");
    if(st) st.textContent = t("settings_title");
    const tr = document.getElementById("setTabRead");
    if(tr) tr.textContent = t("settings_text");
    const tl = document.getElementById("setTabListen");
    if(tl) tl.textContent = t("settings_audio");
  }catch(e){}

  // UI language row
  try{
    const lbl = document.getElementById("uiLangLabel");
    if(lbl) lbl.textContent = t("ui_lang_label");
    const hint = document.getElementById("uiLangHint");
    if(hint){ const hTxt = t("ui_lang_hint"); hint.textContent = hTxt || ""; hint.style.display = hTxt ? "" : "none"; }
    const sel = document.getElementById("uiLangSelect");
    if(sel) sel.value = lang;
  }catch(e){}
  // Settings sheet rows (static HTML)
  try{
    const rowTarget = document.getElementById("targetLang")?.closest(".row");
    if(rowTarget){
      const b=rowTarget.querySelector("b"); if(b) b.textContent = t("translation_lang_label");
      const sm=rowTarget.querySelector("small"); if(sm) sm.textContent = t("translation_lang_hint");
    }

    const rowFont = document.getElementById("fontMinus")?.closest(".row");
    if(rowFont){
      const b=rowFont.querySelector("b"); if(b) b.textContent = t("font_size_label");
      const sm=rowFont.querySelector("small"); if(sm) sm.textContent = t("font_size_hint");
    }

    const rowHl = document.getElementById("hlDefault")?.closest(".row");
    if(rowHl){
      const b=rowHl.querySelector("b"); if(b) b.textContent = t("hl_color_label");
      const sm=rowHl.querySelector("small"); if(sm) sm.textContent = t("hl_color_hint");
    }

    // Highlight color toggle labels
    if(rowHl){
      const btns = rowHl.querySelectorAll("button");
      if(btns && btns.length>=2){
        btns[0].textContent = t("hl_color_default");
        btns[1].textContent = t("hl_color_yellow");
      }
    }

    const rowTap = document.getElementById("tTranslation")?.closest(".row");
    if(rowTap){
      const b=rowTap.querySelector("b"); if(b) b.textContent = t("tap_translate_label");
      const sm=rowTap.querySelector("small"); if(sm) sm.textContent = t("tap_translate_hint");
    }

    const rowLine = document.getElementById("tLineTranslation")?.closest(".row");
    if(rowLine){
      const b=rowLine.querySelector("b"); if(b) b.textContent = t("line_translate_label");
      const sm=rowLine.querySelector("small"); if(sm) sm.textContent = t("line_translate_hint");
    }

    const rowTheme = document.getElementById("tNight")?.closest(".row");
    if(rowTheme){
      const b=rowTheme.querySelector("b"); if(b) b.textContent = t("theme_label");
      const sm=rowTheme.querySelector("small"); if(sm) sm.textContent = t("theme_hint");
    }

    const rowHi = document.getElementById("tHighlight")?.closest(".row");
    if(rowHi){
      const b=rowHi.querySelector("b"); if(b) b.textContent = t("active_row_label");
      const sm=rowHi.querySelector("small"); if(sm) sm.textContent = t("active_row_hint");
    }

    const rowSwap = document.getElementById("tSwap")?.closest(".row");
    if(rowSwap){
      const b=rowSwap.querySelector("b"); if(b) b.textContent = t("swap_lang_label");
      const sm=rowSwap.querySelector("small"); if(sm) sm.textContent = t("swap_lang_hint");
    }

    const rowUG = document.getElementById("uMale")?.closest(".row");
    if(rowUG){
      const b=rowUG.querySelector("b"); if(b) b.textContent = t("voice_gender_label");
      const sm=rowUG.querySelector("small"); if(sm) sm.textContent = t("voice_gender_hint");
    }
    const uMale = document.getElementById("uMale");
    const uFemale = document.getElementById("uFemale");
    if(uMale) uMale.textContent = t("male");
    if(uFemale) uFemale.textContent = t("female");

    const rowSpeed = document.getElementById("uSpeedSlow")?.closest(".row");
    if(rowSpeed){
      const b=rowSpeed.querySelector("b"); if(b) b.textContent = t("speed_label");
    }
    const uSpeedSlow = document.getElementById("uSpeedSlow");
    const uSpeedNormal = document.getElementById("uSpeedNormal");
    const uSpeedFast = document.getElementById("uSpeedFast");
    if(uSpeedSlow) uSpeedSlow.textContent = t("slow");
    if(uSpeedNormal) uSpeedNormal.textContent = t("normal");
    if(uSpeedFast) uSpeedFast.textContent = t("fast");

    const hint = document.querySelector("#settings #setPaneListen .hint");
    if(hint) hint.textContent = t("normal_speed_hint");
  }catch(e){}

  // Dev panel static labels
  try{
    const dp = document.getElementById("devPanel");
    if(dp){
      const st = dp.querySelector(".setTitle");
      if(st) st.textContent = t("admin_title");
    }
    const rowProv = document.getElementById("provLibre")?.closest(".row");
    if(rowProv){
      const b=rowProv.querySelector("b"); if(b) b.textContent = t("translation_provider_label");
      const sm=rowProv.querySelector("small"); if(sm) sm.textContent = t("translation_provider_hint");
    }

    const rowVG = document.getElementById("vMale")?.closest(".row");
    if(rowVG){
      const b=rowVG.querySelector("b"); if(b) b.textContent = t("voice_gender_label");
      const sm=rowVG.querySelector("small"); if(sm) sm.textContent = t("voice_gender_hint");
    }
    const vMale = document.getElementById("vMale");
    const vFemale = document.getElementById("vFemale");
    if(vMale) vMale.textContent = t("male");
    if(vFemale) vFemale.textContent = t("female");

    const rowVoice = document.getElementById("ttsVoiceSelect")?.closest(".row");
    if(rowVoice){
      const b=rowVoice.querySelector("b"); if(b) b.textContent = t("voice_label");
      const sm=rowVoice.querySelector("small"); if(sm) sm.textContent = t("voice_hint");
    }

    const rowPrompt = document.getElementById("ttsInstructions")?.closest(".row");
    if(rowPrompt){
      const b=rowPrompt.querySelector("b"); if(b) b.textContent = t("voice_prompt_label");
      const sm=rowPrompt.querySelector("small"); if(sm) sm.textContent = t("voice_prompt_hint");
    }

    const rowNoCache = document.getElementById("tNoCache")?.closest(".row");
    if(rowNoCache){
      const b=rowNoCache.querySelector("b"); if(b) b.textContent = t("no_cache_label");
      const sm=rowNoCache.querySelector("small"); if(sm) sm.textContent = t("no_cache_hint");
    }

    const btnCT = document.getElementById("btnClearTts");
    const btnCR = document.getElementById("btnClearTr");
    if(btnCT) btnCT.textContent = t("dev_clear_tts");
    if(btnCR) btnCR.textContent = t("dev_clear_tr");

    const hint = document.querySelector("#devPanel .hint");
    if(hint){
      hint.innerHTML = t("dev_hint_1") + "<br/><br/>" + t("dev_hint_2");
    }
  }catch(e){}

  // Chapters sheet labels
  try{
    const ct = document.getElementById("chaptersTitle");
    if(ct) ct.textContent = t("chapters_title");
    const cc = document.getElementById("chaptersClose");
    if(cc) cc.textContent = t("close");
  }catch(e){}

}

document.addEventListener("change", function(ev){
  try{
    const tEl = ev.target;
    if(tEl && tEl.id === "uiLangSelect"){
      setUiLang(tEl.value);
    }
  }catch(e){}
});



/* ===========================
   v8 Core (single source of truth for progress/pkg/level)
   Core is DOM-free. UI only calls core methods.
=========================== */
const core = (window.createCoreV8 ? window.createCoreV8({ storage: localStorage }) : null);


const app = document.getElementById("app");
applyUiLang();

const player = document.getElementById("player");
const pTitle = document.getElementById("pTitle");
const pPct = document.getElementById("pPct");
const pFill = document.getElementById("pFill");
const btnPlay = document.getElementById("btnPlay");
const btnBack = document.getElementById("btnBack");
const btnStart = document.getElementById("btnStart");
const btnChapters = document.getElementById("btnChapters");
const chaptersSheet = document.getElementById("chaptersSheet");
const chaptersList = document.getElementById("chaptersList");
const chaptersClose = document.getElementById("chaptersClose");
const modeListen = document.getElementById("modeListen");
const modeRead = document.getElementById("modeRead");

const settings = document.getElementById("settings");
const setClose = document.getElementById("setClose");
const fontMinus = document.getElementById("fontMinus");
const fontPlus = document.getElementById("fontPlus");
const speed = document.getElementById("speed");
const speedLabel = document.getElementById("speedLabel");
const tTranslation = document.getElementById("tTranslation");
const rowTapTranslate = document.getElementById("rowTapTranslate");
const rowLineTranslate = document.getElementById("rowLineTranslate");
const tLineTranslation = document.getElementById("tLineTranslation");
const tNight = document.getElementById("tNight");
const tHighlight = document.getElementById("tHighlight");
const hlDefault = document.getElementById("hlDefault");
const hlYellow = document.getElementById("hlYellow");
const targetLangSelect = document.getElementById("targetLang");

// Sheets
const sheetBackdrop = document.getElementById("sheetBackdrop");
const setTabRead = document.getElementById("setTabRead");
const setTabListen = document.getElementById("setTabListen");
const setPaneRead = document.getElementById("setPaneRead");
const setPaneListen = document.getElementById("setPaneListen");
const uMale = document.getElementById("uMale");
const uFemale = document.getElementById("uFemale");
const uSpeedSlow = document.getElementById("uSpeedSlow");
const uSpeedNormal = document.getElementById("uSpeedNormal");
const uSpeedFast = document.getElementById("uSpeedFast");


// Dev panel
const devPanel = document.getElementById("devPanel");
const devClose = document.getElementById("devClose");
const provLibre = document.getElementById("provLibre");
const provOpenAI = document.getElementById("provOpenAI");
const vMale = document.getElementById("vMale");
const vFemale = document.getElementById("vFemale");
const ttsVoiceSelect = document.getElementById("ttsVoiceSelect");
const tSwap = document.getElementById("tSwap");
const ttsInstructions = document.getElementById("ttsInstructions");
const tNoCache = document.getElementById("tNoCache");
const btnClearTts = document.getElementById("btnClearTts");
const btnClearTr = document.getElementById("btnClearTr");

const popover = document.getElementById("popover");
const popWord = document.getElementById("popWord");
const popTrans = document.getElementById("popTrans");
const popPlayFromHere = document.getElementById("popPlayFromHere");
const popSpeak = document.getElementById("popSpeak");
const popBookmark = document.getElementById("popBookmark");

let popCtx = null; // {bookId, paraIdx, raw, tr}

function addBookmarkFromPopover(){
  try{
    if(!popCtx) return;
    const bookId = popCtx.bookId || state.book?.id || state.route?.bookId;
    const raw = popCtx.raw || popWord?.textContent || "";
    const tr = popCtx.tr || popTrans?.textContent || "";
    const sLang = String(state.reading?.sourceLang || state.book?.sourceLang || "en").trim().toLowerCase();
    const tLang = String(state.reading?.targetLang || "uk").trim().toLowerCase();
    const m = pkgMode(state.route?.name);

    let __mode = (popCtx.mode || m);
    let __wi = Number(popCtx.wordIndex ?? -1);
    let __wk = String(popCtx.wordKey||"");

    // In Read mode we currently support only line bookmarks (no per-word spans),
    // so force wordIndex off to avoid misleading "word bookmark" behavior.
    if(String(__mode) === "read"){ __wi = -1; __wk = ""; }

    const level = (popCtx.level || state.reading?.level || "original");
    const sourceLang = (popCtx.sourceLang || sLang);
    const targetLang = (popCtx.targetLang || tLang);
    const lineIndex = (popCtx.lineIndex ?? popCtx.paraIdx ?? 0);
    const paraIdx = (popCtx.paraIdx ?? 0);

    // Toggle: if the bookmark already exists for this exact word/line in current context, remove it.
    const existing = findBookmarkByContext(bookId, {level, sourceLang, targetLang, mode: __mode, lineIndex, wordIndex: __wi, wordKey: __wk, raw});
    if(existing && existing.id){
      removeBookmarkEntry(bookId, existing.id);
      try{ updatePopoverBookmarkButton(); }catch(e){}
      // refresh bookmarks tab if visible
      try{ if(state.route?.name === "library" && state.ui?.libraryTab === "bookmarks"){ renderLibrary(); } }catch(e){}
      return;
    }

    addBookmarkEntry({bookId, paraIdx: (Number.isFinite(paraIdx)?Number(paraIdx):0), raw, tr,
      lineIndex: (Number.isFinite(lineIndex)?Number(lineIndex):0),
      level, sourceLang, targetLang, mode: __mode, wordIndex: __wi, wordKey: __wk});

    try{ updatePopoverBookmarkButton(); }catch(e){}

    // If user is currently on Bookmarks tab, refresh
    try{
      if(state.route?.name === "library" && state.ui?.libraryTab === "bookmarks"){ renderLibrary(); }
    }catch(e){}
  }catch(e){}
}

if(popBookmark){
  popBookmark.addEventListener("click", (e)=>{
    e.preventDefault();
    e.stopPropagation();
    addBookmarkFromPopover();
  });
  // Bookmarks "All" button
  try{
    const allBtn=document.getElementById("bmAllBtn");
    if(allBtn){ allBtn.textContent = t("all"); allBtn.title = t("all_bookmarks_title"); }
  }catch(e){}

}

function langToBcp47(code){
  const c = String(code||"").toLowerCase();
  if(c==="uk") return "uk-UA";
  if(c==="ru") return "ru-RU";
  if(c==="pl") return "pl-PL";
  if(c==="de") return "de-DE";
  if(c==="es") return "es-ES";
  if(c==="fr") return "fr-FR";
  return "en-US";
}

function setTheme(night){
  ensureThemePatch();
  document.body.setAttribute("data-theme", night ? "night" : "light");
}

function ensureThemePatch(){
  try{
    if(document.getElementById("themePatch")) return;
    const st = document.createElement("style");
    st.id = "themePatch";
    st.textContent = `
/* Theme patch: frosted glass + readable night mode for all app surfaces */

/* --- Tokens (light) --- */
body:not([data-theme="night"]){
  --appBg: transparent;
  --appText: rgba(20,24,28,.92);
  --appMuted: rgba(20,24,28,.62);
  --appBorder: rgba(20,24,28,.08);
  --appCardSolid: rgba(255,255,255,.72);
  --appCard: rgba(255,255,255,.58);
  --appBtn: rgba(255,255,255,.70);
  --appBtn2: rgba(255,255,255,.82);
  --appBtnText: rgba(20,24,28,.92);
  --appPillBg: rgba(255,255,255,.72);
  --appPillText: rgba(20,24,28,.92);
}

/* --- Tokens (night) --- */
body[data-theme="night"]{
  --appBg:#07121f;
  --appText:#e9f0ff;
  --appMuted:rgba(233,240,255,.74);
  --appBorder:rgba(255,255,255,.10);
  --appCardSolid:rgba(255,255,255,.14);
  --appCard:rgba(255,255,255,.10);
  --appBtn:rgba(255,255,255,.14);
  --appBtn2:rgba(255,255,255,.18);
  --appBtnText:#e9f0ff;
  --appPillBg:rgba(255,255,255,.14);
  --appPillText:#e9f0ff;
}

/* Frosted surfaces (shared) */
.wrap, .homeScreen .card, .cardWide, .panel, .bmSheet, .sheet, .modal, .dialog, .toast{
  -webkit-backdrop-filter: blur(18px) saturate(120%);
  backdrop-filter: blur(18px) saturate(120%);
}

/* Global app surfaces */
body[data-theme="night"] .wrap{ background:var(--appBg); color:var(--appText); }
body[data-theme="night"] .homeScreen .card,
body[data-theme="night"] .cardWide,
body[data-theme="night"] .panel,
body[data-theme="night"] .sheet,
body[data-theme="night"] .modal,
body[data-theme="night"] .dialog,
body[data-theme="night"] .bmSheet{
  background: var(--appCardSolid);
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: none;
  color: var(--appText);
}
body[data-theme="night"] .meta,
body[data-theme="night"] .sectionLabel,
body[data-theme="night"] .muted,
body[data-theme="night"] .subtle{ color: var(--appMuted) !important; }

/* Tabs (Books / My Library) readability */
body[data-theme="night"] .appHeader .tab{ color: var(--appText) !important; }
body[data-theme="night"] .appHeader .tab.muted{ color: var(--appMuted) !important; }
body[data-theme="night"] .appHeader{ background: transparent; }

/* Headings */
body[data-theme="night"] h1, body[data-theme="night"] h2, body[data-theme="night"] h3,
body[data-theme="night"] .bigTitle, body[data-theme="night"] .pageTitle{
  color: var(--appText) !important;
  text-shadow: none !important;
}

/* Buttons / icons */
body[data-theme="night"] .iconBtn,
body[data-theme="night"] .pillBtn,
body[data-theme="night"] .miniBtn,
body[data-theme="night"] .bmSheetBtn,
body[data-theme="night"] .segBtn,
body[data-theme="night"] button{
  background: var(--appBtn);
  border: 1px solid rgba(255,255,255,.10);
  color: var(--appBtnText);
}
body[data-theme="night"] .miniBtn.active,
body[data-theme="night"] .pillBtn.active,
body[data-theme="night"] .segBtn.active{ background: var(--appBtn2); }

/* Bookmark chip markers / line markers */
body[data-theme="night"] .mark,
body[data-theme="night"] .chip,
body[data-theme="night"] .badge{
  background: rgba(0,0,0,.18);
  color: var(--appText);
  border: 1px solid rgba(255,255,255,.08);
}

/* Close (X) visibility in sheets/modals */
body[data-theme="night"] .closeBtn,
body[data-theme="night"] .sheetClose,
body[data-theme="night"] .bmClose,
body[data-theme="night"] .xBtn{
  background: rgba(255,255,255,.12);
  color: var(--appText) !important;
  border: 1px solid rgba(255,255,255,.14);
}
/* Bookmark markers: make existing dot/shelf visible in night (do NOT add new markers) */
body[data-theme="night"] .bmWordMark::before{
  background: rgba(255,255,255,.85) !important;
  box-shadow: 0 0 0 2px rgba(255,255,255,.14) !important;
}
body[data-theme="night"] .bmLineMark .lineCardBtn::after{
  background: rgba(255,255,255,.62) !important;
  box-shadow: 0 0 0 1px rgba(255,255,255,.18) !important;
}

/* Bookmarks list cards in night: match main menu "glass" instead of flat gray */
body[data-theme="night"] .bmItem,
body[data-theme="night"] .bmCard,
body[data-theme="night"] .bmRow{
  background: var(--appCardSolid) !important;
  border: 1px solid rgba(255,255,255,.08) !important;
}

/* Library segmented buttons in LIGHT: ensure readable labels */
body:not([data-theme="night"]) .segBtn{
  color: rgba(20,24,28,.70) !important;
}
body:not([data-theme="night"]) .segBtn.active{
  color: rgba(20,24,28,.92) !important;
}

/* Top bars (Read/Listen): frosted like player bar in both themes */
.readTopBar, .listenTop{
  -webkit-backdrop-filter: blur(18px) saturate(120%);
  backdrop-filter: blur(18px) saturate(120%);
}
body:not([data-theme="night"]) .readTopBar,
body:not([data-theme="night"]) .listenTop{
  background: rgba(255,255,255,.60) !important;
  border-bottom: 1px solid rgba(20,24,28,.08) !important;
}
body[data-theme="night"] .readTopBar,
body[data-theme="night"] .listenTop{
  background: rgba(255,255,255,.10) !important;
  border-bottom: 1px solid rgba(255,255,255,.08) !important;
}


/* --- v2 fixes: bookmark indicators visibility + mobile layout --- */

/* Bookmark indicators (night): style whichever pseudo is used (do NOT create new content) */
body[data-theme="night"] .bmWordMark{
  filter: drop-shadow(0 0 6px rgba(120,200,255,.18));
}
body[data-theme="night"] .bmWordMark::before,
body[data-theme="night"] .bmWordMark::after{
  background: rgba(255,255,255,.92) !important;
  opacity: 1 !important;
  box-shadow: 0 0 0 2px rgba(0,0,0,.35), 0 0 10px rgba(120,200,255,.22) !important;
}

/* Line-bookmark shelf + button highlight (night) */
body[data-theme="night"] .bmLineMark .lineCardBtn{
  box-shadow: 0 0 0 2px rgba(120,200,255,.18), 0 6px 18px rgba(0,0,0,.25) !important;
}
body[data-theme="night"] .bmLineMark .lineCardBtn::before,
body[data-theme="night"] .bmLineMark .lineCardBtn::after{
  background: rgba(255,255,255,.62) !important;
  opacity: 1 !important;
}

/* Mobile: prevent title/meta overlap in Bookmarks list */
@media (max-width: 520px){
  .bmTitleRow{ flex-wrap: wrap !important; gap: 8px !important; }
  .bmTitle{ max-width: 100% !important; }
  .bmMeta{ margin-top: 4px !important; }
}
`;
    document.head.appendChild(st);
  }catch(e){}
}

function applyHighlightTheme(){
  if(state.reading.highlightTheme === "default"){
    const word = state.reading.night ? "rgba(42,167,255,.22)" : "rgba(42,167,255,.26)";
    const line = state.reading.night ? "rgba(42,167,255,.10)" : "rgba(42,167,255,.12)";
    const soft = state.reading.night ? "rgba(42,167,255,.06)" : "rgba(42,167,255,.07)";
    document.documentElement.style.setProperty("--hlWord", word);
    document.documentElement.style.setProperty("--hlLine", line);
    document.documentElement.style.setProperty("--hlLineSoft", soft);
    hlDefault.classList.add("active");
    hlYellow.classList.remove("active");
  }else{
    // Yellow theme
    document.documentElement.style.setProperty("--hlWord", "rgba(255, 213, 0, .34)");
    document.documentElement.style.setProperty("--hlLine", "rgba(255, 213, 0, .22)");
    document.documentElement.style.setProperty("--hlLineSoft", "rgba(255, 213, 0, .14)");
    hlYellow.classList.add("active");
    hlDefault.classList.remove("active");
  }
}

/* ===========================
   NEW: robust asset resolving for folder-based books
=========================== */
function isAbsoluteUrl(u){
  return /^https?:\/\//i.test(u) || /^data:/i.test(u);
}

function resolveBookAsset(bookId, path, fallbackFile){
  const p = (path && String(path).trim()) ? String(path).trim() : fallbackFile;
  if(!p) return "";
  if(isAbsoluteUrl(p)) return p;
  if(p.startsWith("books/")) return p;
  return `books/${encodeURIComponent(bookId)}/${p}`;
}

function normalizeCatalogItem(x){
  const id = x.id;
  return {
    ...x,
    id,
    cover: resolveBookAsset(id, x.cover, "cover.jpg")
  };
}

function normalizeBookJson(book, id){
  const b = {...book};
  b.id = b.id || id;
  b.sourceLang = b.sourceLang || "en";
  b.text = b.text || [];

  // Extract chapters markers and keep a cleaned text for reading/playback
  try{
    const processed = processBookTextForChapters(b.text);
    b.text = processed.text;
    b.chapters = processed.chapters;
  }catch(e){
    b.chapters = b.chapters || [];
  }

  b.cover = resolveBookAsset(b.id, b.cover, "cover.jpg");
  if(b.audio) b.audio = resolveBookAsset(b.id, b.audio, "");
  return b;
}

// ===== Chapters =====
// Marker format: [[CHAPTER: Title]] (this line is hidden from the reader)
function processBookTextForChapters(lines){
  const src = (lines || []).map(v=>String(v ?? ""));
  const out = [];
  const chapters = [];
  const markerRe = /^\s*\[\[CHAPTER:\s*(.+?)\s*\]\]\s*$/i;

  for(const line of src){
    const m = markerRe.exec(line);
    if(m){
      const title = String(m[1]||"").trim() || "Chapter";
      chapters.push({ title, startIndex: out.length });
      continue; // hide marker
    }
    out.push(line);
  }

  // Hybrid fallback: if no explicit markers, infer chapter starts by "two empty lines" before a heading-like line.
  if(!chapters.length){
    const isBlank = (s)=>{
      const v = String(s ?? "").replace(/\u00A0/g, " "); // NBSP -> space
      return v.trim() === "";
    };

    // Multilingual heading keywords (extendable)
    const headingRe = new RegExp(
      "^(" +
        "chapter|chapitre|kapitel|cap[ií]tulo|capitulo|rozdzia[lł]|rozdzial|rozdi[lł]|rozdi[lł]|rozd[ií]l|розділ|глава|частина|part|section" +
      ")(?:\s+|\s*[:.-]\s*)(?:\d+|[ivxlcdm]+)(?:\s*[:.-].*)?$",
      "i"
    );

    const looksLikeHeading = (line)=>{
      const cur = String(line ?? "").replace(/\u00A0/g, " ").trim();
      if(!cur) return false;
      if(cur.length > 90) return false;
      // if it matches known keywords, accept
      if(headingRe.test(cur)) return true;

      // Generic: short line, has a number/roman numeral, few words
      const words = cur.split(/\s+/).filter(Boolean);
      if(words.length <= 10 && (/[0-9]/.test(cur) || /\b[IVXLCDM]{1,8}\b/i.test(cur))){
        // avoid normal sentences (end with period + long)
        if(!/[.!?]$/.test(cur) || cur.includes(":")) return true;
      }
      // Extra fallback: title-like short line (often used in translations)
      // Accept Title Case / ALL-CAPS even if it ends with a period (some translators add it).
      if(words.length <= 10 && cur.length <= 70){
        const letters = cur.replace(/[^A-Za-zА-Яа-яІіЇїЄєŁłÇçÑñÁáÉéÍíÓóÚúÜüÖöÄäß]/g, "");
        const uppers = letters.replace(/[^A-ZА-ЯІЇЄŁÇÑÁÉÍÓÚÜÖÄ]/g, "");
        const upperRatio = letters.length ? (uppers.length / letters.length) : 0;
        const titleCase = words.every(w=>/^[A-ZА-ЯІЇЄŁÇÑÁÉÍÓÚÜÖÄ]/.test(w));
        // Heuristic: headings rarely contain commas/semicolons and usually don't have many verbs.
        const hasComma = /[,;]|\u2014/.test(cur);
        if(!hasComma && (upperRatio >= 0.70 || titleCase)) return true;
      }

      return false;
    };

    for(let i=0;i<out.length;i++){
      const curLine = out[i] ?? "";
      if(isBlank(curLine)) continue;

      const prev1 = out[i-1] ?? "";
      const prev2 = out[i-2] ?? "";
      const next1 = out[i+1] ?? "";
      const next2 = out[i+2] ?? "";

      const blankBefore = isBlank(prev1) && isBlank(prev2);
      const blankAfter  = isBlank(next1) && isBlank(next2);

      if(blankBefore || blankAfter){
        const cur = String(curLine).replace(/\u00A0/g, " ").trim();
        if(looksLikeHeading(cur)){
          chapters.push({ title: cur, startIndex: i });
        }
      }
    }
  }

  // Always include a default chapter for convenience
  if(!chapters.length){
    chapters.push({ title: "Start", startIndex: 0 });
  }

  return { text: out, chapters };
}


function _coreApplyBookMeta(book){
  try{
    if(!core || !book) return;
    const totalLines = Number(effectiveTotalLines(book.text)||0);
    let chapters = [];
    if(Array.isArray(book.chapters) && book.chapters.length){
      chapters = book.chapters.map(c=>({ index: Number(c.startIndex||0), title: String(c.title||"Chapter") }));
    }else if(typeof core.buildChaptersFromLines === "function"){
      chapters = core.buildChaptersFromLines(book.text);
    }
    core.setMeta({ totalLines, chapters });
  }catch(e){}
}

function getChapters(){
  try{
    if(core && typeof core.getChapters === "function"){
      const ch = core.getChapters() || [];
      // keep legacy shape {title,startIndex}
      return ch.map(c=>({ title: c.title, startIndex: c.index }));
    }
  }catch(e){}
  return (state.book && Array.isArray(state.book.chapters)) ? state.book.chapters : [];
}

function _escHtml(s){
  return String(s||"")
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function renderChaptersList(){
  if(!chaptersList) return;
  const ch = getChapters();
  if(!ch.length){
    chaptersList.innerHTML = `<div style="opacity:.6;font-weight:700;padding:8px 2px">${escapeHtml(t('no_chapters'))}</div>`;
    return;
  }
  // Determine current chapter by current cursor line.
  let curLine = 0;
  try{ curLine = getCursorIndex(); }catch(e){ curLine = 0; }
  let activeIdx = 0;
  try{
    for(let i=0;i<ch.length;i++){
      const si = Number(ch[i]?.startIndex||0);
      if(Number.isFinite(si) && si <= curLine) activeIdx = i;
    }
  }catch(e){}

  chaptersList.innerHTML = ch.map((c, idx)=>{
    const title = _escHtml(String(c.title||"Chapter"));
    const isActive = idx === activeIdx;
    const isDone = idx < activeIdx;
    return `<button class="btn" style="text-align:left;justify-content:flex-start;gap:10px;position:relative;${isActive?'background:rgba(59,130,246,.14);':''}" data-chapter="${idx}">
      <span style="font-weight:900;opacity:.8">${idx+1}.</span>
      <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</span>
      ${isDone?`<span style="position:absolute;right:40px;font-weight:900;opacity:.65">✓</span>`:''}
      <span style="opacity:.6">›</span>
    </button>`;
  }).join('');

  [...chaptersList.querySelectorAll('[data-chapter]')].forEach(btn=>{
    btn.onclick = (e)=>{
      e.preventDefault();
      const idx = Number(btn.getAttribute('data-chapter'));
      jumpToChapter(idx);
      closeChapters();
    };
  });
}

function openChapters(){
  if(!chaptersSheet) return;
  try{ closeSettings(); }catch(e){}
  try{ closeDev(); }catch(e){}
  renderChaptersList();
  chaptersSheet.setAttribute('aria-hidden','false');
  openSheet(chaptersSheet);
}
function closeChapters(){
  if(!chaptersSheet) return;
  closeSheet(chaptersSheet);
}

function jumpToChapter(chIdx){
  const ch = getChapters();
  if(!ch.length) return;
  const c = ch[Math.max(0, Math.min(ch.length-1, Number(chIdx)||0))];
  const idx = Math.max(0, Number(c.startIndex||0));

  // If we're inside an active reading screen, stop playback WITHOUT saving first,
  // then set cursor to the chapter start and save once (prevents stale-save races).
  if(state.route?.name === 'reader' || state.route?.name === 'bireader'){
    try{ stopReading({save:false}); }catch(e){}

    // Jump inside active reading screen
          setCursorIndex(idx, {syncUI:true, scroll:true});
      try{ _clearPendingBookmarkPlayChoice(); }catch(e){}
      // Apply bookmark word highlight if provided
      try{
        const wi = Number(state.route?.startWordIndex);
        if(Number.isFinite(wi) && wi >= 0){
          setActiveParaWord(idx, wi);
          const wEl = state.reading.paraWords?.[idx]?.[wi];
          if(wEl && wEl.getBoundingClientRect){
            const r = wEl.getBoundingClientRect();
            const topZone = window.innerHeight * 0.25;
            const botZone = window.innerHeight * 0.75;
            if(r.top < topZone || r.bottom > botZone){
              window.scrollBy({top: (r.top - window.innerHeight/2), behavior:"smooth"});
            }
          }
        }
        try{ delete state.route.startWordIndex; }catch(e){}
      }catch(e){}

      // Autoplay for bookmarks "Play"
      try{ if(state.route?.autoPlay){ try{ state.route.autoPlay=false; }catch(e){}; setTimeout(()=>{ try{ startReading(); }catch(e){} }, 80); } }catch(e){}


  // NEW: Cross-mode sync so mode-switch won't restore an older index
  if(state.route?.name === 'reader'){
    try{ state.reading.activeBiLineIndex = idx; }catch(e){}
    try{ state.reading.resumeIndexBi = idx; }catch(e){}
  }else{
    try{ state.reading.activeParaIndex = idx; }catch(e){}
    try{ state.reading.resumeIndexReader = idx; }catch(e){}
  }

    try{ saveReadingProgress(); }catch(e){}
    try{ closeChapters(); }catch(e){}
    return;
  }

  // Details screen: save selected chapter as the next start position for this (book + language pair)
  try{
    const bookId = resolveBookId();
    const src = String(state.reading.sourceLang || state.book?.sourceLang || "en").trim().toLowerCase();
    const trg = String(state.reading.targetLang || "uk").trim().toLowerCase();
    const level = normalizeLevel(state.reading.level || "original");
    const pkgKey = pkgProgressKey(bookId, src, trg, level);

    // Keep previous percent if exists
    let prevProgress = 0;
    try{
      const prev = getPkgProgress(bookId, src, trg, level);
      if(prev && typeof prev.progress === "number") prevProgress = Number(prev.progress||0);
    }catch(_e){}

    const pkgPayload = { sourceLang: src, targetLang: trg, progress: prevProgress, activeIndex: idx, ts: Date.now() };
    try{ localStorage.setItem(pkgKey, JSON.stringify(pkgPayload)); }
    catch(e){ try{ sessionStorage.setItem(pkgKey, JSON.stringify(pkgPayload)); }catch(_e){} }

    saveLastPkg(bookId, state.route?.name||"details", src, trg);
  }catch(e){}
  try{ closeChapters(); }catch(e){}
}


/* ---------------------------
   Mode switch (inside reader modes)
   Requirement:
   • In-mode back button (bottom player) switches Read/Listen.
   • Top back button returns to Book menu (Details).
--------------------------- */
function switchMode(nextRoute){
  const bookId = resolveBookId();
  if(!bookId) return;

  // Capture current cursor BEFORE navigation resets indices.
  let startIndex = 0;
  try{
    const mode = state.route?.name;
    if(mode === "reader"){
      const a = Number(state.reading.activeParaIndex);
      const r = Number(state.reading.resumeIndexReader);
      startIndex = Number.isFinite(a) ? a : (Number.isFinite(r) ? r : getCursorIndex());
    }else if(mode === "bireader"){
      const a = Number(state.reading.activeBiLineIndex);
      const r = Number(state.reading.resumeIndexBi);
      startIndex = Number.isFinite(a) ? a : (Number.isFinite(r) ? r : getCursorIndex());
    }
    if(!Number.isFinite(startIndex) || startIndex < 0) startIndex = 0;
  }catch(e){ startIndex = 0; }

    try{ saveReadingProgress(); }catch(e){}

  // NEW: prevent snap-back by forcing both modes' active indices to the same cursor
  try{ syncCursorIndex(startIndex); }catch(e){}
  try{ state.reading.activeParaIndex = startIndex; }catch(e){}
  try{ state.reading.activeBiLineIndex = startIndex; }catch(e){}
  try{ state.reading.resumeIndexReader = startIndex; }catch(e){}
  try{ state.reading.resumeIndexBi = startIndex; }catch(e){}

  // Pass startIndex as a safety-net: even if storage restore fails, Read/Listen won't jump to the beginning.
  go({name: nextRoute, bookId, startIndex}, {push:false});
}
function handlePlayerBack(){
  const r = state.route?.name;
  if(r === "reader") return switchMode("bireader");
  if(r === "bireader") return switchMode("reader");
  return appBack();
}

/* ---------------------------
   Back
--------------------------- */
function appBack(){
  try{
    if(window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function"){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:"BACK"}));
      return;
    }
  }catch(e){}
  stopReading();
  const prev = state.navStack.pop();
  if(prev) go(prev, {push:false});
  else go({name:"catalog"}, {push:false});
}

// Always exit to the Books catalog (not browser/app history)
function goCatalog(){
  try{ stopReading(); }catch(e){}
  try{ closeSettings(); }catch(e){}
  try{ closeDev(); }catch(e){}
  // clear nav stack so "Back" doesn't bounce around inside the reader
  try{ state.navStack = []; }catch(e){}
  go({name:"catalog"}, {push:false});
}

/* ---------------------------
   Router
--------------------------- */

/* ---------------------------
   Progress memory (per book, per mode) - survives navigation, resets on full reload
--------------------------- */
function resolveBookId(){
  const id = state.route?.bookId || state.route?.id || state.book?.id || state.book?.bookId;
  if(!id) return null;
  return String(id);
}


function effectiveTotalLines(lines){
  try{
    if(!Array.isArray(lines)) return Number(lines?.length||0);
    for(let i=lines.length-1;i>=0;i--){
      if(String(lines[i]||"").trim()) return i+1;
    }
    return lines.length;
  }catch(e){
    return Number(lines?.length||0);
  }
}

function progressKey(bookId, mode){
  return `book_progress::${bookId}::${mode}`;
}

// NEW: progress per "language package" (bookLang -> translationLang)
// IMPORTANT: progress must be SHARED between Read and Listen modes for the same book+language pair.
function pkgMode(routeName){
  // In this app routing: reader = Listen, bireader = Read
  if(routeName === "reader") return "listen";
  if(routeName === "bireader") return "read";
  return String(routeName||"");
}
function pkgProgressKey(bookId, sourceLang, targetLang, level){
  const s = String(sourceLang||"en").trim().toLowerCase();
  const t = String(targetLang||"uk").trim().toLowerCase();
  const lv = normalizeLevel(level||"original");
  // Keep legacy key for original to preserve existing users data
  if(lv === "original") return `book_pkg_progress::${String(bookId||"")}::${s}::${t}`;
  return `book_pkg_progress::${String(bookId||"")}::${s}::${t}::${lv}`;
}
function lastPkgKey(bookId){
  return `book_last_pkg::${bookId}`;
}

function globalLastInteractionKey(){
  return "app_last_interaction";
}

function setGlobalLastInteraction(bookId, mode, sourceLang, targetLang, level){
  try{
    const payload={
      bookId: String(bookId||""),
      mode: String(mode||"").trim().toLowerCase(),
      level: normalizeLevel(level||"original"),
      sourceLang: String(sourceLang||"en").trim().toLowerCase(),
      targetLang: String(targetLang||"uk").trim().toLowerCase(),
      ts: Date.now()
    };
    localStorage.setItem(globalLastInteractionKey(), JSON.stringify(payload));
  }catch(e){}
}

function getGlobalLastInteraction(){
  try{
    const s=localStorage.getItem(globalLastInteractionKey());
    if(!s) return null;
    const o=JSON.parse(s);
    if(!o || typeof o!=="object") return null;
    return o;
  }catch(e){
    return null;
  }
}

function saveLastPkg(bookId, routeName, sourceLang, targetLang, level){
  try{
    const payload = {
      mode: pkgMode(routeName),
      level: normalizeLevel(state.reading?.level || "original"),
      sourceLang: String(sourceLang||"en").trim().toLowerCase(),
      targetLang: String(targetLang||"uk").trim().toLowerCase(),
      ts: Date.now()
    };
    localStorage.setItem(lastPkgKey(bookId), JSON.stringify(payload));
    // also update global last interaction used for the home screen and ordering
    setGlobalLastInteraction(bookId, payload.mode, payload.sourceLang, payload.targetLang, payload.level);
  }catch(e){}
}

function getLastPkg(bookId){
  try{
    const s = localStorage.getItem(lastPkgKey(bookId));
    if(!s) return null;
    const o = JSON.parse(s);
    if(!o || typeof o !== 'object') return null;
    return o;
  }catch(e){
    return null;
  }
}

function getPkgProgress(bookId, sourceLang, targetLang, level){
  try{
    const s = String(sourceLang||"en").trim().toLowerCase();
    const t = String(targetLang||"uk").trim().toLowerCase();
    const key = pkgProgressKey(bookId, s, t, level);
    let raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if(raw){
      return JSON.parse(raw);
    }
    const lv = normalizeLevel(level||"original");
    if(lv !== "original") return null;



    // Backward-compat (older builds stored per-mode keys). If found, pick the latest and migrate.
    const legacyKeys = [
      `book_pkg_progress::${bookId}::listen::${s}::${t}`,
      `book_pkg_progress::${bookId}::read::${s}::${t}`
    ];
    let best = null;
    for(const lk of legacyKeys){
      try{
        const v = localStorage.getItem(lk) || sessionStorage.getItem(lk);
        if(!v) continue;
        const o = JSON.parse(v);
        if(o && typeof o === 'object'){
          if(!best || Number(o.ts||0) > Number(best.ts||0)) best = o;
        }
      }catch(_e){}
    }
    if(best){
      // migrate into the new shared key
      const migrated = {
        sourceLang: s,
        targetLang: t,
        progress: Number(best.progress||0),
        activeIndex: Number.isFinite(best.activeIndex) ? Number(best.activeIndex) : 0,
        ts: Number(best.ts||Date.now())
      };
      try{ localStorage.setItem(key, JSON.stringify(migrated)); }catch(e){
        try{ sessionStorage.setItem(key, JSON.stringify(migrated)); }catch(_e){}
      }
      return migrated;
    }
    return null;
  }catch(e){
    return null;
  }
}

function listPkgProgress(bookId){
  // Collect all saved package progresses for this book.
  const out = [];
  const prefix = `book_pkg_progress::${bookId}::`;
  try{
    const scan = (storage)=>{
      if(!storage) return;
      for(let i=0;i<storage.length;i++){
        const k = storage.key(i);
        if(!k || !k.startsWith(prefix)) continue;
        try{
          const v = storage.getItem(k);
          if(!v) continue;
          const o = JSON.parse(v);
          if(o && typeof o === 'object') out.push(o);
        }catch(_e){}
      }
    };
    scan(localStorage);
    scan(sessionStorage);
  }catch(e){}
  // Unique by level+source+target+mode, keep latest ts
  const map = new Map();
  for(const o of out){
    const s = String(o.sourceLang||"").toLowerCase();
    const t = String(o.targetLang||"").toLowerCase();
    const lv = normalizeLevel(o.level||"original");
    const m = String(o.mode||"").toLowerCase() || "read";
    const id = `${lv}::${s}::${t}::${m}`;
    const prev = map.get(id);
    if(!prev || Number(o.ts||0) > Number(prev.ts||0)) map.set(id, o);
  }
  return Array.from(map.values()).sort((a,b)=>Number(b.ts||0)-Number(a.ts||0));
}
function saveReadingProgress(){
  try{
    const bookId = resolveBookId();
    const mode = state.route?.name;
    if(!bookId) return;
    if(mode !== "reader" && mode !== "bireader") return;

    const payload = { scrollY: window.scrollY || 0 };

    if(mode === "reader"){
      payload.resumeIndex = Number.isFinite(state.reading.resumeIndexReader) ? state.reading.resumeIndexReader : (Number.isFinite(state.reading.activeParaIndex)? state.reading.activeParaIndex : 0);
      payload.activeParaIndex = Number.isFinite(state.reading.activeParaIndex) ? state.reading.activeParaIndex : payload.resumeIndex;
    }else{
      payload.activeBiLineIndex = Number.isFinite(state.reading.activeBiLineIndex) ? state.reading.activeBiLineIndex : 0;
      payload.resumeIndexBi = Number.isFinite(state.reading.resumeIndexBi) ? state.reading.resumeIndexBi : payload.activeBiLineIndex;
      payload.activeBiLineIndex = Number.isFinite(state.reading.activeBiLineIndex) ? state.reading.activeBiLineIndex : 0;
      payload.swapLang = !!state.reading.swapLang;
    }

    // store progress percent for catalog/library cards
    try{
      if(mode === "reader"){
        const total = Number(effectiveTotalLines(state.book?.text) || state.reading.totalParas || 0);
        const idx = Number.isFinite(payload.activeParaIndex) ? payload.activeParaIndex : 0;
        payload.total = total;
        payload.progress = total>0 ? Math.max(0, Math.min(100, ((idx+1)/total)*100)) : 0;
      }else{
        const total = Number(state.reading.biTotal || effectiveTotalLines(state.book?.text) || 0);
        const idx = Number.isFinite(payload.activeBiLineIndex) ? payload.activeBiLineIndex : 0;
        payload.total = total;
        payload.progress = total>0 ? Math.max(0, Math.min(100, ((idx+1)/total)*100)) : 0;
      }
    }catch(e){}

    // v8 core progress (shared across modes + ready for level)
    try{
      if(core){
        const totalLines = Number(effectiveTotalLines(state.book?.text)||0);
        core.setMeta({ totalLines, chapters: (Array.isArray(state.book?.chapters) ? state.book.chapters.map(c=>({index:Number(c.startIndex||0), title:String(c.title||"Chapter")})) : (typeof core.buildChaptersFromLines==="function" ? core.buildChaptersFromLines(state.book?.text||[]) : [])) });
        core.openBook(bookId, { src: (state.reading.sourceLang||state.book?.sourceLang||"en"), trg: (state.reading.targetLang||"uk"), mode: pkgMode(mode), level: (state.reading.level||"original") });
      }
    }catch(e){}

    // legacy progress (per mode)
    sessionStorage.setItem(progressKey(bookId, mode), JSON.stringify(payload));

    // NEW: progress per language package (book language + translation language) shared across modes
    try{
      const src = String(state.reading.sourceLang || state.book?.sourceLang || "en").trim().toLowerCase();
      const trg = String(state.reading.targetLang || "uk").trim().toLowerCase();
    const level = normalizeLevel(state.reading.level || "original");
      const pkgKey = pkgProgressKey(bookId, src, trg, level);
      // capture cursor index for this mode so we can restore per (source→target)
      let activeIndex = 0;
      try{
        const ci = Number.isFinite(state.reading.cursorIndex) ? Number(state.reading.cursorIndex) : null;
        const oi = Number.isFinite(openaiLineIndex) ? Number(openaiLineIndex) : null;
        if(mode === "reader"){
          const a = Number(state.reading.activeParaIndex);
          const r = Number(state.reading.resumeIndexReader);
          activeIndex = Number.isFinite(a) ? a : (Number.isFinite(r) ? r : (ci ?? oi ?? 0));
        }else if(mode === "bireader"){
          const a = Number(state.reading.activeBiLineIndex);
          const r = Number(state.reading.resumeIndexBi);
          activeIndex = Number.isFinite(a) ? a : (Number.isFinite(r) ? r : (ci ?? oi ?? 0));
        }else{
          activeIndex = oi ?? 0;
        }
        if(!Number.isFinite(activeIndex) || activeIndex < 0) activeIndex = 0;
      }catch(e){ activeIndex = 0; }

      const pkgPayload = {
        sourceLang: src,
        targetLang: trg,
        level: level,
        mode: (state.reading?.mode || (routeName==="listen" ? "listen" : "read")),
        progress: Number(payload.progress||0),
        activeIndex: activeIndex,
        ts: Date.now()
      };

      // v8 core: save canonical progress
      try{
        if(core){
          core.setLine(activeIndex);
          core.saveProgress({ progress: Number(payload.progress||0) });
        }
      }catch(e){}
      try{ localStorage.setItem(pkgKey, JSON.stringify(pkgPayload)); }catch(e){
        try{ sessionStorage.setItem(pkgKey, JSON.stringify(pkgPayload)); }catch(_e){}
      }
      saveLastPkg(bookId, mode, src, trg, level);
    }catch(e){}
  }catch(e){}
}


function restoreReadingProgress(){
  try{
    const bookId = resolveBookId();
    const route = state.route?.name;
    if(!bookId) return 0;
    if(route !== "reader" && route !== "bireader") return 0;

    const src = String(state.reading.sourceLang || state.book?.sourceLang || "en").trim().toLowerCase();
    const trg = String(state.reading.targetLang || "uk").trim().toLowerCase();
    const level = normalizeLevel(state.reading.level || "original");

    // 1) Prefer package progress (sourceLang + targetLang) shared across modes
    const pkg = getPkgProgress(bookId, src, trg, level);
    if(pkg && typeof pkg.activeIndex === "number"){
      const idx = Math.max(0, Number(pkg.activeIndex||0));

      // Keep indices in sync across Read/Listen so switching modes doesn't "jump back"
      try{
        state.reading.activeParaIndex = idx;
        state.reading.resumeIndexReader = idx;
      }catch(e){}
      try{
        state.reading.activeBiLineIndex = idx;
        state.reading.resumeIndexBi = idx;
      }catch(e){}
      setCursorIndex(idx, {syncUI:false});

      // progress for current view
      const total = Number(effectiveTotalLines(state.book?.text)||0);
      state.reading.progress = total>0 ? (idx+1)/total : 0;

      return idx;
    }

    // If level is not original and there is no level-specific progress yet,
    // do NOT inherit shared legacy progress (levels must be independent).
    if(level !== "original"){
      try{
        state.reading.activeParaIndex = 0;
        state.reading.resumeIndexReader = 0;
        state.reading.activeBiLineIndex = 0;
        state.reading.resumeIndexBi = 0;
      }catch(e){}
      setCursorIndex(0, {syncUI:false});
      state.reading.progress = 0;
      return 0;
    }

    // 2) If there are *no* package progresses yet (old users), fallback to legacy per-mode progress
    const hasAnyPkgs = (listPkgProgress(bookId)||[]).length>0;
    if(!hasAnyPkgs){
      const key = progressKey(bookId, route);
      const raw = sessionStorage.getItem(key);
      if(raw){
        const p = JSON.parse(raw);
        if(route === "reader"){
          const idx = Number(p.activeParaIndex ?? p.resumeIndexReader ?? p.resumeIndex ?? 0);
          state.reading.activeParaIndex = Number.isFinite(idx) ? idx : 0;
          state.reading.resumeIndexReader = state.reading.activeParaIndex;
          setCursorIndex(state.reading.activeParaIndex, {syncUI:false});
          const total = Number(effectiveTotalLines(state.book?.text)||0);
          state.reading.progress = total>0 ? (state.reading.activeParaIndex+1)/total : 0;
          return state.reading.activeParaIndex;
        }else{
          const idx = Number(p.activeBiLineIndex ?? p.resumeIndexBi ?? p.resumeIndex ?? 0);
          state.reading.activeBiLineIndex = Number.isFinite(idx) ? idx : 0;
          state.reading.resumeIndexBi = state.reading.activeBiLineIndex;
          setCursorIndex(state.reading.activeBiLineIndex, {syncUI:false});
          const total = Number(effectiveTotalLines(state.book?.text)||0);
          state.reading.progress = total>0 ? (state.reading.activeBiLineIndex+1)/total : 0;
          return state.reading.activeBiLineIndex;
        }
      }
    }

    // 3) Otherwise: no progress for this pair => start from beginning
    if(route === "reader"){
      state.reading.activeParaIndex = 0;
      state.reading.resumeIndexReader = 0;
    }else{
      state.reading.activeBiLineIndex = 0;
      state.reading.resumeIndexBi = 0;
    }
    state.reading.progress = 0;
    setCursorIndex(0, {syncUI:false});
    return 0;
  }catch(e){
    try{ setCursorIndex(0, {syncUI:false}); }catch(_e){}
    return 0;
  }
}

function restoreProgressForPair(bookId, src, trg, level){
  try{
    if(!bookId) return 0;
    src = String(src || "en").trim().toLowerCase();
    trg = String(trg || "uk").trim().toLowerCase();

    level = normalizeLevel(level || state.reading.level || "original");

    // Prefer v8 core progress (level-aware)
    let idx = 0;
    try{
      if(window.core && typeof window.core.loadProgress==="function"){
        const saved = window.core.loadProgress(bookId, src, trg, level);
        if(saved && typeof saved.lineIndex==="number") idx = Math.max(0, Number(saved.lineIndex||0));
      }
    }catch(e){}
    // Fallback legacy (no level)
    if(!idx){
      const pkg = getPkgProgress(bookId, src, trg, level);
      idx = (pkg && typeof pkg.activeIndex === "number") ? Math.max(0, Number(pkg.activeIndex||0)) : 0;
    }


    // sync indices across modes
    try{ state.reading.activeParaIndex = idx; state.reading.resumeIndexReader = idx; }catch(e){}
    try{ state.reading.activeBiLineIndex = idx; state.reading.resumeIndexBi = idx; }catch(e){}
    try{ setCursorIndex(idx, {syncUI:false}); }catch(e){}

    // compute progress using effective total lines (ignore trailing blanks)
    const total = Number(effectiveTotalLines(state.book?.text)||0);
    state.reading.progress = total>0 ? (idx+1)/total : 0;

    return idx;
  }catch(e){
    return 0;
  }
}




function applyLanguagePairChange(){
  try{
    const bookId = resolveBookId();
    if(!bookId) return;

    const src = String(state.reading.sourceLang || state.book?.sourceLang || "en").trim().toLowerCase();
    const trg = String(state.reading.targetLang || "uk").trim().toLowerCase();
    const level = normalizeLevel(state.reading.level || "original");

    // If user changes the pair while audio is playing in an active reader, stop & save current progress first.
    // (In Details we already saved before changing the pair, so this is just a safe guard.)
    if(state.route?.name === "reader" || state.route?.name === "bireader"){
      try{ stopReading({ save:true }); }catch(e){}
    }

    // Restore progress for the NEW pair (bookId + src + trg) without zeroing anything.
    let idx = 0;
    try{
      if(window.core && typeof window.core.openBook==="function"){
        window.core.openBook(bookId, { src, trg, mode: pkgMode(state.reading.mode||"read"), level });
        const st = window.core.getState();
        idx = (st && typeof st.lineIndex==="number") ? Number(st.lineIndex||0) : 0;
      }
    }catch(e){}
    if(!idx){ idx = restoreProgressForPair(bookId, src, trg, level); }

    // If we are inside a reader screen, update UI highlight/scroll immediately.
    try{
      if(state.route?.name === "reader" || state.route?.name === "bireader"){
        setCursorIndex(idx, {syncUI:true, scroll:true});
      }
    }catch(e){}
  }catch(e){}
}
/* ---------------------------
   Bookmarks (per book)
--------------------------- */
function bmKey(bookId){ return `bm:${bookId}`; }
function loadBookmarks(bookId){
  try{
    const s = localStorage.getItem(bmKey(bookId)) || sessionStorage.getItem(bmKey(bookId));
    if(!s) return [];
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : [];
  }catch(e){
    return [];
  }
}
function saveBookmarks(bookId, arr){
  try{ localStorage.setItem(bmKey(bookId), JSON.stringify(arr||[])); }catch(e){
    try{ sessionStorage.setItem(bmKey(bookId), JSON.stringify(arr||[])); }catch(_e){}
  }
}
function addBookmarkEntry({bookId, paraIdx, raw, tr, lineIndex, level, sourceLang, targetLang, mode, wordIndex, wordKey}){
  if(!bookId) return;
  const r = String(raw||"").trim();
  const t = String(tr||"").trim();
  if(!r && !t) return;
  const _all = loadBookmarks(bookId);
  const entry = {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    paraIdx: Number.isFinite(paraIdx) ? Number(paraIdx) : 0,
    lineIndex: Number.isFinite(lineIndex) ? Number(lineIndex) : (Number.isFinite(paraIdx)?Number(paraIdx):0),
    level: String(level||"original"),
    sourceLang: String(sourceLang||"").trim().toLowerCase(),
    targetLang: String(targetLang||"").trim().toLowerCase(),
    mode: String(mode||"read"),
    wordIndex: Number.isFinite(wordIndex) ? Number(wordIndex) : -1,
    wordKey: String(wordKey||""),
    raw: r,
    tr: t,
    createdAt: Date.now()
  };
  // append to full list (do NOT drop other contexts)
  _all.push(entry);
  saveBookmarks(bookId, _all);
  try{ applyBookmarkMarks(); }catch(e){}
}
function removeBookmarkEntry(bookId, entryId){
  if(!bookId || !entryId) return;
  const list = loadBookmarks(bookId).filter(x=>x && x.id !== entryId);
  saveBookmarks(bookId, list);
  try{ applyBookmarkMarks(); }catch(e){}
}

// Find an existing bookmark for the same context/position (used for toggle UI)
function findBookmarkByContext(bookId, ctx){
  try{
    if(!bookId) return null;
    const level = String(ctx.level||"original");
    const src = String(ctx.sourceLang||"").trim().toLowerCase();
    const trg = String(ctx.targetLang||"").trim().toLowerCase();
    const mode = String(ctx.mode||"read");
    const lineIndex = Number.isFinite(ctx.lineIndex) ? Number(ctx.lineIndex) : 0;
    const wordIndex = Number.isFinite(ctx.wordIndex) ? Number(ctx.wordIndex) : -1;
    const wordKey = String(ctx.wordKey||"");
    const rawNorm = normalizeWord(String(ctx.raw||""));
    const list = loadBookmarks(bookId) || [];
    const rel = list.filter(b=>{
      if(!b) return false;
      return String(b.level||"original")===level
        && String(b.sourceLang||"").toLowerCase()===src
        && String(b.targetLang||"").toLowerCase()===trg
        && String(b.mode||"read")===mode;
    });
    if(wordIndex >= 0){
      // Prefer exact wordKey match, else fall back to wordIndex+lineIndex, else normalized word text match.
      return rel.find(b=>{
        if(!b) return false;
        if(Number(b.lineIndex) !== lineIndex) return false;
        if(Number(b.wordIndex) >= 0){
          if(wordKey && String(b.wordKey||"")===wordKey) return true;
          if(Number(b.wordIndex) === wordIndex) return true;
        }
        const bn = normalizeWord(String(b.raw||""));
        return bn && rawNorm && bn===rawNorm;
      }) || null;
    }
    // line bookmark
    return rel.find(b=> Number(b.lineIndex)===lineIndex && (Number(b.wordIndex)||-1) < 0 ) || null;
  }catch(e){
    return null;
  }
}

function updatePopoverBookmarkButton(){
  try{
    if(!popBookmark){ return; }
    if(!popCtx){ popBookmark.classList.remove("active"); return; }
    const bookId = popCtx.bookId || state.book?.id || state.route?.bookId;
    const sLang = String(popCtx.sourceLang || state.reading?.sourceLang || state.book?.sourceLang || "en").trim().toLowerCase();
    const tLang = String(popCtx.targetLang || state.reading?.targetLang || "uk").trim().toLowerCase();
    const mode = String(popCtx.mode || pkgMode(state.route?.name) || "read");
    let wi = Number(popCtx.wordIndex ?? -1);
    let wk = String(popCtx.wordKey||"");
    if(mode==="read"){ wi = -1; wk = ""; }
    const ctx = {
      level: String(popCtx.level || state.reading?.level || "original"),
      sourceLang: sLang,
      targetLang: tLang,
      mode,
      lineIndex: Number(popCtx.lineIndex ?? popCtx.paraIdx ?? 0),
      wordIndex: wi,
      wordKey: wk,
      raw: String(popCtx.raw||popWord?.textContent||"")
    };
    const ex = findBookmarkByContext(bookId, ctx);
    popBookmark.classList.toggle("active", !!(ex && ex.id));
  }catch(e){}
}
// ===== Bookmark marks (subtle dots near bookmarked lines/words) =====
function _bmCurrentCtx(){
  try{
    const bookId = state.book?.id || state.route?.bookId || state.route?.id;
    const level = String(state.reading?.level || "original");
    const sourceLang = String(state.reading?.sourceLang || state.book?.sourceLang || "en").trim().toLowerCase();
    const targetLang = String(state.reading?.targetLang || "uk").trim().toLowerCase();
    const mode = pkgMode(state.route?.name);
    try{ state.ui = state.ui||{}; state.ui.lastBmCtx = {bookId, level, sourceLang, targetLang, mode}; }catch(e){}
    return {bookId, level, sourceLang, targetLang, mode};
  }catch(e){
    return {bookId:null, level:"original", sourceLang:"en", targetLang:"uk", mode:"read"};
  }
}
function applyBookmarkMarks(){
  try{
    // clear
    document.querySelectorAll('.bmLineMark').forEach(el=>el.classList.remove('bmLineMark'));
    document.querySelectorAll('.bmWordMark').forEach(el=>el.classList.remove('bmWordMark'));
    const ctx = _bmCurrentCtx();
    if(!ctx.bookId) return;
    const all = loadBookmarks(ctx.bookId) || [];
    const rel = all.filter(b=>{
      if(!b) return false;
      return String(b.level||"original")===ctx.level
        && String(b.sourceLang||"").toLowerCase()===ctx.sourceLang
        && String(b.targetLang||"").toLowerCase()===ctx.targetLang
        && String(b.mode||"read")===ctx.mode;
    });
    if(!rel.length) return;

    const lineSet = new Set();
    const wordMap = new Map(); // lineIndex -> Set(wordIndex)

    rel.forEach(b=>{
      const li = Number.isFinite(Number(b.lineIndex)) ? Number(b.lineIndex) : (Number.isFinite(Number(b.paraIdx))?Number(b.paraIdx):0);
      const wi = Number(b.wordIndex);
      if(Number.isFinite(wi) && wi>=0 && ctx.mode!=="read"){
        if(!wordMap.has(li)) wordMap.set(li, new Set());
        wordMap.get(li).add(wi);
      }else{
        lineSet.add(li);
      }
    });

    // line dots
    lineSet.forEach(li=>{
      const wrap = document.querySelector(`[data-para-wrap="${li}"]`);
      if(wrap) wrap.classList.add('bmLineMark');
    });

    // word dots (Listen only)
    wordMap.forEach((set, li)=>{
      set.forEach(wi=>{
        const el = state.reading?.paraWords?.[li]?.[wi];
        if(el) el.classList.add('bmWordMark');
      });
    });
  }catch(e){}
}

// ===== Bookmarks v8 (sheet in-book + safe jump) =====
function _bmGetLineIndexFallback(){
  try{ if(typeof core!=="undefined" && core && typeof core.getState==="function"){ return Number(core.getState().lineIndex||0); } }catch(e){}
  try{ if(typeof openaiLineIndex!=="undefined") return Number(openaiLineIndex||0); }catch(e){}
  try{ if(typeof cursorIndex!=="undefined") return Number(cursorIndex||0); }catch(e){}
  return 0;
}
function _bmGetLevel(){
  try{ return String(state.reading?.level || "original"); }catch(e){ return "original"; }
}
function _bmGetLangPair(){
  const src = String(state.reading?.sourceLang || state.book?.sourceLang || "en").trim().toLowerCase();
  const trg = String(state.reading?.targetLang || "uk").trim().toLowerCase();
  return {src, trg};
}
function _bmGetMode(){
  // Prefer current route mapping (reader=based listen, bireader=read) to avoid stale state.reading.mode
  try{
    const rn = String(state.route?.name||"").trim();
    if(rn==="reader" || rn==="bireader") return pkgMode(rn);
  }catch(e){}
  try{
    const m = String(state.reading?.mode||"").trim();
    if(m==="listen" || m==="read") return m;
  }catch(e){}
  try{ return pkgMode(state.route?.name); }catch(e){ return "read"; }
}
function addBookmarkHere(bookId){
  try{
    bookId = bookId || state.book?.id || state.route?.bookId;
    if(!bookId) return;
    const lineIndex = _bmGetLineIndexFallback();
    const level = _bmGetLevel();
    const {src, trg} = _bmGetLangPair();
    const mode = _bmGetMode();
    const raw = (state.book?.text && state.book.text[lineIndex]) ? String(state.book.text[lineIndex]) : "";
    addBookmarkEntry({bookId, paraIdx: lineIndex, raw, tr:"", lineIndex, level, sourceLang: src, targetLang: trg, mode});
  }catch(e){}
}
function _bmFind(bookId, entryId){
  try{
    const list = loadBookmarks(bookId);
    return (list||[]).find(x=>x && x.id===entryId) || null;
  }catch(e){
    return null;
  }
}
function _bmOpenFromEntry(bookId, entry, play){
  if(!bookId || !entry) return;
  const idx = Number.isFinite(entry.lineIndex) ? Number(entry.lineIndex) : (Number.isFinite(entry.paraIdx)?Number(entry.paraIdx):0);
  const level = String(entry.level || state.reading?.level || "original");
  const src = String(entry.sourceLang || state.reading?.sourceLang || state.book?.sourceLang || "en").trim().toLowerCase();
  const trg = String(entry.targetLang || state.reading?.targetLang || "uk").trim().toLowerCase();
  const mode = (play ? "listen" : String(entry.mode || "read"));
  // set reading context first
  try{ state.reading.level = level; }catch(e){}
  try{ state.reading.sourceLang = src; }catch(e){}
  try{ state.reading.targetLang = trg; }catch(e){}
  const routeName = (mode==="listen") ? "reader" : "bireader";

  // Prepare "Continue vs Bookmark" choice (only for Go, not for Play buttons)
  try{
    state.ui = state.ui || {};
    if(!play){
      let resumeIndex = 0;
      try{
        if(typeof core!=="undefined" && core && typeof core.loadProgress==="function"){
          const saved = core.loadProgress(bookId, src, trg, level);
          if(saved && typeof saved.lineIndex==="number") resumeIndex = Math.max(0, Number(saved.lineIndex||0));
        }
      }catch(e){}
      if(!resumeIndex){
        try{
          const pkg = getPkgProgress(bookId, src, trg, level);
          if(pkg && typeof pkg.activeIndex==="number") resumeIndex = Math.max(0, Number(pkg.activeIndex||0));
        }catch(e){}
      }
      state.ui.pendingBookmarkPlayChoice = {
        bookId: String(bookId),
        bookmarkIndex: idx,
        resumeIndex,
        src, trg, level,
        createdAt: Date.now()
      };
    }else{
      // If user explicitly pressed "Play" in bookmarks UI, don't interrupt with the choice
      try{ _clearPendingBookmarkPlayChoice(); }catch(e){}
    }
  }catch(e){}
  go({name: routeName, bookId: bookId, startIndex: idx, forceStartIndex: true, autoPlay: !!play, startWordIndex: (Number.isFinite(entry.wordIndex) && entry.wordIndex>=0) ? Number(entry.wordIndex) : undefined});
}
function showBookBookmarksSheet(bookId){
  bookId = bookId || state.book?.id || state.route?.bookId;
  if(!bookId) return;
  const b = (state.book && state.book.id===bookId ? state.book : (state.catalog||[]).find(x=>x.id===bookId)) || state.book || {};
  const listAll = loadBookmarks(bookId);

  // Current context (level + lang pair + mode) for this book
  let ctxLevel = "original";
  let ctxPair = {src:"en", trg:"uk"};
  let ctxMode = "read";
  try{ ctxLevel = String(_bmGetLevel()||"original"); }catch(e){}
  try{ ctxPair = _bmGetLangPair() || ctxPair; }catch(e){}
  try{ ctxMode = String(_bmGetMode()||"read"); }catch(e){}

  // When opened from a book context (read/listen/details), show ONLY bookmarks for current context
  let list = listAll;
  try{
    const hasCtx = !!(ctxPair && ctxPair.src && ctxPair.trg);
    const inSameBookCtx = (state.book && String(state.book.id||"")===String(bookId)) || (state.route && String(state.route.bookId||"")===String(bookId));
    if(hasCtx && inSameBookCtx){
      const lvl = String(ctxLevel||"original");
      const s0 = String(ctxPair.src||"en");
      const t0 = String(ctxPair.trg||"uk");
      const md = String(ctxMode||"read");
      list = (listAll||[]).filter(it=>{
        if(!it) return false;
        const il = String(it.level||"original");
        const is = String(it.sourceLang||s0);
        const itg= String(it.targetLang||t0);
        const im = String(it.mode||"read");
        return il===lvl && is===s0 && itg===t0 && im===md;
      });
    }
  }catch(e){ list = listAll; }
  // basic modal
  const wrap = document.createElement("div");
  wrap.className = "bmSheetWrap";
  wrap.innerHTML = `
    <div class="bmSheet">
      <div class="bmSheetTop">
        <div class="bmSheetTitle">${escapeHtml(getBookTitle(b) || "Bookmarks")}</div>
        <div class="bmSheetBtns">
          <button class="bmSheetBtn" id="bmAddBtn" title="Add bookmark">＋</button>
          <button class="bmSheetBtn" id="bmAllBtn" title="${t('all_bookmarks_title')}">${t('btn_all')}</button>
          <button class="bmSheetBtn" id="bmCloseBtn" title="Close">✕</button>
        </div>
      </div>
      <div class="bmSheetList">
        
        ${list.length ? list.map((it,i)=>`
          <div class="bmSheetItem">
            <div class="bmSheetMain">
              <div class="bmSheetLine">#${i+1} <span class="bmSep">•</span> <span class="bmSheetLevel">${escapeHtml(formatLevelLabel(it.level||"original"))}</span> <span class="bmSep">•</span> <span class="bmSheetPkg">${escapeHtml(formatPkgLabel((it.sourceLang||_bmGetLangPair().src),(it.targetLang||_bmGetLangPair().trg),(it.mode||"read")))}</span></div>
              <div class="bmSheetRaw">${escapeHtml(it.raw||"")}</div>
              ${it.tr ? `<div class="bmSheetTr">${escapeHtml(it.tr||"")}</div>` : ``}
            </div>
            <div class="bmSheetActions">
              <button class="bmBtn" data-bm-play="${escapeHtml(bookId)}::${escapeHtml(it.id)}" title="Play">🔊</button>
              <button class="bmBtn primary" data-bm-go="${escapeHtml(bookId)}::${escapeHtml(it.id)}" title="Go">↪︎</button>
              <button class="bmBtn" data-bm-del="${escapeHtml(bookId)}::${escapeHtml(it.id)}" title="Delete">✕</button>
            </div>
          </div>
        `).join("") : `<div class="bmEmpty">No bookmarks yet</div>`}
      </div>
    </div>`;
  document.body.appendChild(wrap);

  function close(){ try{ wrap.remove(); }catch(e){} try{ if(state.ui && state.ui._resumeAudioAfterBMSheet){ state.ui._resumeAudioAfterBMSheet=false; if(typeof openaiAudio !== "undefined" && openaiAudio && openaiAudio.play) { const p=openaiAudio.play(); if(p && p.catch) p.catch(()=>{}); } } }catch(e){} }
  wrap.addEventListener("click", (e)=>{ if(e.target===wrap) close(); });

  wrap.querySelector("#bmCloseBtn").onclick = close;
  wrap.querySelector("#bmAddBtn").onclick = ()=>{ addBookmarkHere(bookId); close(); showBookBookmarksSheet(bookId); };
  wrap.querySelector("#bmAllBtn").onclick = ()=>{
    // remember return point
    try{
      state.ui = state.ui || {};
      state.ui.backToBook = {
        bookId,
        src: _bmGetLangPair().src,
        trg: _bmGetLangPair().trg,
        level: _bmGetLevel(),
        mode: _bmGetMode(),
        lineIndex: _bmGetLineIndexFallback()
      };
    }catch(e){}
    close();
    try{ state.ui.libraryTab = "bookmarks"; }catch(e){}
    go({name:"library"}, {push:false});
  };

  // Group resume (same as progress chip): jump to last stop for this book+level+pair+mode
  const gh = wrap.querySelector('[data-bm-group-resume]');
  if(gh){
    gh.onclick = (e)=>{
      try{ e.preventDefault(); e.stopPropagation(); }catch(_e){}
      const key = String(gh.getAttribute('data-bm-group-resume')||'');
      const parts = key.split('|');
      if(parts.length<5) return;
      const [bid, lvl, src, trg, mode] = parts;
      try{ state.reading.level = lvl || state.reading.level || 'original'; }catch(e){}
      try{ state.reading.sourceLang = src || state.reading.sourceLang || 'en'; }catch(e){}
      try{ state.reading.targetLang = trg || state.reading.targetLang || 'uk'; }catch(e){}
      const routeName = (String(mode||'read')==='listen') ? 'reader' : 'bireader';
      let idx = 0;
      try{
        const pkg = getPkgProgress(bid, src, trg, normalizeLevel(lvl||'original'));
        if(pkg && typeof pkg.activeIndex === 'number') idx = Number(pkg.activeIndex||0);
      }catch(e){}
      close();
      go({name: routeName, bookId: bid, startIndex: idx});
    };
  }

  // delegate actions
  wrap.querySelectorAll("[data-bm-go]").forEach(btn=>{
    btn.onclick = ()=>{
      const [bid, eid] = String(btn.getAttribute("data-bm-go")||"").split("::");
      const entry = _bmFind(bid, eid);
      close();
      _bmOpenFromEntry(bid, entry, false);
    };
  });
  wrap.querySelectorAll("[data-bm-play]").forEach(btn=>{
    btn.onclick = ()=>{
      const [bid, eid] = String(btn.getAttribute("data-bm-play")||"").split("::");
      const entry = _bmFind(bid, eid);
      if(entry) playOneShotTTS(entry.raw || entry.tr || "");
    };
  });
  wrap.querySelectorAll("[data-bm-del]").forEach(btn=>{
    btn.onclick = ()=>{
      const [bid, eid] = String(btn.getAttribute("data-bm-del")||"").split("::");
      removeBookmarkEntry(bid, eid);
      close();
      showBookBookmarksSheet(bid);
    };
  });
}

function hasAnyBookmarks(bookId){
  try{ return loadBookmarks(bookId).length>0; }catch(e){ return false; }
}

function go(route, {push=true}={}){
  if(push && state.route && state.route.name){
    state.navStack.push({...state.route});
  }
  // save progress before leaving reading screens
  if(state.route && (state.route.name === 'reader' || state.route.name === 'bireader')){
    saveReadingProgress();
  }
  const __prevRoute = state.route || null;
  const __prevBookId = __prevRoute && (__prevRoute.bookId || __prevRoute.id) ? String(__prevRoute.bookId || __prevRoute.id) : null;
  const __nextBookId = route && (route.bookId || route.id) ? String(route.bookId || route.id) : null;

  // If switching to another book, hard-reset all transient reader indices to avoid "progress leaking"
  if(__prevBookId && __nextBookId && __prevBookId !== __nextBookId){
    try{ stopReading(); }catch(e){}
    setCursorIndex(0, {syncUI:false});
    state.reading.activeParaIndex = 0;
    state.reading.resumeIndexReader = 0;
    state.reading.activeBiLineIndex = 0;
    state.reading.resumeIndexBi = 0;
    state.reading.cursorIndex = 0;
    state.reading.activeTokenIndex = -1;
    state.reading.tokenMap = [];
    try{ state.reading.translateCache?.clear?.(); }catch(e){}
  }

  state.route = route;
  document.body.dataset.route = route.name || "";
  updateModeSwitchUI();
  try{ if(route.name!=="reader" && route.name!=="bireader"){ _clearPendingBookmarkPlayChoice(); } }catch(e){}

  if(route.name === "catalog"){
    state.book = null;
    stopReading({save:true});
    renderCatalog();
    hidePlayer();
  }
  
  if(route.name === "library"){
    state.book = null;
    stopReading({save:true});
    renderLibrary();
    hidePlayer();
  }
if(route.name === "details"){
    stopReading({save:true});
    loadBook(route.bookId, state.reading.sourceLang, (typeof core?.getState==="function" ? core.getState().level : (state.level||"original"))).then(book=>{
      state.book = book;
      _coreApplyBookMeta(book);
      renderDetails();
      hidePlayer();
    });
  }
  if(route.name === "reader"){
    stopReading({save:true});
    loadBook(route.bookId, state.reading.sourceLang, (typeof core?.getState==="function" ? core.getState().level : (state.level||"original"))).then(book=>{
      state.book = book;
      _coreApplyBookMeta(book);
      renderReader();
      showPlayer();
      let idx = (function(){ try{ return restoreReadingProgress()||0; }catch(e){ return 0; } })();
      // Fallback: when switching modes, route.startIndex carries the last cursor
      const __fallbackStart = Number(state.route?.startIndex);
      if((!Number.isFinite(idx) || idx===0) && Number.isFinite(__fallbackStart) && __fallbackStart>0){ idx = __fallbackStart; }
      // Force jump (bookmarks)
      if(state.route?.forceStartIndex && Number.isFinite(__fallbackStart) && __fallbackStart>=0){ idx = __fallbackStart; }
      try{ state.route.forceStartIndex = false; }catch(e){}


      try{ clearAllWordHighlights(); }catch(e){}
      setCursorIndex(idx, {syncUI:true, scroll:true});

      // If bookmark targets a specific word, highlight it (one-shot)
      try{
        const wi = Number(state.route?.startWordIndex);
        if(Number.isFinite(wi) && wi >= 0){
          setActiveParaWord(idx, wi);
          const wEl = state.reading.paraWords?.[idx]?.[wi];
          if(wEl && wEl.getBoundingClientRect){
            const r = wEl.getBoundingClientRect();
            const topZone = window.innerHeight * 0.25;
            const botZone = window.innerHeight * 0.75;
            if(r.top < topZone || r.bottom > botZone){
              window.scrollBy({top: (r.top - window.innerHeight/2), behavior:"smooth"});
            }
          }
        }
      }catch(e){}

      // Consume one-shot bookmark routing params to avoid "sticky" jumps
      try{ delete state.route.startIndex; }catch(e){}
      try{ delete state.route.startWordIndex; }catch(e){}
      try{ delete state.route.forceStartIndex; }catch(e){}
    });
  }

  if(route.name === "bireader"){
    stopReading({save:true});
    loadBook(route.bookId, state.reading.sourceLang, (typeof core?.getState==="function" ? core.getState().level : (state.level||"original"))).then(book=>{
      state.book = book;
      _coreApplyBookMeta(book);
      renderBiReader();
      showPlayer();
      let idx = (function(){ try{ return restoreReadingProgress()||0; }catch(e){ return 0; } })();
      // Fallback: when switching modes, route.startIndex carries the last cursor
      const __fallbackStart = Number(state.route?.startIndex);
      if((!Number.isFinite(idx) || idx===0) && Number.isFinite(__fallbackStart) && __fallbackStart>0){ idx = __fallbackStart; }
      // Force jump (bookmarks)
      if(state.route?.forceStartIndex && Number.isFinite(__fallbackStart) && __fallbackStart>=0){ idx = __fallbackStart; }
      try{ state.route.forceStartIndex = false; }catch(e){}


      try{ clearAllWordHighlights(); }catch(e){}
      setCursorIndex(idx, {syncUI:true, scroll:true});

      // If bookmark targets a specific word, highlight it (one-shot)
      try{
        const wi = Number(state.route?.startWordIndex);
        if(Number.isFinite(wi) && wi >= 0){
          setActiveParaWord(idx, wi);
          const wEl = state.reading.paraWords?.[idx]?.[wi];
          if(wEl && wEl.getBoundingClientRect){
            const r = wEl.getBoundingClientRect();
            const topZone = window.innerHeight * 0.25;
            const botZone = window.innerHeight * 0.75;
            if(r.top < topZone || r.bottom > botZone){
              window.scrollBy({top: (r.top - window.innerHeight/2), behavior:"smooth"});
            }
          }
        }
      }catch(e){}

      // Consume one-shot bookmark routing params to avoid "sticky" jumps
      try{ delete state.route.startIndex; }catch(e){}
      try{ delete state.route.startWordIndex; }catch(e){}
      try{ delete state.route.forceStartIndex; }catch(e){}
    });
  }
}

function hidePlayer(){ player.style.display="none"; }
function showPlayer(){
  player.style.display="block";
  pTitle.textContent = getBookTitle(state.book) || "Reader";
  updateProgressUI();
}



function updateModeSwitchUI(){
  try{
    if(!modeListen || !modeRead) return;
    modeListen.classList.toggle("active", state.route?.name === "reader");
    modeRead.classList.toggle("active", state.route?.name === "bireader");
  }catch(e){}
}


/* ===========================
   Books loader (index.json + per-folder book.json) + fallback
=========================== */
async function loadCatalog(){
  const fallbackCatalog = FALLBACK_BOOKS.map(b => normalizeCatalogItem({
    id: b.id,
    series: b.series,
    title_ua: b.title_ua,
    title_en: b.title_en,
    level: b.level,
    durationMin: b.durationMin,
    cover: b.cover
  }));

  try{
    const res = await fetch(BOOKS_INDEX_URL, {cache:"no-store"});
    if(!res.ok) throw new Error("index not ok");
    const remoteRaw = await res.json();

    const remote = (remoteRaw || []).map(normalizeCatalogItem);

    const ids = new Set(remote.map(x=>x.id));
    state.catalog = [...remote, ...fallbackCatalog.filter(x=>!ids.has(x.id))];
  }catch(e){
    state.catalog = fallbackCatalog;
  }
}

function _normalizeLevel(lv){
  lv = String(lv||"original").trim().toLowerCase();
  if(lv === "orig") lv = "original";
  if(lv === "a0") lv = "a1"; // defensive
  if(["original","a1","a2","b1"].includes(lv)) return lv;
  return "original";
}

async function loadBook(id, sourceLang, level){
  const lang = String(sourceLang || "en").trim().toLowerCase();
  const uiL = getUiLang ? getUiLang() : "en";
  const lv = _normalizeLevel(level || (typeof core?.getState==="function" ? core.getState().level : (state.level||"original")));
  const cacheId = `${id}::${lang}::${uiL}::${lv}`;
  if(state.bookCache.has(cacheId)) return state.bookCache.get(cacheId);

  const basePath = `books/${encodeURIComponent(id)}`;
  const remoteUrl = `${basePath}/book.json`;

  try{
    const res = await fetch(remoteUrl, {cache:"no-store"});
    if(!res.ok) throw new Error("book not ok");
    const raw = await res.json();

    // If no "text" array provided, load plain text file.
    // New structure (preferred): books/<id>/levels/<level>/book.<lang>.txt
    // Fallbacks: levels/original -> legacy book.<lang>.txt -> book.txt
    if(!raw.text){
      const fallbackFile = raw.textFile || "book.txt";

      async function fetchTextFile(relPath){
        const r = await fetch(`${basePath}/${relPath}`, {cache:"no-store"});
        if(!r.ok) return null;
        let txt = await r.text();
        txt = txt.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        return txt;
      }

      const candidates = [];
      // preferred: level folder
      candidates.push(`levels/${lv}/book.${lang}.txt`);
      if(lang !== "en") candidates.push(`levels/${lv}/book.en.txt`);
      // fallback to original level
      if(lv !== "original"){
        candidates.push(`levels/original/book.${lang}.txt`);
        if(lang !== "en") candidates.push(`levels/original/book.en.txt`);
      }
      // legacy
      if(lang !== "en") candidates.push(`book.${lang}.txt`);
      candidates.push(fallbackFile);

      let txt = null;
      for(const rel of candidates){
        txt = await fetchTextFile(rel);
        if(txt != null) break;
      }
      raw.text = txt ? txt.split("\n") : [];
    }

    // Chapters: prefer levels/<level>/chapters.json, then levels/original/chapters.json, then legacy/raw/auto.
    try{
      async function fetchChapters(relPath){
        const r = await fetch(`${basePath}/${relPath}`, {cache:"no-store"});
        if(!r.ok) return null;
        return await r.json();
      }
      let ch = await fetchChapters(`levels/${lv}/chapters.json`);
      if(ch==null && lv !== "original") ch = await fetchChapters(`levels/original/chapters.json`);
      if(Array.isArray(ch) && ch.length){
        raw.chapters = ch;
      }
    }catch(e){}


    // Description as separate files (desc.<uiLang>.txt), optional.
    // Tries desc.<uiLang>.txt -> desc.en.txt -> book.json description fields.
    try{
      const uiLang = (typeof getUiLang==="function" ? getUiLang() : "en");
      async function fetchDescFile(fileName){
        const r = await fetch(`${basePath}/${fileName}`, {cache:"no-store"});
        if(!r.ok) return null;
        let txt = await r.text();
        txt = txt.replace(/^\uFEFF/, "").replace(/\r\n/g,"\n").replace(/\r/g,"\n").trim();
        return txt;
      }
      let descTxt = await fetchDescFile(`desc.${uiLang}.txt`);
      if(descTxt==null) descTxt = await fetchDescFile(`desc.${uiLang==="uk"?"ua":uiLang}.txt`);
      if(descTxt==null) descTxt = await fetchDescFile(`desc.en.txt`);
      if(descTxt!=null){
        raw.description_i18n = raw.description_i18n || {};
        raw.description_i18n[uiLang] = descTxt;
      }
    }catch(e){}

    const book = normalizeBookJson(raw, id);
    book.sourceLang = lang;
    book.levelVersion = lv;

    state.bookCache.set(cacheId, book);
    return book;
  }catch(e){
    const fb = FALLBACK_BOOKS.find(b=>b.id===id) || FALLBACK_BOOKS[0];
    // keep fallback cached per lang key to prevent toggles from sticking to an older cached book
    state.bookCache.set(cacheId, fb);
    return fb;
  }
}

/* ---------------------------
   UI renderers
--------------------------- */
function renderTopbar(title){
  return `
    <div class="topbar">
      <div class="brand">
        <button class="navbtn" id="topBack" title="Back">← Назад</button>
        <div style="width:34px;height:34px;border-radius:12px;background:linear-gradient(135deg,#1e88e5,#2aa7ff);"></div>
        <div class="brandTitle">${escapeHtml(title)}</div>
        <span class="pill">GitHub Pages</span>
      </div>
      <button class="navbtn" id="topHome">Каталог</button>
    </div>
  `;
}

function renderCatalog(){
  // "Books" home screen
  const groups = {};
  state.catalog.forEach(b=>{
    const g = (b.series || "Books").trim();
    (groups[g] ||= []).push(b);
  });
  const groupNames = Object.keys(groups);

  // pick continue reading book = last interaction across books (fallback to max progress)
  let cont = null;
  let contPct = 0;
  try{
    const g = getGlobalLastInteraction();
    if(g && g.bookId){
      cont = state.catalog.find(b=>b.id===g.bookId) || null;
      if(cont){
        const lp = getPkgProgress(cont.id, g.sourceLang, g.targetLang);
        if(lp && typeof lp.progress === 'number') contPct = Number(lp.progress||0);
      }
    }
    if(!cont){
      for(const b of state.catalog){
        const pkgs = listPkgProgress(b.id);
        if(pkgs && pkgs.length){
          const latest = pkgs[0];
          const ts = Number(latest.ts||0);
          const bestTs = cont ? Number((listPkgProgress(cont.id)[0]||{}).ts||0) : -1;
          if(!cont || ts > bestTs){
            cont = b;
            contPct = Number(latest.progress||0);
          }
        }else{
          const r = JSON.parse(sessionStorage.getItem(progressKey(b.id,'reader') ) || "null");
          const br = JSON.parse(sessionStorage.getItem(progressKey(b.id,'bireader')) || "null");
          const p = Math.max(r?.progress||0, br?.progress||0);
          if(p > contPct){
            contPct = p;
            cont = b;
          }
        }
      }
    }
  }catch(e){}

  // Show progress for the last used language package (if available)
  let contShowPct = contPct;
  let contShowLabel = "";
  let contLevelLabel = t("level_original");
  let contMeta1 = "";
  let contMeta2 = "";

  if(cont){
    const _series = String((cont.series||"")||"").trim() || "NEW";
    const _author = String((cont.author||"")||"").trim();
    contMeta1 = [_author, _series].filter(Boolean).join(" • ") || _series;
    contMeta2 = "";

    // Safe get last package for this book
    let last = null;
    try{ last = (typeof getLastPkg === "function") ? getLastPkg(cont.id) : null; }catch(e){ last = null; }

    // Fallback label from current reading state (if any)
    const fallbackLabel = (() => {
      try{
        if(last && last.sourceLang && last.targetLang){
          const modeTxt = (last.mode && String(last.mode).toLowerCase()==="listen") ? t("mode_listen") : t("mode_read");
          return `${flagEmoji(last.sourceLang)} ${String(last.sourceLang).toUpperCase()}→${flagEmoji(last.targetLang)} ${String(last.targetLang).toUpperCase()} (${modeTxt})`;
        }
      }catch(e){}
      return "";
    })();

    if(last){
      if(last.level) contLevelLabel = String(last.level);
      // Prefer formatted label (EN→UK (Listen))
      try{
        if(typeof formatPkgLabel === "function"){
          contShowLabel = formatPkgLabel(last.sourceLang, last.targetLang, last.mode);
        }
      }catch(e){}

      // Prefer progress from pkg storage (level-aware if supported)
      try{
        if(typeof getPkgProgress === "function"){
          let lp = null;
          try{ lp = getPkgProgress(cont.id, last.sourceLang, last.targetLang, last.level); }catch(e){ lp = getPkgProgress(cont.id, last.sourceLang, last.targetLang); }
          if(lp && typeof lp.progress === "number") contShowPct = Number(lp.progress||0);
        }
      }catch(e){}
    }

    const pctTxt = `${Math.round(contShowPct)}%`;
    const labelTxt = contShowLabel || fallbackLabel;
    const lvlTxt = formatLevelLabel(contLevelLabel || "original");
    contMeta2 = labelTxt ? `${lvlTxt} • ${labelTxt} • ${pctTxt}` : `${lvlTxt} • ${pctTxt}`;
  }

  app.innerHTML = `
    <div class="wrap homeScreen">
      <div class="appHeader">
        <button class="tab" id="tabBooks">${t("tabs_books")}</button>
        <button class="tab muted" id="tabLibrary">${t("tabs_library")}</button>
      </div>

      ${cont ? `
        <div class="sectionLabel">${t("continue_reading")}</div>
        <div class="cardWide" id="continueCard" role="button" tabindex="0">
          <div class="coverImg">${cont.cover ? `<img src="${escapeHtml(cont.cover)}" alt="">` : ``}</div>
          <div class="info">
            <p class="title">${escapeHtml(getBookTitle(cont) || "Book")}</p>
            <p class="meta meta1">${escapeHtml((typeof contMeta1!=='undefined')?contMeta1:'')}</p>
            <p class="meta meta2">${escapeHtml((typeof contMeta2!=='undefined')?contMeta2:'')}</p>
          </div>
          <div class="circle" style="--p:${Math.round(contShowPct)}%">
            <div class="inner">${Math.round(contShowPct)}%</div>
          </div>
        </div>
      ` : ``}

      ${groupNames.map(g=>{
        const items = groups[g].slice(0, 10);
        return `
          <div class="groupCard">
            <div class="groupTitleRow">
              <h3 class="groupTitle">${escapeHtml(tGenre(g))}</h3>
              <button class="chevBtn" data-group="${escapeHtml(g)}">›</button>
            </div>
            <div class="hScroll">
              ${items.map(b=>`
                <div class="bookTile" data-open="${escapeHtml(b.id)}">
                  <div class="tileCover">
                    ${b.cover ? `<img src="${escapeHtml(b.cover)}" alt="">` : ``}
                  </div>
                  <div class="tileMeta">
                    <p class="tileTitle">${escapeHtml(getBookTitle(b) || "Book")}</p>
                    <p class="tileSub">${escapeHtml(formatMetaAuthorSeries(b))}</p>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `;

// Enrich Continue card meta1 with author if it was missing in catalog entry
try{
  if(cont && (!cont.author || !String(cont.author).trim())){
    const meta1El = document.querySelector("#continueCard .meta1");
    const cur = meta1El ? meta1El.textContent.trim() : "";
    // if meta1 is only series (e.g., "NEW"), try to load book.json once
    if(meta1El && cur && (!cur.includes("•"))){
      fetch(`books/${cont.id}/book.json`).then(r=>r.ok?r.json():null).then(j=>{
        if(!j) return;
        const _series = String((j.series||cont.series||"")||"").trim() || "NEW";
        const _author = String((j.author||"")||"").trim();
        const txt = [_author,_series].filter(Boolean).join(" • ") || _series;
        meta1El.textContent = txt;
      }).catch(()=>{});
    }
  }
}catch(e){}
      }).join("")}
    </div>
  `;

  document.getElementById("tabBooks").onclick = ()=>go({name:"catalog"}, {push:false});
  document.getElementById("tabLibrary").onclick = ()=>go({name:"library"}, {push:false});

  if(cont){
    const openCont = ()=>{
      try{
        const last = getGlobalLastInteraction();
        const bid = cont.id;
        if(last && String(last.bookId||"")===String(bid||"")){
          state.reading.sourceLang = last.sourceLang || state.reading.sourceLang;
          state.reading.targetLang = last.targetLang || state.reading.targetLang;
          const pkg = getPkgProgress(bid, state.reading.sourceLang, state.reading.targetLang);
          const idx = pkg && typeof pkg.activeIndex==="number" ? Number(pkg.activeIndex||0) : 0;
          if(String(last.mode||"")==="read"){
            go({name:"bireader", bookId: bid, startIndex: idx});
          }else{
            go({name:"reader", bookId: bid, startIndex: idx});
          }
          return;
        }
      }catch(e){}
      go({name:"details", bookId: cont.id});
    };
    const cc = document.getElementById("continueCard");
    cc.onclick = openCont;
    cc.onkeydown = (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openCont(); } };
  }

  app.querySelectorAll("[data-open]").forEach(el=>{
    el.addEventListener("click", ()=>go({name:"details", bookId: el.dataset.open}));
  });

  app.querySelectorAll("[data-group]").forEach(el=>{
    el.addEventListener("click", ()=>alert("Фільтри/пошук по жанру можна додати пізніше."));
  });
}

function renderLibrary(){
  // My Library screen
  const tab = state.ui?.libraryTab || "progress"; // 'progress' | 'finished' | 'bookmarks'

  const hasBookmarks = (bookId)=>{
    try{
      const k = `bm:${bookId}`;
      const s = localStorage.getItem(k) || sessionStorage.getItem(k);
      if(!s) return false;
      const arr = JSON.parse(s);
      return Array.isArray(arr) && arr.length>0;
    }catch(e){
      return false;
    }
  };
  const rows = state.catalog.map(b=>{
    // main progress shown in UI = last used language package for this book (fallback to legacy max)
    let mainP = 0;
    let maxP = 0;
    let pkgs = [];
    try{
      pkgs = listPkgProgress(b.id);
      if(pkgs && pkgs.length){
        maxP = Math.max(...pkgs.map(x=>Number(x.progress||0)));
        const last = getLastPkg(b.id);
        if(last){
          const lp = getPkgProgress(b.id, last.sourceLang, last.targetLang, normalizeLevel(last.level||"original"));
          if(lp && typeof lp.progress === "number") mainP = Number(lp.progress||0);
          else mainP = Number(maxP||0);
        }else{
          mainP = Number(maxP||0);
        }
      }
    }catch(e){}
    // fallback to legacy progress if no package progress exists yet
    if(!pkgs || !pkgs.length){
      let r=null, br=null;
      try{
        r = JSON.parse(sessionStorage.getItem(progressKey(b.id,'reader')) || "null");
        br = JSON.parse(sessionStorage.getItem(progressKey(b.id,'bireader')) || "null");
      }catch(e){}
      maxP = Math.max(Number(r?.progress||0), Number(br?.progress||0));
      mainP = maxP;
    }
        // Build chips: always put "Resume" (last pkg) first when available
    let chips = [];
    try{
      const last = getLastPkg(b.id);
      if(last){
        const lv = normalizeLevel(last.level||"original");
        const lp = getPkgProgress(b.id, last.sourceLang, last.targetLang, lv);
        if(lp && typeof lp.progress === "number"){
          chips.push({
            sourceLang: String(last.sourceLang||"").toLowerCase(),
            targetLang: String(last.targetLang||"").toLowerCase(),
            mode: String(last.mode||"read").toLowerCase(),
            level: lv,
            progress: Number(lp.progress||0),
            ts: Number(last.ts||lp.ts||0),
            isResume: true
          });
        }
      }
    }catch(e){}
    try{
      const all = (pkgs||[]);
      for(const o of all){
        if(chips.length>=3) break;
        const s = String(o.sourceLang||"").toLowerCase();
        const t = String(o.targetLang||"").toLowerCase();
        const lv = normalizeLevel(o.level||"original");
        const m = String(o.mode||"read").toLowerCase();
        const same = chips.some(c=> c.sourceLang===s && c.targetLang===t && normalizeLevel(c.level||"original")===lv && String(c.mode||"read").toLowerCase()===m);
        if(same) continue;
        chips.push(o);
      }
    }catch(e){}
    const lastTs = chips.length ? Number(chips[0].ts||0) : ((pkgs && pkgs.length) ? Number(pkgs[0].ts||0) : 0);
    return {b, p: mainP, maxP, lastTs, pkgs: chips};
  }).filter(x=> x.p>0 || tab==="finished"); // show all if finished? keep simple

  const inProgress = rows.filter(x=> x.maxP>0 && x.maxP<99.5).sort((a,b)=> (Number(b.lastTs||0)-Number(a.lastTs||0)) || (b.maxP-a.maxP));
  const finished = rows.filter(x=> x.maxP>=99.5).sort((a,b)=> (Number(b.lastTs||0)-Number(a.lastTs||0)) || (b.maxP-a.maxP));

  let list = (tab==="finished" ? finished : inProgress);
  if(tab==="bookmarks"){
    list = rows.filter(({b})=>hasBookmarks(b.id)).sort((a,b)=> (Number(b.lastTs||0)-Number(a.lastTs||0)) || (b.p-a.p));
  }

  let bookmarksGroups = [];
  if(tab==="bookmarks"){
    bookmarksGroups = list.map(({b})=>({
      b,
      items: loadBookmarks(b.id)
    })).filter(g=>g.items && g.items.length);
  }

  app.innerHTML = `
    <div class="wrap">
      <div class="appHeader">
        <button class="tab muted" id="tabBooks">${t("tabs_books")}</button>
        <button class="tab" id="tabLibrary">${t("tabs_library")}</button>
      </div>

      <div style="padding: 0 18px 8px 18px;">
        <div class="segmented">
          <button class="libSegBtn ${tab==="progress"?"active":""}" id="libInProgress">${t("lib_in_progress")}</button>
          <button class="libSegBtn ${tab==="finished"?"active":""}" id="libFinished">${t("lib_finished")}</button>
          <button class="libSegBtn ${tab==="bookmarks"?"active":""}" id="libBookmarks">${t("lib_bookmarks")}</button>
        </div>
      </div>

      <div class="libraryList">
        ${tab==="bookmarks" ? (
          (bookmarksGroups.length ? bookmarksGroups.map(({b,items})=>`
            <div class="bmBook">
              <div class="bmHead" data-open="${escapeHtml(b.id)}">
                <div class="bmCover">${b.cover ? `<img src="${escapeHtml(b.cover)}" alt="">` : ``}</div>
                <div style="flex:1; min-width:0;">
                  <div class="bmTitleRow">
                    <p class="bmTitle">${escapeHtml(getBookTitle(b) || "Book")}</p>
                    ${tab==="bookmarks" && state.ui?.backToBook && state.ui.backToBook.bookId===b.id ? ` <button class="bmBackMini inline" id="backToBookBtn" title="Back to book">↩︎ ${t("btn_back")}</button>` : ``}
                  </div>
                </div>
                  ${(()=>{ const _m=[String((b.author||"")||"").trim(), String((b.series||"")||"").trim()].filter(Boolean).join(" • "); return _m? `<p class="bmMeta">${escapeHtml(_m)}</p>` : ``; })()}
                              </div>
              <div class="bmItems">
                ${(()=>{ 
                  const groups = [];
                  const keyOrder = [];
                  const keyMap = new Map();
                  (items||[]).forEach(it=>{
                    const lvl = String(it.level||"original");
                    const src = String(it.sourceLang||"en");
                    const trg = String(it.targetLang||"uk");
                    const md  = String(it.mode||"read");
                    const key = lvl+"|"+src+"|"+trg+"|"+md;
                    if(!keyMap.has(key)){
                      const g = {key, level:lvl, src, trg, mode:md, items:[]};
                      keyMap.set(key, g);
                      groups.push(g);
                    }
                    keyMap.get(key).items.push(it);
                  });
                  // Prefer the most recently used lang pair (per current app context) at the top
                  try{
                    const last = state.ui?.lastBmCtx;
                    const prefKey = (last && String(last.bookId)===String(b.id)) ? (String(last.level||"original")+"|"+String(last.sourceLang||"en")+"|"+String(last.targetLang||"uk")+"|"+String(last.mode||"read")) : "";
                    groups.forEach(g=>{
                      try{
                        g._ts = Math.max.apply(null, (g.items||[]).map(x=>Number(x.createdAt||0)));
                      }catch(e){ g._ts = 0; }
                    });
                    groups.sort((a,b)=>{
                      const ap = (prefKey && a.key===prefKey) ? 1 : 0;
                      const bp = (prefKey && b.key===prefKey) ? 1 : 0;
                      if(ap!==bp) return bp-ap;
                      return Number(b._ts||0)-Number(a._ts||0);
                    });
                  }catch(e){}

                  return groups.map(g=>`
                    <div class="bmGroupHdr" data-resume="${escapeHtml(b.id)}|${escapeHtml(String(g.level||'original'))}|${escapeHtml(String(g.src||'en'))}|${escapeHtml(String(g.trg||'uk'))}|${escapeHtml(String(g.mode||'read'))}" role="button" tabindex="0" title="Resume">
                      <span class="bmLevel">${escapeHtml(formatLevelLabel(g.level))}</span>
                      <span class="bmSep">•</span>
                      <span class="bmPkg">${escapeHtml(formatPkgLabel(g.src,g.trg,g.mode))}</span>
                    </div>
                    ${g.items.map((it, idx)=>`
                      <div class="bmItem" data-bm-item>
                        <div class="bmMain">
                          <p class="bmLabel">#${idx+1}</p>
                          <p class="bmRaw">${escapeHtml(it.raw||it.tr||"")}</p>
                          ${(it.tr && it.raw && it.tr!==it.raw) ? `<p class="bmTr">${escapeHtml(it.tr)}</p>` : ``}
                        </div>
                        <div class="bmBtns">
                          <button class="bmBtn" data-bm-play="${escapeHtml(b.id)}::${escapeHtml(it.id)}" title="Play">🔊</button>
                          <button class="bmBtn primary" data-bm-go="${escapeHtml(b.id)}::${escapeHtml(it.id)}" title="Go">↪︎</button>
                          <button class="bmBtn" data-bm-del="${escapeHtml(b.id)}::${escapeHtml(it.id)}" title="Unbookmark">✕</button>
                        </div>
                      </div>
                    `).join("")}
                  `).join("");
                })()}
              </div>
            </div>
          `).join("") : `<div style="color:rgba(0,0,0,.45);font-weight:800;padding:18px 4px;">No bookmarks yet.</div>`)
        ) : (
          (list.length ? list.map(({b,p,pkgs})=>`
            <div class="libraryItem" data-open="${escapeHtml(b.id)}">
              <div class="coverImg">${b.cover ? `<img src="${escapeHtml(b.cover)}" alt="">` : ``}</div>
              <div style="flex:1; min-width:0;">
                <p class="title">${escapeHtml(getBookTitle(b) || "Book")}</p>
                <p class="meta">${escapeHtml(formatMetaAuthorSeries(b))}</p>
                ${pkgs && pkgs.length ? `
                  <div class="pkgRow">
                    ${pkgs.map(x=>{
                      const s = String(x.sourceLang||"").toLowerCase();
                      const trg = String(x.targetLang||"").toLowerCase();
                      const m = String(x.mode||"read").toLowerCase();
                      const lv = normalizeLevel(x.level||"original");
                      const modeLabel = t(m==="listen" ? "mode_listen" : "mode_read");
                      const pct = Math.round(Number(x.progress||0));
                      const isResume = !!x.isResume;
                      const lvLabel = (lv==="original") ? t("level_original") : String(lv).toUpperCase();
                      const lead = lvLabel;
                      const resumeKey = `${escapeHtml(b.id)}|${escapeHtml(lv)}|${escapeHtml(s)}|${escapeHtml(trg)}|${escapeHtml(m)}`;
                      return `<span class="pkgChip ${isResume?'resume':''}" data-resume="${resumeKey}" role="button" tabindex="0" title="Resume"><span class="lvl">${lead}</span><span class="sep">•</span> ${flagFor(s)} ${s.toUpperCase()} <span class="arrow">→</span> ${flagFor(trg)} ${trg.toUpperCase()} <span class="sep">•</span> <span class="mode">${modeLabel}</span> <span class="sep">•</span> <span class="pct">${pct}%</span></span>`;
                    }).join("")}
                  </div>
                ` : ``}
              </div>
              <div class="circle" style="--p:${Math.round(p)}%"><div class="inner">${Math.round(p)}%</div></div>
            </div>
          `).join("") : `<div style="color:rgba(0,0,0,.45);font-weight:800;padding:18px 4px;">No books yet.</div>`)
        )}
      </div>
    </div>
  `;

  document.getElementById("tabBooks").onclick = ()=>go({name:"catalog"}, {push:false});
  document.getElementById("tabLibrary").onclick = ()=>go({name:"library"}, {push:false});

  document.getElementById("libInProgress").onclick = ()=>{
    state.ui = state.ui || {};
    state.ui.libraryTab="progress";
    renderLibrary();
  };
  document.getElementById("libFinished").onclick = ()=>{
    state.ui = state.ui || {};
    state.ui.libraryTab="finished";
    renderLibrary();
  };

  document.getElementById("libBookmarks").onclick = ()=>{
    state.ui = state.ui || {};
    state.ui.libraryTab="bookmarks";
    renderLibrary();
  };

  const __btb = document.getElementById("backToBookBtn");
  if(__btb){
    __btb.onclick = (e)=>{
      try{ e.preventDefault(); e.stopPropagation(); }catch(_e){}
      const ctx = state.ui?.backToBook;
      if(!ctx || !ctx.bookId) return;
      try{ state.reading.level = ctx.level || state.reading.level || "original"; }catch(e){}
      try{ state.reading.sourceLang = ctx.src || state.reading.sourceLang || "en"; }catch(e){}
      try{ state.reading.targetLang = ctx.trg || state.reading.targetLang || "uk"; }catch(e){}
      const routeName = (String(ctx.mode||"read")==="listen") ? "reader" : "bireader";
      // Return to the last saved progress for this book+level+langpair (no forced index)
      try{ delete state.ui.backToBook; }catch(e){}
      go({name: routeName, bookId: ctx.bookId}, {push:false});
    };
  }

  // Make progress chips clickable: resume by book+level+langpair+mode
  app.querySelectorAll('.pkgChip[data-resume]').forEach(ch=>{
    const act = (e)=>{
      try{ e.preventDefault(); e.stopPropagation(); }catch(_e){}
      const key = String(ch.dataset.resume||'');
      const parts = key.split('|');
      if(parts.length<5) return;
      const [bookId, level, src, trg, mode] = parts;
      try{ state.reading.level = level || state.reading.level || 'original'; }catch(e){}
      try{ state.reading.sourceLang = src || state.reading.sourceLang || 'en'; }catch(e){}
      try{ state.reading.targetLang = trg || state.reading.targetLang || 'uk'; }catch(e){}
      const routeName = (String(mode||'read')==='listen') ? 'reader' : 'bireader';
      let idx = 0;
      try{
        const pkg = getPkgProgress(bookId, src, trg, normalizeLevel(level||'original'));
        if(pkg && typeof pkg.activeIndex === 'number') idx = Number(pkg.activeIndex||0);
      }catch(e){}
      go({name: routeName, bookId, startIndex: idx});
    };
    ch.addEventListener('click', act);
    ch.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ act(e); } });
  });

  // Clickable: resume by group header in Library → Bookmarks (All bookmarks view)
  if(tab==="bookmarks"){
    app.querySelectorAll('.bmGroupHdr[data-resume]').forEach(h=>{
      const act = (e)=>{
        try{ e.preventDefault(); e.stopPropagation(); }catch(_e){}
        const key = String(h.dataset.resume||'');
        const parts = key.split('|');
        if(parts.length<5) return;
        const [bookId, level, src, trg, mode] = parts;
        try{ state.reading.level = level || state.reading.level || 'original'; }catch(e){}
        try{ state.reading.sourceLang = src || state.reading.sourceLang || 'en'; }catch(e){}
        try{ state.reading.targetLang = trg || state.reading.targetLang || 'uk'; }catch(e){}
        const routeName = (String(mode||'read')==='listen') ? 'reader' : 'bireader';
        let idx = 0;
        try{
          const pkg = getPkgProgress(bookId, src, trg, normalizeLevel(level||'original'));
          if(pkg && typeof pkg.activeIndex === 'number') idx = Number(pkg.activeIndex||0);
        }catch(e){}
        go({name: routeName, bookId, startIndex: idx});
      };
      h.addEventListener('click', act);
      h.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ act(e); } });
    });
  }


  app.querySelectorAll("[data-open]").forEach(el=>{
    el.addEventListener("click", ()=>go({name:"details", bookId: el.dataset.open}));
  });

  // bookmark buttons (play / go / delete)
  if(tab==="bookmarks"){
    app.querySelectorAll("[data-bm-play]").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.preventDefault();
        e.stopPropagation();
        const [bookId, entryId] = String(btn.dataset.bmPlay||"").split("::");
        const list = loadBookmarks(bookId);
        const it = (list||[]).find(x=>x && x.id===entryId);
        if(it) playOneShotTTS(it.raw || it.tr || "");
      });
    });
    app.querySelectorAll("[data-bm-go]").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.preventDefault();
        e.stopPropagation();
        const [bookId, entryId] = String(btn.dataset.bmGo||"").split("::");
        const listAll = loadBookmarks(bookId);
  // When opened from reading modes, show ONLY bookmarks for current context (level + lang pair + mode)
  let list = listAll;
  try{
    const inReading = state.route && (state.route.name==="reader" || state.route.name==="bireader");
    if(inReading){
      const lvl = String(_bmGetLevel()||"original");
      const pair = _bmGetLangPair();
      const md = String(_bmGetMode()||"read");
      list = (listAll||[]).filter(it=>{
        if(!it) return false;
        const il = String(it.level||"original");
        const is = String(it.sourceLang||pair.src||"en");
        const itg= String(it.targetLang||pair.trg||"uk");
        const im = String(it.mode||"read");
        return il===lvl && is===String(pair.src||"en") && itg===String(pair.trg||"uk") && im===md;
      });
    }
  }catch(e){ list = listAll; }
        const it = list.find(x=>x && x.id===entryId);
        const idx = Number(it?.paraIdx ?? it?.lineIndex ?? 0);
        const widx = (it && Number.isFinite(it.wordIndex) && it.wordIndex>=0) ? Number(it.wordIndex) : undefined;

        // Determine target mode from bookmark meta (fallback to current route)
        const bmMode = String(it?.mode||"").toLowerCase(); // "listen" or "read"
        const routeName = (bmMode === "listen") ? "reader" : (bmMode === "read" ? "bireader" : (state.route?.name === "bireader" ? "bireader" : "reader"));

        // Prepare "Continue vs Bookmark" choice for Play (only for Go, not for direct Play from bookmarks)
        try{
          const src = String(it?.sourceLang || state.reading?.sourceLang || "en").trim().toLowerCase();
          const trg = String(it?.targetLang || state.reading?.targetLang || "uk").trim().toLowerCase();
          const level = normalizeLevel(it?.level || state.reading?.level || "original");
          const prev = getPkgProgress(bookId, src, trg, level);
          const resumeIndex = Number.isFinite(prev?.activeIndex) ? Number(prev.activeIndex) : 0;

          state.ui = state.ui || {};
          state.ui.pendingBookmarkPlayChoice = {
            bookId: String(bookId),
            bookmarkIndex: idx,
            resumeIndex,
            src, trg, level,
            createdAt: Date.now()
          };
          state.ui.lockProgressUntilChoice = { bookId: String(bookId), src, trg, level, createdAt: Date.now() };
        }catch(_e){}

        go({name: routeName, bookId, startIndex: idx, forceStartIndex:true, startWordIndex: widx, autoPlay: false});
      });
    });
    app.querySelectorAll("[data-bm-del]").forEach(btn=>{
      btn.addEventListener("click", (e)=>{
        e.preventDefault();
        e.stopPropagation();
        const [bookId, entryId] = String(btn.dataset.bmDel||"").split("::");
        removeBookmarkEntry(bookId, entryId);
        renderLibrary();
      });
    });
  }
}


function renderDetails(){
  if(!state.book){ return go({name:"catalog"}, {push:false}); }
  const b = state.book;

  // progress (show last used language package; fallback to max)
  let savedPct = 0;
  let savedLabel = "";
  try{
    const last = getLastPkg(b.id);
    if(last){
      const lp = getPkgProgress(b.id, last.sourceLang, last.targetLang, normalizeLevel(last.level||"original"));
      if(lp && typeof lp.progress === "number"){
        savedPct = Number(lp.progress||0);
        savedLabel = formatPkgLabel(last.sourceLang, last.targetLang, last.mode);
      }
    }
    if(!savedLabel){
      const pkgs = listPkgProgress(b.id);
      if(pkgs && pkgs.length){
        const best = pkgs.reduce((a,c)=> (Number(c.progress||0) > Number(a.progress||0) ? c : a), pkgs[0]);
        savedPct = Number(best.progress||0);
        // Package progress is shared across modes; show label using the last used mode if possible.
        const m = (getLastPkg(b.id)?.mode) || pkgMode(state.route?.name||"reader");
        savedLabel = formatPkgLabel(best.sourceLang, best.targetLang, m);
      }else{
        const r = JSON.parse(sessionStorage.getItem(progressKey(b.id,'reader')) || 'null');
        const br = JSON.parse(sessionStorage.getItem(progressKey(b.id,'bireader')) || 'null');
        savedPct = Math.max(Number(r?.progress||0), Number(br?.progress||0));
      }
    }
  }catch(e){}
    const totalLinesForPages = Array.isArray(b.text) ? b.text.length : String(b.text||"").split(/\n/).filter(x=>x.trim()).length;
  const _fs = Number(state.reading.fontSize||22);
  const _lpp = Math.max(8, Math.round(14*22/_fs));
  const pagesEst = Math.max(1, Math.ceil(totalLinesForPages/_lpp));
  const meta1 = formatMetaAuthorSeries(b);
  let levelNow = String(state.reading.level||"");
  if(!levelNow){ try{ const lp = getLastPkg(b.id); if(lp && lp.level) levelNow = String(lp.level); }catch(e){} }
  levelNow = formatLevelLabel(levelNow || "original");
  const pctNow = Math.max(0, Math.round(Number(savedPct||0)));
  const pkgLine = `• ${levelNow} • ~${pagesEst} ${t("pages")} • ${pctNow}%${savedLabel?` • ${savedLabel}`:``}`;


  const uiL = getUiLang();
  const desc = (
    (b.description_i18n && (b.description_i18n[uiL] || b.description_i18n[uiL==="uk"?"ua":uiL])) ||
    (uiL==="uk" ? (b.description_ua || b.description_uk) : (uiL==="ru" ? b.description_ru : b.description_en)) ||
    b.description_en || b.description || ""
  ).trim();
  const descHtml = desc ? escapeHtml(desc).replace(/\n/g, "<br>") : "";


  // default book language from metadata (fallback to state or 'en')
  const bookLang = b.sourceLang || state.reading.sourceLang || "en";
  state.reading.sourceLang = bookLang;

  app.innerHTML = `
<div class="wrap">
  <div class="detailsWrap">
    <div class="detailsTop">
      <button class="iconBtn" id="detailsBack" title="Back">‹</button>
      <button class="iconBtn" id="detailsChapters" title="Chapters">≡</button>
      <button class="iconBtn" id="detailsBookmark" title="Bookmark">🔖</button>
    </div>

    <div class="detailsGrid">
      <div>
        <div class="detailsCover">
          ${b.cover ? `<img src="${escapeHtml(b.cover)}" alt="">` : ``}
        </div>
      </div>

      <div>
        <div>
          <h1 class="detailsTitle">${escapeHtml(getBookTitle(b) || "Book")}</h1>
          <p class="detailsMeta detailsMeta1">${escapeHtml(meta1)}</p>
          <p class="detailsMeta detailsMeta2">${escapeHtml(pkgLine)}</p>
          <div class="detailsDesc">${descHtml}</div>
        </div>

        <div class="formCard">
          <div class="formRow">
            <div class="label">${t("details_level")}</div>
            <button class="pillBtn" id="detailsLevelBtn"><span id="detailsLevelLabel">${escapeHtml(t("level_original"))}</span> <span style="opacity:.6;">▾</span><select id="dLevel" class="selOverlay"></select></button>
          </div>
          <div class="formRow">
            <div class="label">${t("details_book_lang")}</div>
            <button class="pillBtn" id="detailsBookLangBtn"><span id="detailsBookFlag">🇬🇧</span><span id="detailsBookLangLabel">English</span> <span style="opacity:.6;">▾</span><select id="dSourceLang" class="selOverlay"></select></button>
          </div>
          <div class="formRow">
            <div class="label">${t("details_trans_lang")}</div>
            <button class="pillBtn" id="detailsTransLangBtn"><span id="detailsTransFlag">UA</span><span id="detailsTransLangLabel">Ukrainian</span> <span style="opacity:.6;">▾</span><select id="dTargetLang" class="selOverlay"></select></button>
          </div>
        </div>


        <div class="bigActions">
          <button class="bigBtn" id="btnRead">≡ ${t("details_btn_read")}</button>
          <button class="bigBtn secondary" id="btnListen">🎧 ${t("details_btn_listen")}</button>
        </div>
      </div>
    </div>
  </div>
</div>
`;

  document.getElementById("detailsBack").onclick = ()=>go({name:"catalog"},{push:false});
  document.getElementById("detailsBookmark").onclick = ()=>showBookBookmarksSheet((state.route && state.route.bookId) || state.book?.id || state.route?.bookId);
const __dch = document.getElementById("detailsChapters");
  if(__dch){
    __dch.addEventListener("click", (e)=>{ try{ e.preventDefault(); e.stopPropagation(); }catch(_){} try{ openChapters(); }catch(err){} });
  }

  const src = document.getElementById("dSourceLang");
  const trg = document.getElementById("dTargetLang");
  const lvl = document.getElementById("dLevel");

  SOURCE_LANGS.forEach(l=>{
    const opt = document.createElement("option");
    opt.value = l.code;
    opt.textContent = flagFor(l.code) + " " + l.label;
    src.appendChild(opt);
  });
  TARGET_LANGS.forEach(l=>{
    const opt = document.createElement("option");
    opt.value = l.code;
    opt.textContent = flagFor(l.code) + " " + l.label;
    trg.appendChild(opt);
  });


  LEVELS.forEach(l=>{
    const opt = document.createElement("option");
    opt.value = l.code;
    opt.textContent = (String(l.code).toLowerCase()==='original') ? t('level_original') : l.label;
    lvl.appendChild(opt);
  });

  src.value = state.reading.sourceLang || "en";
  trg.value = state.reading.targetLang || "uk";
  state.reading.level = normalizeLevel(state.reading.level || "original");
  lvl.value = state.reading.level;

const bookLabel = document.getElementById("detailsBookLangLabel");
const transLabel = document.getElementById("detailsTransLangLabel");
const levelLabel = document.getElementById("detailsLevelLabel");
const bookFlag = document.getElementById("detailsBookFlag");
const transFlag = document.getElementById("detailsTransFlag");
function setLabels(){
  const sOpt = SOURCE_LANGS.find(x=>x.code===src.value);
  const tOpt = TARGET_LANGS.find(x=>x.code===trg.value);
  const lOpt = LEVELS.find(x=>x.code===lvl.value);
  if(bookLabel && sOpt) bookLabel.textContent = sOpt.label;
  if(transLabel && tOpt) transLabel.textContent = tOpt.label;
  if(levelLabel) levelLabel.textContent = formatLevelLabel(lvl.value);
  if(bookFlag) bookFlag.textContent = flagFor(src.value);
  if(transFlag) transFlag.textContent = flagFor(trg.value);
}
setLabels();

  src.onchange = ()=>{
    try{ stopReading({save:true}); }catch(e){}
    try{ saveReadingProgress(); }catch(e){}
    state.reading.sourceLang = src.value;
    try{ state.reading.translateCache.clear(); }catch(e){}
    setLabels();
    applyLanguagePairChange();
  };

  trg.onchange = ()=>{
    try{ stopReading({save:true}); }catch(e){}
    try{ saveReadingProgress(); }catch(e){}
    state.reading.targetLang = trg.value;
    try{ state.reading.translateCache.clear(); }catch(e){}
    setLabels();
    applyLanguagePairChange();
  };


  lvl.onchange = ()=>{
    try{ stopReading({save:true}); }catch(e){}
    try{ saveReadingProgress(); }catch(e){}
    state.reading.level = normalizeLevel(lvl.value);
    setLabels();
    applyLanguagePairChange();
  };

  document.getElementById("btnListen").onclick = ()=>{ try{ stopReading({save:true}); }catch(e){} state.reading.mode="listen"; state.reading.sourceLang = src.value; state.reading.targetLang = trg.value; try{ restoreProgressForPair(b.id, src.value, trg.value, state.reading.level); }catch(e){} go({name:"reader", bookId: b.id},{push:false}); };
  document.getElementById("btnRead").onclick = ()=>{ try{ stopReading({save:true}); }catch(e){} state.reading.mode="read"; state.reading.sourceLang = src.value; state.reading.targetLang = trg.value; try{ restoreProgressForPair(b.id, src.value, trg.value, state.reading.level); }catch(e){} go({name:"bireader", bookId: b.id},{push:false}); };
}

function renderReader(){
  if(!state.book){ return go({name:"catalog"}, {push:false}); }
  const b = state.book;

  setTheme(state.reading.night);
  syncSettingsUI();
  applyHighlightTheme();

  // Use first heading-like line as screen title if present
  const firstHeading = (b.text || []).find(t=>/^Chapter\s\d+:/i.test(String(t||"")) || /^The\s+/i.test(String(t||""))) || (b.title_en || "");
  const lines = (b.text || []);

  // chapter headings (start indices) for consistent styling across all languages
  const chapterStarts = new Set((getChapters()||[]).map(c=>Number(c.startIndex||0)).filter(n=>Number.isFinite(n)));

  app.innerHTML = `
    <div class="listenStage">
      <div class="listenTop">
        <div class="ltLeft">
          <button class="chevBtn" id="btnBooks" aria-label="Books">≡</button>
          <button class="chevBtn" id="readerBack" aria-label="Back">‹</button>
        </div>
        <div class="ltCenter">${escapeHtml(b.title_en || "Book")}</div>
        <div class="ltRight">
          <button class="topIcon" id="topChapters" title="Chapters">≡</button>
          <button class="topIcon" id="topBookmarks" title="Bookmarks">🔖</button>
          <button class="topIcon" id="topDev" title="Admin">⋯</button>
          <button class="topIcon" id="topSettings" title="Settings">⚙︎</button>
        </div>
      </div>

      <div class="listenTitle">${escapeHtml(String(firstHeading || ""))}</div>

      <div class="listenList">
        ${lines.map((p, i)=>{
          const raw = String(p ?? "");
          const isCh = chapterStarts.has(i);
          // keep empty lines as spacer
          if(raw === ""){
            return `<div style="height:10px"></div>`;
          }
          return `
            <div class="listenLine ${isCh ? "chapterLine" : ""}" data-para-wrap="${i}">
              ${renderParagraph(raw, i, isCh)}
              <button class="lineCardBtn" data-para-btn="${i}" title="Line translation">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M7 8h10M7 12h6M7 16h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  document.getElementById("readerBack").onclick = ()=>{ try{ stopReading(); }catch(e){} go({name:"details", bookId: (state.book?.id || state.route?.bookId || state.route?.id)},{push:false}); };
  const __books = document.getElementById("btnBooks");
  if(__books) __books.onclick = goCatalog;
  const __tc = document.getElementById("topChapters");
  if(__tc){
    __tc.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      try{ openChapters(); }catch(err){}
    });
  }

  // Important: stop propagation so the global "outside click" handler
  // doesn't instantly close the sheet right after it opens.
  const __ts = document.getElementById("topSettings");
  if(__ts){
    __ts.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      try{ openSettings(); }catch(err){}
    });
  }
  const __td = document.getElementById("topDev");
  if(__td){
    __td.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      try{ openDev(); }catch(err){}
    });
  }

  // Quick open Bookmarks
  const __tbm = document.getElementById("topBookmarks");
  if(__tbm){
    __tbm.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      // In Read/Listen screens open an in-page sheet with bookmarks of this book
      const rn = state.route?.name;
      if(rn === "reader" || rn === "bireader"){
        try{ state.ui = state.ui || {}; state.ui._resumeAudioAfterBMSheet = (typeof openaiAudio !== "undefined" && openaiAudio && openaiAudio.paused===false); }catch(err){}
        try{ if(typeof openaiAudio !== "undefined" && openaiAudio && openaiAudio.pause) openaiAudio.pause(); }catch(err){}
        try{ showBookBookmarksSheet(state.book?.id || state.route?.bookId); }catch(err){}
        return;
      }
      // Otherwise go to Library → Bookmarks (all)
      try{ stopReading(); }catch(err){}
      state.ui = state.ui || {};
      state.ui.libraryTab = "bookmarks";
      go({name:"library"}, {push:true});
    });
  }

  document.documentElement.style.setProperty("--fontSize", state.reading.fontSize + "px");
  document.documentElement.style.setProperty("--lineHeight", "1.9");

  buildTokenMap();
  buildParaWordMap();
  try{ applyBookmarkMarks(); }catch(e){}

  // If we navigated here from a bookmark, jump to that paragraph
  try{
    if(state.route && state.route.startPara != null){
      const sp = Math.max(0, Number(state.route.startPara||0));
      setCursorIndex(sp, {syncUI:false});
      state.reading.activeParaIndex = sp;
      state.reading.resumeIndexReader = sp;
      // highlight + scroll
      try{ clearActivePara(); }catch(e){}
      try{ setActivePara(sp); }catch(e){}
      // If bookmark targets a specific word, highlight it
      try{
        const wi = Number(state.route.startWordIndex);
        if(Number.isFinite(wi) && wi >= 0){
          setActiveParaWord(sp, wi);
          const wEl = state.reading.paraWords?.[sp]?.[wi];
          if(wEl && wEl.getBoundingClientRect){
            const r = wEl.getBoundingClientRect();
            const topZone = window.innerHeight * 0.25;
            const botZone = window.innerHeight * 0.75;
            if(r.top < topZone || r.bottom > botZone){
              window.scrollBy({top: (r.top - window.innerHeight/2), behavior:"smooth"});
            }
          }
        }
      }catch(e){}
      setTimeout(()=>{ try{ scrollToPara(sp); }catch(e){} }, 80);
      // consume once
      try{ delete state.route.startPara; }catch(e){}
      try{ delete state.route.startWordIndex; }catch(e){}
    }
  }catch(e){}

  // We do not show inline line translations in Listen UI; but we keep them cached.
  initReaderLineTranslations({silent:true});

  // Line card button
  [...document.querySelectorAll(".lineCardBtn")].forEach(btn=>{
    btn.addEventListener("click",(e)=>{
      e.stopPropagation();
      const idx = Number(btn.dataset.paraBtn);
      showLineCard(idx);
    });
  });

  // close popover on outside click
  document.addEventListener("click", onDocClick, {capture:true});
  updateProgressUI();
}
function renderBiReader(){
  if(!state.book){ return go({name:"catalog"}, {push:false}); }
  const b = state.book;

  setTheme(state.reading.night);
  syncSettingsUI();
  applyHighlightTheme();
  hideTranslation();

  const lines = (b.text || []);
  state.reading.biTotal = effectiveTotalLines(lines);

  const chapterStarts = new Set((getChapters()||[]).map(c=>Number(c.startIndex||0)).filter(n=>Number.isFinite(n)));

  app.innerHTML = `
    <div class="readerStage">
      <div class="readTopBar">
        <div class="rtLeft">
          <button class="chevBtn" id="btnBooks" aria-label="Books">≡</button>
          <button class="chevBtn" id="readerBack" aria-label="Back">‹</button>
        </div>
        <div class="rtCenter">${escapeHtml(b.title_en || "")}</div>
        <div class="rtRight">
          <button class="topIcon" id="topChapters" title="Chapters">≡</button>
          <button class="topIcon" id="topBookmarks" title="Bookmarks">🔖</button>
          <button class="topIcon" id="topDev" title="Admin">⋯</button>
          <button class="topIcon" id="topSettings" title="Settings">⚙︎</button>
        </div>
      </div>

      <div class="paper">
        <div class="paperInner">
          <div class="bookTitle">${escapeHtml(b.title_en || "")}</div>

          ${lines.map((ln, i)=>{
            const raw = String(ln ?? "");
            const isCh = chapterStarts.has(i);
            if(raw === ""){
              return `<div style="height:14px"></div>`;
            }
            return `
              <div class="paraLine ${isCh ? "chapterLine" : ""}" data-para-wrap="${i}">
                <div class="line" data-token="line" data-idx="${i}" data-raw="${escapeHtml(raw)}" style="${isCh? "font-weight:900;letter-spacing:.2px" : ""}">${escapeHtml(raw)}</div>
                <div class="paraTrans" data-for="${i}"></div>
                <button class="lineCardBtn" data-para-btn="${i}" title="Line translation">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 8h10M7 12h6M7 16h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;

  document.getElementById("readerBack").onclick = ()=>{ try{ stopReading(); }catch(e){} go({name:"details", bookId: (state.book?.id || state.route?.bookId || state.route?.id)},{push:false}); };
  const __books = document.getElementById("btnBooks");
  if(__books) __books.onclick = goCatalog;
  const __tc = document.getElementById("topChapters");
  if(__tc){
    __tc.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      try{ openChapters(); }catch(err){}
    });
  }

  // Stop propagation so global outside-click handler doesn't close immediately.
  const __ts = document.getElementById("topSettings");
  if(__ts){
    __ts.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      try{ openSettings(); }catch(err){}
    });
  }
  const __td = document.getElementById("topDev");
  if(__td){
    __td.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      try{ openDev(); }catch(err){}
    });
  }

  const __tbm = document.getElementById("topBookmarks");
  if(__tbm){
    __tbm.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      // In Reader/BiReader: open book-only bookmarks sheet
      if(state.route?.name === "reader" || state.route?.name === "bireader"){
        try{ state.ui = state.ui || {}; state.ui._resumeAudioAfterBMSheet = (typeof openaiAudio !== "undefined" && openaiAudio && openaiAudio.paused===false); }catch(err){}
        try{ if(typeof openaiAudio !== "undefined" && openaiAudio && openaiAudio.pause) openaiAudio.pause(); }catch(err){}
        try{ showBookBookmarksSheet(state.book?.id || state.route?.bookId); }catch(err){}
        return;
      }
      // Otherwise go to Library → Bookmarks (all)
      try{ stopReading(); }catch(err){}
      state.ui = state.ui || {};
      state.ui.libraryTab = "bookmarks";
      go({name:"library"}, {push:true});
    });
  }

  document.documentElement.style.setProperty("--fontSize", state.reading.fontSize + "px");
  document.documentElement.style.setProperty("--lineHeight", "1.9");

  buildLineMap();
  document.body.classList.toggle("hideLineTrans", !state.reading.lineTranslation);
  document.body.classList.toggle("swapLang", !!state.reading.swapLang);
  initLineTranslations();
  // Safety: when returning to BiReader, Safari can keep empty translations with done=1.
  // If that happens, force a refresh so translations render again without reloading the page.
  if(state.reading.lineTranslation){
    const needsRefresh = [...document.querySelectorAll('.paraTrans[data-for]')]
      .some(el => (el.dataset.done === '1' && (!el.textContent || !el.textContent.trim())));
    if(needsRefresh){
      try{ refreshBiReaderTranslations(); }catch(e){}
    }
  }
  // line actions (translation/bookmark via popover)
  try{
    [...document.querySelectorAll('[data-para-btn]')].forEach(btn=>{
      btn.addEventListener('click',(e)=>{
        e.preventDefault();
        e.stopPropagation();
        const idx = Number(btn.dataset.paraBtn);
        showLineCard(idx);
      });
    });
  }catch(e){}

  try{ applyBookmarkMarks(); }catch(e){}

}

function buildLineMap(){
  const els = [...document.querySelectorAll('.line[data-token="line"]')];
  state.reading.tokenMap = els;
  state.reading.wordCount = els.length;
}

/* ---------------------------
   Text tokens
--------------------------- */
// Word normalization / tokenization MUST work for:
// - Latin + diacritics (PL/DE/FR/ES)
// - Cyrillic (UK/RU)
// Safari/WebView note: avoid Unicode property escapes (\p{L}) to prevent white screens.
const WORD_CHARS = "0-9A-Za-z\u00C0-\u024F\u1E00-\u1EFF\u0400-\u052F\u2DE0-\u2DFF\uA640-\uA69F'’";
const WORD_TOKEN_RE = new RegExp(`(\\s+|[${WORD_CHARS}]+|[^\\s])`, "g");
const WORD_ONLY_RE = new RegExp(`^[${WORD_CHARS}]+$`);
const WORD_TRIM_RE = new RegExp(`^[^${WORD_CHARS}]+|[^${WORD_CHARS}]+$`, "g");

function normalizeWord(w){
  return String(w||"")
    .toLowerCase()
    .replace(WORD_TRIM_RE, "");
}

function renderParagraph(text, pIndex, isHeadingOverride=false){
  if(text === ""){
    return `<p class="para" data-para="${pIndex}"><span style="border-bottom-color:transparent;opacity:.35">—</span></p>`;
  }
  const tokens = String(text).match(WORD_TOKEN_RE) || [String(text)];
  const hText = String(text||"").replace(/\u00A0/g," ").trim();
  const headingKw = /^(chapter|chapitre|kapitel|cap[ií]tulo|capitulo|rozdzia[lł]|rozdzial|розділ|глава|частина|part|section)\b/i;
  const isHeading = !!isHeadingOverride || headingKw.test(hText) || (hText.length<=60 && (/[0-9]/.test(hText) || /\b[IVXLCDM]{1,8}\b/i.test(hText)) && !/[.!?]$/.test(hText));

  return `
    <p class="para" data-para="${pIndex}" style="${isHeading ? "font-weight:950;letter-spacing:.2px" : ""}">
      ${tokens.map((t)=>{
        if(/^\s+$/.test(t)) return `<span class="w space" data-token="space"> </span>`;
        const isWord = WORD_ONLY_RE.test(t);
        if(!isWord){
          return `<span class="w" data-token="punct" data-raw="${escapeHtml(t)}" style="border-bottom-color:transparent;cursor:default">${escapeHtml(t)}</span>`;
        }
        const raw = t;
        const key = normalizeWord(raw);
        return `<span class="w" data-token="word" data-key="${escapeHtml(key)}" data-raw="${escapeHtml(raw)}">${escapeHtml(raw)}</span>`;
      }).join("")}
    </p>
  `;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function buildTokenMap(){
  const spans = [...document.querySelectorAll('.w[data-token="word"]')];
  state.reading.tokenMap = spans;
  state.reading.wordCount = spans.length;

  // IMPORTANT: translation only by click/tap to avoid 429
  spans.forEach((sp)=>{
    sp.addEventListener("click", (e)=> {
      if(!state.reading.showTranslation) return;
      e.stopPropagation();
      showTranslation(sp);
    });
  });
}

function buildParaWordMap(){
  // IMPORTANT: map paragraphs by their data-para index (do not rely on DOM order),
  // because we may skip rendering empty lines (spacers) and indices must stay aligned
  // with state.book.text/openaiLineIndex.
  const paras = [...document.querySelectorAll(".para[data-para]")];
  state.reading.paras = [];
  state.reading.paraWords = [];
  paras.forEach(p=>{
    const idx = Number(p.dataset.para);
    state.reading.paras[idx] = p;
    state.reading.paraWords[idx] = [...p.querySelectorAll('.w[data-token="word"]')];
  });
}


function clearActivePara(){
  const prev = state.reading.activeParaIndex;
  try{
    // defensive: clear any stuck paragraph highlights
    document.querySelectorAll('.para.activeLine').forEach(el=>el.classList.remove('activeLine'));
  }catch(e){}
  try{
    if(prev != null && prev >= 0){
      clearParaWordHighlight(prev);
    }
  }catch(e){}
  state.reading.activeParaIndex = -1;
}


function syncCursorIndex(idx){
  // v8 core is the single source of truth for cursor position.
  // This helper keeps legacy variables (openaiLineIndex, resumeIndex*) mirrored,
  // without allowing them to diverge.
  try{
    return setCursorIndex(idx, { syncUI:false });
  }catch(e){
    // fallback (should be rare)
    try{
      let i = Number(idx);
      if(!Number.isFinite(i) || i < 0) i = 0;
      state.reading.cursorIndex = i;
      openaiLineIndex = i;
      state.reading.resumeIndexReader = i;
      state.reading.resumeIndexBi = i;
      return i;
    }catch(_e){}
    return 0;
  }
}

function setActivePara(idx){
  // Always keep engine cursor in sync with UI cursor
  syncCursorIndex(idx);
  // IMPORTANT: always update cursor index, even if highlight is OFF
  if(idx === state.reading.activeParaIndex) { state.reading.activeParaIndex = idx; return; }

  // If highlight is OFF, we still track the index but don't paint UI
  if(!state.reading.highlight){
    state.reading.activeParaIndex = idx;
    state.reading.resumeIndexReader = idx;
    return;
  }

  clearActivePara();

  const p = state.reading.paras && state.reading.paras[idx];
  if(p){
    p.classList.add("activeLine");
    state.reading.activeParaIndex = idx;
    state.reading.resumeIndexReader = idx;

    const r = p.getBoundingClientRect();
    const topZone = window.innerHeight * 0.20;
    const botZone = window.innerHeight * 0.80;
    if(r.top < topZone || r.bottom > botZone){
      window.scrollBy({top: (r.top - window.innerHeight/2), behavior:"smooth"});
    }
  }
}

// In Listen mode we sometimes want ONLY word highlight (no paragraph block highlight),
// but still need auto-scroll to the current paragraph.
function scrollToPara(idx){
  const p = state.reading.paras && state.reading.paras[idx];
  if(!p) return;
  const r = p.getBoundingClientRect();
  const topZone = window.innerHeight * 0.20;
  const botZone = window.innerHeight * 0.80;
  if(r.top < topZone || r.bottom > botZone){
    window.scrollBy({top: (r.top - window.innerHeight/2), behavior:"smooth"});
  }
}

function scrollToLine(idx){
  const el = document.querySelector(`.line[data-idx="${idx}"]`);
  if(!el) return;
  const r = el.getBoundingClientRect();
  window.scrollBy({top: (r.top - window.innerHeight/3), behavior:'smooth'});
}


function clearParaWordHighlight(paraIdx){
  const list = state.reading.paraWords?.[paraIdx] || [];
  list.forEach(sp=>sp.classList.remove("active"));
}

// Clear any lingering word highlight everywhere (Reader + BiReader)
function clearAllWordHighlights(){
  try{
    const prev = state.reading.activeTokenIndex;
    if(prev >= 0 && state.reading.tokenMap?.[prev]) state.reading.tokenMap[prev].classList.remove("active");
  }catch(e){}
  try{ state.reading.activeTokenIndex = -1; }catch(e){}
  try{
    const pw = state.reading.paraWords || {};
    Object.keys(pw).forEach(k=>{
      (pw[k]||[]).forEach(sp=>sp.classList.remove("active"));
    });
  }catch(e){}
}

function setActiveParaWord(paraIdx, wordIdx){
  if(!state.reading.highlight) return;
  const list = state.reading.paraWords?.[paraIdx] || [];
  if(!list.length) return;
  list.forEach(sp=>sp.classList.remove("active"));
  const sp = list[wordIdx];
  if(sp) sp.classList.add("active");
}


// Universal word highlight for AUDIO playback (OpenAI / any mp3). Works on iOS too.
let __hlRaf = 0;
function stopAudioWordHighlight(){
  if(__hlRaf) cancelAnimationFrame(__hlRaf);
  __hlRaf = 0;
  // Clear stuck word highlight (do NOT touch line highlight)
  try{ clearAllWordHighlights(); }catch(e){}
}
function startAudioWordHighlight({ audio, paraIdx, text, mode, spans }){
  stopAudioWordHighlight();
  if(mode !== "reader") return;
  if(!state.reading.highlight) return;
  if(!audio) return;

  const words = [...String(text).matchAll(new RegExp(`[${WORD_CHARS}]+`, 'g'))].map(m => m[0]);
  if(!words.length) return;

  const sps = spans || (state.reading.paraWords?.[paraIdx] || []);
  if(!sps.length) return;

  function buildTimeline(duration){
    const w = words.map(x => Math.max(1, x.length));
    const sum = w.reduce((a,b)=>a+b,0);
    const t = [];
    let acc = 0;
    for(let i=0;i<w.length;i++){
      acc += w[i];
      t.push((acc / sum) * duration); // end time of word i
    }
    return t;
  }

  let timeline = null;
  let lastIdx = -1;

  const tick = ()=>{
    if(!state.reading.isPlaying){ stopAudioWordHighlight(); return; }
    if(!audio || audio.paused){ __hlRaf = requestAnimationFrame(tick); return; }

    const dur = audio.duration;
    if(!timeline && Number.isFinite(dur) && dur > 0){
      timeline = buildTimeline(dur);
    }

    if(timeline){
      const ct = audio.currentTime;
      let i = timeline.findIndex(x => x >= ct);
      if(i < 0) i = timeline.length - 1;
      i = Math.min(i, sps.length - 1);
      if(i !== lastIdx){
        setActiveParaWord(paraIdx, i);
        lastIdx = i;
      }
    }
    __hlRaf = requestAnimationFrame(tick);
  };

  __hlRaf = requestAnimationFrame(tick);

  audio.addEventListener("ended", stopAudioWordHighlight, { once:true });
}


function langToLocale(code){
  const c = String(code||"").toLowerCase();
  if(c==="uk") return "uk-UA";
  if(c==="ru") return "ru-RU";
  if(c==="pl") return "pl-PL";
  if(c==="de") return "de-DE";
  if(c==="es") return "es-ES";
  if(c==="fr") return "fr-FR";
  return "en-US";
}


/* ---------------------------
   Translation (LibreTranslate) + 429 protection
--------------------------- */
async function translateWord(word){
  const w = String(word||"").trim();
  if(!w) return "—";

  const key = `${String(state.dev.translationProvider||"openai")}::${String(state.reading.targetLang||"uk")}::${normalizeWord(w)}`;
  if(state.reading.translateCache.has(key)) return state.reading.translateCache.get(key);

  if(state.reading.cooldownUntil && Date.now() < state.reading.cooldownUntil){
    const wait = Math.ceil((state.reading.cooldownUntil - Date.now())/1000);
    return `⏳ Ліміт. Зачекай ${wait} с.`;
  }

  const prov = String(state.dev.translationProvider||"openai").toLowerCase();
  const trg  = String(state.reading.targetLang || "uk").trim().toLowerCase();
  const sl   = String(state.reading.sourceLang || state.book?.sourceLang || "auto").trim().toLowerCase() || "auto";

  // Prefer Worker (keeps Libre/OpenAI keys off GitHub Pages).
  const url = String(WORKER_TRANSLATE_URL || "").trim();
  if(url){
    const res = await fetch(url, {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        text: w,
        sourceLang: sl || "auto",
        targetLang: trg,
        provider: prov,      // "openai" | "libre"
        noCache: !!state.dev.noCache
      })
    }).catch(()=>null);

    if(!res) return "— (не вдалося підключитися до воркера)";
    if(res.status === 429){
      state.reading.cooldownUntil = Date.now() + 20000;
      return "⏳ Ліміт. Зачекай 20 секунд.";
    }
    if(!res.ok) return `— (помилка ${res.status})`;

    const data = await res.json().catch(()=> ({}));
    const translated = (data.translatedText || data.translation || "").trim() || "—";
    state.reading.translateCache.set(key, translated);
    return translated;
  }

  // Optional fallback: direct LibreTranslate ONLY if app has a key (not recommended for GitHub Pages).
  if(prov === "libre"){
    const apiKey = String(LIBRETRANSLATE_API_KEY || "").trim();
    if(!apiKey) return "— (Worker URL не задано, а ключ LibreTranslate не вказано)";
    const payload = { q: w, source: sl || "auto", target: trg, format: "text", alternatives: 3, api_key: apiKey };
    const res = await fetch(LIBRETRANSLATE_URL, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)}).catch(()=>null);
    if(!res) return "— (не вдалося підключитися до LibreTranslate)";
    if(res.status === 429){
      state.reading.cooldownUntil = Date.now() + 20000;
      return "⏳ Ліміт. Зачекай 20 секунд.";
    }
    if(!res.ok) return `— (помилка ${res.status})`;
    const data = await res.json().catch(()=> ({}));
    const translated = (data.translatedText || "").trim() || "—";
    state.reading.translateCache.set(key, translated);
    return translated;
  }

  return "— (Worker URL не задано)";
}

async function translateTextAny(text, target, provider){
  const s = String(text||"").trim();
  if(!s) return "—";
  const cacheKey = `${String(provider||state.dev.translationProvider||"openai")}::${target}::${s}`;
  if(state.reading.translateCache.has(cacheKey)) return state.reading.translateCache.get(cacheKey);

  // local cooldown (mainly for LibreTranslate public / worker)
  if(state.reading.cooldownUntil && Date.now() < state.reading.cooldownUntil){
    const wait = Math.ceil((state.reading.cooldownUntil - Date.now())/1000);
    return `⏳ Ліміт. Зачекай ${wait} с.`;
  }

  const prov = String(provider || state.dev.translationProvider || "openai").toLowerCase();
  const trg = String(target || state.reading.targetLang || "uk").trim().toLowerCase();
  const sl  = String(state.reading.sourceLang || state.book?.sourceLang || "auto").trim().toLowerCase() || "auto";

  // Prefer Worker for BOTH providers (keeps keys server-side and avoids CORS/API-key issues).
  const url = String(WORKER_TRANSLATE_URL || "").trim();
  if(url){
    const res = await fetch(url, {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        text: s,
        sourceLang: sl || "auto",
        targetLang: trg,
        provider: prov,        // "openai" | "libre"
        noCache: !!state.dev.noCache
      })
    }).catch(()=>null);

    if(!res) return "— (не вдалося підключитися до воркера)";
    if(res.status === 429){
      state.reading.cooldownUntil = Date.now() + 20000;
      return "⏳ Ліміт. Зачекай 20 секунд.";
    }
    if(!res.ok) return `— (помилка ${res.status})`;

    const data = await res.json().catch(()=> ({}));
    const translated = (data.translatedText || data.translation || "").trim() || "—";
    state.reading.translateCache.set(cacheKey, translated);
    return translated;
  }

  // Fallback: direct LibreTranslate ONLY if a key is provided in the app (optional).
  if(prov === "libre"){
    const apiKey = String(LIBRETRANSLATE_API_KEY || "").trim();
    if(!apiKey) return "— (Worker URL не задано, а ключ LibreTranslate не вказано)";
    const payload = { q: s, source: sl || "auto", target: trg, format: "text", api_key: apiKey };
    const res = await fetch(LIBRETRANSLATE_URL, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(payload)}).catch(()=>null);
    if(!res) return "— (не вдалося підключитися до LibreTranslate)";
    if(res.status === 429){
      state.reading.cooldownUntil = Date.now() + 20000;
      return "⏳ Ліміт. Зачекай 20 секунд.";
    }
    if(!res.ok) return `— (помилка ${res.status})`;
    const data = await res.json().catch(()=> ({}));
    const translated = (data.translatedText || "").trim() || "—";
    state.reading.translateCache.set(cacheKey, translated);
    return translated;
  }

  return "— (Worker URL не задано)";
}


let lineObserver = null;
let biProgressObserver = null;

function initLineTranslations(){
  const isBi = state.route?.name === "bireader";
  if(!isBi) return;

  const lines = [...document.querySelectorAll('.line[data-token="line"]')];
  if(!lines.length) return;

  // If translations are hidden, do nothing.
  if(!state.reading.lineTranslation) return;

  // Sequential queue to avoid "random" + avoid global inFlight conflicts.
  // reset queue every time we enter Reader (Safari may keep stale state)
  state.reading._lineQueue = [];
  state.reading._lineQueued = new Set();
  state.reading._lineQueueRunning = false;

  // fix: if Safari left done=1 but empty, allow re-fetch
  const transEls = [...document.querySelectorAll('.paraTrans[data-for]')];
  transEls.forEach(el=>{
    if(el.dataset.done === "1" && !String(el.textContent||"").trim()){
      el.dataset.done = "0";
    }
  });

  function enqueue(idx){
    if(state.reading._lineQueued.has(idx)) return;
    state.reading._lineQueued.add(idx);
    state.reading._lineQueue.push(Number(idx));
    state.reading._lineQueue.sort((a,b)=>a-b);
    runQueue();
  }

  async function runQueue(){
    if(state.reading._lineQueueRunning) return;
    state.reading._lineQueueRunning = true;
    try{
      while(state.reading._lineQueue.length){
        const idx = state.reading._lineQueue.shift();
        const transEl = document.querySelector(`.paraTrans[data-for="${idx}"]`);
        const lineEl = document.querySelector(`.line[data-idx="${idx}"]`);
        if(!transEl || !lineEl) continue;
        if(transEl.dataset.done === "1") continue;

        transEl.textContent = "Переклад…";
        transEl.classList.add("loading");

        const tr = await translateTextAny(lineEl.dataset.raw || "");
        transEl.classList.remove("loading");

        // If throttled placeholder returned, re-queue later
        if(tr === "…" || tr === ""){
          transEl.textContent = "…";
          transEl.dataset.done = "0";
          state.reading._lineQueued.delete(idx);
          // small retry delay
          setTimeout(()=>enqueue(idx), 800);
          continue;
        }

        transEl.textContent = tr;
        transEl.dataset.done = "1";
      }
    }finally{
      state.reading._lineQueueRunning = false;
    }
  }

  if(lineObserver) lineObserver.disconnect();

  lineObserver = new IntersectionObserver((entries)=>{
    for(const en of entries){
      if(!en.isIntersecting) continue;
      const idx = Number(en.target.dataset.idx);
      const transEl = document.querySelector(`.paraTrans[data-for="${idx}"]`);
      if(!transEl || transEl.dataset.done === "1") continue;
      enqueue(idx);
    }
  }, {root:null, threshold:0.25});

  lines.forEach(el=>lineObserver.observe(el));
}







function initReaderLineTranslations({silent=false}={}){
  const isReader = state.route?.name === "reader";
  if(!isReader) return;

  const lines = [...document.querySelectorAll('.line[data-token="line"]')];
  if(!lines.length) return;

  if(!state.reading.lineTranslation) return;

  // reset queue every time we enter Reader (Safari may keep stale state)
  state.reading._lineQueue = [];
  state.reading._lineQueued = new Set();
  state.reading._lineQueueRunning = false;

  // fix: if Safari left done=1 but empty, allow re-fetch
  const __transEls = [...document.querySelectorAll(".paraTrans[data-for]")];
  __transEls.forEach(el=>{
    if(el.dataset.done === "1" && !String(el.textContent||"").trim()){
      el.dataset.done = "0";
    }
  });

  function enqueue(idx){
    if(state.reading._lineQueued.has(idx)) return;
    state.reading._lineQueued.add(idx);
    state.reading._lineQueue.push(Number(idx));
    runQueue();
  }

  async function runQueue(){
    if(state.reading._lineQueueRunning) return;
    state.reading._lineQueueRunning = true;
    try{
      while(state.reading._lineQueue.length){
        const idx = state.reading._lineQueue.shift();
        const lineEl = document.querySelector(`.line[data-token="line"][data-idx="${idx}"]`);
        const transEl = document.querySelector(`.paraTrans[data-for="${idx}"]`);
        if(!lineEl || !transEl) continue;
        if(transEl.dataset.done === "1") continue;

        const raw = (lineEl.dataset.raw || lineEl.textContent || "").trim();
        if(!raw){ transEl.textContent = ""; transEl.dataset.done="1"; continue; }

        const tr = await translateTextAny(raw);
        transEl.textContent = tr || "—";
        transEl.dataset.done = "1";
      }
    }finally{
      state.reading._lineQueueRunning = false;
    }
  }

  try{ if(lineObserver) lineObserver.disconnect(); }catch(e){}

  lineObserver = new IntersectionObserver((entries)=>{
    for(const en of entries){
      if(!en.isIntersecting) continue;
      const idx = Number(en.target.dataset.idx);
      const transEl = document.querySelector(`.paraTrans[data-for="${idx}"]`);
      if(!transEl || transEl.dataset.done === "1") continue;
      enqueue(idx);
    }
  }, {root:null, threshold:0.25});

  lines.forEach(el=>lineObserver.observe(el));
}

function attachLineTranslationObserver(){
  if(state.route?.name === "bireader") return initLineTranslations();
  if(state.route?.name === "reader") return initReaderLineTranslations();
}
function refreshBiReaderTranslations(){
  if(state.route?.name !== "bireader") return;
  // Clear visible translations and done flags so they can be re-fetched
  const trans = [...document.querySelectorAll('.paraTrans[data-for]')];
  trans.forEach(el=>{
    el.textContent = "";
    el.dataset.done = "0";
    el.classList.remove("loading");
  });
  // reset queue state
  state.reading._lineQueue = [];
  state.reading._lineQueued = new Set();
  state.reading._lineQueueRunning = false;
  try{ if(lineObserver) lineObserver.disconnect(); }catch(e){}
  initLineTranslations();
}

async function showTranslation(span){
  const raw = span.dataset.raw || "";
  popWord.textContent = raw;

  // prepare bookmark context (word inside a paragraph)
  try{
    const pEl = span.closest(".para[data-para]");
    const pIdx = pEl ? Number(pEl.dataset.para) : 0;
    popCtx = { bookId: state.book?.id || state.route?.bookId, paraIdx: Number.isFinite(pIdx) ? pIdx : 0, raw, tr: "" };
    try{ updatePopoverBookmarkButton(); }catch(e){}
  
    // capture word position for precise bookmark jump
    try{
      const list = state.reading.paraWords?.[Number.isFinite(pIdx)?pIdx:0] || [];
      const wi = list.indexOf(span);
      let wi2 = wi;
      // Fallback for Read mode if paraWords cache is stale: compute from DOM
      if(wi2 < 0 && pEl){
        try{
          const list2 = [...pEl.querySelectorAll('.w[data-token="word"]')];
          wi2 = list2.indexOf(span);
        }catch(e){}
      }
      if(popCtx){
        popCtx.wordIndex = (wi2 >= 0) ? wi2 : -1;
        popCtx.wordKey = span.dataset.key || normalizeWord(raw);
      }
      try{ updatePopoverBookmarkButton(); }catch(e){}
    }catch(_e){}
}catch(e){ popCtx = { bookId: state.book?.id || state.route?.bookId, paraIdx: 0, raw, tr:"" }; }
    try{ updatePopoverBookmarkButton(); }catch(e){}

  // Listen mode: pause narration while popover is open
  try{
    if(state.route?.name === "reader" && state.book && state.reading.isPlaying){
      // pause current narration while popover is open
      if(state.dev.ttsProvider === "openai"){
        try{ if(openaiAudio && !openaiAudio.paused){ state.reading.wasPlayingBeforePopover = true; state.reading.pausedForPopover = true; openaiAudio.pause(); } }catch(e){}
      }else if(("speechSynthesis" in window)){
      // pause only if not already paused
      if(!window.speechSynthesis.paused){
        state.reading.wasPlayingBeforePopover = true;
        state.reading.pausedForPopover = true;
        window.speechSynthesis.pause();
      }
    }
  }
  }catch(e){}


  popTrans.textContent = "Переклад…";
  popTrans.classList.add("loading");

  const r = span.getBoundingClientRect();

  // Place popover BELOW the tapped word so it doesn't cover the word/line.
  // If there isn't enough space below, fall back to above.
  const popW = 340;
  // show hidden to measure height
  popover.style.display = "block";
  popover.style.visibility = "hidden";
  popover.style.left = "12px";
  popover.style.top = "12px";
  popover.setAttribute("aria-hidden","false");

  const ph = popover.offsetHeight || 180;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.min(vw - popW - 12, Math.max(12, r.left));
  let y = Math.round(r.bottom); // top edge aligned to tapped word bottom
  if(y + ph + 12 > vh){
    y = Math.max(12, Math.round(r.top) - ph);
  }
  popover.style.left = x + "px";
  popover.style.top = y + "px";
  popover.style.visibility = "visible";

  const tr = await translateWord(raw);
  popTrans.classList.remove("loading");
  popTrans.textContent = tr;
  try{ if(popCtx) popCtx.tr = tr; }catch(e){}
  try{ if(popCtx) popCtx.tr = tr; }catch(e){}

  popSpeak.onclick = ()=>playOneShotTTS(raw);
  popPlayFromHere.onclick = ()=>{
    const pEl = span.closest(".para[data-para]");
    const pIdx = pEl ? Number(pEl.dataset.para) : 0;
    setCursorIndex(pIdx, {syncUI:true, scroll:true});
    startReadingOpenAI({mode:"reader", speakTranslation:false});
    hideTranslation();
  };
}


let oneShotAudio = null;
let oneShotUrl = null;

async function playOneShotTTS(text){
  const t = String(text||"").trim();
  if(!t) return;
  try{
    if(oneShotAudio){ try{ oneShotAudio.pause(); }catch(e){} }
    if(oneShotUrl){ try{ URL.revokeObjectURL(oneShotUrl); }catch(e){} }
  }catch(e){}
  const voice = state.dev.ttsVoice || (state.dev.ttsGender === "female" ? "shimmer" : "onyx");
  const instructions = state.dev.ttsInstructions || "";
  const speed = state.reading.speed;
  let blob;
  try{
    blob = await fetchTtsAudioBlob(t, {voice, instructions, speed, noCache: state.dev.noCache});
  }catch(e){
    console.warn(e);
    return;
  }
  oneShotUrl = URL.createObjectURL(blob);
  oneShotAudio = new Audio(oneShotUrl);
  oneShotAudio.onended = ()=>{ try{ URL.revokeObjectURL(oneShotUrl);}catch(e){} oneShotUrl=null; };
  try{ await oneShotAudio.play(); }catch(e){ /* ignore */ }
}
async function translateLine(text){
  // Line-level translation uses the same engine/cache as other translations
  return await translateTextAny(String(text||""));
}

async function showLineCard(paraIdx){
  if(!state.book) return;
  const b = state.book;
  const raw = String((b.text||[])[paraIdx] ?? "");
  if(!raw) return;

  // prepare bookmark context (line)
  try{
    const level = normalizeLevel(state.reading?.level || "original");
    const src = String(state.reading?.sourceLang || b.sourceLang || "en").trim().toLowerCase();
    const trg = String(state.reading?.targetLang || "uk").trim().toLowerCase();
    const mode = pkgMode(state.route?.name);
    const li = Number.isFinite(paraIdx) ? Number(paraIdx) : 0;
    popCtx = { bookId: b.id || state.route?.bookId, paraIdx: li, lineIndex: li, level, sourceLang: src, targetLang: trg, mode, raw, tr: "" };
  }catch(e){
    popCtx = { bookId: b.id || state.route?.bookId, paraIdx: Number.isFinite(paraIdx)?Number(paraIdx):0, lineIndex: Number.isFinite(paraIdx)?Number(paraIdx):0, raw, tr: "" };
  }  try{ updatePopoverBookmarkButton(); }catch(e){}



  // Pause narration while popover is open
  try{ if(state.reading.isPlaying && openaiAudio && !openaiAudio.paused){ state.reading.wasPlayingBeforePopover=true; state.reading.pausedForPopover=true; openaiAudio.pause(); } }catch(e){}

  popWord.textContent = raw;
  popTrans.textContent = "Переклад…";
  popTrans.classList.add("loading");

  // Place popover BELOW the tapped line so it doesn't cover the line.
  const wrap = document.querySelector(`[data-para-wrap="${paraIdx}"]`);
  const r = wrap ? wrap.getBoundingClientRect() : {left:12, top:120, bottom:140};
  const popW = 360;
  // show hidden to measure height
  popover.style.display = "block";
  popover.style.visibility = "hidden";
  popover.style.left = "12px";
  popover.style.top = "12px";
  popover.setAttribute("aria-hidden","false");

  const ph = popover.offsetHeight || 240;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.min(vw - popW - 12, Math.max(12, r.left));
  let y = Math.round(r.bottom);
  if(y + ph + 12 > vh){
    y = Math.max(12, Math.round(r.top) - ph);
  }
  popover.style.left = x + "px";
  popover.style.top = y + "px";
  popover.style.visibility = "visible";

  const tr = await translateLine(raw);
  popTrans.classList.remove("loading");
  popTrans.textContent = tr;
  try{ if(popCtx) popCtx.tr = tr; }catch(e){}
  try{ if(popCtx) popCtx.tr = tr; }catch(e){}

  popSpeak.onclick = ()=>playOneShotTTS(raw);

  popPlayFromHere.onclick = ()=>{
    setCursorIndex(paraIdx, {syncUI:true, scroll:true});
    startReadingOpenAI({mode:"reader", speakTranslation:false});
    hideTranslation();
  };
}


function hideTranslation(){
  popover.style.display = "none";
  popCtx = null;
  try{ updatePopoverBookmarkButton(); }catch(e){}

  // Resume narration after closing popover (if we paused it)
  try{
    if(state.route?.name === "reader"
      && state.reading.pausedForPopover
      && state.reading.wasPlayingBeforePopover
      && state.reading.isPlaying){

      if(state.dev.ttsProvider === "openai"){
        try{ if(openaiAudio && openaiAudio.paused){ openaiAudio.play(); } }catch(e){}
      }else if(("speechSynthesis" in window) && window.speechSynthesis.paused){
        window.speechSynthesis.resume();
      }
    }
  }catch(e){}

  state.reading.pausedForPopover = false;
  state.reading.wasPlayingBeforePopover = false;
}

function onDocClick(e){
  if(!popover.contains(e.target)) hideTranslation();
}


/* ---------------------------
   Active line helpers (Bi-reader)
--------------------------- */
let activeLineEl = null;
let activeTransEl = null;

function clearActiveLineUI(){
  try{
    // defensive: clear any stuck highlights
    document.querySelectorAll('.activeLine').forEach(el=>el.classList.remove('activeLine'));
    document.querySelectorAll('.activeTrans').forEach(el=>el.classList.remove('activeTrans'));
  }catch(e){}
  activeLineEl = null;
  activeTransEl = null;
}

function setActiveLineUI(idx){
  // Works only in Bi-reader (line-by-line mode)
  // Always keep engine cursor in sync with UI cursor
  syncCursorIndex(idx);
  // IMPORTANT: always update cursor index, even if highlight is OFF
  state.reading.activeBiLineIndex = idx;
  state.reading.resumeIndexBi = idx;
  // progress for Bi-reader
  const total = Number(state.reading.biTotal||state.reading.wordCount||0);
  if(total>0){ state.reading.progress = (idx+1)/total; updateProgressUI(); }

  if(!state.reading.highlight){
    // no UI painting
    clearActiveLineUI();
    return;
  }

  clearActiveLineUI();

  const lineEl = document.querySelector(`.line[data-idx="${idx}"]`);
  if(!lineEl) return;

  const transEl = document.querySelector(`.paraTrans[data-for="${idx}"]`);
  // In Bi-reader we want two-line highlight:
  // Top (spoken) line = strong highlight, other line = softer.
  // swapLang=true => spoken is translation.
  const speakTranslation = !!state.reading.swapLang;

  if(!speakTranslation){
    // Spoken: original line
    activeLineEl = lineEl;
    activeTransEl = transEl || null;
    lineEl.classList.add("activeLine");
    if(transEl) transEl.classList.add("activeTrans");
  }else{
    // Spoken: translation line
    activeLineEl = transEl || null;
    activeTransEl = lineEl;
    if(transEl) transEl.classList.add("activeLine");
    lineEl.classList.add("activeTrans");
  }

  // Gentle scroll to keep active line visible
  const scrollEl = (speakTranslation && transEl) ? transEl : lineEl;
  const r = scrollEl.getBoundingClientRect();
  const topZone = window.innerHeight * 0.25;
  const botZone = window.innerHeight * 0.75;
  if(r.top < topZone || r.bottom > botZone){
    window.scrollBy({top: (r.top - window.innerHeight/2), behavior:"smooth"});
  }
}

// Back-compat in case older code calls clearActiveLine()
function clearActiveLine(){ clearActiveLineUI(); }

/* ---------------------------
   Audio unlock (iOS/Safari)
--------------------------- */
let __audioUnlocked = false;
function ensureAudioUnlocked(){
  if(__audioUnlocked) return;
  __audioUnlocked = true;
  try{
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if(!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
    if(ctx.resume) ctx.resume();
  }catch(e){}
}

function startReading(){
  // OpenAI-only narration
  startReadingOpenAI();
}

// ===== OpenAI TTS (line-by-line, cached in Worker) =====
let openaiAudio = null;
let openaiSessionId = 0;
let openaiLineIndex = 0;
let openaiStopRequested = false;

// Single source of truth for reading position.
// Keep UI cursor + OpenAI line cursor always in sync to avoid "highlight at X but play from Y".
// v8: always read the current cursor from core (single source of truth)
function getCursorIndex(){
  try{
    if(core && typeof core.getState === "function"){
      const s = core.getState();
      const i = Number(s?.lineIndex);
      return Number.isFinite(i) && i >= 0 ? i : 0;
    }
  }catch(e){}
  const i = Number(openaiLineIndex);
  return Number.isFinite(i) && i >= 0 ? i : 0;
}

function setCursorIndex(idx, {syncUI=true, scroll=true}={}){
  let i = Number(idx);
  if(!Number.isFinite(i) || i < 0) i = 0;
  // clamp to effective total if available
  try{
    const totalEff = Number(effectiveTotalLines(state.book?.text) || 0);
    if(totalEff > 0) i = Math.min(i, totalEff - 1);
  }catch(e){}
  // v8 core owns the cursor; keep legacy vars mirrored only
  try{
    if(core && typeof core.setLine === "function"){
      core.setLine(i);
      const s = core.getState();
      const ci = Number(s?.lineIndex);
      if(Number.isFinite(ci) && ci >= 0) i = ci;
    }
  }catch(e){}
  state.reading.cursorIndex = i;
  openaiLineIndex = i;

  // Update per-mode indices so mode switch & restore won't drift
  try{
    state.reading.resumeIndexReader = i;
    state.reading.resumeIndexBi = i;
  }catch(e){}

  if(!syncUI) return i;

  try{
    if(state.route?.name === "reader"){
      state.reading.activeParaIndex = i;
      try{ clearActivePara(); }catch(e){}
      try{ setActivePara(i); }catch(e){}
      if(scroll) setTimeout(()=>{ try{ scrollToPara(i); }catch(e){} }, 30);
    }else if(state.route?.name === "bireader"){
      state.reading.activeBiLineIndex = i;
      try{ clearActiveLineUI(); }catch(e){}
      try{ setActiveLineUI(i); }catch(e){}
      if(scroll) setTimeout(()=>{ try{ scrollToLine(i); }catch(e){} }, 30);
    }
  }catch(e){}
  try{ updateProgressUI(); }catch(e){}
  return i;
}


function getListenLines(){
  return (state.book?.text || []).map(s=>String(s ?? ""));
}

// If the worker caches by (text, voice) only, speed changes may appear to do nothing.
// We can safely bypass cache whenever speed differs from the stored "Normal" speed.
function shouldBypassTtsCache(speed){
  const s = Number(speed);
  const normal = Number.isFinite(state.reading.normalSpeed)
    ? Number(state.reading.normalSpeed)
    : Number(state.reading.speed);
  if(!Number.isFinite(s) || !Number.isFinite(normal)) return false;
  return Math.abs(s - normal) > 0.01;
}

async function fetchTtsAudioBlob(text, {voice, instructions, speed, noCache=false}={}){
  const url = String(WORKER_TTS_URL || "").trim();
  if(!url) throw new Error("WORKER_TTS_URL is empty");
  const effectiveNoCache = !!noCache || !!state?.dev?.noCache || shouldBypassTtsCache(speed);
  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({text, voice, instructions, speed, format: "mp3", noCache: effectiveNoCache})
  });
  if(!res.ok){
    const t = await res.text().catch(()=>"");
    throw new Error(`TTS error ${res.status}: ${t}`);
  }
  const ab = await res.arrayBuffer();
  return new Blob([ab], {type:"audio/mpeg"});
}


async function startReadingOpenAI(){
  // Ensure engine starts from current cursor (prevents "jump back to first save")
  try{ if(Number.isFinite(state.reading.cursorIndex)) openaiLineIndex = state.reading.cursorIndex; }catch(e){}
  try{ clearActiveWord(); }catch(e){}
try{ clearAllWordHighlights(); }catch(e){}

  stopReading({save:false});
  ensureAudioUnlocked();
  state.reading.isPlaying = true;
  btnPlay.textContent = "⏸";
  hideTranslation();

  openaiStopRequested = false;
  const thisSession = (++openaiSessionId);
  // resume index depends on mode (cursorIndex is the single source of truth)
  const mode = state.route?.name;
  let startIdx = Number.isFinite(state.reading.cursorIndex) ? Number(state.reading.cursorIndex) : null;
  if(startIdx == null){
    if(mode === "bireader"){
      const a = Number(state.reading.activeBiLineIndex);
      const r = Number(state.reading.resumeIndexBi);
      startIdx = Number.isFinite(a) ? a : (Number.isFinite(r) ? r : 0);
    }else{
      const a = Number(state.reading.activeParaIndex);
      const r = Number(state.reading.resumeIndexReader);
      startIdx = Number.isFinite(a) ? a : (Number.isFinite(r) ? r : 0);
    }
  }
  setCursorIndex(startIdx, {syncUI:true, scroll:false});
  // mode already computed above
  const lines = getListenLines();

  const useTranslation = ()=>{
    if(mode === "reader") return (state.reading.listenMode === "translation");
    return !!state.reading.swapLang;
  };

  
  // Prefetch cache for seamless autoplay (iOS/WebView can block play() after awaits)
  const ttsPrefetch = new Map(); // idx -> Promise<Blob>

  function findNextNonEmpty(startIdx){
    for(let i=startIdx;i<lines.length;i++){
      const t = String(lines[i] ?? "").trim();
      if(t) return i;
    }
    return -1;
  }

  function prefetchForIndex(idx){
    if(idx < 0 || idx >= lines.length) return;
    if(ttsPrefetch.has(idx)) return;

    const speakTr = useTranslation();
    const line = String(lines[idx] ?? "").trim();
    if(!line) return;

    const voice = state.dev.ttsVoice || (state.dev.ttsGender === "female" ? "shimmer" : "onyx");
    const instructions = state.dev.ttsInstructions || "";
    const speed = state.reading.speed;

    const p = (async ()=>{
      let speakText = line;
      if(speakTr){
        try{
          const tr = await translateTextAny(line);
          if(tr && tr !== "—" && tr !== "…") speakText = tr;
        }catch(e){}
      }
      return await fetchTtsAudioBlob(speakText, {voice, instructions, speed, noCache: state.dev.noCache});
    })();

    ttsPrefetch.set(idx, p);
  }
const playNext = async ()=>{
    if(openaiStopRequested || !state.reading.isPlaying) return;

    // Skip empty lines (chapter gaps) without pausing
    let idx = getCursorIndex();
    idx = findNextNonEmpty(idx);
    if(idx === -1 || idx >= lines.length){ finishReading(); return; }

    const raw = String(lines[idx] ?? "");
    const lineText = raw.trim();

    const speakTr = useTranslation();
    let speakText = lineText;

    if(speakTr){
      const tr = await translateTextAny(lineText);
      if(tr && tr !== "—" && tr !== "…") speakText = tr;
    }

    // Highlight:
    // - Listen mode (reader): word highlight only (no full paragraph block)
    // - Read mode (bireader): line highlight (two rows)
    if(mode === "reader"){
      idx = setCursorIndex(idx, {syncUI:true, scroll:true});
    }else{
      idx = setCursorIndex(idx, {syncUI:true, scroll:false});
    }

    // Progress is line-based for OpenAI narration (ignore trailing empty lines)
    try{
      const total = Number(effectiveTotalLines(lines) || lines.length || 0);
      if(total > 0){
        state.reading.progress = (idx + 1) / total;
        updateProgressUI();
      }
    }catch(e){}

    const voice = state.dev.ttsVoice || (state.dev.ttsGender === "female" ? "shimmer" : "onyx");
    const instructions = state.dev.ttsInstructions || "";
    const speed = state.reading.speed;

    // Use prefetched TTS when available (important for iOS autoplay)
    let blob;
    try{
      const pref = ttsPrefetch.get(idx);
      if(pref){
        ttsPrefetch.delete(idx);
        blob = await pref;
      }else{
        blob = await fetchTtsAudioBlob(speakText, {voice, instructions, speed, noCache: state.dev.noCache});
      }
    }catch(err){
      console.warn(err);
      // Skip to next non-empty line and continue
      let nextIdx = findNextNonEmpty(idx + 1);
      if(nextIdx === -1 || nextIdx >= lines.length){ finishReading(); return; }

      // Update core + UI in one place to avoid observers snapping back
      try{ setCursorIndex(nextIdx, {syncUI:true, scroll:false}); }catch(e){ setCursorIndex(nextIdx, {syncUI:false}); }

      try{ saveReadingProgress(); }catch(e){}
      playNext();
      return;
    }


    if(openaiStopRequested || !state.reading.isPlaying || thisSession !== openaiSessionId) return;

    if(openaiAudio){
      try{ openaiAudio.pause(); }catch(e){}
      openaiAudio = null;
    }

    const objUrl = URL.createObjectURL(blob);
    openaiAudio = new Audio(objUrl);
    // Prefetch next playable line to avoid iOS pausing after a single line
    prefetchForIndex(findNextNonEmpty(idx + 1));

// Word highlight only when we're speaking ORIGINAL (so spans match original text)
if(mode === "reader" && !speakTr && state.reading.highlight){
  const startHL = ()=>{
    startAudioWordHighlight({
      audio: openaiAudio,
      paraIdx: idx,
      text: lineText,
      mode
    });
  };
  openaiAudio.addEventListener("loadedmetadata", startHL, { once:true });
  // if metadata is already available
  if(Number.isFinite(openaiAudio.duration) && openaiAudio.duration > 0) startHL();
}

    openaiAudio.onended = ()=>{
      stopAudioWordHighlight();
      URL.revokeObjectURL(objUrl);
      if(openaiStopRequested || !state.reading.isPlaying || thisSession !== openaiSessionId) return;

      // Advance cursor to next playable line (skip empty) and keep UI/core synced
      let nextIdx = findNextNonEmpty(idx + 1);
      if(nextIdx === -1 || nextIdx >= lines.length){ finishReading(); return; }

      try{ setCursorIndex(nextIdx, {syncUI:true, scroll:false}); }catch(e){ setCursorIndex(nextIdx, {syncUI:false}); }
      try{ saveReadingProgress(); }catch(e){}
      playNext();
    };
    openaiAudio.onerror = ()=>{
      stopAudioWordHighlight();
      URL.revokeObjectURL(objUrl);
      // Don't skip ahead on audio errors; pause so user can retry.
      if(openaiStopRequested || thisSession !== openaiSessionId) return;
      state.reading.isPlaying = false;
      btnPlay.textContent = "▶";
      return;
    };

    try{
      if(openaiStopRequested || !state.reading.isPlaying || thisSession !== openaiSessionId) return;
      await openaiAudio.play();
    }catch(e){
      // On mobile browsers, play() can be blocked; DO NOT advance the cursor.
      console.warn(e);
      if(openaiStopRequested || thisSession !== openaiSessionId) return;
      state.reading.isPlaying = false;
      btnPlay.textContent = "▶";
      stopAudioWordHighlight();
      // keep idx as-is so resume continues from the same line
      return;
    }
  };

  playNext();
}



function startDeterministicHighlight(){
  const n = state.reading.wordCount;
  if(!n) return;

  const baseWpm = 150;
  const wpm = baseWpm * state.reading.speed;
  const msPerWord = Math.max(180, Math.round(60000 / wpm));

  let idx = 0;
  state.reading.timer = setInterval(()=>{
    if(!state.reading.isPlaying) return;
    // Listen mode: also freeze highlight while narration is paused by word popover or system pause
    if(state.reading.pausedForPopover) return;
    try{ if(("speechSynthesis" in window) && window.speechSynthesis.paused) return; }catch(e){}

    setActiveWord(idx);
    state.reading.progress = (idx+1) / n;
    updateProgressUI();

    idx++;
    if(idx >= n) finishReading();
  }, msPerWord);
}

function pauseReading(){
  // Pause narration WITHOUT advancing the cursor
  state.reading.isPlaying = false;
  btnPlay.textContent = "▶";
  openaiStopRequested = true; // cancel any in-flight async steps
  stopAudioWordHighlight();
  try{ if(openaiAudio) openaiAudio.pause(); }catch(e){}
  // persist resume cursor per mode
  const mode = state.route?.name;
  if(mode === "bireader"){
    state.reading.resumeIndexBi = Number.isFinite(idx) ? idx : (Number.isFinite(state.reading.activeBiLineIndex)?state.reading.activeBiLineIndex:0);
  }else{
    state.reading.resumeIndexReader = Number.isFinite(idx) ? idx : (Number.isFinite(state.reading.activeParaIndex)?state.reading.activeParaIndex:0);
  }
  saveReadingProgress();
}

function resumeReading(){
  // Resume by restarting OpenAI loop from saved cursor (reliable on Safari)
  if(!state.book) return;
  startReadingOpenAI();
}

function stopReading(opts={save:true}){
  const save = opts && opts.save !== false;

  // derive cursor from core (single source of truth), fallback to UI indices
  let cursor = 0;
  try{ cursor = getCursorIndex(); }catch(e){ cursor = 0; }
  try{
    if(state.route?.name === "reader"){
      const a = Number(state.reading.activeParaIndex);
      const r = Number(state.reading.resumeIndexReader);
      if(!Number.isFinite(cursor) || cursor < 0){
      cursor = Number.isFinite(a) ? a : (Number.isFinite(r) ? r : (Number.isFinite(idx)? idx:0));
    }
      state.reading.resumeIndexReader = cursor;
    }else if(state.route?.name === "bireader"){
      const a = Number(state.reading.activeBiLineIndex);
      const r = Number(state.reading.resumeIndexBi);
      if(!Number.isFinite(cursor) || cursor < 0){
        cursor = Number.isFinite(a) ? a : (Number.isFinite(r) ? r : (Number.isFinite(idx)? idx:0));
      }
      state.reading.resumeIndexBi = cursor;
    }else{
      if(!Number.isFinite(cursor) || cursor < 0){
        cursor = Number.isFinite(idx) ? idx : 0;
      }
    }
    if(!Number.isFinite(cursor) || cursor < 0) cursor = 0;
    idx = cursor;
    state.reading.cursorIndex = cursor;
  }catch(e){ cursor = 0; }

  // keep shared cursor in sync across modes
  try{ state.reading.cursorIndex = cursor; }catch(e){}
  try{ state.reading.resumeIndexReader = cursor; }catch(e){}
  try{ state.reading.resumeIndexBi = cursor; }catch(e){}

  // Save progress BEFORE any UI cleanup
  try{
    if(save){
      const lock = state.ui?.lockProgressUntilChoice;
      if(lock && state.book && String(state.book.id||"") === String(lock.bookId||"")){
        const s = String(state.reading?.sourceLang||"").toLowerCase();
        const t = String(state.reading?.targetLang||"").toLowerCase();
        const lv = normalizeLevel(state.reading?.level||"original");
        if(String(lock.src||"").toLowerCase() === s && String(lock.trg||"").toLowerCase() === t && normalizeLevel(lock.level||"original") === lv){
          // Skip saving while user hasn't chosen "Continue vs Bookmark" yet.
        }else{
          saveReadingProgress();
        }
      }else{
        saveReadingProgress();
      }
    }
  }catch(e){}

  // Cancel any ongoing browser TTS / timers / observers
  try{ if(state.reading._browserCancel) state.reading._browserCancel(); }catch(e){}
  state.reading._browserCancel = null;

  try{ clearActiveLineUI(); }catch(e){}
  try{ if(lineObserver) lineObserver.disconnect(); }catch(e){}
  try{ if(biProgressObserver) biProgressObserver.disconnect(); }catch(e){}
  lineObserver = null;
  biProgressObserver = null;

  state.reading.isPlaying = false;
  try{ btnPlay.textContent = "▶"; }catch(e){}

  if(state.reading.timer) clearInterval(state.reading.timer);
  state.reading.timer = null;

  try{ clearActiveWord(); }catch(e){}
try{ clearAllWordHighlights(); }catch(e){}

  // IMPORTANT: do NOT zero progress here (it breaks history/library)
  try{ updateProgressUI(); }catch(e){}

  if("speechSynthesis" in window){
    try{ window.speechSynthesis.cancel(); }catch(e){}
  }

  // stop OpenAI loop
  try{
    openaiStopRequested = true;
  }catch(e){}
}

function finishReading(){
  try{ if(state.reading._browserCancel) state.reading._browserCancel(); }catch(e){}
  state.reading._browserCancel = null;
  clearActiveLineUI();

  state.reading.isPlaying = false;
  btnPlay.textContent = "▶";

  if(state.reading.timer) clearInterval(state.reading.timer);
  state.reading.timer = null;

// Force cursor to the real last non-empty line and persist 100% progress
try{
  const totalEff = Number(effectiveTotalLines(state.book?.text)||0);
  const lastIdx = totalEff>0 ? (totalEff-1) : 0;
  setCursorIndex(lastIdx, {syncUI:false});
  if(state.route?.name === "reader"){
    state.reading.activeParaIndex = lastIdx;
    state.reading.resumeIndexReader = lastIdx;
  }else if(state.route?.name === "bireader"){
    state.reading.activeBiLineIndex = lastIdx;
    state.reading.resumeIndexBi = lastIdx;
  }
}catch(e){}
try{ saveReadingProgress(); }catch(e){}
try{ clearActiveWord(); }catch(e){}
try{ clearAllWordHighlights(); }catch(e){}

  state.reading.progress = 1;
  updateProgressUI();

  if("speechSynthesis" in window) window.speechSynthesis.cancel();

  openaiStopRequested = true;
  try{ if(openaiAudio){ openaiAudio.pause(); openaiAudio.src = ""; } }catch(e){}
  openaiAudio = null;
}


function clearActiveWord(){
  const prev = state.reading.activeTokenIndex;
  if(prev >= 0 && state.reading.tokenMap[prev]){
    state.reading.tokenMap[prev].classList.remove("active");
  }
  state.reading.activeTokenIndex = -1;
}

function setActiveWord(idx){
  // When highlight is OFF, make sure any previous active word is cleared
  if(!state.reading.highlight){
    const prev = state.reading.activeTokenIndex;
    if(prev >= 0 && state.reading.tokenMap[prev]){
      state.reading.tokenMap[prev].classList.remove("active");
    }
    state.reading.activeTokenIndex = -1;
    return;
  }
  if(idx === state.reading.activeTokenIndex) return;

  const prev = state.reading.activeTokenIndex;
  if(prev >= 0 && state.reading.tokenMap[prev]){
    state.reading.tokenMap[prev].classList.remove("active");
  }

  const sp = state.reading.tokenMap[idx];
  if(sp){
    sp.classList.add("active");
    state.reading.activeTokenIndex = idx;

    // gentle scroll
    const r = sp.getBoundingClientRect();
    const topZone = window.innerHeight * 0.25;
    const botZone = window.innerHeight * 0.75;
    if(r.top < topZone || r.bottom > botZone){
      window.scrollBy({top: (r.top - window.innerHeight/2), behavior:"smooth"});
    }
  }
}

/* ---------------------------
   Progress UI
--------------------------- */
function updateProgressUI(){
  const pct = Math.round((state.reading.progress || 0) * 100);
  pPct.textContent = pct + "%";
  pFill.style.width = pct + "%";
}

/* ---------------------------
   Settings UI
--------------------------- */
function toggleUI(el, on){ el.classList.toggle("on", !!on); }
function showBackdrop(on){
  if(!sheetBackdrop) return;
  sheetBackdrop.style.display = on ? 'block' : 'none';
  sheetBackdrop.setAttribute('aria-hidden', on ? 'false' : 'true');
}

function openSheet(el){
  if(!el) return;
  el.style.display = 'block';
  requestAnimationFrame(()=>{ el.classList.add('open'); });
  showBackdrop(true);
}

function closeSheet(el){
  if(!el) return;
  el.classList.remove('open');
  // wait for transition
  setTimeout(()=>{
    el.style.display = 'none';
    el.setAttribute('aria-hidden','true');
    // hide backdrop only if nothing else is open
    const anyOpen = (settings && settings.classList.contains('open')) || (devPanel && devPanel.classList.contains('open')) || (chaptersSheet && chaptersSheet.classList.contains('open'));
    if(!anyOpen) showBackdrop(false);
  }, 220);
}

let currentSettingsTab = 'read';
function setSettingsTab(tab){
  currentSettingsTab = (tab==='listen') ? 'listen' : 'read';
  if(setTabRead){
    setTabRead.classList.toggle('active', currentSettingsTab==='read');
    setTabRead.setAttribute('aria-selected', currentSettingsTab==='read' ? 'true' : 'false');
  }
  if(setTabListen){
    setTabListen.classList.toggle('active', currentSettingsTab==='listen');
    setTabListen.setAttribute('aria-selected', currentSettingsTab==='listen' ? 'true' : 'false');
  }
  if(setPaneRead) setPaneRead.style.display = currentSettingsTab==='read' ? 'block' : 'none';
  if(setPaneListen) setPaneListen.style.display = currentSettingsTab==='listen' ? 'block' : 'none';
  syncSettingsUI();
}

function openSettings(){
  // never show Settings and Dev panel together
  try{ closeDev(); }catch(e){}
  setSettingsTab(currentSettingsTab);
  syncSettingsUI();
  settings.setAttribute('aria-hidden','false');
  openSheet(settings);
}
function closeSettings(){
  closeSheet(settings);
}
function syncSettingsUI(){
  targetLangSelect.value = state.reading.targetLang;
  speed.value = String(state.reading.speed);
  speedLabel.textContent = state.reading.speed.toFixed(2) + "×";
  // Listen tab helpers
  try{
    // gender buttons
    if(uMale && uFemale){
      uMale.classList.toggle("active", state.dev.ttsGender === "male");
      uFemale.classList.toggle("active", state.dev.ttsGender === "female");
    }

    // speed presets: keep initial speed as "Normal (100)"
    if(state.reading.normalSpeed == null){
      state.reading.normalSpeed = Number(state.reading.speed)||0.7;
    }
    const normal = Number(state.reading.normalSpeed)||0.7;
    const slowV = Math.max(0.3, normal * 0.80);
    const fastV = Math.min(2.0, normal * 1.25);

    const cur = Number(state.reading.speed)||normal;
    const dSlow = Math.abs(cur - slowV);
    const dNorm = Math.abs(cur - normal);
    const dFast = Math.abs(cur - fastV);
    const which = (dSlow<=dNorm && dSlow<=dFast) ? "slow" : (dFast<=dNorm && dFast<=dSlow) ? "fast" : "normal";
    if(uSpeedSlow && uSpeedNormal && uSpeedFast){
      uSpeedSlow.classList.toggle("active", which==="slow");
      uSpeedNormal.classList.toggle("active", which==="normal");
      uSpeedFast.classList.toggle("active", which==="fast");
    }
  }catch(e){}
  toggleUI(tTranslation, state.reading.showTranslation);
  toggleUI(tNight, state.reading.night);
  toggleUI(tHighlight, state.reading.highlight);
  setTheme(state.reading.night);
  applyHighlightTheme();
  // mode-specific settings
  const isBi = state.route?.name === "bireader";

  if(rowTapTranslate) rowTapTranslate.style.display = isBi ? "none" : "flex";
  if(rowLineTranslate) rowLineTranslate.style.display = isBi ? "flex" : "none";

  if(tLineTranslation){
    toggleUI(tLineTranslation, state.reading.lineTranslation);
  }

  document.body.classList.toggle("hideLineTrans", isBi && !state.reading.lineTranslation);
}

function openDev(){
  if(!state.dev.enabled) return;
  // never show Settings and Dev panel together
  try{ closeSettings(); }catch(e){}
  syncDevUI();
  devPanel.setAttribute('aria-hidden','false');
  openSheet(devPanel);
}
function closeDev(){
  closeSheet(devPanel);
}
function setSegActive(btnA, btnB, isA){
  btnA.classList.toggle("active", !!isA);
  btnB.classList.toggle("active", !isA);
}
function syncDevUI(){
  setSegActive(provOpenAI, provLibre, state.dev.translationProvider === "openai");
  setSegActive(vMale, vFemale, state.dev.ttsGender === "male");
  toggleUI(tNoCache, !!state.dev.noCache);
  toggleUI(tSwap, !!state.reading.swapLang);

  ttsVoiceSelect.innerHTML = "";
  const gender = state.dev.ttsGender;
  const list = OPENAI_TTS_VOICES.filter(v=>v.gender===gender).map(v=>v.id);
  const other = OPENAI_TTS_VOICES.filter(v=>v.gender!==gender).map(v=>v.id);
  const all = [...list, ...other];
  all.forEach(id=>{
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    ttsVoiceSelect.appendChild(opt);
  });
  ttsVoiceSelect.value = state.dev.ttsVoice;
  ttsInstructions.value = state.dev.ttsInstructions || "";

}

/* ---------------------------
   Controls
--------------------------- */

function _clearPendingBookmarkPlayChoice(){
  try{ if(state.ui) delete state.ui.pendingBookmarkPlayChoice; }catch(e){}
  try{ if(state.ui) delete state.ui.lockProgressUntilChoice; }catch(e){}
}

function _maybeShowBookmarkPlayChoice(){
  try{
    const pending = state.ui?.pendingBookmarkPlayChoice;
    if(!pending) return false;
    if(!(state.route?.name === "reader" || state.route?.name === "bireader")) return false;
    if(!state.book || String(state.book.id||"") !== String(pending.bookId||"")){ _clearPendingBookmarkPlayChoice(); return false; }

    const curIdx = (function(){
      try{ return _bmGetLineIndexFallback(); }catch(e){}
      try{
        if(state.route?.name==="reader") return Number(state.reading.activeParaIndex||0);
        return Number(state.reading.activeBiLineIndex||0);
      }catch(e){}
      return 0;
    })();

    if(Number(curIdx) !== Number(pending.bookmarkIndex)){
      // user moved away (chapter/back/etc) — don't show the choice anymore
      _clearPendingBookmarkPlayChoice();
      return false;
    }

    if(Number(pending.resumeIndex) === Number(pending.bookmarkIndex)){
      _clearPendingBookmarkPlayChoice();
      return false;
    }

    // Build a tiny modal (theme-aware)
    const wrap = document.createElement("div");
    wrap.style.position = "fixed";
    wrap.style.inset = "0";
    wrap.style.background = "rgba(0,0,0,.35)";
    wrap.style.zIndex = "9999";
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.justifyContent = "center";
    wrap.innerHTML = `
      <div style="width:min(440px, calc(100vw - 36px));background:var(--card);color:var(--text);border-radius:18px;padding:16px 16px 14px;box-shadow:0 18px 60px rgba(0,0,0,.25);border:1px solid var(--line);">
        <div style="font-weight:900;font-size:16px;letter-spacing:.2px;margin-bottom:10px;">${t("start_playback_title")}</div>
        <div style="color:var(--muted);font-weight:700;font-size:13px;line-height:1.35;margin-bottom:14px;">
          ${t("start_playback_desc")}
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button id="bmChoiceContinue" class="bigBtn" style="width:100%;">${t("modal_continue")}</button>
          <button id="bmChoiceBookmark" class="bigBtn secondary" style="width:100%;">${t("modal_start_bookmark")}</button>
          <button id="bmChoiceCancel" class="pillBtn" style="width:100%;">${t("modal_cancel")}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    function close(){ try{ wrap.remove(); }catch(e){} }

    wrap.addEventListener("click", (e)=>{ if(e.target===wrap) close(); });

    const btnC = wrap.querySelector("#bmChoiceContinue");
    const btnB = wrap.querySelector("#bmChoiceBookmark");
    const btnX = wrap.querySelector("#bmChoiceCancel");

    btnX.onclick = ()=>{ close(); };

    btnB.onclick = ()=>{
      _clearPendingBookmarkPlayChoice();
      close();
      startReading();
    };

    btnC.onclick = ()=>{
      try{ stopReading({save:false}); }catch(e){}
      try{ clearAllWordHighlights(); }catch(e){}
      try{ setCursorIndex(Math.max(0, Number(pending.resumeIndex||0)), {syncUI:true, scroll:true}); }catch(e){}
      _clearPendingBookmarkPlayChoice();
      close();
      startReading();
    };

    return true;
  }catch(e){
    return false;
  }
}
btnPlay.onclick = ()=>{
  if(!state.book) return;
  if(!state.reading.isPlaying){
    if(_maybeShowBookmarkPlayChoice()) return;
    startReading();
  }else{
    pauseReading();
  }
};
btnBack.onclick = ()=>{ try{ handlePlayerBack(); }catch(e){ try{ appBack(); }catch(_e){} } };
if(btnChapters) btnChapters.onclick = (e)=>{ try{ e.preventDefault(); e.stopPropagation(); }catch(_){} openChapters(); };

btnStart.onclick = ()=>{
  // jump to the beginning for current mode
  stopReading();
  try{ _clearPendingBookmarkPlayChoice(); }catch(e){}
  const bookId = resolveBookId();
  if(!bookId || !state.book) return;

  // reset shared indices
  setCursorIndex(0, {syncUI:false});
  state.reading.activeTokenIndex = -1;
  state.reading.tokenMap = [];

  if(state.route?.name==="reader"){
    state.reading.resumeIndexReader = 0;
    state.reading.activeParaIndex = 0;
    setActivePara(0);

    const total = Number(effectiveTotalLines(state.book?.text)||0);
    state.reading.progress = total>0 ? 1/total : 0;
    updateProgressUI();
    saveReadingProgress();
    window.scrollTo({top:0, behavior:"smooth"});
    return;
  }

  if(state.route?.name==="bireader"){
    state.reading.resumeIndexBi = 0;
    state.reading.activeBiLineIndex = 0;

    if(state.reading.highlight){
      setActiveLineUI(0);
    }else{
      clearActiveLineUI();
    }

    const total = Number(state.reading.biTotal||state.book?.text?.length||0);
    state.reading.progress = total>0 ? 1/total : 0;
    updateProgressUI();
    saveReadingProgress();
    window.scrollTo({top:0, behavior:"smooth"});
    return;
  }
};



if(modeListen){
  modeListen.onclick = ()=>{ try{ switchMode("reader"); }catch(e){} };
}
if(modeRead){
  modeRead.onclick = ()=>{ try{ switchMode("bireader"); }catch(e){} };
}

if(devClose) devClose.onclick = closeDev;

provLibre.onclick = ()=>{ state.dev.translationProvider = "libre"; state.reading.translateCache.clear(); syncDevUI(); };
provOpenAI.onclick = ()=>{ state.dev.translationProvider = "openai"; state.reading.translateCache.clear(); syncDevUI(); };

vMale.onclick = ()=>{ state.dev.ttsGender = "male"; state.dev.ttsVoice = "onyx"; syncDevUI(); };
vFemale.onclick = ()=>{ state.dev.ttsGender = "female"; state.dev.ttsVoice = "shimmer"; syncDevUI(); };

ttsVoiceSelect.onchange = ()=>{ state.dev.ttsVoice = ttsVoiceSelect.value; };

tSwap.onclick = ()=>{ state.reading.swapLang = !state.reading.swapLang; toggleUI(tSwap, state.reading.swapLang); if(state.route?.name==="bireader"){ document.body.classList.toggle("swapLang", !!state.reading.swapLang); setActiveLineUI(state.reading.activeBiLineIndex||0); } };

tNoCache.onclick = ()=>{ state.dev.noCache = !state.dev.noCache; toggleUI(tNoCache, state.dev.noCache); };

ttsInstructions.oninput = ()=>{ state.dev.ttsInstructions = ttsInstructions.value; };

async function workerClear(url, kind){
  url = String(url||"").trim();
  if(!url) return alert("Worker URL не задано");
  const res = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({action:"clear", kind})}).catch(()=>null);
  if(!res) return alert("Не вдалося підключитися");
  if(!res.ok) return alert("Помилка очистки: " + res.status);
  alert("OK: cache cleared");
}
btnClearTr.onclick = ()=>workerClear(WORKER_TRANSLATE_URL, "translate");
btnClearTts.onclick = ()=>workerClear(WORKER_TTS_URL, "tts");
setClose.onclick = closeSettings;
if(chaptersClose) chaptersClose.onclick = closeChapters;

// Sheet interactions
if(sheetBackdrop){
  sheetBackdrop.onclick = ()=>{
    if(settings && settings.classList.contains('open')) closeSettings();
    if(devPanel && devPanel.classList.contains('open')) closeDev();
    if(chaptersSheet && chaptersSheet.classList.contains('open')) closeChapters();
  };
}

if(setTabRead) setTabRead.onclick = ()=>setSettingsTab('read');
if(setTabListen) setTabListen.onclick = ()=>setSettingsTab('listen');

// User voice gender (duplicate of admin)
if(uMale) uMale.onclick = ()=>{ state.dev.ttsGender='male'; state.dev.ttsVoice='onyx'; syncDevUI(); syncSettingsUI(); };
if(uFemale) uFemale.onclick = ()=>{ state.dev.ttsGender='female'; state.dev.ttsVoice='shimmer'; syncDevUI(); syncSettingsUI(); };

// User speed presets (fixed values)
const SPEED_PRESETS = { slow: 0.8, normal: 1.0, fast: 1.25 };
function setSpeedPreset(kind){
  const v = SPEED_PRESETS[kind] ?? 1.0;
  state.reading.speed = v;
  speed.value = String(v);
  speedLabel.textContent = v.toFixed(2) + '×';
  // Update UI immediately (no need to close the sheet)
  if(uSpeedSlow && uSpeedNormal && uSpeedFast){
    uSpeedSlow.classList.toggle('active', kind==='slow');
    uSpeedNormal.classList.toggle('active', kind==='normal');
    uSpeedFast.classList.toggle('active', kind==='fast');
  }
  try{ syncSettingsUI(); }catch(e){}
  if(state.reading.isPlaying) startReading();
}
if(uSpeedSlow) uSpeedSlow.onclick = ()=>setSpeedPreset('slow');
if(uSpeedNormal) uSpeedNormal.onclick = ()=>setSpeedPreset('normal');
if(uSpeedFast) uSpeedFast.onclick = ()=>setSpeedPreset('fast');

fontMinus.onclick = ()=>{
  state.reading.fontSize = Math.max(16, state.reading.fontSize - 2);
  document.documentElement.style.setProperty("--fontSize", state.reading.fontSize + "px");
};
fontPlus.onclick = ()=>{
  state.reading.fontSize = Math.min(34, state.reading.fontSize + 2);
  document.documentElement.style.setProperty("--fontSize", state.reading.fontSize + "px");
};

speed.oninput = ()=>{
  state.reading.speed = Number(speed.value);
  speedLabel.textContent = state.reading.speed.toFixed(2) + "×";
  try{ syncSettingsUI(); }catch(e){}
  if(state.reading.isPlaying) startReading();
};

hlDefault.onclick = ()=>{
  state.reading.highlightTheme = "default";
  applyHighlightTheme();
};
hlYellow.onclick = ()=>{
  state.reading.highlightTheme = "yellow";
  applyHighlightTheme();
};

tTranslation.onclick = ()=>{
  state.reading.showTranslation = !state.reading.showTranslation;
  toggleUI(tTranslation, state.reading.showTranslation);
  if(!state.reading.showTranslation) hideTranslation();
};

tLineTranslation.onclick = ()=>{
  state.reading.lineTranslation = !state.reading.lineTranslation;
  toggleUI(tLineTranslation, state.reading.lineTranslation);

  const isBi = state.route?.name === "bireader";
  if(isBi){
    document.body.classList.toggle("hideLineTrans", !state.reading.lineTranslation);
    if(state.reading.lineTranslation) initLineTranslations();
  }
};

tNight.onclick = ()=>{
  state.reading.night = !state.reading.night;
  toggleUI(tNight, state.reading.night);
  setTheme(state.reading.night);
  applyHighlightTheme();
};
tHighlight.onclick = ()=>{
  state.reading.highlight = !state.reading.highlight;
  toggleUI(tHighlight, state.reading.highlight);

  if(!state.reading.highlight){
    clearActiveWord();
    clearActivePara();
    clearActiveLineUI();
  }else{
    // Re-apply current highlight if we have a known index
    const mode = state.route?.name;
    if(mode === "reader"){
      if(state.reading.activeParaIndex != null && state.reading.activeParaIndex >= 0){
        setActivePara(state.reading.activeParaIndex);
      }
    }
    if(mode === "bireader"){
      if(typeof openaiLineIndex === "number"){
        setActiveLineUI(getCursorIndex());
      }
    }
  }
};

targetLangSelect.onchange = ()=>{
  // Save current progress for OLD pair, then switch and restore for NEW pair
  try{ saveReadingProgress(); }catch(e){}
  state.reading.targetLang = targetLangSelect.value;
  try{ state.reading.translateCache.clear(); }catch(e){}
  document.querySelectorAll(".paraTrans").forEach(el=>{
    el.textContent = "";
    el.dataset.done = "0";
  });

  applyLanguagePairChange();

  if(state.route?.name === 'bireader' && state.reading.lineTranslation){
    refreshBiReaderTranslations();
  }
  if(state.route?.name === 'reader' && state.reading.lineTranslation){
    attachLineTranslationObserver();
  }
};

// close settings on outside click
document.addEventListener("click", (e)=>{
  if(settings.style.display !== "block") return;
  // ignore the same click that opened the sheet
  try{ if(e.target && e.target.closest && e.target.closest('#topSettings')) return; }catch(_e){}
  if(settings.contains(e.target)) return;
  closeSettings();
});

/* ---------------------------
   Init
--------------------------- */
(function init(){
  TARGET_LANGS.forEach(l=>{
    const opt = document.createElement("option");
    opt.value = l.code;
    opt.textContent = l.label;
    targetLangSelect.appendChild(opt);
  });
  targetLangSelect.value = state.reading.targetLang;

  loadCatalog().then(()=>go({name:"catalog"}, {push:false}));
})();
