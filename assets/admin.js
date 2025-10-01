// ====== KONFIG ======
const PIN_DEFAULT = '2505'; // tymczasowo, później przeniesiemy do settings w Supabase

// ====== UTIL ======
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' });
  } catch { return iso || ''; }
}

function matchesQuery(b, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return [
    b.name, b.email, b.phone, (b.service_name || ''), (b.address || '')
  ].some(x => (x||'').toLowerCase().includes(q));
}

function inRange(iso, from, to) {
  if (!from && !to) return true;
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 24*60*60*1000 - 1) return false;
  return true;
}

// ====== PIN / LOGIN ======
const Pin = {
  ok() { return localStorage.getItem('adm_ok') === '1'; },
  setOk(v) { localStorage.setItem('adm_ok', v ? '1' : '0'); },
  async check(pin) {
    // na razie lokalnie (prosto). Potem weźmiemy z tabeli settings.
    return String(pin || '').trim() === PIN_DEFAULT;
  }
};

// ====== SUPABASE ======
// zakładam, że masz globalny sb z supabase-client.js
async function fetchBookings() {
  // pobierz ostatnie 30 dni + przyszłość
  const since = new Date(); since.setDate(since.getDate() - 30);
  const { data, error } = await sb
    .from('bookings_view') // jeżeli masz widok; jeśli nie, zmień na 'bookings'
    .select('id, status, when, service_name, name, email, phone')
    .gte('when', since.toISOString())
    .order('when', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ====== RENDER ======
function renderRows(list) {
  const tbody = $('#rows');
  tbody.innerHTML = '';
  for (const b of list) {
    const tr = document.createElement('tr');
    const st = (b.status || 'pending').toLowerCase();
    tr.innerHTML = `
      <td>${fmtWhen(b.when)}</td>
      <td>${b.name || '-'}</td>
      <td>${b.service_name || '-'}</td>
      <td><span class="status ${st}">${st}</span></td>
      <td>${b.phone || '-'}</td>
      <td>${b.email || '-'}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ====== FILTERING ======
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

// ====== INIT ======
async function initList() {
  try {
    $('#refresh').disabled = true;
    const data = await fetchBookings();
    const filtered = applyFilters(data);
    renderRows(filtered);
  } catch (e) {
    console.error(e);
    alert('Nie udało się pobrać rezerwacji.');
  } finally {
    $('#refresh').disabled = false;
  }
}

function wireUI() {
  $('#refresh').addEventListener('click', initList);
  $('#status-filter').addEventListener('change', initList);
  $('#q').addEventListener('input', () => {
    // szybki live-filter bez odpytywania bazy (na danych w pamięci)
    initList();
  });
  $('#from').addEventListener('change', initList);
  $('#to').addEventListener('change', initList);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Ekran PIN
  if (Pin.ok()) {
    $('#pin-screen').classList.add('hidden');
    $('#list-screen').classList.remove('hidden');
    wireUI();
    initList();
  } else {
    $('#pin-btn').addEventListener('click', async () => {
      const ok = await Pin.check($('#pin-input').value);
      if (ok) {
        Pin.setOk(true);
        $('#pin-screen').classList.add('hidden');
        $('#list-screen').classList.remove('hidden');
        wireUI();
        initList();
      } else {
        $('#pin-err').textContent = 'Nieprawidłowy PIN';
      }
    });
  }
});
