// assets/client-details.js
(async function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  const fmtDateTimePL = (iso) => {
    try {
      return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return iso || '';
    }
  };
  const normEmail = (value) => String(value || '').trim().toLowerCase();
  const normPhone = (value) => String(value || '').replace(/[^\d+]/g, '');
  const id = new URLSearchParams(location.search).get('id');

  let clientsMemory = [];
  let client = null;
  let extendedSchemaAvailable = true;
  let advisorConversation = [];
  let advisorUiMessages = [];
  let advisorScope = 'client';

  const clientsLoad = () => clientsMemory;
  const clientsSave = (list) => { clientsMemory = Array.isArray(list) ? list : []; };

  function briefingList(items, renderItem) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return '<p class="muted briefing-empty">Brak zapisanych informacji.</p>';
    return `<ul class="briefing-list">${rows.map((item) => `<li>${renderItem(item)}</li>`).join('')}</ul>`;
  }

  function renderBriefingResult(briefing, generatedAt) {
    if (!briefing || typeof briefing !== 'object') {
      return '<div class="briefing-placeholder"><strong>Nie ma jeszcze aktualnej odprawy.</strong><p>Uzupełnij kartę klienta, a następnie wybierz „Przygotuj odprawę”.</p></div>';
    }
    const source = (value) => value ? `<small>Źródło: ${escapeHtml(value)}</small>` : '';
    const simple = (items) => briefingList(items, (item) => escapeHtml(item));
    const alerts = briefingList(briefing.safety_alerts, (item) =>
      `<span class="briefing-level briefing-level-${escapeHtml(item?.level || 'informacja')}">${escapeHtml(item?.level || 'informacja')}</span><strong>${escapeHtml(item?.text || '')}</strong>${source(item?.source)}`
    );
    const plan = briefingList(briefing.today_plan, (item) =>
      `<strong>${escapeHtml(item?.text || '')}</strong><span>${escapeHtml(item?.reason || '')}</span>${source(item?.source)}`
    );
    const continuity = briefing.continuity || {};
    const context = briefing.client_context || {};
    const relationship = briefing.relationship || {};
    const stamp = generatedAt ? fmtDateTimePL(generatedAt) : '';
    return `
      <section class="briefing-summary"><p>${escapeHtml(briefing.summary || '')}</p>${stamp ? `<small>Odprawa z ${escapeHtml(stamp)}</small>` : ''}</section>
      <div class="briefing-grid">
        <section class="briefing-card briefing-safety"><p class="eyebrow">Najpierw sprawdź</p><h3>Bezpieczeństwo</h3>${alerts}</section>
        <section class="briefing-card"><p class="eyebrow">Najbliższa wizyta</p><h3>Plan na dziś</h3>${plan}</section>
        <section class="briefing-card"><p class="eyebrow">Stałe informacje</p><h3>Preferencje</h3>${simple(briefing.preferences)}</section>
        <section class="briefing-card briefing-work"><p class="eyebrow">Ciągłość zabiegów</p><h3>Poprzednie wizyty</h3><p>${escapeHtml(continuity.last_visit || 'Brak danych.')}</p><h4>Co się sprawdziło</h4>${simple(continuity.what_worked)}<h4>Co się zmieniło</h4>${simple(continuity.what_changed)}<h4>Co sprawdzić dzisiaj</h4>${simple(continuity.check_today)}</section>
        <section class="briefing-card briefing-context"><p class="eyebrow">Codzienny kontekst</p><h3>Praca i samopoczucie</h3><h4>Praca i obciążenia</h4>${simple(context.work_and_load)}<h4>Sen, stres i samopoczucie</h4>${simple(context.wellbeing)}<h4>Kontekst życia</h4>${simple(context.life_context)}</section>
        <section class="briefing-card briefing-relationship"><p class="eyebrow">Pamięć relacyjna</p><h3>Warto pamiętać</h3>${simple(relationship.remember)}<h4>Naturalne pytania</h4>${simple(relationship.natural_questions)}<h4>Nie poruszaj samodzielnie</h4>${simple(relationship.avoid)}</section>
        <section class="briefing-card"><p class="eyebrow">Przed rozpoczęciem</p><h3>Pytania kontrolne</h3>${simple(briefing.questions_before_treatment)}</section>
        <section class="briefing-card"><p class="eyebrow">Po zabiegu</p><h3>Ostrożna opieka domowa</h3>${simple(briefing.aftercare)}</section>
        <section class="briefing-card briefing-uncertain"><p class="eyebrow">Do zweryfikowania</p><h3>Niepewne, sprzeczne lub stare dane</h3>${simple(briefing.uncertainties)}</section>
      </div>`;
  }

  function renderAdvisorAnswer(answer) {
    const list = (title, items) => {
      const rows = Array.isArray(items) ? items : [];
      if (!rows.length) return '';
      return `<h4>${escapeHtml(title)}</h4><ul>${rows.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    };
    return `
      <div>${escapeHtml(answer?.answer || 'Brak odpowiedzi.')}</div>
      ${list('Proponowane kroki', answer?.suggested_actions)}
      ${list('Bezpieczeństwo', answer?.safety_notes)}
      ${answer?.uncertainty ? `<h4>Niepewność</h4><div>${escapeHtml(answer.uncertainty)}</div>` : ''}
      ${Array.isArray(answer?.sources) && answer.sources.length ? `<div class="advisor-sources"><strong>Podstawa odpowiedzi:</strong> ${answer.sources.map(escapeHtml).join(' • ')}</div>` : ''}`;
  }

  function conversationText(answer) {
    const actions = Array.isArray(answer?.suggested_actions) ? answer.suggested_actions.join('; ') : '';
    return [answer?.answer || '', actions ? `Kroki: ${actions}` : '', answer?.uncertainty ? `Niepewność: ${answer.uncertainty}` : '']
      .filter(Boolean)
      .join('\n');
  }

  function renderAdvisorMessages() {
    const box = document.getElementById('advisor-messages');
    if (!box) return;
    if (!advisorUiMessages.length) {
      box.innerHTML = advisorScope === 'general'
        ? '<div class="advisor-message system">Zapytaj o recepturę, kosmetyk, pielęgnację albo pomysł dla SPA. Ten tryb nie korzysta z danych klienta.</div>'
        : '<div class="advisor-message system">Zapytaj o plan zabiegu, bezpieczeństwo, zmiany od ostatniej wizyty albo informacje, o których warto pamiętać w rozmowie.</div>';
      return;
    }
    box.innerHTML = advisorUiMessages.map((message) => {
      if (message.role === 'assistant') return `<div class="advisor-message assistant">${renderAdvisorAnswer(message.answer)}</div>`;
      return `<div class="advisor-message user">${escapeHtml(message.content)}</div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function setAdvisorStatus(message = '', isError = false) {
    const status = document.getElementById('advisor-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  async function callAdvisor(payload) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error('Sesja administratora wygasła. Zaloguj się ponownie.');
    const res = await fetch('/.netlify/functions/client-advisor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ client_id: id, ...payload }),
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Doradca nie odpowiedział.');
    return body;
  }

  async function generateBriefing(button) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Analizuję historię…';
    setAdvisorStatus('Przygotowuję odprawę na podstawie aktualnych danych klienta.');
    try {
      const payload = await callAdvisor({ mode: 'briefing' });
      client.briefing_json = payload.briefing;
      client.briefing_generated_at = payload.generated_at;
      const target = document.getElementById('briefing-result');
      if (target) target.innerHTML = renderBriefingResult(payload.briefing, payload.generated_at);
      button.textContent = 'Odśwież odprawę';
      setAdvisorStatus('Odprawa jest wyświetlana tylko na tej stronie i nie została zapisana w kartotece.');
    } catch (error) {
      button.textContent = original;
      setAdvisorStatus(error.message || 'Nie udało się przygotować odprawy.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function sendAdvisorQuestion() {
    const input = document.getElementById('advisor-question');
    const button = document.getElementById('advisor-send');
    const question = String(input?.value || '').trim();
    if (!question || !button) return;
    advisorUiMessages.push({ role: 'user', content: question });
    renderAdvisorMessages();
    input.value = '';
    const normalizedQuestion = question.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const saveCommand = advisorScope === 'general' && /^(zapisz|zapisz przepis)$/.test(normalizedQuestion);
    if (saveCommand) {
      const lastIdeaIndex = advisorUiMessages.map((item, index) => ({ item, index })).reverse()
        .find(({ item }) => item.role === 'assistant' && item.recipe_save_allowed === true && item.answer?.idea_content)?.index;
      if (lastIdeaIndex === undefined) {
        advisorUiMessages.push({ role: 'assistant', answer: { answer: 'Nie mam jeszcze przepisu do zapisania. Najpierw napisz: „napisz przepis na…”.', safety_notes: [], suggested_actions: [], sources: [], uncertainty: '' } });
        renderAdvisorMessages();
        return;
      }
      try {
        await saveIdea(lastIdeaIndex);
        advisorUiMessages.push({ role: 'assistant', answer: { answer: 'Zapisałam ostatni przepis w zakładce Pomysły.', safety_notes: [], suggested_actions: [], sources: [], uncertainty: '' } });
        renderAdvisorMessages();
      } catch (error) {
        setAdvisorStatus(error.message || 'Nie udało się zapisać pomysłu.', true);
      }
      return;
    }
    input.disabled = true;
    button.disabled = true;
    setAdvisorStatus(advisorScope === 'general' ? 'Doradca przygotowuje pomysł SPA bez danych klienta…' : 'Doradca analizuje kartę klienta i historię wizyt…');
    try {
      const payload = await callAdvisor({ mode: advisorScope === 'general' ? 'general' : 'chat', question, conversation: advisorConversation });
      const answer = payload.answer || {};
      const recipeSaveAllowed = advisorScope === 'general' && /\b(przepis|receptur)/.test(normalizedQuestion);
      advisorUiMessages.push({ role: 'assistant', answer, recipe_save_allowed: recipeSaveAllowed });
      advisorConversation.push({ role: 'user', content: question });
      advisorConversation.push({ role: 'assistant', content: conversationText(answer) });
      advisorConversation = advisorConversation.slice(-8);
      renderAdvisorMessages();
      setAdvisorStatus(advisorScope === 'general'
        ? (recipeSaveAllowed ? 'Przepis nie został zapisany. Jeśli chcesz go zachować, napisz teraz: „zapisz”.' : 'Odpowiedź nie została zapisana.')
        : 'Odpowiedź jest sugestią do weryfikacji przez terapeutkę.');
    } catch (error) {
      advisorUiMessages.push({ role: 'assistant', answer: { answer: error.message || 'Nie udało się uzyskać odpowiedzi.', safety_notes: [], suggested_actions: [], sources: [], uncertainty: '' } });
      renderAdvisorMessages();
      setAdvisorStatus(error.message || 'Nie udało się uzyskać odpowiedzi.', true);
    } finally {
      input.disabled = false;
      button.disabled = false;
      input.focus();
    }
  }

  async function saveIdea(messageIndex) {
    const message = advisorUiMessages[Number(messageIndex)];
    const answer = message?.answer;
    if (!answer?.idea_content) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Sesja administratora wygasła.');
    const { error } = await sb.from('ideas').insert({
      title: String(answer.idea_title || 'Pomysł SPA').slice(0, 180),
      category: String(answer.idea_category || 'Inspiracja').slice(0, 80),
      content: String(answer.idea_content).slice(0, 12000),
      created_by: session.user.id,
    });
    if (error) throw new Error(error.message.includes('ideas') ? 'Uruchom migrację Pomysłów w Supabase.' : error.message);
    setAdvisorStatus('Pomysł został zapisany w zakładce Pomysły.');
  }

  function switchAdvisorScope(nextScope) {
    advisorScope = nextScope === 'general' ? 'general' : 'client';
    advisorConversation = [];
    advisorUiMessages = [];
    document.querySelectorAll('[data-advisor-scope]').forEach((button) => {
      const active = button.getAttribute('data-advisor-scope') === advisorScope;
      button.classList.toggle('primary', active);
      button.classList.toggle('ghost', !active);
    });
    const heading = document.getElementById('advisor-mode-title');
    const description = document.getElementById('advisor-mode-description');
    const input = document.getElementById('advisor-question');
    if (heading) heading.textContent = advisorScope === 'general' ? 'Pomysły SPA' : 'Zapytaj o tego klienta';
    if (description) description.textContent = advisorScope === 'general'
      ? 'Ogólne receptury i inspiracje. Dane klienta nie są używane.'
      : 'Rozmowa dotyczy wyłącznie otwartej karty i nie zapisuje się w kartotece.';
    if (input) input.placeholder = advisorScope === 'general'
      ? 'Np. podaj bezpieczny pomysł na wodę różaną do domowego rytuału SPA.'
      : 'Np. co najważniejszego pamiętać o tym kliencie przed wizytą?';
    const quick = document.getElementById('advisor-quick');
    const questions = advisorScope === 'general' ? [
      'Napisz przepis na wodę różaną do domowego rytuału SPA.',
      'Zaproponuj prosty rytuał pielęgnacyjny po masażu.',
      'Podaj pomysł na sezonowy kosmetyk lub dodatek do oferty.',
    ] : [
      'Przygotuj krótki plan dzisiejszego zabiegu.',
      'Na co szczególnie uważać przed rozpoczęciem?',
      'Co zmieniło się od poprzednich wizyt?',
      'Jakie pytania zadać klientowi przed masażem?',
      'Co warto pamiętać z życia klienta?',
    ];
    if (quick) {
      quick.innerHTML = questions.map((question) => `<button type="button" data-advisor-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join('');
    }
    renderAdvisorMessages();
    setAdvisorStatus('');
  }

  async function renderSuggestions() {
    const box = document.getElementById('cd-section-suggestions');
    if (!box) return;
    if (!extendedSchemaAvailable) {
      box.innerHTML = '<div class="briefing-placeholder"><strong>Brakuje pól doradcy w Supabase.</strong><p>Uruchom migrację <code>202609240002_client_advisor.sql</code>, a następnie odśwież stronę.</p></div>';
      return;
    }
    const savedBits = [
      client.prefs, client.allergies, client.contras, client.notes,
      client.current_complaints, client.work_context, client.wellbeing_context,
      client.relationship_context, client.conversation_followups, client.avoid_topics,
    ].filter((value) => String(value || '').trim()).length;
    const quickQuestions = [
      'Przygotuj krótki plan dzisiejszego zabiegu.',
      'Na co szczególnie uważać przed rozpoczęciem?',
      'Co zmieniło się od poprzednich wizyt?',
      'Jakie pytania zadać klientowi przed masażem?',
      'Co warto pamiętać z życia klienta?',
    ];
    box.innerHTML = `
      <div class="advisor-shell">
        <section>
          <div class="briefing-head">
            <div><p class="eyebrow">Przed wizytą</p><h2>Doradca klienta</h2><p class="muted">Analizuje wcześniejsze wizyty, dolegliwości, uczulenia, pracę, samopoczucie i pamięć relacyjną.</p></div>
            <div class="advisor-actions"><button id="briefing-generate" class="btn primary" type="button">${client.briefing_json ? 'Odśwież odprawę' : 'Przygotuj odprawę'}</button></div>
          </div>
          <div class="briefing-data-note"><strong>Karta klienta: ${savedBits} z 10 obszarów zawiera dane.</strong> Doradca nie stawia diagnozy i nie zastępuje oceny terapeutki. Imię, adres i dane kontaktowe nie są wysyłane do modelu.</div>
          <div id="briefing-result">${renderBriefingResult(client.briefing_json, client.briefing_generated_at)}</div>
        </section>
        <section class="advisor-chat" aria-label="Pisemny doradca klienta">
          <div class="advisor-scope-switch"><button class="btn primary" type="button" data-advisor-scope="client">Klient</button><button class="btn ghost" type="button" data-advisor-scope="general">Pomysły SPA</button></div>
          <div class="advisor-chat-head"><div><h3 id="advisor-mode-title">Zapytaj o tego klienta</h3><p id="advisor-mode-description">Rozmowa dotyczy wyłącznie otwartej karty i nie zapisuje się w kartotece.</p></div><button id="advisor-clear" class="text-btn" type="button">Wyczyść rozmowę</button></div>
          <div id="advisor-quick" class="advisor-quick">${quickQuestions.map((question) => `<button type="button" data-advisor-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join('')}</div>
          <div id="advisor-messages" class="advisor-messages" aria-live="polite"></div>
          <div class="advisor-composer"><textarea id="advisor-question" rows="2" maxlength="2000" placeholder="Np. jak dostosować dzisiejszy masaż do ostatnich dolegliwości?"></textarea><button id="advisor-send" class="btn primary" type="button">Wyślij</button></div>
          <p id="advisor-status" class="advisor-status"></p>
        </section>
        <p class="advisor-disclaimer">Sugestie AI wymagają oceny terapeutki. W razie czerwonych flag, niejasnego przeciwwskazania lub pogorszenia objawów pierwszeństwo ma bezpieczeństwo i konsultacja z odpowiednim specjalistą.</p>
      </div>`;
    renderAdvisorMessages();
    document.getElementById('briefing-generate')?.addEventListener('click', (event) => generateBriefing(event.currentTarget));
    document.getElementById('advisor-send')?.addEventListener('click', sendAdvisorQuestion);
    document.getElementById('advisor-question')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        sendAdvisorQuestion();
      }
    });
    document.getElementById('advisor-clear')?.addEventListener('click', () => {
      advisorConversation = [];
      advisorUiMessages = [];
      renderAdvisorMessages();
      setAdvisorStatus('Rozmowa została wyczyszczona. Odprawa klienta pozostaje zapisana.');
    });
    box.querySelectorAll('[data-advisor-scope]').forEach((button) => button.addEventListener('click', () => switchAdvisorScope(button.getAttribute('data-advisor-scope'))));
    box.addEventListener('click', (event) => {
      const button = event.target.closest('[data-advisor-question]');
      if (!button) return;
      const input = document.getElementById('advisor-question');
      if (input) input.value = button.getAttribute('data-advisor-question') || '';
      sendAdvisorQuestion();
    });
  }

  function showSection(sectionId) {
    const sections = ['cd-section-suggestions', 'cd-section-upcoming', 'cd-section-history', 'cd-section-contact', 'cd-section-notes'];
    sections.forEach((value) => document.getElementById(value)?.classList.add('hidden'));
    document.getElementById(sectionId)?.classList.remove('hidden');
    const activeButton = {
      'cd-section-upcoming': 'cd-btn-upcoming',
      'cd-section-suggestions': 'cd-btn-suggestions',
      'cd-section-history': 'cd-btn-history',
      'cd-section-contact': 'cd-btn-contact',
      'cd-section-notes': 'cd-btn-notes',
    }[sectionId];
    ['cd-btn-upcoming', 'cd-btn-suggestions', 'cd-btn-history', 'cd-btn-contact', 'cd-btn-notes']
      .forEach((buttonId) => document.getElementById(buttonId)?.classList.toggle('active', buttonId === activeButton));
  }

  async function loadClient() {
    const extendedFields = 'id,name,email,phone,address,prefs,allergies,contras,notes,treatment_notes,current_complaints,work_context,wellbeing_context,relationship_context,conversation_followups,avoid_topics,briefing_json,briefing_generated_at';
    let result = await sb.from('clients').select(extendedFields).eq('id', id).single();
    if (result.error) {
      extendedSchemaAvailable = false;
      result = await sb.from('clients').select('id,name,email,phone,address,prefs,allergies,contras,notes,treatment_notes').eq('id', id).single();
    }
    if (result.error || !result.data) return null;
    return { ...result.data, treatmentNotes: result.data.treatment_notes || {} };
  }

  async function fetchClientBookings() {
    const email = normEmail(client?.email);
    const phone = normPhone(client?.phone);
    if (!email && !phone) return { rows: [], reason: 'Brak e-maila/telefonu u klienta' };
    let query = sb.from('bookings_view').select('*').order('when', { ascending: true });
    const filters = [];
    if (email) filters.push(`client_email.ilike.${email}`);
    if (phone) filters.push(`phone.eq.${phone}`);
    query = query.or(filters.join(','));
    const { data, error } = await query;
    if (error) return { rows: [], reason: error.message };
    return { rows: data || [], reason: null };
  }

  function noteFor(row) {
    return row.notes ?? row.note ?? row.admin_notes ?? row.uwagi ?? row.comment ?? row.comments ?? row.remark ?? row.remarks ?? '';
  }

  async function renderUpcoming() {
    const out = await fetchClientBookings();
    const tbody = document.getElementById('cd-upcoming-rows');
    if (!tbody) return;
    if (out.reason && !out.rows.length) {
      tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(out.reason)}</td></tr>`;
      return;
    }
    const rows = out.rows.filter((row) => new Date(row.when) >= new Date() && row.status !== 'Anulowana');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4">Brak nadchodzących</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row) => `
      <tr><td>${escapeHtml(fmtDateTimePL(row.when))}</td><td>${escapeHtml(row.service_name || '-')}</td><td>${escapeHtml(row.status || '-')}</td><td>${escapeHtml(noteFor(row) || '-')}</td></tr>`).join('');
  }

  async function renderHistory() {
    const out = await fetchClientBookings();
    const tbody = document.getElementById('cd-history-rows');
    if (!tbody) return;
    if (out.reason && !out.rows.length) {
      tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(out.reason)}</td></tr>`;
      return;
    }
    const rows = out.rows
      .filter((row) => new Date(row.when) < new Date() && row.status !== 'Anulowana')
      .sort((a, b) => new Date(b.when) - new Date(a.when));
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4">Brak historii</td></tr>';
      return;
    }
    const localNotes = client.treatmentNotes || {};
    tbody.innerHTML = rows.map((row) => {
      const key = row.booking_no || `${row.when}|${row.service_name || ''}`;
      return `
        <tr data-key="${encodeURIComponent(key)}">
          <td>${escapeHtml(fmtDateTimePL(row.when))}</td><td>${escapeHtml(row.service_name || '-')}</td><td>${escapeHtml(row.status || '-')}</td>
          <td><div style="display:flex;gap:6px;align-items:flex-start"><textarea class="hist-note" rows="2" style="min-width:260px">${escapeHtml(localNotes[key] || '')}</textarea><button class="btn" data-save-hist="${encodeURIComponent(key)}">Zapisz</button></div></td>
        </tr>`;
    }).join('');
  }

  function setBtnCount(buttonId, label, count) {
    const button = document.getElementById(buttonId);
    if (button) button.textContent = `${label} (${count})`;
  }

  async function refreshCounts() {
    const out = await fetchClientBookings();
    const now = new Date();
    setBtnCount('cd-btn-upcoming', 'Nadchodzące', out.rows.filter((row) => new Date(row.when) >= now && row.status !== 'Anulowana').length);
    setBtnCount('cd-btn-history', 'Historia zabiegów', out.rows.filter((row) => new Date(row.when) < now && row.status !== 'Anulowana').length);
  }

  function loadNotesToForm() {
    $('#cd-prefs').value = client.prefs || '';
    $('#cd-allergies').value = client.allergies || '';
    $('#cd-contras').value = client.contras || '';
    $('#cd-complaints').value = client.current_complaints || '';
    $('#cd-work-context').value = client.work_context || '';
    $('#cd-wellbeing').value = client.wellbeing_context || '';
    $('#cd-notes').value = client.notes || '';
    $('#cd-relationship').value = client.relationship_context || '';
    $('#cd-followups').value = client.conversation_followups || '';
    $('#cd-avoid-topics').value = client.avoid_topics || '';
  }

  async function saveNotesFromForm() {
    const list = clientsLoad();
    const index = list.findIndex((item) => item.id === id);
    if (index < 0) return;
    const updates = {
      prefs: $('#cd-prefs')?.value || '',
      allergies: $('#cd-allergies')?.value || '',
      contras: $('#cd-contras')?.value || '',
      notes: $('#cd-notes')?.value || '',
    };
    if (extendedSchemaAvailable) {
      updates.relationship_context = $('#cd-relationship')?.value || '';
      updates.conversation_followups = $('#cd-followups')?.value || '';
      updates.avoid_topics = $('#cd-avoid-topics')?.value || '';
      updates.current_complaints = $('#cd-complaints')?.value || '';
      updates.work_context = $('#cd-work-context')?.value || '';
      updates.wellbeing_context = $('#cd-wellbeing')?.value || '';
    }
    const { error } = await sb.from('clients').update(updates).eq('id', id);
    if (error) {
      alert(`Nie zapisano: ${error.message}`);
      return;
    }
    Object.assign(list[index], updates);
    clientsSave(list);
    client = list[index];
    alert('Zapisano.');
  }

  client = await loadClient();
  clientsSave(client ? [client] : []);
  if (!client) {
    document.body.innerHTML = '<div class="container"><p>Nie znaleziono klienta albo sesja administratora wygasła.</p><p><a href="index.html#clients">Wróć</a></p></div>';
    return;
  }

  $('#cd-title').textContent = client.name || 'Szczegóły klienta';
  const avatar = $('.client-avatar-large');
  if (avatar) avatar.textContent = String(client.name || 'K').trim().charAt(0).toUpperCase() || 'K';
  $('#cd-email').textContent = client.email || '-';
  $('#cd-phone').textContent = client.phone || '-';
  $('#cd-address').textContent = client.address || '-';

  await renderUpcoming();
  showSection('cd-section-upcoming');
  refreshCounts();

  $('#cd-btn-upcoming')?.addEventListener('click', async () => { await renderUpcoming(); showSection('cd-section-upcoming'); });
  $('#cd-btn-suggestions')?.addEventListener('click', async () => { await renderSuggestions(); showSection('cd-section-suggestions'); });
  $('#cd-btn-history')?.addEventListener('click', async () => { await renderHistory(); showSection('cd-section-history'); });
  $('#cd-btn-contact')?.addEventListener('click', () => showSection('cd-section-contact'));
  $('#cd-btn-notes')?.addEventListener('click', () => { loadNotesToForm(); showSection('cd-section-notes'); });
  $('#cd-save')?.addEventListener('click', saveNotesFromForm);
  $('#cd-btn-back')?.addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else location.replace('index.html#clients');
  });

  document.getElementById('cd-history-rows')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-save-hist]');
    if (!button) return;
    const key = decodeURIComponent(button.getAttribute('data-save-hist') || '');
    const note = button.closest('tr')?.querySelector('.hist-note')?.value || '';
    const list = clientsLoad();
    const index = list.findIndex((item) => item.id === id);
    if (index < 0) return;
    list[index].treatmentNotes = list[index].treatmentNotes || {};
    list[index].treatmentNotes[key] = note;
    const { error } = await sb.from('clients').update({ treatment_notes: list[index].treatmentNotes }).eq('id', id);
    if (error) {
      alert(`Nie zapisano: ${error.message}`);
      return;
    }
    clientsSave(list);
    client = list[index];
    button.textContent = 'Zapisano';
    setTimeout(() => { button.textContent = 'Zapisz'; }, 1000);
  });
})();
