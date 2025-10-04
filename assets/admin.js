// ✅ Inicjalizacja Supabase
function assertSB() {
  if (!window.supabaseUrl || !window.supabaseKey) {
    throw new Error('Brak konfiguracji Supabase (supabaseUrl / supabaseKey)');
  }
  if (!window.sb) {
    window.sb = supabase.createClient(window.supabaseUrl, window.supabaseKey);
  }
  return window.sb;
}

// ✅ Formatowanie daty i godziny
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pl-PL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ✅ Pobieranie listy rezerwacji
async function fetchBookings() {
  const sb = assertSB();
  const { data, error } = await sb
    .from('bookings')
    .select('booking_no, client_name, when, service_name, client_email, phone, notes, status')
    .order('when', { ascending: true });

  if (error) {
    console.error('Błąd pobierania rezerwacji:', error);
    return [];
  }
  return data || [];
}

// ✅ Render tabeli
function renderRows(list) {
  const tbody = document.getElementById('rows');
  if (!tbody) return;
  tbody.innerHTML = '';

  for (const b of list) {
    const tr = document.createElement('tr');
    tr.dataset.details = JSON.stringify(b);

    tr.innerHTML = `
      <td>${b.booking_no || '-'}</td>
      <td>${b.client_name || '-'}</td>
      <td>${fmtWhen(b.when)}</td>
      <td>
        <button class="btn btn-confirm" data-action="confirm" data-id="${b.booking_no}">Potwierdź</button>
        <button class="btn btn-cancel" data-action="cancel" data-id="${b.booking_no}">Anuluj</button>
        <button class="btn btn-details" data-action="details" data-id="${b.booking_no}">Szczegóły</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// ✅ Potwierdzenie rezerwacji
async function confirmBooking(bookingNo) {
  try {
    const res = await fetch('/.netlify/functions/admin-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_no: bookingNo })
    });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.msg || 'Błąd potwierdzenia');
    alert('✅ Rezerwacja potwierdzona');
    await initList();
  } catch (err) {
    console.error(err);
    alert('Błąd potwierdzania rezerwacji');
  }
}

// ✅ Anulowanie rezerwacji
async function cancelBooking(bookingNo) {
  try {
    const res = await fetch('/.netlify/functions/admin-cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_no: bookingNo })
    });
    const out = await res.json();
    if (!res.ok || !out.ok) throw new Error(out.msg || 'Błąd anulowania');
    alert('❌ Rezerwacja anulowana');
    await initList();
  } catch (err) {
    console.error(err);
    alert('Błąd anulowania rezerwacji');
  }
}

// ✅ Obsługa kliknięć w przyciski
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const tr = btn.closest('tr');
  const b = tr ? JSON.parse(tr.dataset.details || '{}') : {};

  if (action === 'confirm') {
    confirmBooking(id);
  } else if (action === 'cancel') {
    cancelBooking(id);
  } else if (action === 'details') {
    openModal(b);
  }
});

// ✅ Modal szczegółów
function openModal(b) {
  const modal = document.getElementById('details-modal');
  const body = document.getElementById('details-body');
  if (!modal || !body) return;
  body.innerHTML = `
    <p><b>Nr rezerwacji:</b> ${b.booking_no || ''}</p>
    <p><b>Imię i nazwisko:</b> ${b.client_name || ''}</p>
    <p><b>Termin:</b> ${fmtWhen(b.when)}</p>
    <p><b>Usługa:</b> ${b.service_name || ''}</p>
    <p><b>E-mail:</b> ${b.client_email || ''}</p>
    <p><b>Telefon:</b> ${b.phone || ''}</p>
    <p><b>Uwagi:</b> ${b.notes || '-'}</p>
  `;
  modal.classList.remove('hidden');
}

// Zamknięcie modala
document.getElementById('close-details')?.addEventListener('click', () => {
  document.getElementById('details-modal').classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('details-modal').classList.add('hidden');
  }
});

// ✅ Inicjalizacja listy
async function initList() {
  const list = await fetchBookings();
  renderRows(list);
}

document.addEventListener('DOMContentLoaded', initList);
