// assets/admin.js
(async function () {
  // --- Supabase klient (masz już plik supabase-client.js z window.sb) ---
  if (!window.sb) {
    console.error('Supabase client not found (window.sb)');
    return;
  }

  const $list = document.getElementById('bookingsList'); // <div id="bookingsList"></div> w HTML

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'full', timeStyle: 'short' });
    } catch { return iso || ''; }
  }

  async function fetchBookings() {
    const { data, error } = await window.sb
      .from('bookings_view')
      .select('booking_no, client_name, client_email, phone, notes, status, when, service_name, created_at')
      .order('when', { ascending: true })
      .limit(500);
    if (error) {
      console.error('Błąd pobierania rezerwacji:', error);
      return [];
    }
    return data || [];
  }

  function render(bookings) {
    if (!$list) return;
    if (!bookings.length) {
      $list.innerHTML = '<p>Brak rezerwacji.</p>';
      return;
    }
    $list.innerHTML = bookings.map(b => {
      const wait = String(b.status || '').toLowerCase().startsWith('oczek');
      return `
        <div class="card" data-id="${b.booking_no}">
          <div class="row">
            <div>
              <div><b>Nr:</b> ${b.booking_no}</div>
              <div><b>Termin:</b> ${fmtDate(b.when)}</div>
              <div><b>Zabieg:</b> ${b.service_name || '-'}</div>
              <div><b>Klient:</b> ${b.client_name || '-'}</div>
              <div><b>Tel:</b> ${b.phone || '-'}</div>
              <div><b>Email:</b> ${b.client_email || '-'}</div>
              ${b.notes ? `<div><b>Uwagi:</b> ${b.notes}</div>` : ''}
              <div><b>Status:</b> <span class="status">${b.status}</span></div>
            </div>
            <div class="actions">
              ${wait ? `<button class="btn-confirm">Potwierdź</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    // podpinamy klik
    $list.querySelectorAll('.btn-confirm').forEach(btn => {
      btn.addEventListener('click', onConfirmClick);
    });
  }

  async function onConfirmClick(e) {
    const card = e.target.closest('.card');
    const id = card?.getAttribute('data-id');
    if (!id) return;
    e.target.disabled = true;

    try {
      // 1) zaciągnij dane tego wpisu (do maila)
      const { data: arr, error: e1 } = await sb
        .from('bookings_view')
        .select('booking_no, client_name, client_email, phone, notes, status, when, service_name')
        .eq('booking_no', id)
        .limit(1);
      if (e1 || !arr || !arr[0]) throw e1 || new Error('Brak danych rezerwacji');
      const b = arr[0];

      // 2) ustaw status na "Potwierdzona"
      const { error: e2 } = await sb
        .from('bookings')
        .update({ status: 'Potwierdzona' })
        .eq('id', id);
      if (e2) throw e2;

      // 3) e-maile (terapeutka – bez "to"; klient – z "to")
      const whenStr = fmtDate(b.when);
      const subject = `Potwierdzono rezerwację #${id.slice(0, 8)} — ${whenStr}`;
      const html = `
        <h2>Potwierdzono rezerwację</h2>
        <p><b>Nr rezerwacji:</b> ${id}</p>
        <p><b>Termin:</b> ${whenStr}</p>
        <p><b>Zabieg:</b> ${b.service_name || '-'}</p>
        <p><b>Klient:</b> ${b.client_name || '-'}</p>
        <p><b>Kontakt:</b><br>Tel: ${b.phone || '-'}<br>Email: ${b.client_email || '-'}</p>
        ${b.notes ? `<p><b>Uwagi:</b> ${b.notes}</p>` : ''}
      `;

      // do terapeutki (domyślny THERAPIST_EMAIL na backendzie)
      if (window.sendEmail) {
        await window.sendEmail(subject, html);
      }

      // do klienta (tylko jeśli jest mail)
      if (window.sendEmail && b.client_email) {
        await window.sendEmail(
          `Twoja rezerwacja została potwierdzona — ${whenStr}`,
          `
            <h2>Twoja rezerwacja została potwierdzona</h2>
            <p><b>Termin:</b> ${whenStr}</p>
            <p><b>Zabieg:</b> ${b.service_name || '-'}</p>
            <p>Do zobaczenia!</p>
          `,
          b.client_email
        );
      }

      // 4) odśwież kartę w UI
      const statusEl = card.querySelector('.status');
      if (statusEl) statusEl.textContent = 'Potwierdzona';
      e.target.remove(); // usuń przycisk „Potwierdź”
    } catch (err) {
      console.error('Potwierdzanie nie powiodło się:', err);
      alert('Nie udało się potwierdzić. Szczegóły w konsoli.');
      e.target.disabled = false;
    }
  }

  // start
  const data = await fetchBookings();
  render(data);

  // prosty auto-refresh co 60 s (opcjonalnie)
  setInterval(async () => {
    const d = await fetchBookings();
    render(d);
  }, 60000);
})();
