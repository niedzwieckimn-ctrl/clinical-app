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
  let ideas = [];

  function formatDate(value) {
    try {
      return new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return '';
    }
  }

  function render() {
    const root = $('#ideas-list');
    if (!root) return;
    const query = String($('#ideas-search')?.value || '').trim().toLowerCase();
    const rows = ideas.filter((idea) => !query || [idea.title, idea.category, idea.content]
      .some((value) => String(value || '').toLowerCase().includes(query)));
    root.innerHTML = rows.length ? rows.map((idea) => `
      <article class="idea-card">
        <div class="idea-card-head">
          <div><span class="idea-category">${escapeHtml(idea.category || 'Inspiracja')}</span><h3>${escapeHtml(idea.title || 'Pomysł SPA')}</h3><small>${escapeHtml(formatDate(idea.created_at))}</small></div>
          <button class="text-btn idea-delete" type="button" data-idea-delete="${escapeHtml(idea.id)}">Usuń</button>
        </div>
        <div class="idea-content">${escapeHtml(idea.content || '')}</div>
        ${idea.source_question ? `<details><summary>Pytanie, od którego zaczęło się opracowanie</summary><p>${escapeHtml(idea.source_question)}</p></details>` : ''}
      </article>`).join('') : '<div class="paper-panel empty-state">Brak zapisanych pomysłów.</div>';
  }

  async function load() {
    const root = $('#ideas-list');
    if (root) root.innerHTML = '<div class="paper-panel empty-state">Ładowanie pomysłów…</div>';
    const { data, error } = await window.sb.from('ideas')
      .select('id,title,category,content,source_question,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (error) {
      if (root) root.innerHTML = '<div class="paper-panel empty-state">Brakuje tabeli Pomysły. Uruchom migrację <code>202609240003_ideas.sql</code> w Supabase.</div>';
      return;
    }
    ideas = data || [];
    render();
  }

  async function addManual(event) {
    event.preventDefault();
    const title = String($('#idea-title')?.value || '').trim();
    const category = String($('#idea-category')?.value || '').trim() || 'Inspiracja';
    const content = String($('#idea-content')?.value || '').trim();
    if (!title || !content) return;
    const button = $('#idea-add');
    button.disabled = true;
    const { data: { session } } = await window.sb.auth.getSession();
    const { error } = await window.sb.from('ideas').insert({
      title: title.slice(0, 180),
      category: category.slice(0, 80),
      content: content.slice(0, 12000),
      created_by: session?.user?.id || null,
    });
    button.disabled = false;
    if (error) {
      alert(`Nie udało się zapisać pomysłu: ${error.message}`);
      return;
    }
    event.currentTarget.reset();
    await load();
  }

  async function remove(id, button) {
    if (!confirm('Usunąć ten pomysł? Tej operacji nie można cofnąć.')) return;
    button.disabled = true;
    const { error } = await window.sb.from('ideas').delete().eq('id', id);
    if (error) {
      button.disabled = false;
      alert(`Nie udało się usunąć pomysłu: ${error.message}`);
      return;
    }
    ideas = ideas.filter((idea) => String(idea.id) !== String(id));
    render();
  }

  function wire() {
    if (initialized) return;
    initialized = true;
    $('#idea-form')?.addEventListener('submit', addManual);
    $('#ideas-search')?.addEventListener('input', render);
    $('#ideas-list')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-idea-delete]');
      if (button) remove(button.getAttribute('data-idea-delete'), button);
    });
  }

  window.Ideas = {
    init() {
      wire();
      load();
    },
    load,
  };
})();
