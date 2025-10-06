// ================== ADMIN.JS – pełny plik ==================

// ---------- Utils ----------
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uid() {
  const a = new Uint8Array(8);
  (self.crypto||window.crypto).getRandomValues(a);
  return Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join('');
}

const fmtDatePL = (isoOrDate) => {
  const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
  return d.toLocaleString('pl-PL', {
    timeZone: 'Europe/Warsaw',
    weekday: 'long',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

function _first(...vals){ for(const v of vals){ if(v!==undefined && v!==null && String(v).trim()!=='') return v; } return ''; }
const _normPhone = p => (p||'').replace(/\D+/g,'');

// ---------- Global (Supabase client powinien być dostępny jako window.sb z assets/supabase-client.js)
if (!window.sb) console.warn('[supabase-client] jeszcze nie gotowy – upewnij się, że assets/supabase-client.js jest załadowany PRZED admin.js');

// ---------- Tabs ----------
function showTab(tab){
  const map = {
    bookings: '#list-screen',
    slots: '#slots-screen',
    clients: '#clients-screen',
    settings: '#settings-screen',
  };
  for (const id of Object.values(map)) $(id)?.classList.add('hidden');
  const el = $(map[tab]); if (el) el.classList.remove('hidden');

  // dociągnięcia pod zakładki
  if (tab==='bookings') initBookings();
  if (tab==='slots') initSlots();
  if (tab==='clients') { renderClients(); /* dociągnij w tle potwierdzonych */ syncClientsFromSupabase(); }
  if (tab==='settings') loadSettings();
}
function wireTabs(){
  $$('nav#top-tabs [data-tab]').forEach(btn=>{
    btn.addEventListener('click', ()=> showTab(btn.dataset.tab));
  });
}

// ======================================================
// ================   PIN (proste)   ====================
// ======================================================
const LS_PIN_KEY = 'admin.pin';
function getPin(){ return localStorage.getItem(LS_PIN_KEY) || '1234'; }
function setPin(v){ localStorage.setItem(LS_PIN_KEY, v); }
function wirePin(){
  const scr = $('#pin-screen'); if (!scr) return;
  $('#pin-btn')?.addEventListener('click', ()=>{
    const want = $('#pin-input').value.trim();
    if (want === getPin()){
      scr.classList.add('hidden');
      $('nav#top-tabs')?.style?.removeProperty('display');
      showTab('bookings');
      // po zalogowaniu – startowe sync klientów
      syncClientsFromSupabase();
    } else {
      $('#pin-err').textContent = 'Zły PIN';
    }
  });
}

// ======================================================
// ==================  BOOKINGS  ========================
// ======================================================

async function fetchBookings(){
  // Pobieramy z widoku – dopasowane do Twoich kolumn
  const { data, error } = await window.sb
    .from('bookings_view')
    .select('booking_no, when, client_name, client_email, phone, service_name, status, address')
    .order('when', { ascending: true });

  if (error) throw error;
  return data || [];
}

function renderBookingsRows(list){
  const tbody = $('#rows');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!list.length){
    tbody.innerHTML = `<tr><td colspan="4">Brak rezerwacji</td></tr>`;
    return;
  }
  for (const b of list){
    const tr = document.createElement('tr');
    tr.dataset.id = b.booking_no;
    tr.dataset.details = JSON.stringify(b);
    tr.innerHTML = `
      <td>${escapeHtml(String(b.booking_no))}</td>
      <td>${escapeHtml(b.client_name||'-')}</td>
      <td>${fmtDatePL(b.when)}</td>
      <td>
        <button class="btn btn-confirm" data-action="confirm" data-id="${b.booking_no}">Potwierdź</button>
        <button class="btn btn-cancel" data-action="cancel" data-id="${b.booking_no}">Usuń</button>
        <button class="btn btn-details" data-action="details" data-id="${b.booking_no}">Szczegóły</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function initBookings(){
  try {
    renderBookingsRows(await fetchBookings());
  } catch(e){
    const tbody = $('#rows');
    if (tbody) tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(e.message||'Błąd')}</td></tr>`;
  }
}

function wireBookingsTable(){
  $('#rows')?.addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action==='details'){
      const b = JSON.parse(btn.closest('tr').dataset.details || '{}');
      openDetailsModal(b);
      return;
    }

    if (action==='confirm'){
      btn.disabled = true;
      try {
        await confirmBooking(id);
        await initBookings();

        // === AUTO DOPIS KLIENTA do localStorage ===
        const b = JSON.parse(btn.closest('tr').dataset.details || '{}');
        upsertClientFromBooking(b);
        renderClients();
      } catch(err){
        alert('Błąd potwierdzania: ' + (err?.message||err));
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (action==='cancel'){
      btn.disabled = true;
      try {
        await cancelBooking(id);
        await initBookings();
      } catch(err){
        alert('Błąd anulowania: ' + (err?.message||err));
      } finally {
        btn.disabled = false;
      }
      return;
    }
  });
}

// ---- Szczegóły (modal) ----
function openDetailsModal(b){
  const body = $('#details-body');
  const m = $('#details-modal');
  if (!body || !m) return;

  const emailLink = b.client_email ? `<a href="mailto:${encodeURIComponent(b.client_email)}">${escapeHtml(b.client_email)}</a>` : '-';
  const telLink = b.phone ? `<a href="tel:${encodeURIComponent(b.phone)}">${escapeHtml(b.phone)}</a>` : '-';
  const addrLink = b.address ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.address)}" target="_blank" rel="noopener">${escapeHtml(b.address)}</a>` : '-';

  body.innerHTML = `
    <p><strong>Nr rezerwacji:</strong> ${escapeHtml(String(b.booking_no))}</p>
    <p><strong>Imię i nazwisko:</strong> ${escapeHtml(b.client_name||'-')}</p>
    <p><strong>Termin:</strong> ${fmtDatePL(b.when)}</p>
    <p><strong>Usługa:</strong> ${escapeHtml(b.service_name||'-')}</p>
    <p><strong>Adres:</strong> ${addrLink}</p>
    <p><strong>E-mail:</strong> ${emailLink}</p>
    <p><strong>Telefon:</strong> ${telLink}</p>
  `;
  m.classList.remove('hidden');
}

