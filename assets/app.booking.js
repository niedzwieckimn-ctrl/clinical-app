// assets/app.booking.js
(function (global) {
  const form = document.getElementById('bookingForm');
  if (!form || !global.sb) return;

  // ——— helpers ———
  function getEl(id) { return document.getElementById(id); }
  function disableForm(disabled) {
    [...form.querySelectorAll('input,select,textarea,button')].forEach(el => { el.disabled = disabled; });
  }
  function getSlotFromCache(slot_id) {
    try { return (JSON.parse(localStorage.getItem('slots') || '[]') || []).find(s => s.id === slot_id); }
    catch { return null; }
  }

  async function ensureClient({ name, email, phone }) {
    const found = await sb.from('clients').select('id').eq('email', email).maybeSingle();
    if (found.error) throw found.error;
    if (found.data?.id) return found.data.id;

    const ins = await sb.from('clients').insert([{ name, email, phone }]).select('id').single();
    if (ins.error) throw ins.error;
    return ins.data.id;
  }

  async function createBooking({ slot_id, service_id, client_id, notes }) {
    const booking_no = (global.Helpers?.makeBookingNo?.() || ('B' + Date.now().toString(36).toUpperCase()));
    const ins = await sb
      .from('bookings')
      .insert([{ slot_id, service_id, client_id, status: 'pending', booking_no, notes: notes || '' }])
      .select('id, booking_no, status')
      .single();
    if (ins.error) throw ins.error;
    return ins.data;
  }

  async function markSlotTaken(slot_id) {
    const up = await sb.from('slots').update({ taken: true }).eq('id', slot_id);
    if (up.error) throw up.error;
    // wyczyść lokalny cache z tego slotu
    try {
      const arr = (JSON.parse(localStorage.getItem('slots') || '[]') || []).filter(s => s.id !== slot_id);
      localStorage.setItem('slots', JSON.stringify(arr));
      global.dispatchEvent(new Event('slots-synced'));  // odświeży godziny/kal
    } catch {}
    // jeśli masz adapter do free_slots – możesz też odpalić pull
    await global.CloudSlots?.pull?.();
  }

  async function maybeSendEmail(booking, view) {
    if (!global.sendEmail) return; // helper frontu może jeszcze nie być podpięty – wtedy po prostu pomijamy
    try {
      const subject = `Nowa rezerwacja #${booking.booking_no}`;
      await global.sendEmail(subject, view);
    } catch (e) {
      console.warn('[booking] e-mail warning:', e?.message || e);
    }
  }

  // ——— główna obsługa submit ———
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    disableForm(true);

    const name = getEl('name')?.value?.trim();
    const email = getEl('email')?.value?.trim();
    const phone = getEl('phone')?.value?.trim();
    const service_id = getEl('service')?.value || getEl('services')?.value || getEl('service_id')?.value;
    const slot_id = getEl('time')?.value;
    const notes = getEl('notes')?.value || '';

    if (!name || !email || !phone || !service_id || !slot_id) {
      alert('Uzupełnij wszystkie pola.');
      disableForm(false);
      return;
    }

    // sanity-check: wybrany slot istnieje w cache?
    const slot = getSlotFromCache(slot_id);
    if (!slot) {
      alert('Wybrany termin nie jest już dostępny. Odśwież listę godzin.');
      disableForm(false);
      // na wszelki wypadek dociągnij świeże sloty
      await global.CloudSlots?.pull?.();
      return;
    }

    try {
      const client_id = await ensureClient({ name, email, phone });
      const booking = await createBooking({ slot_id, service_id, client_id, notes });
      await markSlotTaken(slot_id);

      // prosty HTML maila (tylko jeśli jest helper frontu)
      const when = new Date(slot.when);
      const hh = String(when.getHours()).padStart(2, '0');
      const mm = String(when.getMinutes()).padStart(2, '0');
      const whenStr = `${when.toISOString().slice(0,10)} ${hh}:${mm}`;

      const html =
        `<h3>Nowa rezerwacja #${booking.booking_no}</h3>` +
        `<p><b>Klient:</b> ${name} (${email}, ${phone})</p>` +
        `<p><b>Usługa ID:</b> ${service_id}</p>` +
        `<p><b>Termin:</b> ${whenStr}</p>` +
        (notes ? `<p><b>Uwagi:</b> ${notes}</p>` : '');

      await maybeSendEmail(booking, html);

      alert(`Rezerwacja zapisana (#${booking.booking_no}).`);
      form.reset();
      // wyczyść listę godzin aż do kolejnego wyboru daty
      const timeSel = getEl('time'); if (timeSel) timeSel.innerHTML = '';
    } catch (err) {
      console.error('[booking] submit error:', err);
      alert('Nie udało się zapisać rezerwacji.');
    } finally {
      disableForm(false);
    }
  });
})(window);
