/* ===========================
   v8 Core (DOM-free)
   - Single source of truth for:
     bookId, langPair, mode, level, lineIndex
   - Persists progress with v8 keys + writes legacy keys for backward compatibility
=========================== */

(function(){
  function safeJSONParse(s){
    try{ return JSON.parse(s); }catch(e){ return null; }
  }
  function safeGet(storage, key){
    try{ return storage.getItem(key); }catch(e){ return null; }
  }
  function safeSet(storage, key, val){
    try{ storage.setItem(key, val); return true; }catch(e){ return false; }
  }
  function normalizeLang(x){ return String(x||"").trim().toLowerCase(); }

  window.createCoreV8 = function createCoreV8(opts){
    opts = opts || {};
    const storage = opts.storage || window.localStorage;

    const DEFAULT_LEVEL = opts.defaultLevel || "original"; // original|A1|A2|B1
    const DEFAULT_MODE  = opts.defaultMode  || "read";     // read|listen

    const state = {
      bookId: null,
      src: "en",
      trg: "uk",
      mode: DEFAULT_MODE,
      level: DEFAULT_LEVEL,
      lineIndex: 0,
      totalLines: 0,
      lastStopLineIndex: 0
    };

    const listeners = new Set();
    function emit(){
      listeners.forEach(fn => { try{ fn(getState()); }catch(e){} });
    }
    function getState(){
      return JSON.parse(JSON.stringify(state));
    }
    function onChange(fn){
      listeners.add(fn);
      return ()=>listeners.delete(fn);
    }

    // ---------- keys ----------
    function getProgressKey(bookId, src, trg, level){
      const b = String(bookId||"");
      const s = normalizeLang(src||"en");
      const t = normalizeLang(trg||"uk");
      const lv = String(level||DEFAULT_LEVEL);
      return `v8::progress::${b}::${s}::${t}::${lv}`;
    }
    function getLastPkgKey(){
      return "v8::lastPkg";
    }
    function getBookLastStopKey(bookId){
      return `v8::bookLastStop::${String(bookId||"")}`;
    }

    // legacy keys (v7)
    function legacyPkgKey(bookId, src, trg){
      const s = normalizeLang(src||"en");
      const t = normalizeLang(trg||"uk");
      return `book_pkg_progress::${String(bookId||"")}::${s}::${t}`;
    }
    function legacyLastPkgKey(bookId){
      return `book_last_pkg::${String(bookId||"")}`;
    }
    function legacyGlobalLastInteractionKey(){
      return "app_last_interaction";
    }

    // ---------- helpers ----------
    function clampIndex(i){
      const idx = Math.max(0, (Number(i)||0));
      if(!state.totalLines) return idx|0;
      return Math.min(idx|0, Math.max(0, (state.totalLines|0) - 1));
    }
    function setMeta(meta){
      meta = meta || {};
      if(typeof meta.totalLines === "number") state.totalLines = Math.max(0, meta.totalLines|0);
      state.lineIndex = clampIndex(state.lineIndex);
      emit();
    }

    // ---------- persistence ----------
    function loadJSON(key){
      const raw = safeGet(storage, key);
      if(!raw) return null;
      const obj = safeJSONParse(raw);
      return obj && typeof obj === "object" ? obj : null;
    }
    function saveJSON(key, obj){
      return safeSet(storage, key, JSON.stringify(obj));
    }

    function openBook(bookId, payload){
      payload = payload || {};
      state.bookId = String(bookId||"");
      if(payload.src) state.src = normalizeLang(payload.src);
      if(payload.trg) state.trg = normalizeLang(payload.trg);
      if(payload.mode) state.mode = String(payload.mode);
      if(payload.level) state.level = String(payload.level);

      // restore lastStop (for "Back to book")
      const lastStop = loadJSON(getBookLastStopKey(state.bookId));
      state.lastStopLineIndex = lastStop && typeof lastStop.lineIndex === "number" ? clampIndex(lastStop.lineIndex) : 0;

      // restore progress for this pkg
      const saved = loadProgress();
      state.lineIndex = saved && typeof saved.lineIndex === "number" ? clampIndex(saved.lineIndex) : 0;

      // write lastPkg pointers (v8 + legacy)
      const lp = { bookId: state.bookId, src: state.src, trg: state.trg, level: state.level, mode: state.mode, ts: Date.now() };
      saveJSON(getLastPkgKey(), lp);
      // legacy last pkg per book
      saveJSON(legacyLastPkgKey(state.bookId), { mode: state.mode, sourceLang: state.src, targetLang: state.trg, ts: lp.ts });
      // legacy global last interaction (used by v7 home ordering)
      saveJSON(legacyGlobalLastInteractionKey(), { bookId: state.bookId, mode: state.mode, sourceLang: state.src, targetLang: state.trg, ts: lp.ts });

      emit();
    }

    function setLine(index){
      state.lineIndex = clampIndex(index);
      emit();
    }

    function saveProgress(extra){
      extra = extra || {};
      if(!state.bookId) return null;

      const lineIndex = clampIndex(state.lineIndex);
      const ts = Date.now();

      const payload = {
        bookId: state.bookId,
        src: state.src,
        trg: state.trg,
        level: state.level,
        mode: state.mode,
        lineIndex,
        progress: (typeof extra.progress === "number") ? Math.max(0, Math.min(100, Number(extra.progress||0))) : undefined,
        ts
      };
      // write v8 progress
      saveJSON(getProgressKey(state.bookId, state.src, state.trg, state.level), payload);

      // update last stop for this book
      state.lastStopLineIndex = lineIndex;
      saveJSON(getBookLastStopKey(state.bookId), { lineIndex, ts });

      // write legacy shared pkg progress for v7 compatibility (catalog/cards)
      const legacy = {
        sourceLang: state.src,
        targetLang: state.trg,
        progress: (typeof payload.progress === "number")
          ? payload.progress
          : (state.totalLines>0 ? Math.max(0, Math.min(100, ((lineIndex+1)/state.totalLines)*100)) : 0),
        activeIndex: lineIndex,
        ts
      };
      saveJSON(legacyPkgKey(state.bookId, state.src, state.trg), legacy);

      // update lastPkg pointers
      const lp = { bookId: state.bookId, src: state.src, trg: state.trg, level: state.level, mode: state.mode, ts };
      saveJSON(getLastPkgKey(), lp);
      saveJSON(legacyLastPkgKey(state.bookId), { mode: state.mode, sourceLang: state.src, targetLang: state.trg, ts });
      saveJSON(legacyGlobalLastInteractionKey(), { bookId: state.bookId, mode: state.mode, sourceLang: state.src, targetLang: state.trg, ts });

      emit();
      return payload;
    }

    function loadProgress(bookId, src, trg, level){
      const b = String(bookId || state.bookId || "");
      if(!b) return null;
      const s = normalizeLang(src || state.src || "en");
      const t = normalizeLang(trg || state.trg || "uk");
      const lv = String(level || state.level || DEFAULT_LEVEL);

      // v8 first
      const v8 = loadJSON(getProgressKey(b, s, t, lv));
      if(v8 && typeof v8.lineIndex === "number") return v8;

      // migrate from legacy shared pkg
      const legacy = loadJSON(legacyPkgKey(b, s, t));
      if(legacy && typeof legacy.activeIndex === "number"){
        const migrated = { bookId: b, src: s, trg: t, level: lv, mode: state.mode, lineIndex: clampIndex(legacy.activeIndex), progress: Number(legacy.progress||0), ts: Number(legacy.ts||Date.now()) };
        saveJSON(getProgressKey(b, s, t, lv), migrated);
        return migrated;
      }
      return null;
    }

    function switchMode(mode){
      state.mode = String(mode||DEFAULT_MODE);
      emit();
    }

    function switchLangPair(src, trg, level){
      // save current progress before switching
      saveProgress();
      state.src = normalizeLang(src||state.src);
      state.trg = normalizeLang(trg||state.trg);
      if(level) state.level = String(level);
      const saved = loadProgress();
      state.lineIndex = saved && typeof saved.lineIndex === "number" ? clampIndex(saved.lineIndex) : 0;

      const lp = { bookId: state.bookId, src: state.src, trg: state.trg, level: state.level, mode: state.mode, ts: Date.now() };
      saveJSON(getLastPkgKey(), lp);
      saveJSON(legacyLastPkgKey(state.bookId), { mode: state.mode, sourceLang: state.src, targetLang: state.trg, ts: lp.ts });
      saveJSON(legacyGlobalLastInteractionKey(), { bookId: state.bookId, mode: state.mode, sourceLang: state.src, targetLang: state.trg, ts: lp.ts });

      emit();
    }

    function getLastPkg(){
      return loadJSON(getLastPkgKey());
    }

    function getBackToBookLine(){
      return clampIndex(state.lastStopLineIndex || 0);
    }

    return {
      // state
      getState,
      onChange,

      // meta
      setMeta,

      // keys
      getProgressKey,

      // ops
      openBook,
      setLine,
      saveProgress,
      loadProgress,
      switchMode,
      switchLangPair,

      // misc
      getLastPkg,
      getBackToBookLine
    };
  };
})();
