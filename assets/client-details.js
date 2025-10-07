// assets/client-details.js
(function () {
  'use strict';

  // ===== UTIL =====
  const $ = (s, r=document) => r.querySelector(s);
  const escapeHtml = (s) => String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmtDatePL = (iso) => {
    try { return new Date(iso).toLocaleDateString('pl-PL', { dateStyle:'medium' }); }
    catch { return iso || ''; }
  };
  const qs = new URLSearchParams(location.search);

  // Normalizacja identyfikatorów
  function normEmail(e){ return String(e||'').trim().toLowerCase(); }
  function normPhone(p){ return String(p||'').replace(/[^\d+]/g,''); }

  // ===== LOCAL STORAGE =====
  const CLIENTS_LS_KEY = 'adm_clients_v1';
  function clientsLoad(){
    try { return JSON.parse(localStorage.getItem(CLIENTS_LS_KEY)) || []; }
    catch { return []; }
  }
  function clientsSave(list){
    localStorage.setItem(CLIENTS_LS_KEY, JSON.stringify(list || []));
  }

  // ===== SECTIONS =====
  function showSection(id){
    const ids = [
      'cd-section-suggestions',
      'cd-section-upcoming',
      'cd-section-history',
      'cd-section-contact',
      'cd-section-notes'
    ];
    ids.forEach(x => document.getElementById(x)?.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
  }

  // ===== LOAD CLIENT =====
  const id = qs.get('id');
  let client = clientsLoad().find(x => x.id === id);
  if (!client) {
    document.body.innerHTML = '<div class="container"><p>Nie znaleziono klienta.</p><p><a href="admin.html#clients">Wróć</a></p></div>';
    return;
  }

  // Header + kontakt na starcie
  $('#cd-title').textContent = client.name || 'Szczegóły klienta';
  $('#cd-email').textContent = client.email || '-';
  $('#cd-phone').textContent = client.phone || '-';
  $('#cd-address').textContent = client.address || '-';

  // ===== SUGESTIE =====
  function buildSuggestions(c){
    const out = [];
    const txt = (s)=>String(s||'').toLowerCase();
    if (txt(c.allergies).includes('olej')) out.push('Unikaj olejków zapachowych.');
    if (txt(c.prefs).includes('mocny'))    out.push('Lubi mocny masaż.');
    if (Object.keys(c.treatmentNotes||{}).length > 3) out.push('Klient regularny – zaproponuj pakiet.');
    if (!out.length) out.push('Brak szczególnych zaleceń.');
    return out.join('<br>');
  }
  $('#cd-section-suggestions').innerHTML = buildSuggestions(client);
  showSection('cd-section-suggestions');

  // ===== SUPABASE QUERIES =====
 // pobiera wszystkie zabiegi klienta; resztę filtrujemy lokalnie
async function fetchClientBookings({ email, phone }) {
  const e = normEmail(email);
  const p = normPhone(phone);

  if (!e && !p) return { rows: [], reason: 'Brak e-maila/telefonu u klienta' };

  let q = sb.from('bookings_view')
    .select('*')                                // bierzemy wszystko, w tym 'notes'
    .order('when', { ascending: true });

  const parts = [];
  if (e) parts.push(`client_email.ilike.${e}`);
  if (p) parts.push(`phone.eq.${p}`);
  q = q.or(parts.join(','));

  const { data, error } = await q;
  if (error) return { rows: [], reason: error.message };
  return { rows: data || [], reason: null };
}


  // ===== RENDERERS =====
 function noteFor(r){
  // na wszelki wypadek złap też inne możliwe nazwy
  return r.notes ?? r.note ?? r.admin_notes ?? r.uwagi ?? r.comment ?? r.comments ?? r.remark ?? r.remarks ?? '';
}

async function renderUpcoming(){
  const out = await fetchClientBookings({ email: client.email, phone: client.phone });
  const tbody = document.getElementById('cd-upcoming-rows'); if (!tbody) return;

  if (out.reason && !out.rows.length) {
    tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(out.reason)}</td></tr>`;
    return;
  }

  const now = new Date();
  const rows = out.rows.filter(r => new Date(r.when) >= now && r.status !== 'Anulowana');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4">Brak nadchodzących</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(it => `
    <tr>
      <td>${fmtDatePL(it.when)}</td>
      <td>${escapeHtml(it.service_name || '-')}</td>
      <td>${escapeHtml(it.status || '-')}</td>
      <td>${escapeHtml(noteFor(it) || '-')}</td>
    </tr>
  `).join('');
}

async function renderHistory(){
  const out = await fetchClientBookings({ email: client.email, phone: client.phone });
  const tbody = document.getElementById('cd-history-rows'); if (!tbody) return;

  if (out.reason && !out.rows.length) {
    tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(out.reason)}</td></tr>`;
    return;
  }

  const now = new Date();
  const rows = out.rows
    .filter(r => new Date(r.when) < now && r.status !== 'Anulowana')
    .sort((a,b) => new Date(b.when) - new Date(a.when));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4">Brak historii</td></tr>`;
    return;
  }

  // klucz notatki: preferuj booking_no; fallback: when|service
  const localNotes = (client.treatmentNotes || {});
  tbody.innerHTML = rows.map(it => {
    const key = it.booking_no || `${it.when}|${it.service_name||''}`;
    const curr = localNotes[key] || '';
    return `
      <tr data-key="${encodeURIComponent(key)}">
        <td>${fmtDatePL(it.when)}</td>
        <td>${escapeHtml(it.service_name || '-')}</td>
        <td>${escapeHtml(it.status || '-')}</td>
        <td>
          <div style="display:flex; gap:6px; align-items:flex-start">
            <textarea class="hist-note" rows="2" style="min-width:260px">${escapeHtml(curr)}</textarea>
            <button class="btn" data-save-hist="${encodeURIComponent(key)}">Zapisz</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function setBtnCount(id, baseLabel, n){
  const el = document.getElementById(id);
  if (el) el.textContent = `${baseLabel} (${n})`;
}

async function refreshCounts(){
  const out = await fetchClientBookings({ email: client.email, phone: client.phone });
  const now = new Date();
  const upcoming = out.rows.filter(r => new Date(r.when) >= now && r.status !== 'Anulowana').length;
  const history  = out.rows.filter(r => new Date(r.when) <  now && r.status !== 'Anulowana').length;
  setBtnCount('cd-btn-upcoming', 'Nadchodzące zabiegi', upcoming);
  setBtnCount('cd-btn-history',  'Historia zabiegów',   history);
}


  // ===== NOTES (lokalne) =====
  function loadNotesToForm(){
    $('#cd-prefs').value      = client.prefs || '';
    $('#cd-allergies').value  = client.allergies || '';
    $('#cd-contras').value    = client.contras || '';
    $('#cd-notes').value      = client.notes || '';
  }
  function saveNotesFromForm(){
    const list = clientsLoad();
    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) return;
    list[idx].prefs     = $('#cd-prefs')?.value || '';
    list[idx].allergies = $('#cd-allergies')?.value || '';
    list[idx].contras   = $('#cd-contras')?.value || '';
    list[idx].notes     = $('#cd-notes')?.value || '';
    clientsSave(list);
    client = list[idx]; // odśwież referencję
    alert('Zapisano.');
  }

  // ===== BUTTONS =====
renderUpcoming().then(() => showSection('cd-section-upcoming'));
refreshCounts(); // ← doda liczby do przycisków



  $('#cd-btn-upcoming')?.addEventListener('click', async () => {
    await renderUpcoming();
    showSection('cd-section-upcoming');
  });

  $('#cd-btn-history')?.addEventListener('click', async () => {
    await renderHistory();
    showSection('cd-section-history');
  });
// zapis uwag terapeutki w Historii (localStorage)
document.getElementById('cd-history-rows')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-save-hist]');
  if (!btn) return;
  const key = decodeURIComponent(btn.getAttribute('data-save-hist') || '');
  const tr = btn.closest('tr');
  const val = tr?.querySelector('.hist-note')?.value || '';

  const list = clientsLoad();
  const idx = list.findIndex(x => x.id === id);
  if (idx < 0) return;
  list[idx].treatmentNotes = list[idx].treatmentNotes || {};
  list[idx].treatmentNotes[key] = val;
  clientsSave(list);
  client = list[idx]; // odśwież referencję

  btn.textContent = 'Zapisano';
  setTimeout(() => { btn.textContent = 'Zapisz'; }, 1000);
});

  $('#cd-btn-contact')?.addEventListener('click', () => {
    showSection('cd-section-contact');
  });

  $('#cd-btn-notes')?.addEventListener('click', () => {
    loadNotesToForm();
    showSection('cd-section-notes');
  });

  $('#cd-save')?.addEventListener('click', saveNotesFromForm);

  $('#cd-btn-back')?.addEventListener('click', () => {
    // spróbuj zamknąć; jeśli przeglądarka blokuje, wróć do admin
    window.close();
    setTimeout(() => { location.href = 'admin.html#clients'; }, 200);
  });
  
})();
