// assets/client-details.js
(function () {
  'use strict';

  // ---- UTIL ----
  const $ = (s, r=document) => r.querySelector(s);
  const escapeHtml = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmtDatePL = (iso)=>{ try { return new Date(iso).toLocaleDateString('pl-PL', { dateStyle:'medium' }); } catch { return iso||''; } };
  const qs = new URLSearchParams(location.search);
  const CLIENTS_LS_KEY = 'adm_clients_v1';

  function clientsLoad(){
    try { return JSON.parse(localStorage.getItem(CLIENTS_LS_KEY)) || []; }
    catch { return []; }
  }
  function clientsSave(list){
    localStorage.setItem(CLIENTS_LS_KEY, JSON.stringify(list || []));
  }

  function showSection(id){
    ['cd-section-suggestions','cd-section-upcoming','cd-section-history','cd-section-contact','cd-section-notes']
      .forEach(x => document.getElementById(x)?.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
  }
function normEmail(e){ return String(e||'').trim().toLowerCase(); }
function normPhone(p){ return String(p||'').replace(/[^\d+]/g,''); }

  // ---- DATA ----
  const id = qs.get('id');
  let client = clientsLoad().find(x => x.id === id);
  if (!client) {
    document.body.innerHTML = '<div class="container"><p>Nie znaleziono klienta.</p><p><a href="admin.html">Wróć</a></p></div>';
    return;
  }

  // ---- START ----
  $('#cd-title').textContent = client.name || 'Szczegóły klienta';
  $('#cd-email').textContent = client.email || '-';
  $('#cd-phone').textContent = client.phone || '-';
  $('#cd-address').textContent = client.address || '-';

  // Sugestie
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

  // Nadchodzące / Historia (Supabase)
async function fetchUpcoming({ email, phone }){
  const nowIso = new Date().toISOString();
  const e = normEmail(email);
  const p = normPhone(phone);

  let q = window.sb.from('bookings_view')
    .select('when, service_name, status')
    .gte('when', nowIso)
    .neq('status','Anulowana')
    .order('when', { ascending: true });

  if (e && p) {
    // dopasuj po e-mail (case-insensitive) LUB po telefonie
    q = q.or(`client_email.ilike.${e},phone.eq.${p}`);
  } else if (e) {
    q = q.ilike('client_email', e);
  } else if (p) {
    q = q.eq('phone', p);
  } else {
    return []; // brak identyfikatorów – nic nie zwrócimy
  }

  const { data, error } = await q;
  if (error) { console.warn('upcoming error', error); return []; }
  return data || [];
}


  async function fetchHistory({ email, phone }){
  const nowIso = new Date().toISOString();
  const e = normEmail(email);
  const p = normPhone(phone);

  let q = window.sb.from('bookings_view')
    .select('when, service_name, status')
    .lt('when', nowIso)                 // tylko przeszłe
    .neq('status','Anulowana')          // nie pokazuj anulowanych
    .order('when', { ascending: false });

  if (e && p) {
    q = q.or(`client_email.ilike.${e},phone.eq.${p}`);
  } else if (e) {
    q = q.ilike('client_email', e);
  } else if (p) {
    q = q.eq('phone', p);
  } else {
    return [];
  }

  const { data, error } = await q;
  if (error) { console.warn('history error', error); return []; }
  return data || [];
}


  async function renderUpcoming(){
    const rows = await fetchUpcoming({ email: client.email, phone: client.phone });
    const tbody = $('#cd-upcoming-rows');
    tbody.innerHTML = rows.map(it => `
      <tr><td>${fmtDatePL(it.when)}</td><td>${escapeHtml(it.service_name||'-')}</td><td>${escapeHtml(it.status||'-')}</td></tr>
    `).join('') || '<tr><td colspan="3">Brak nadchodzących</td></tr>';
  }

  async function renderHistory(){
    const rows = await fetchHistory({ email: client.email, phone: client.phone });
    const tbody = $('#cd-history-rows');
    tbody.innerHTML = rows.map(it => `
      <tr><td>${fmtDatePL(it.when)}</td><td>${escapeHtml(it.service_name||'-')}</td><td>${escapeHtml(it.status||'-')}</td></tr>
    `).join('') || '<tr><td colspan="3">Brak historii</td></tr>';
  }

  // Notatki/ustawienia (lokalne)
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
    client = list[idx];
    alert('Zapisano.');
  }

  // ---- Łączenia przycisków ----
  $('#cd-btn-suggestions')?.addEventListener('click', () => {
    $('#cd-section-suggestions').innerHTML = buildSuggestions(client);
    showSection('cd-section-suggestions');
  });

  $('#cd-btn-upcoming')?.addEventListener('click', async () => {
    await renderUpcoming();
    showSection('cd-section-upcoming');
  });

  $('#cd-btn-history')?.addEventListener('click', async () => {
    await renderHistory();
    showSection('cd-section-history');
  });

  $('#cd-btn-contact')?.addEventListener('click', () => {
    // dane kontaktowe wypełnione już na starcie
    showSection('cd-section-contact');
  });

  $('#cd-btn-notes')?.addEventListener('click', () => {
    loadNotesToForm();
    showSection('cd-section-notes');
  });

  $('#cd-save')?.addEventListener('click', saveNotesFromForm);

  $('#cd-btn-back')?.addEventListener('click', () => {
    // spróbuj zamknąć kartę; jeśli nie można, wróć do admin
    window.close();
    setTimeout(() => { location.href = 'admin.html#clients'; }, 200);
  });
})();
