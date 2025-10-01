// assets/cloud-slots-adapter.js
// WYMAGANE: globalny klient Supabase w window.sb (tworzony w assets/supabase-client.js)
//
// Działanie:
//  - CloudSlots.pull()  -> pobiera sloty z tabeli 'slots', filtruje (taken=false, przyszłość),
//                          zapisuje do localStorage('slots') i emituje 'slots-synced'
//  - CloudSlots.get()   -> zwraca tablicę slotów z localStorage
//  - CloudSlots.byDate(yyyyMMdd) -> zwraca wolne sloty dla danego dnia (posortowane)
//  - CloudSlots.markTakenLocal(id, taken) -> lokalnie aktualizuje cache (np. po rezerwacji)
//  - CloudSlots.removeFromCache(id) -> usuwa slot z cache
//  - CloudSlots.clear() -> czyści cache

(function (global) {
  var LS_KEY = 'slots';
  var TABLE = 'slots'; // <— jeśli kiedyś wrócisz do free_slots, zmień tutaj

  function toISODate(d) {
    try { return new Date(d).toISOString().slice(0, 10); }
    catch (_) { return ''; }
  }

  function isFutureOrToday(dt) {
    try {
      var now = new Date();
      var t = new Date(dt);
      // odetnij czas z "now" by dopuścić dzisiejsze przyszłe godziny po stronie UI
      return t >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } catch (_) {
      return false;
    }
  }

  function saveCache(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr || [])); }
    catch (_) {}
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') || []; }
    catch (_) { return []; }
  }

  function sortByWhen(a, b) {
    return new Date(a.when) - new Date(b.when);
  }

  function normalizeRow(row) {
    return {
      id: row.id,
      when: row.when,
      taken: row.taken === true ? true : false
    };
  }

  async function pull() {
    if (!global.sb) {
      console.error('[CloudSlots] Supabase client (sb) nie jest dostępny.');
      return [];
    }
    try {
      // Pobierz surowe dane – selekcja minimalna
      var resp = await sb
        .from(TABLE)
        .select('id, when, taken')
        .order('when', { ascending: true });

      if (resp.error) throw resp.error;

      var rows = resp.data || [];
      // Normalizacja + filtr (wolne i w przyszłości)
      var cleaned = [];
      for (var i = 0; i < rows.length; i++) {
        var s = normalizeRow(rows[i]);
        if (s.taken) continue;
        if (!isFutureOrToday(s.when)) continue;
        cleaned.push(s);
      }
      cleaned.sort(sortByWhen);

      saveCache(cleaned);
      // powiadom UI, że cache jest świeży
      try { global.dispatchEvent(new Event('slots-synced')); } catch (_) {}

      return cleaned;
    } catch (e) {
      console.error('[CloudSlots.pull] error:', e);
      return [];
    }
  }

  function get() {
    return readCache();
  }

  function byDate(yyyyMMdd) {
    var all = readCache();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var s = all[i];
      if (toISODate(s.when) === yyyyMMdd && !s.taken) out.push(s);
    }
    out.sort(sortByWhen);
    return out;
  }

  function markTakenLocal(id, taken) {
    var all = readCache();
    var changed = false;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) {
        all[i].taken = !!taken;
        changed = true;
        break;
      }
    }
    if (changed) {
      // jeśli zajęty, usuń z listy wolnych w cache
      var filtered = [];
      for (var j = 0; j < all.length; j++) {
        if (all[j].taken === true) continue;
        filtered.push(all[j]);
      }
      saveCache(filtered);
      try { global.dispatchEvent(new Event('slots-synced')); } catch (_) {}
    }
  }

  function removeFromCache(id) {
    var all = readCache();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].id !== id) out.push(all[i]);
    }
    saveCache(out);
    try { global.dispatchEvent(new Event('slots-synced')); } catch (_) {}
  }

  function clear() {
    try { localStorage.removeItem(LS_KEY); } catch (_) {}
    try { global.dispatchEvent(new Event('slots-synced')); } catch (_) {}
  }

  // wystaw publiczne API
  global.CloudSlots = {
    pull: pull,
    get: get,
    byDate: byDate,
    markTakenLocal: markTakenLocal,
    removeFromCache: removeFromCache,
    clear: clear
  };
})(window);
