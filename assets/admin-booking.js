(() => {
  const R = window.BookingRange;
  const dialog = document.createElement('dialog');
  dialog.className = 'range-dialog';
  dialog.setAttribute('aria-labelledby', 'range-title');
  dialog.innerHTML = `<button type="button" class="range-close" aria-label="Zamknij">×</button>
    <h2 id="range-title">Nowa wizyta</h2><p id="range-date"></p>
    <p class="range-error" role="alert"></p>
    <section id="range-step"><p class="range-hint">Przeciągnij po godzinach lub kliknij początek i koniec. Każdy blok to 30 minut. Szare godziny są niedostępne.</p>
    <div class="range-grid" aria-label="Godziny od 08:00 do 20:00"></div>
    <p class="range-summary" aria-live="polite">Wybierz godziny</p>
    <div class="range-actions"><button class="btn primary" id="range-next" disabled>OK — dane wizyty</button></div></section>
    <form id="range-form" hidden><p id="range-chosen" class="range-summary"></p>
    <label>Klient<select id="range-client"><option value="">Nowy klient</option></select></label>
    <label>Imię i nazwisko *<input name="name" required maxlength="150" autocomplete="name"></label>
    <label>E-mail *<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
    <label>Telefon *<input name="phone" type="tel" required maxlength="40" autocomplete="tel"></label>
    <label>Adres zabiegu *<input name="address" required maxlength="500" autocomplete="street-address"></label>
    <label>Zabieg *<select name="service" required></select></label>
    <p class="range-hint">Czas wizyty wynika z zaznaczonego zakresu, nie z domyślnego czasu zabiegu. Cena zabiegu pozostaje bez zmian.</p>
    <label>Uwagi<textarea name="notes" maxlength="2000" rows="2"></textarea></label>
    <p class="range-hint">Zapis potwierdzi wizytę i uruchomi e-mail do klienta oraz administratora.</p>
    <div class="range-actions"><button type="button" class="btn" id="range-back">Zmień godziny</button><button class="btn primary" id="range-save">Zapisz wizytę</button></div></form>`;
  document.body.append(dialog);
  const $ = s => dialog.querySelector(s), form = $('#range-form'), grid = $('.range-grid');
  let day, blocked = [], clients = [], selected = null, anchor = null, pointer = null, moved = false, busy = false, requestId, generation = 0;
  const error = message => { $('.range-error').textContent = message || ''; };
  function paint() {
    grid.querySelectorAll('[data-i]').forEach((cell, i) => {
      const on = selected && i >= selected.first && i <= selected.last;
      cell.classList.toggle('selected', !!on); cell.setAttribute('aria-pressed', String(!!on));
    });
    $('.range-summary').textContent = selected ? `${selected.start}–${selected.end} · ${selected.minutes} min · jedna wizyta` : 'Wybierz godziny';
    $('#range-next').disabled = !selected;
  }
  function choose(a, b) {
    const next = R.selection(a, b, blocked);
    if (!next) { selected = null; paint(); error('Nie można zaznaczyć zakresu przez zajętą godzinę.'); return; }
    selected = next; error(''); paint();
  }
  function cellAt(e) { return document.elementFromPoint(e.clientX, e.clientY)?.closest('.range-cell'); }
  grid.addEventListener('pointerdown', e => {
    const cell = e.target.closest('[data-i]');
    if (!cell || blocked[+cell.dataset.i] || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointer = { id: e.pointerId, start: +cell.dataset.i }; moved = false;
    grid.setPointerCapture(e.pointerId);
  });
  grid.addEventListener('pointermove', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    const cell = cellAt(e);
    if (!cell || !grid.contains(cell)) return;
    const i = +cell.dataset.i;
    if (i !== pointer.start) { moved = true; choose(pointer.start, i); }
  });
  grid.addEventListener('pointerup', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    if (!moved) {
      const i = pointer.start;
      if (anchor === null) { anchor = i; choose(i, i); }
      else { choose(anchor, i); anchor = null; }
    } else anchor = null;
    pointer = null;
  });
  grid.addEventListener('pointercancel', () => { pointer = null; anchor = null; selected = null; paint(); });
  grid.addEventListener('click', e => {
    // Keyboard/screen-reader activation has detail=0; pointer input is handled above.
    if (e.detail !== 0) return;
    const cell = e.target.closest('[data-i]'); if (!cell || blocked[+cell.dataset.i]) return;
    const i = +cell.dataset.i;
    if (anchor === null) { anchor = i; choose(i, i); } else { choose(anchor, i); anchor = null; }
  });
  async function headers() {
    const { data, error: authError } = await window.sb.auth.getSession();
    if (authError || !data?.session) throw new Error('Sesja wygasła. Zaloguj się ponownie.');
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` };
  }
  async function open(date) {
    if (busy) return;
    day = date; selected = null; anchor = null; pointer = null; requestId = crypto.randomUUID();
    const run = ++generation;
    form.reset(); form.hidden = true; $('#range-step').hidden = false; grid.innerHTML = '';
    $('#range-next').disabled = true; error(''); $('.range-summary').textContent = 'Wczytywanie godzin…';
    $('#range-date').textContent = new Date(`${day}T12:00:00`).toLocaleDateString('pl-PL', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
    if (!dialog.open) dialog.showModal();
    try {
      const res = await fetch(`/.netlify/functions/admin-create-range-booking?day=${encodeURIComponent(day)}`, { headers: await headers(), cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Nie udało się pobrać godzin.');
      if (run !== generation || !dialog.open) return;
      blocked = data.blocked; clients = data.clients;
      grid.replaceChildren(...blocked.map((no, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'range-cell'; b.dataset.i = i;
        b.setAttribute('aria-disabled', String(no)); b.setAttribute('aria-pressed', 'false');
        b.textContent = `${R.clock(480+i*30)}–${R.clock(510+i*30)}`; return b;
      }));
      $('#range-client').replaceChildren(new Option('Nowy klient', ''), ...clients.map(c => new Option(`${c.name || 'Klient'} — ${c.email || c.phone || ''}`, c.id)));
      form.elements.service.replaceChildren(new Option('Wybierz zabieg', ''), ...data.services.map(s => new Option(`${s.name} (${s.duration_min || '?'} min)`, s.id)));
      paint();
    } catch (e) { if (run === generation && dialog.open) { error(e.message); $('.range-summary').textContent = 'Godziny niedostępne'; } }
  }
  $('#range-next').onclick = () => { if (!selected) return; $('#range-step').hidden = true; form.hidden = false; $('#range-chosen').textContent = `${selected.start}–${selected.end} · ${selected.minutes} min`; $('#range-client').focus(); };
  $('#range-back').onclick = () => { if (busy) return; form.hidden = true; $('#range-step').hidden = false; };
  $('#range-client').onchange = e => {
    const c = clients.find(c => String(c.id) === e.target.value);
    ['name','email','phone','address'].forEach(k => { form.elements[k].value = c?.[k] || ''; });
  };
  $('.range-close').onclick = () => { if (!busy) dialog.close(); };
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  dialog.addEventListener('close', () => { ++generation; });
  form.onsubmit = async e => {
    e.preventDefault(); if (busy || !selected || !form.reportValidity()) return;
    const payload = { day, start: selected.start, end: selected.end, client_id: $('#range-client').value, request_id: requestId };
    ['name','email','phone','address','notes'].forEach(k => payload[k] = form.elements[k].value.trim());
    payload.service_id = form.elements.service.value;
    busy = true; $('#range-save').disabled = true; $('#range-save').textContent = 'Zapisywanie…'; error('');
    try {
      const res = await fetch('/.netlify/functions/admin-create-range-booking', { method:'POST', headers:await headers(), body:JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Nie udało się zapisać wizyty.');
      dialog.close(); window.dispatchEvent(new Event('admin-booking-created'));
      alert(data.warning || `Zapisano jedną wizytę ${selected.start}–${selected.end}. Wysłano potwierdzenie e-mail.`);
    } catch (e) { error(`${e.message}\nJeśli połączenie zostało przerwane, ponów zapis w tym samym oknie — nie utworzy to drugiej wizyty.`); }
    finally { busy = false; $('#range-save').disabled = false; $('#range-save').textContent = 'Zapisz wizytę'; }
  };
  window.AdminBooking = { open };
})();
