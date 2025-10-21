diff --git a/assets/admin.js b/assets/admin.js
index 94fe232f94c92c384625cc258b2efbc97f08d5cf..ebcfff30e87c5d4f5e6ee79fcb0d2529ef7cb0a6 100644
--- a/assets/admin.js
+++ b/assets/admin.js
@@ -14,59 +14,280 @@
 
   // --- KONFIG ---------------------------------------------------------------
   let PIN = '2505';
   const AUTH_KEY = 'adm_ok';
 
 
   // --- UTIL -----------------------------------------------------------------
   const $  = (s, r=document) => r.querySelector(s);
   const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
   const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' }); } catch { return iso||''; } };
   const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
 function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
 function toTelHref(phone){
   const num = String(phone||'').replace(/[^\d+]/g,''); // tylko cyfry i +
   return num ? `tel:${num}` : '';
 }
 function toMailHref(email, subject='Rezerwacja potwierdzona'){
   const e = String(email||'').trim();
   return e ? `mailto:${encodeURIComponent(e)}?subject=${encodeURIComponent(subject)}` : '';
 }
 function toMapsHref(address){
   const a = String(address||'').trim();
   return a ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}` : '';
 }
 
+  function toYmdLocal(value) {
+    try {
+      const d = value instanceof Date ? value : new Date(value);
+      if (!d || Number.isNaN(d.getTime())) return '';
+      const y = d.getFullYear();
+      const m = String(d.getMonth() + 1).padStart(2, '0');
+      const day = String(d.getDate()).padStart(2, '0');
+      return `${y}-${m}-${day}`;
+    } catch (_) {
+      return '';
+    }
+  }
+
+  function fmtTimeShort(iso) {
+    try {
+      return new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
+    } catch (_) {
+      return '';
+    }
+  }
+
+  let calendarFp = null;
+  let calendarMeta = {};
+  let calendarChannel = null;
+  let calendarLoading = false;
+  let calendarRefreshTimer = null;
+  let calendarRefreshQueued = false;
+
+  function setCalendarStatus(message, isError = false) {
+    const el = document.getElementById('calendar-status');
+    if (!el) return;
+    const text = String(message || '').trim();
+    if (!text) {
+      el.textContent = '';
+      el.classList.remove('error');
+      el.style.display = 'none';
+      return;
+    }
+    el.style.display = '';
+    el.textContent = text;
+    el.classList.toggle('error', !!isError);
+  }
+
+  function decorateCalendarDay(dayElem, meta) {
+    if (!dayElem) return;
+    dayElem.classList.remove('calendar-day-free', 'calendar-day-full');
+    dayElem.querySelectorAll('.calendar-mini').forEach((node) => node.remove());
+
+    if (!meta || (!meta.totalSlots && !meta.bookings.length)) {
+      dayElem.removeAttribute('title');
+      return;
+    }
+
+    const tooltip = [];
+
+    if (meta.freeCount > 0) {
+      dayElem.classList.add('calendar-day-free');
+      const earliest = meta.free[0];
+      const label = fmtTimeShort(earliest?.when) || '—';
+      const marker = document.createElement('span');
+      marker.className = 'calendar-mini';
+      marker.textContent = label;
+      dayElem.appendChild(marker);
+      tooltip.push(`Najbliższy wolny termin: ${label}`);
+      tooltip.push(`Wolne: ${meta.freeCount}/${meta.totalSlots}`);
+    } else if (meta.totalSlots > 0) {
+      dayElem.classList.add('calendar-day-full');
+      const marker = document.createElement('span');
+      marker.className = 'calendar-mini';
+      marker.textContent = 'Brak';
+      dayElem.appendChild(marker);
+      tooltip.push(`Brak wolnych terminów (${meta.totalSlots})`);
+    }
+
+    if (meta.bookings.length) {
+      const preview = meta.bookings
+        .slice(0, 4)
+        .map((b) => `${fmtTimeShort(b.when)} – ${b.status || 'Rezerwacja'}`)
+        .join(', ');
+      const more = meta.bookings.length > 4 ? ` (+${meta.bookings.length - 4})` : '';
+      tooltip.push(`Rezerwacje: ${preview}${more}`);
+    }
+
+    dayElem.title = tooltip.filter(Boolean).join('\n');
+  }
+
+  function ensureCalendar() {
+    const container = document.getElementById('admin-calendar');
+    if (!container || !window.flatpickr) return false;
+
+    if (!calendarFp) {
+      try {
+        if (window.flatpickr?.l10ns?.pl) {
+          window.flatpickr.localize(window.flatpickr.l10ns.pl);
+        }
+      } catch (_) {}
+
+      calendarFp = window.flatpickr(container, {
+        inline: true,
+        disableMobile: true,
+        defaultDate: new Date(),
+        locale: window.flatpickr?.l10ns?.pl ? 'pl' : undefined,
+        onDayCreate(_dObj, _dStr, _fp, dayElem) {
+          const meta = calendarMeta[toYmdLocal(dayElem.dateObj)];
+          decorateCalendarDay(dayElem, meta);
+        }
+      });
+
+      subscribeCalendarRealtime();
+    }
+
+    return true;
+  }
+
+  function buildCalendarMeta(slots, bookings) {
+    const map = {};
+    const ensure = (ymd) => {
+      if (!map[ymd]) {
+        map[ymd] = { free: [], taken: [], bookings: [], totalSlots: 0, freeCount: 0 };
+      }
+      return map[ymd];
+    };
+
+    (slots || []).forEach((slot) => {
+      if (!slot?.when) return;
+      const ymd = toYmdLocal(slot.when);
+      if (!ymd) return;
+      const entry = ensure(ymd);
+      entry.totalSlots += 1;
+      if (slot.taken) entry.taken.push(slot);
+      else entry.free.push(slot);
+    });
+
+    (bookings || []).forEach((booking) => {
+      if (!booking?.when) return;
+      const ymd = toYmdLocal(booking.when);
+      if (!ymd) return;
+      ensure(ymd).bookings.push(booking);
+    });
+
+    Object.values(map).forEach((entry) => {
+      entry.free.sort((a, b) => new Date(a.when) - new Date(b.when));
+      entry.taken.sort((a, b) => new Date(a.when) - new Date(b.when));
+      entry.bookings.sort((a, b) => new Date(a.when) - new Date(b.when));
+      entry.freeCount = entry.free.length;
+      if (!entry.totalSlots) entry.totalSlots = entry.free.length + entry.taken.length;
+    });
+
+    return map;
+  }
+
+  async function refreshCalendar() {
+    if (!ensureCalendar() || !window.sb) return;
+    if (calendarLoading) return;
+
+    calendarLoading = true;
+    setCalendarStatus('Ładowanie…');
+
+    try {
+      const nowIso = new Date().toISOString();
+
+      const { data: slots, error: slotsErr } = await window.sb
+        .from('slots')
+        .select('id, when, taken')
+        .gte('when', nowIso)
+        .order('when', { ascending: true });
+      if (slotsErr) throw slotsErr;
+
+      const { data: bookings, error: bookingsErr } = await window.sb
+        .from('bookings_view')
+        .select('when, status, client_name, booking_no')
+        .gte('when', nowIso)
+        .order('when', { ascending: true });
+      if (bookingsErr) throw bookingsErr;
+
+      calendarMeta = buildCalendarMeta(slots, bookings);
+      const hasDays = Object.keys(calendarMeta).length > 0;
+      setCalendarStatus(hasDays ? '' : 'Brak nadchodzących terminów.');
+      if (calendarFp?.redraw) calendarFp.redraw();
+    } catch (err) {
+      console.error('[calendar] refresh error:', err);
+      setCalendarStatus(err?.message || 'Nie udało się wczytać kalendarza.', true);
+    } finally {
+      calendarLoading = false;
+      if (calendarRefreshQueued) {
+        calendarRefreshQueued = false;
+        scheduleCalendarRefresh();
+      }
+    }
+  }
+
+  function scheduleCalendarRefresh() {
+    if (!document.getElementById('admin-calendar')) return;
+    if (calendarLoading) {
+      calendarRefreshQueued = true;
+      return;
+    }
+    if (calendarRefreshTimer) clearTimeout(calendarRefreshTimer);
+    calendarRefreshTimer = setTimeout(() => {
+      calendarRefreshTimer = null;
+      refreshCalendar();
+    }, 150);
+  }
+
+  function subscribeCalendarRealtime() {
+    if (!window.sb?.channel) return;
+    if (calendarChannel) return;
+
+    const handler = () => scheduleCalendarRefresh();
+    calendarChannel = window.sb
+      .channel('admin-calendar')
+      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, handler)
+      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, handler);
+
+    calendarChannel.subscribe((status) => {
+      if (status === 'SUBSCRIBED') {
+        console.log('[calendar] realtime sub active');
+      }
+    });
+  }
+
   // --- TABS -----------------------------------------------------------------
   function showNav() { const nav = $('#top-tabs'); if (nav) nav.style.display = ''; }
   function showTab(name) {
     const ids = ['bookings','slots','clients','settings'];
     for (const id of ids) {
       const el = document.getElementById(id+'-screen');
       if (el) el.classList.toggle('hidden', id !== name);
     }
-    if      (name==='bookings') initBookings();
+    if      (name==='bookings') { initBookings(); scheduleCalendarRefresh(); }
     else if (name==='slots')    loadSlots();
     else if (name==='clients')  window.Clients?.render();
     else if (name==='settings') loadSettings();
   }
   (function wireTabs(){
     $('#top-tabs')?.addEventListener('click', (e) => {
       const btn = e.target.closest('button[data-tab]');
       if (!btn) return;
       showTab(btn.dataset.tab);
     });
   })();
 
   // --- LOGIN ----------------------------------------------------------------
   function wireLogin() {
     const pinScr  = $('#pin-screen');
     const bookScr = document.getElementById('bookings-screen') || document.getElementById('list-screen');
 
     async function afterLogin() {
       pinScr?.classList.add('hidden');
       bookScr?.classList.remove('hidden');
       showNav();
       showTab('bookings');
     }
 
     if (localStorage.getItem(AUTH_KEY) === '1') { afterLogin(); return; }
@@ -271,99 +492,109 @@ for (const b of list) {
   const phone = b.phone || b.client_phone || '';
 
   const mapH  = addr  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}` : '';
   const mailH = email ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Rezerwacja potwierdzona')}` : '';
   const telH  = phone ? `tel:${String(phone).replace(/[^\d+]/g,'')}` : '';
 
   const modal = document.getElementById('details-modal');
   const body  = document.getElementById('details-body');
   if (modal && body) {
     body.innerHTML = `
       <p><b>Nr rezerwacji:</b> ${b.booking_no || ''}</p>
       <p><b>Imię i nazwisko:</b> ${b.client_name || ''}</p>
       <p><b>Termin:</b> ${fmtWhen(b.when)}</p>
       <p><b>Usługa:</b> ${b.service_name || ''}</p>
       <p><b>Adres:</b> ${addr ? `<a href="${mapH}" target="_blank" rel="noopener">${addr}</a>` : '-'}</p>
       <p><b>E-mail:</b> ${email ? `<a href="${mailH}">${email}</a>` : '-'}</p>
       <p><b>Telefon:</b> ${phone ? `<a href="${telH}">${phone}</a>` : '-'}</p>
       <p><b>Uwagi:</b> ${b.notes || '-'}</p>`;
     modal.classList.remove('hidden');
   }
   return;
 }
 
       if (action==='confirm') {
         btn.disabled = true;
-        try { await confirmBooking(id); await initBookings(); }
+        try {
+          await confirmBooking(id);
+          await initBookings();
+          scheduleCalendarRefresh();
+        }
         catch(err){ alert('Błąd potwierdzania: ' + (err?.message||err)); }
         finally { btn.disabled = false; }
         return;
       }
 
       if (action==='cancel') {
         if (!confirm('Na pewno anulować tę rezerwację?')) return;
         btn.disabled = true;
-        try { await cancelBooking(id); await initBookings(); }
+        try {
+          await cancelBooking(id);
+          await initBookings();
+          scheduleCalendarRefresh();
+        }
         catch(err){ alert('Błąd anulowania: ' + (err?.message||err)); }
         finally { btn.disabled = false; }
         return;
       }
     });
     $('#close-details')?.addEventListener('click', () => { $('#details-modal')?.classList.add('hidden'); });
     document.addEventListener('keydown', (e) => { if (e.key==='Escape') $('#details-modal')?.classList.add('hidden'); });
   })();
 
   // --- SLOTS (bez usługi, zaokrąglanie do 5 min) ----------------------------
   async function loadSlots() {
   const tbody = document.getElementById('slots-rows'); if (!tbody) return;
   tbody.innerHTML = '<tr><td colspan="3">Ładowanie…</td></tr>';
 
   const nowIso = new Date().toISOString();
 
   const { data, error } = await window.sb
     .from('slots')
     .select('id, when, taken')
     .gte('when', nowIso)                // <— POKAZUJEMY TYLKO PRZYSZŁE
     .order('when', { ascending:true });
 
   if (error) { tbody.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`; return; }
 
   tbody.innerHTML = '';
   for (const s of (data || [])) {
     const tr = document.createElement('tr');
     tr.innerHTML = `
       <td>${fmtWhen(s.when)}</td>
       <td>${s.taken ? 'Zajęty' : 'Wolny'}</td>
       <td><button class="btn" data-slot-del="${s.id}" ${s.taken ? 'disabled':''}>Usuń</button></td>`;
     tbody.appendChild(tr);
   }
 
   if (!data || data.length === 0) {
     const tr = document.createElement('tr');
     tr.innerHTML = '<td colspan="3">Brak przyszłych terminów</td>';
     tbody.appendChild(tr);
   }
+
+  scheduleCalendarRefresh();
 }
 // =============== KLIENCI ===============
 
 const CLIENTS_LS_KEY = 'adm_clients_v1';
 const CLIENTS_EXPORT_VERSION = 2;
 
 // Model klienta
 function clientNew() {
   return {
     id: cryptoRandId(),
     name: '', email: '', phone: '', address: '',
     prefs: '', allergies: '', contras: '', notes: '',
     treatmentNotes: {} // notatki przypięte do booking_no
   };
 }
 
 // localStorage helpers
 function clientsLoad() {
   try {
     const raw = localStorage.getItem(CLIENTS_LS_KEY);
     return raw ? JSON.parse(raw) : [];
   } catch { return []; }
 }
 function clientsSave(list) {
   localStorage.setItem(CLIENTS_LS_KEY, JSON.stringify(list || []));