function wireDetailsModal(){
  $('#close-details')?.addEventListener('click', ()=> $('#details-modal')?.classList.add('hidden'));
  document.addEventListener('keydown', (e)=> {
    if (e.key==='Escape') $('#details-modal')?.classList.add('hidden');
  });
}

// ---- Netlify Functions ----
async function confirmBooking(booking_no){
  const res = await fetch('/.netlify/functions/admin-confirm', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ booking_no })
  });
  if (!res.ok){
    const t = await res.text().catch(()=> '');
    throw new Error(t || 'Błąd potwierdzania');
  }
  return true;
}
async function cancelBooking(booking_no){
  const res = await fetch('/.netlify/functions/admin-cancel', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ booking_no })
  });
  if (!res.ok){
    const t = await res.text().catch(()=> '');
    throw new Error(t || 'Błąd anulowania');
  }
  return true;
}

// ======================================================
// ==================  SLOTS  ===========================
// ======================================================

async function fetchSlots(){
  const { data, error } = await window.sb
    .from('free_slots')
    .select('id, when, is_free')
    .order('when', { ascending: true });
  if (error) throw error;
  return data||[];
}

function renderSlots(list){
  const tbody = $('#slots-rows');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!list.length){
    tbody.innerHTML = `<tr><td colspan="3">Brak terminów</td></tr>`;
    return;
  }
  for (const s of list){
    const tr = document.createElement('tr');
    tr.dataset.id = s.id;
    tr.innerHTML = `
      <td>${fmtDatePL(s.when)}</td>
      <td>${s.is_free ? 'wolny' : 'zajęty'}</td>
      <td><button class="btn btn-cancel" data-slot-del="${s.id}">Usuń</button></td>
    `;
    tbody.appendChild(tr);
  }
}

