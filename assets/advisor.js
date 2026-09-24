(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  let initialized = false;
  let scope = 'client';
  let conversation = [];
  let messages = [];

  function normalized(value) {
    return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/ł/g, 'l');
  }

  function isSaveIdeaCommand(value) {
    const command = normalized(value).replace(/[.!?]+$/g, '').replace(/\s+/g, ' ');
    if (command === 'zapisz') return true;
    if (!/^(?:zapisz|dodaj)\b/.test(command)) return false;
    if (/\b(?:dane|klient\w*|kart\w* klient\w*|notatk\w* klient\w*|rezerwacj\w*)\b/.test(command)) return false;
    return /\b(?:pomysl\w*|przepis\w*|receptur\w*|material\w*|rytual\w*|koncepcj\w*|wersj\w*)\b/.test(command);
  }

  function isSavableIdeaAnswer(currentScope, answer) {
    return currentScope === 'general' && typeof answer?.idea_content === 'string' && answer.idea_content.trim().length > 0;
  }

  function renderAnswer(answer) {
    const list = (title, items) => {
      const rows = Array.isArray(items) ? items : [];
      return rows.length ? `<h4>${escapeHtml(title)}</h4><ul>${rows.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
    };
    return `<div>${escapeHtml(answer?.answer || 'Brak odpowiedzi.')}</div>
      ${list('Proponowane kroki', answer?.suggested_actions)}
      ${list('Bezpieczeństwo', answer?.safety_notes)}
      ${answer?.uncertainty ? `<h4>Niepewność</h4><div>${escapeHtml(answer.uncertainty)}</div>` : ''}
      ${Array.isArray(answer?.sources) && answer.sources.length ? `<div class="advisor-sources"><strong>Podstawa odpowiedzi:</strong> ${answer.sources.map(escapeHtml).join(' • ')}</div>` : ''}`;
  }

  function renderMessages() {
    const root = $('#global-advisor-messages');
    if (!root) return;
    if (!messages.length) {
      root.innerHTML = scope === 'client'
        ? '<div class="advisor-message system">Wybierz klienta i zapytaj o wcześniejsze wizyty, bezpieczeństwo, preferencje albo informacje warte zapamiętania.</div>'
        : '<div class="advisor-message system">Poproś o przepis lub inspirację SPA. Ten tryb nie korzysta z żadnej karty klienta.</div>';
      return;
    }
    root.innerHTML = messages.map((message) => message.role === 'assistant'
      ? `<div class="advisor-message assistant">${renderAnswer(message.answer)}</div>`
      : `<div class="advisor-message user">${escapeHtml(message.content)}</div>`).join('');
    root.scrollTop = root.scrollHeight;
  }

  function setStatus(text = '', error = false) {
    const root = $('#global-advisor-status');
    if (!root) return;
    root.textContent = text;
    root.classList.toggle('error', error);
  }

  function conversationText(answer) {
    const actions = Array.isArray(answer?.suggested_actions) ? answer.suggested_actions.join('; ') : '';
    const idea = answer?.idea_content
      ? `Aktualna wersja pomysłu (${answer.idea_title || 'bez tytułu'}, ${answer.idea_category || 'bez kategorii'}): ${answer.idea_content}`
      : '';
    return [answer?.answer || '', actions ? `Kroki: ${actions}` : '', idea, answer?.uncertainty ? `Niepewność: ${answer.uncertainty}` : ''].filter(Boolean).join('\n');
  }

  async function callAdvisor(question) {
    const { data: { session } } = await window.sb.auth.getSession();
    if (!session?.access_token) throw new Error('Sesja administratora wygasła. Zaloguj się ponownie.');
    const clientId = $('#global-advisor-client')?.value || '';
    if (scope === 'client' && !clientId) throw new Error('Najpierw wybierz klienta.');
    const response = await fetch('/.netlify/functions/client-advisor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        mode: scope === 'general' ? 'general' : 'chat',
        client_id: scope === 'client' ? clientId : undefined,
        question,
        conversation,
      }),
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Doradca nie odpowiedział.');
    return body.answer || {};
  }

  async function saveLastIdea() {
    const lastIdea = [...messages].reverse().find((message) => message.role === 'assistant' && message.idea_save_allowed === true && message.answer?.idea_content);
    if (!lastIdea) throw new Error('Najpierw poproś doradcę o przygotowanie pomysłu, rytuału, opisu albo przepisu.');
    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) throw new Error('Sesja administratora wygasła.');
    const answer = lastIdea.answer;
    const { error } = await window.sb.from('ideas').insert({
      title: String(answer.idea_title || 'Pomysł SPA').slice(0, 180),
      category: String(answer.idea_category || 'Pomysł').slice(0, 80),
      content: String(answer.idea_content).slice(0, 12000),
      created_by: session.user.id,
    });
    if (error) throw new Error(error.message.includes('ideas') ? 'Uruchom migrację Pomysłów w Supabase.' : error.message);
  }

  async function send() {
    const input = $('#global-advisor-question');
    const button = $('#global-advisor-send');
    const question = String(input?.value || '').trim();
    if (!question || !button) return;
    const normalizedQuestion = normalized(question);
    messages.push({ role: 'user', content: question });
    input.value = '';
    renderMessages();

    if (scope === 'general' && isSaveIdeaCommand(normalizedQuestion)) {
      try {
        await saveLastIdea();
        messages.push({ role: 'assistant', answer: { answer: 'Zapisałam ostatni przygotowany materiał w zakładce Pomysły.', suggested_actions: [], safety_notes: [], sources: [], uncertainty: '' } });
        setStatus('Pomysł został zapisany.');
      } catch (error) {
        messages.push({ role: 'assistant', answer: { answer: error.message, suggested_actions: [], safety_notes: [], sources: [], uncertainty: '' } });
        setStatus(error.message, true);
      }
      renderMessages();
      return;
    }

    input.disabled = true;
    button.disabled = true;
    setStatus(scope === 'client' ? 'Analizuję kartę i historię wybranego klienta…' : 'Przygotowuję odpowiedź bez danych klienta…');
    try {
      const answer = await callAdvisor(question);
      const ideaSaveAllowed = isSavableIdeaAnswer(scope, answer);
      messages.push({ role: 'assistant', answer, idea_save_allowed: ideaSaveAllowed });
      conversation.push({ role: 'user', content: question }, { role: 'assistant', content: conversationText(answer) });
      conversation = conversation.slice(-12);
      setStatus(scope === 'general'
        ? (ideaSaveAllowed ? 'Materiał nie został zapisany. Aby go zachować w Pomysłach, napisz: „zapisz”.' : 'Odpowiedź nie została zapisana.')
        : 'Odpowiedź jest sugestią do oceny przez terapeutkę i nie została zapisana.');
    } catch (error) {
      messages.push({ role: 'assistant', answer: { answer: error.message || 'Nie udało się uzyskać odpowiedzi.', suggested_actions: [], safety_notes: [], sources: [], uncertainty: '' } });
      setStatus(error.message || 'Nie udało się uzyskać odpowiedzi.', true);
    } finally {
      input.disabled = false;
      button.disabled = false;
      input.focus();
      renderMessages();
    }
  }

  function setScope(next) {
    scope = next === 'general' ? 'general' : 'client';
    conversation = [];
    messages = [];
    document.querySelectorAll('[data-global-advisor-scope]').forEach((button) => {
      const active = button.getAttribute('data-global-advisor-scope') === scope;
      button.classList.toggle('primary', active);
      button.classList.toggle('ghost', !active);
    });
    $('#global-advisor-client-wrap')?.classList.toggle('hidden', scope !== 'client');
    const input = $('#global-advisor-question');
    if (input) input.placeholder = scope === 'client'
      ? 'Np. co najważniejszego pamiętać przed kolejną wizytą?'
      : 'Np. napisz przepis na wodę różaną.';
    const quick = $('#global-advisor-quick');
    const questions = scope === 'client'
      ? ['Co najważniejszego pamiętać o tym kliencie?', 'Na co uważać przed zabiegiem?', 'Co zmieniło się od ostatniej wizyty?']
      : ['Napisz przepis na wodę różaną.', 'Podaj pomysł na rytuał SPA.', 'Zaproponuj sezonowy dodatek do oferty.'];
    if (quick) quick.innerHTML = questions.map((question) => `<button type="button" data-global-question="${escapeHtml(question)}">${escapeHtml(question)}</button>`).join('');
    setStatus('');
    renderMessages();
  }

  async function loadClients() {
    const select = $('#global-advisor-client');
    if (!select) return;
    const { data, error } = await window.sb.from('clients').select('id,name').order('name');
    if (error) {
      select.innerHTML = '<option value="">Nie udało się pobrać klientów</option>';
      return;
    }
    select.innerHTML = '<option value="">Wybierz klienta…</option>' + (data || []).map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name || 'Klient')}</option>`).join('');
  }

  function wire() {
    if (initialized) return;
    initialized = true;
    $('#global-advisor-send')?.addEventListener('click', send);
    $('#global-advisor-question')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        send();
      }
    });
    $('#global-advisor-clear')?.addEventListener('click', () => {
      conversation = [];
      messages = [];
      renderMessages();
      setStatus('Rozmowa została wyczyszczona.');
    });
    $('#advisor-screen')?.addEventListener('click', (event) => {
      const scopeButton = event.target.closest('[data-global-advisor-scope]');
      if (scopeButton) setScope(scopeButton.getAttribute('data-global-advisor-scope'));
      const questionButton = event.target.closest('[data-global-question]');
      if (questionButton) {
        const input = $('#global-advisor-question');
        if (input) input.value = questionButton.getAttribute('data-global-question') || '';
        send();
      }
    });
  }

  window.GlobalAdvisor = {
    isSaveIdeaCommand,
    isSavableIdeaAnswer,
    init() {
      wire();
      loadClients();
      setScope(scope);
    },
  };
})();
