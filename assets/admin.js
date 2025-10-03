// ====== UTIL ======
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function fmtWhen(iso) {
  try { return new Date(iso).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' }); }
  catch { return iso || ''; }
}
function matchesQuery(b, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return [
    b.client_name, b.client_email, b.phone, b.service_name, b.notes
  ].some(x => (x||'').toLowerCase().includes(q));
}
function inRange(iso, from, to) {
  if (!from && !to) return true;
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 24*60*60*1000 - 1) return false;
  return true;
}

// ====== PIN ======
const PIN_DEFAULT = '2505';
const Pin = {
  ok()      { return localStorage.getItem('adm_ok') === '1'; },
  setOk(v)  { localStorage.setItem('adm_ok', v ? '1' : '0'); },
  async check(pin) { return String(pin||'').trim() === PIN_DEFAULT; }
};

// ====== SUPABASE – pobranie listy z widoku ======
async function fetchBookings() {
  if (!window.sb) { console.error('Supabase client nie jest dostępny'); return []; }

  const { data, error } = await window.sb
    .from('bookings_view')
    .select('booking_no, status, when, service_name, client_name, client_email, phone, notes, created_at')
    .order('when', { ascending: true })
    .limit(500);

  if (error) { console.error('Błąd pobierania rezerwacji:', error); return []; }
  return data || [];
}

// ====== RENDER ======
function renderRows(list) {
  const tbody = $('#rows');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (const b of list) {
    const st = (b.status || 'pending').toLowerCase();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtWhen(b.when)}</td>
      <td>${b.client_name || '-'}</td>
      <td>${b.service_name || '-'}</td>
      <td><span class="status ${st}">${st}</span></td>
      <td>${b.phone || '-'}</td>
      <td>${b.client_email || '-'}</td>
      <td>
        ${st === 'pending' ? `<button class="btn confirm-btn" data-id="${b.booking_no}">Potwierdź</button>` : ''}
        ${st !== 'canceled' ? `<button class="btn cancel-btn"  data-id="${b.booking_no}">Anuluj</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// ====== FILTRY ======
function applyFilters(items) {
  const status = $('#status-filter').value;
  const q = $('#q').value.trim();
  const from = $('#from').value || null;
  const to = $('#to').value || null;

  return items.filter(b =>
    (!status || (b.status || 'pending') === status) &&
    matchesQuery(b, q) &&
    inRange(b.when, from, to)
  );
}

// ====== INIT LISTY ======
async function initList() {
  try {
    $('#refresh').disabled = true;
    const data = await fetchBookings();
    const filtered = applyFilters(data);
    renderRows(filtered);
  } finally {
    $('#refresh').disabled = false;
  }
}

// Delegacja kliknięć (1 listener na tbody)
$('#rows')?.addEventListener('click', async (e) => {
  const btnConfirm = e.target.closest('.confirm-btn');
  const btnCancel  = e.target.closest('.cancel-btn');
  if (!btnConfirm && !btnCancel) return;

  const bookingNo = (btnConfirm || btnCancel).dataset.id;
  if (!bookingNo) return;

  const btn = btnConfirm || btnCancel;
  btn.disabled = true;

  try {
    const fn = btnConfirm ? 'admin-confirm' : 'admin-cancel';
    const res = await fetch(`/.netlify/functions/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ id: bookingNo })
    });

    let out;
    try { out = await res.json(); } catch { out = { ok:false, raw: await res.text() }; }
    if (res.ok && out?.ok) {
      alert(btnConfirm ? 'Rezerwacja potwierdzona ✅' : 'Rezerwacja anulowana ❌');
      initList();
    } else {
      console.error(out);
      alert('Błąd akcji administracyjnej');
    }
  } catch (err) {
    console.error(err);
    alert('Błąd sieci / funkcji');
  } finally {
    btn.disabled = false;
  }
});

// ====== UI ======
function wireUI() {
  $('#refresh').addEventListener('click', initList);
  $('#status-filter').addEventListener('change', initList);
  $('#q').addEventListener('input', () => initList());
  $('#from').addEventListener('change', initList);
  $('#to').addEventListener('change', initList);
}

// ====== START ======
document.addEventListener('DOMContentLoaded', () => {
  const pinScr = $('#pin-screen');
  const listScr = $('#list-screen');

  const enter = async () => {
    const ok = await Pin.check($('#pin-input').value);
    if (ok) {
      Pin.setOk(true);
      pinScr.classList.add('hidden');
      listScr.classList.remove('hidden');
      wireUI();
      initList();
    } else {
      $('#pin-err').textContent = 'Nieprawidłowy PIN';
    }
  };

  $('#pin-btn')?.addEventListener('click', enter);
  $('#pin-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') enter(); });

  if (Pin.ok()) {
    pinScr.classList.add('hidden');
    listScr.classList.remove('hidden');
    wireUI();
    initList();
  }
});
