// assets/app.js

// ===== helpers =====
function el(sel, root = document) { return root.querySelector(sel); }
function fmtMoney(v) {
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(v || 0);
}

// ===== usługi (services) =====
const getServices = () => Store.get('services', []);
function ensureServicesSeed() {
  let s = Store.get('services', []);
  if (!s || !s.length) {
    s = [{ id: Store.uid(), name: 'Masaż klasyczny 60 min', durationMin: 60, price: 180 }];
    Store.set('services', s);
  }
}

// Wczytuje zabiegi z Supabase i buduje <select id="service">
async function renderServicesSelect() {
  const select = document.getElementById('service');
  if (!select) return;
  const services = await dbLoadServices(); // funkcja jest w index.html
  select.innerHTML = '<option value="">Wybierz zabieg…</option>';
  (services || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} — ${(Number(s.price) || 0).toFixed(2)} zł`;
    select.appendChild(opt);
  });
}

// ===== sloty / godziny =====

// zwraca wolne sloty dla danego dnia (YYYY-MM-DD) na podstawie cache w LS
function availableTimesFor(dateStr) {
  const dateKey = String(dateStr).slice(0, 10);
  const slots = Store.get('slots', []) || [];

  return slots
    .filter(s => {
      const d = new Date(s.when);
      const slotKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const isFree = (s.taken === false || s.taken == null);
      return slotKey === dateKey && isFree;
    })
    .sort((a, b) => new Date(a.when) - new Date(b.when));
}

// wypełnia <select id="time">
function renderTimeOptions() {
  const dateEl = document.getElementById('date');
  const timeSel = document.getElementById('time');
  if (!dateEl || !timeSel) return;

  const dateVal = dateEl.value;
  if (!dateVal) {
    timeSel.innerHTML = '<option value="">Najpierw wybierz datę…</option>';
    timeSel.disabled = true;
    return;
  }

  const opts = availableTimesFor(dateVal); // masz tę funkcję wyżej
  if (!opts.length) {
    timeSel.innerHTML = '<option value="">Brak wolnych godzin</option>';
    timeSel.disabled = true;
    return;
  }

  timeSel.innerHTML =
    '<option value="" disabled selected>Wybierz godzinę…</option>' +
    opts.map(s => {
      const d = new Date(s.when);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `<option value="${s.id}" data-when="${s.when}">${hh}:${mm}</option>`;
    }).join('');

  timeSel.disabled = false;
}


// ===== SUBMIT (Supabase flow) =====

(function () {
  const form = document.getElementById('form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = e.submitter || el('button[type=submit]', form);
    if (btn) btn.disabled = true;

    // numer rezerwacji (5 cyfr)
    const bookingNo = Math.floor(10000 + Math.random() * 90000);

    // pola formularza
    const rodo = el('#rodo').checked;
    const name = el('#name').value.trim();
    const email = el('#email').value.trim();
    const phone = el('#phone').value.trim();
    const address = el('#address').value.trim();
    const serviceId = el('#service').value;
    const slotId = el('#time').value;
    const notes = el('#notes').value.trim();

    if (!rodo) { alert('Musisz wyrazić zgodę RODO.'); if (btn) btn.disabled = false; return; }
    if (!name || !email || !phone || !serviceId || !slotId) {
      alert('Uzupełnij wszystkie wymagane pola.'); if (btn) btn.disabled = false; return;
    }

    try {
      // 1) klient: znajdź/utwórz (funkcja jest w index.html)
      const client_id = await dbEnsureClient({ name, email, phone, address });
      if (!client_id) throw new Error('Nie udało się zapisać klienta.');
     // przed wywołaniem dbCreateBooking dopisz / upewnij się, że masz:
const services = await dbLoadServices();
const service  = (services || []).find(s => s.id === serviceId) || { name: '(brak)' };

// wyciągnij ISO terminu (z <option data-when>, a jakby go brakło – z cache slots)
const opt     = document.querySelector('#time option:checked');
const whenISO = (opt && opt.dataset && opt.dataset.when)
  || ((Store.get('slots',[])||[]).find(s => s.id === slotId)?.when)
  || null;

// >>> PODMIEŃ OBIEKT W WYWOŁANIU <<<
const r = await dbCreateBooking({
   slot_id: slotId,
   service_id: serviceId,
   client_id,
   notes,
   service_name: service.name,
   client_name: name,
   client_email: email,
   phone,
   address,
   booking_no: String(bookingNo),
   slot_when: whenISO   // <— dopisane
});




      if (!r || !r.ok) throw new Error('Nie udało się utworzyć rezerwacji.');

      // 3) oznacz slot jako zajęty (w bazie)
      const { error: markErr } = await window.sb
        .from('slots')
        .update({ taken: true })
        .eq('id', slotId);
      if (markErr) throw markErr;

      // 4) odśwież cache slotów i UI
      if (window.CloudSlots) { await window.CloudSlots.pull(); }
      renderTimeOptions();
      if (window.fp?.redraw) window.fp.redraw();

// budujemy string terminu
let whenStr = '---';
if (whenISO) {
  try {
    whenStr = new Date(whenISO).toLocaleString('pl-PL', {
      dateStyle: 'full',
      timeStyle: 'short'
    });
  } catch (e) {
    console.error('Błąd przy formacie daty', e);
  }
}

// e-mail do masażystki (nie blokuje UX)
try {
  if (window.sendEmail) {
    const subject = `Masz nową rezerwację!😁⚡ #${bookingNo} – ${whenStr}`;
    const html = `
      <h2>Dane rezerwacji:</h2>
      <p><b>Nr rezerwacji:</b> ${bookingNo}</p>
      <p><b>Termin:</b> ${whenStr}</p>
      <p><b>Zabieg:</b> ${service?.name || '-'}</p>
      <p><b>Klient:</b> ${name}</p>
      <p><b>Adres / kontakt:</b><br>${address || ''}<br>Tel: ${phone || ''}<br>Email: ${email || ''}</p>
      ${notes ? `<p><b>Uwagi:</b><br>${notes}</p>` : ''}
    `;
    await window.sendEmail(String(subject), String(html));
    console.log('[MAIL OK]');
  } else {
    console.warn('[email] window.sendEmail nie jest załadowane');
  }
} catch (mailErr) {
  console.warn('[email] nie wysłano (nie blokuje):', mailErr);
}


      // 6) komunikat + reset
      const thanks = document.getElementById('bookingThanks');
      if (thanks) { thanks.classList.add('show'); setTimeout(() => thanks.classList.remove('show'), 4000); }
      form.reset();
      renderTimeOptions();
     

    } catch (err) {
      console.error('[booking] błąd', err);
      alert('Nie udało się złożyć rezerwacji. Spróbuj ponownie.');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
})();

// ===== init =====
document.addEventListener('DOMContentLoaded', () => {
  ensureServicesSeed();
  renderServicesSelect();

  el('#date')?.addEventListener('change', renderTimeOptions);
  el('#date')?.setAttribute('min', new Date().toISOString().slice(0, 10));

  // stopka kontakt (z LocalStorage)
  const s = Store.get('settings', {});
  el('#contact').textContent = `${s.contactEmail || ''} • ${s.contactTel || ''}`;

  renderTimeOptions();
});

// odśwież widoki, gdy Admin zmienia dane (inny tab)
window.addEventListener('storage', (e) => {
  if (e.key === 'services') renderServicesSelect();
  if (e.key === 'slots') renderTimeOptions();
});

// Po synchronizacji slotów ustaw pierwszy dostępny dzień (jeśli pole daty puste)
window.addEventListener('slots-synced', () => {
  try {
    const slots = JSON.parse(localStorage.getItem('slots') || '[]');
    if (!slots.length) return;
    const d = new Date(slots[0].when);
    const firstDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dateEl = document.getElementById('date');
    if (!dateEl) return;
    if (!dateEl.value) {
      dateEl.value = firstDay;
      dateEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch (e) {
    console.warn('slots-synced handler error', e);
  }
});
