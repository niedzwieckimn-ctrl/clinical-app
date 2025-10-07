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
  // Nadchodzące (>= now, != Anulowana), dopasuj po email (ILIKE) lub phone (eq)
  async function fetchUpcoming({ email, phone }){
    const nowIso = new Date().toISOString();
    const e = normEmail(email);
    const p = normPhone(phone);

    let q = window.sb.from('bookings_view')
      .select('when, service_name, status')
      .gte('when', nowIso)
      .neq('status','Anulowana')
      .order('when', { ascending: true });

    if (!e && !p) return { rows: [], reason: 'Brak e-maila/telefonu u klienta' };

    const parts = [];
    if (e) parts.push(`client_email.ilike.${e}`);
    if (p) parts.push(`phone.eq.${p}`);
    q = q.or(parts.join(','));

    const { data, error } = await q;
    if (error) { console.warn('[upcoming] supabase:', error); return { rows: [], reason: error.message }; }
    return { rows: data || [], reason: null };
  }

  // Historia (< now, != Anulowana), dopasuj po email (ILIKE) lub phone (eq)
  async function fetchHistory({ email, phone }){
    const nowIso = new Date().toISOString();
    const e = normEmail(email);
    const p = normPhone(phone);

    let q = window.sb.from('bookings_view')
      .select('when, service_name, status, notes')
      .lt('when', nowIso)
      .neq('status','Anulowana')
      .order('when', { ascending: false });

    if (!e && !p) return { rows: [], reason: 'Brak e-maila/telefonu u klienta' };

    const parts = [];
    if (e) parts.push(`client_email.ilike.${e}`);
    if (p) parts.push(`phone.eq.${p}`);
    q = q.or(parts.join(','));

    const { data, error } = await q;
    if (error) { console.warn('[history] supabase:', error); return { rows: [], reason: error.message }; }
    return { rows: data || [], reason: null };
  }

  // ===== RENDERERS =====
  async function renderUpcoming(){
    const out = await fetchUpcoming({ email: client.email, phone: client.phone });
    const tbody = document.getElementById('cd-upcoming-rows'); if (!tbody) return;
   
 if (!out.rows.length) {
   tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(out.reason || 'Brak nadchodzących')}</td></tr>`;
   return;
 }
 tbody.innerHTML = out.rows.map(it => `
   <tr>
     <td>${fmtDatePL(it.when)}</td>
     <td>${escapeHtml(it.service_name||'-')}</td>
     <td>${escapeHtml(it.status||'-')}</td>
     <td>${escapeHtml(it.notes||'-')}</td>
   </tr>
 `).join('');


  async function renderHistory(){
    const out = await fetchHistory({ email: client.email, phone: client.phone });
    const tbody = document.getElementById('cd-history-rows'); if (!tbody) return;
    if (!out.rows.length) {
      tbody.innerHTML = `<tr><td colspan="3">${escapeHtml(out.reason || 'Brak historii')}</td></tr>`;
      return;
    }
    tbody.innerHTML = out.rows.map(it => `
      <tr>
        <td>${fmtDatePL(it.when)}</td>
        <td>${escapeHtml(it.service_name||'-')}</td>
        <td>${escapeHtml(it.status||'-')}</td>
      </tr>
    `).join('');
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


  $('#cd-btn-upcoming')?.addEventListener('click', async () => {
    await renderUpcoming();
    showSection('cd-section-upcoming');
  });

  $('#cd-btn-history')?.addEventListener('click', async () => {
    await renderHistory();
    showSection('cd-section-history');
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
