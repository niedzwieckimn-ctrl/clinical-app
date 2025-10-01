// assets/app.calendar.js
(function (global) {
  // ===== helpers =====

function ymd(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;   // ⬅︎ ten return był brakujący
}


  function byTime(a,b){ return new Date(a.when) - new Date(b.when); }

  function getSlots(){
    try { return JSON.parse(localStorage.getItem('slots') || '[]') || []; }
    catch { return []; }
  }

  function buildMap(slots){
    var map = {};
    for (var i=0;i<slots.length;i++){
      var s = slots[i];
      if (s.taken) continue;
      var k = ymd(s.when);
      if (!map[k]) map[k] = [];
      map[k].push(s);
    }
    Object.keys(map).forEach(function(k){ map[k].sort(byTime); });
    return map;
  }

 function fillTimes(dateYmd) {
  const timeSel = document.getElementById('time');
  if (!timeSel) return;

  // wyczyść
  timeSel.innerHTML = '';

  // wczytaj sloty z cache
  let slots = [];
  try { slots = JSON.parse(localStorage.getItem('slots') || '[]') || []; } catch {}

  // filtr: wybrany dzień (po lokalnym YYYY-MM-DD), tylko wolne i w przyszłości (dla "dziś" – tylko przyszłe godziny)
  const now = new Date();
  const todayYmd = ymd(now);

  const sameDay = (iso) => {
    const d = new Date(iso);
    return ymd(d) === dateYmd;
  };

  const isFutureIfToday = (iso) => {
    const d = new Date(iso);
    if (dateYmd === todayYmd) return d.getTime() > now.getTime();
    return true;
  };

  const available = slots
    .filter(s => !s.taken && s.when && sameDay(s.when) && isFutureIfToday(s.when))
    .sort((a,b) => new Date(a.when) - new Date(b.when));

  if (!available.length) {
    timeSel.innerHTML = `<option value="">Brak wolnych godzin</option>`;
    return;
  }

  timeSel.innerHTML = available.map(s => {
    const t = new Date(s.when);
    const hh = String(t.getHours()).padStart(2,'0');
    const mm = String(t.getMinutes()).padStart(2,'0');
    // value: ID slota — reszta logiki (zapisywanie rezerwacji) zakłada ID
   return `<option value="${s.id}" data-when="${s.when}">${hh}:${mm}</option>`;

  }).join('');
}


  // ===== mount: ustaw datę i wypełnij godziny =====
  function mount(){
    var dateEl = document.getElementById('date');
    if (!dateEl) return;

    // mapa dni -> sloty
    var map = buildMap(getSlots());
    var days = Object.keys(map).sort();

    if (days.length){
      // ustaw zakres i pierwszy wolny dzień
      dateEl.min = days[0];
      dateEl.max = days[days.length-1];
      if (!dateEl.value || !map[dateEl.value]) { dateEl.value = days[0]; }
      // wypełnij godziny
      fillTimes(dateEl.value);
    } else {
      dateEl.removeAttribute('min');
      dateEl.removeAttribute('max');
      var timeEl = document.getElementById('time');
      if (timeEl){
        timeEl.innerHTML = '';
        var none = new Option('Brak wolnych godzin','');
        none.disabled = true; none.selected = true;
        timeEl.add(none);
      }
    }
  }

  // zmiana daty → przeładuj godziny
  document.addEventListener('change', function(e){
    if (e.target && e.target.id === 'date'){
      fillTimes(e.target.value);
    }
  });

  // po zsynchronizowaniu slotów z chmury
  global.addEventListener('slots-synced', mount);

  // po załadowaniu DOM – spróbuj z tego co już w cache
  document.addEventListener('DOMContentLoaded', mount);

  // eksport prostego API
  global.ModCalendar = {
    refresh: mount,
    fillTimes: fillTimes
  };
})(window);