async function addSlot(dateIso){
  // zaokrąglenie do 5 min (krok 300 w input)
  const d = new Date(dateIso);
  const { data, error } = await window.sb
    .from('free_slots')
    .insert({ when: d.toISOString(), is_free: true })
    .select().single();
  if (error) throw error;
  return data;
}

async function deleteSlot(id){
  const { error } = await window.sb.from('free_slots').delete().eq('id', id);
  if (error) throw error;
}

function wireSlots(){
  $('#slot-add')?.addEventListener('click', async ()=>{
    const v = $('#slot-date').value;
    if (!v) return alert('Wybierz datę');
    try { await addSlot(v); await initSlots(); } catch(e){ alert('Błąd dodania: '+(e.message||e)); }
  });
  $('#slots-rows')?.addEventListener('click', async (e)=>{
    const btn = e.target.closest('[data-slot-del]');
    if (!btn) return;
    if (!confirm('Usunąć termin?')) return;
    try { await deleteSlot(btn.dataset.slotDel); await initSlots(); } catch(e){ alert('Błąd usuwania: '+(e.message||e)); }
  });
}

async function cleanupExpiredSlots(){
  // usuń przeterminowane wolne terminy
  const nowIso = new Date().toISOString();
  await window.sb.from('free_slots').delete().lt('when', nowIso).eq('is_free', true);
}

async function initSlots(){
  try { await cleanupExpiredSlots(); renderSlots(await fetchSlots()); }
  catch(e){ const tbody=$('#slots-rows'); if (tbody) tbody.innerHTML = `<tr><td colspan="3">${escapeHtml(e.message||'Błąd')}</td></tr>`; }
}

// ======================================================
// ==================  KLIENCI  =========================
// ======================================================

// Struktura localStorage
const LS_KEY = 'clients.v1';
function loadLocal(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||'{"clients":[]}'); } catch{ return {clients:[]}; } }
function saveLocal(obj){ localStorage.setItem(LS_KEY, JSON.stringify(obj)); }

function clientsAll(){ return loadLocal().clients || []; }

function renderClients(){
  const tbody = $('#clients-rows'); if (!tbody) return;
  const list = clientsAll();
  tbody.innerHTML = '';
  if (!list.length){
    tbody.innerHTML = `<tr><td colspan="5">Brak klientów</td></tr>`;
    return;
  }
  for (const c of list){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name||'-')}</td>
      <td>${escapeHtml(c.email||'-')}</td>
      <td>${escapeHtml(c.phone||'-')}</td>
      <td>-</td>
      <td>
        <button class="btn" data-client-edit="${c.id}">Edytuj</button>
        <button class="btn btn-cancel" data-client-del="${c.id}">Usuń</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// minimalna edycja w modalu istniejącym w HTML
let CLIENT_EDIT_ID = null;
function openClientModal(id){
  const list = clientsAll();
  let c = list.find(x=>x.id===id);
  if (!c){ c = { id: uid(), name:'', email:'', phone:'', address:'', prefs:'', allergies:'', contras:'', notes:'', treatmentNotes:{} }; list.push(c); const db=loadLocal(); db.clients=list; saveLocal(db); }
  CLIENT_EDIT_ID = c.id;
  $('#c-name').value = c.name||'';
  $('#c-email').value = c.email||'';
  $('#c-phone').value = c.phone||'';
  $('#c-address').value = c.address||'';
  $('#c-prefs').value = c.prefs||'';
  $('#c-allergies').value = c.allergies||'';
  $('#c-contras').value = c.contras||'';
  $('#c-notes').value = c.notes||'';
  $('#client-modal').classList.remove('hidden');
}
function closeClientModal(){ $('#client-modal').classList.add('hidden'); CLIENT_EDIT_ID=null; }

function wireClients(){
  // lista
  $('#clients-rows')?.addEventListener('click',(e)=>{
    const edit = e.target.closest('[data-client-edit]');
    const del  = e.target.closest('[data-client-del]');
    if (edit) openClientModal(edit.dataset.clientEdit);
    if (del){
      if (!confirm('Usunąć klienta?')) return;
      const db = loadLocal();
      db.clients = db.clients.filter(x=>x.id!==del.dataset.clientDel);
      saveLocal(db);
      renderClients();
    }
  });
  // modal
  $('#client-close')?.addEventListener('click', closeClientModal);
  $('#client-save')?.addEventListener('click', ()=>{
    if (!CLIENT_EDIT_ID) return;
    const db = loadLocal();
    const i = db.clients.findIndex(x=>x.id===CLIENT_EDIT_ID);
    if (i>=0){
      db.clients[i].name = $('#c-name').value.trim();
      db.clients[i].email = $('#c-email').value.trim().toLowerCase();
      db.clients[i].phone = $('#c-phone').value.trim();
      db.clients[i].address = $('#c-address').value.trim();
      db.clients[i].prefs = $('#c-prefs').value.trim();
      db.clients[i].allergies = $('#c-allergies').value.trim();
      db.clients[i].contras = $('#c-contras').value.trim();
      db.clients[i].notes = $('#c-notes').value.trim();
      saveLocal(db);
      renderClients();
      closeClientModal();
    }
  });
}

// ---- AUTO-UPIS klienta z rezerwacji ----
function upsertClientFromBooking(b){
  if (!b) return;
  const email = (b.client_email || b.email || '').toLowerCase();
  const phone = _normPhone(b.phone || b.client_phone || '');
  if (!email && !phone) return;

  const db = loadLocal();
  const list = db.clients || [];
  let c = list.find(x =>
    (x.email && x.email.toLowerCase() === email) ||
    (_normPhone(x.phone) && _normPhone(x.phone) === phone)
  );
  if (!c){
    c = { id: uid(), name: b.client_name || b.name || '', email, phone, address: b.address||'', prefs:'', allergies:'', contras:'', notes:'', treatmentNotes:{} };
    list.push(c);
  } else {
    if (!c.name) c.name = b.client_name || b.name || '';
    if (!c.email) c.email = email;
    if (!c.phone) c.phone = phone;
    if (!c.address && b.address) c.address = b.address;
  }
  db.clients = list;
  saveLocal(db);
}

// ---- Jednorazowy import z Supabase (potwierdzone) ----
async function syncClientsFromSupabase(){
  try{
    const r = await window.sb
      .from('bookings_view')
      .select('client_name, client_email, phone, address, status');
    if (r.error){ console.warn('[sync clients] err:', r.error.message); return; }

    const rows = (r.data||[]).filter(x=>{
      const s = String(x.status||'').toLowerCase();
      return (s.includes('potwierdz') || s.includes('confirm')) && !s.includes('anul');
    });

    for (const b of rows) upsertClientFromBooking(b);
    renderClients();
  } catch(e){
    console.warn('[sync clients] fatal:', e);
  }
}

// ======================================================
// ==================  USTAWIENIA  ======================
// ======================================================

function loadSettings(){
  const txt = localStorage.getItem('prep.text') || '';
  $('#set-prep-text').value = txt;
}

function wireSettings(){
  $('#set-prep-text')?.addEventListener('input', (e)=>{
    localStorage.setItem('prep.text', e.target.value);
  });
  // zmiana PINu (jeśli masz inputy w HTML)
  $('#set-pin-save')?.addEventListener('click', ()=>{
    const v = ($('#set-pin')?.value||'').trim();
    if (!v) return alert('Podaj PIN');
    setPin(v);
    alert('PIN zapisany');
  });
}

// ======================================================
// ==================  START  ===========================
// ======================================================

function startAdmin(){
  // na starcie ukryj zakładki
  $('nav#top-tabs')?.style?.setProperty('display','none');

  wirePin();
  wireTabs();
  wireBookingsTable();
  wireDetailsModal();
  wireSlots();
  wireClients();
  wireSettings();

  // domyślnie pokaż ekran PIN
  $('#pin-screen')?.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', startAdmin);
