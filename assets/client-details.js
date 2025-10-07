// assets/client-details.js
(function () {
  'use strict';

  // ===== UTIL =====
  const $ = (s, r=document) => r.querySelector(s);
  const escapeHtml = (s) => String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmtDatePL = (iso) => {
    try { return new Date(iso).toLocaleDateString('pl-PL', { dateStyle:'medium' }); }
    catch { return iso || ''; }
  };
  const qs = new URLSearchParams(location.search);
/* === SUGESTIE: konfiguracja, helpery i reguły === */

// --- LIMITY (żeby tekst był krótki) ---
const MAX_PLAN_ITEMS = 6;        // maksymalnie 6 punktów planu
const MAX_PREFS = 3;             // maks 3 preferencje w narracji
const MAX_ALLERGIES = 3;         // maks 3 alergie
const MAX_CONTRAS = 3;           // maks 3 przeciwwskazania
const MAX_AREAS = 2;             // maks 2 dominujące obszary
const HISTORY_WINDOW_DAYS = 365;  // analizujemy ostatni rok
const CLIP_LEN = 120;             // skracanie cytatów/uwag

// --- Helpery skracania i dopasowań ---
const has = (txt, ...terms) => String(txt||'').toLowerCase()
  && terms.some(t => String(txt||'').toLowerCase().includes(String(t).toLowerCase()));
const daysBetween = (a,b) => Math.round((+b - +a) / 86400000);
const clip = (s, n=CLIP_LEN) => {
  const t = String(s||'').trim(); return t.length<=n ? t : t.slice(0, n-1)+'…';
};
const csvList = (s, max=3) => String(s||'')
  .split(/[;,/|]/).map(x=>x.trim()).filter(Boolean)
  .filter((v,i,a)=>a.findIndex(z=>z.toLowerCase()===v.toLowerCase())===i)
  .slice(0,max);
const uniqCap = (arr, max) => {
  const out=[]; for (const it of arr) if (!out.includes(it)) out.push(it); return out.slice(0,max);
};
const recencyWeight = (whenIso) => {
  const d = Math.abs((new Date() - new Date(whenIso)) / 86400000);
  if (d > HISTORY_WINDOW_DAYS) return 0; if (d > 180) return 0.25; if (d > 90) return 0.5; return 1.0;
};

// --- (opcjonalnie) jeśli nie masz tych dwóch helperów, odkomentuj:
// function normEmail(e){ return String(e||'').trim().toLowerCase(); }
// function normPhone(p){ return String(p||'').replace(/[^\d+]/g,''); }

// --- (opcjonalnie) jeśli nie masz: pobranie wszystkich zabiegów klienta
// async function fetchClientBookings({ email, phone }) {
//   const e = normEmail(email), p = normPhone(phone);
//   if (!e && !p) return { rows: [], reason: 'Brak e-maila/telefonu' };
//   let q = window.sb.from('bookings_view').select('*').order('when',{ascending:true});
//   const parts = []; if (e) parts.push(`client_email.ilike.${e}`); if (p) parts.push(`phone.eq.${p}`);
//   q = q.or(parts.join(','));
//   const { data, error } = await q;
//   if (error) return { rows: [], reason: error.message };
//   return { rows: data || [], reason: null };
// }

// --- reguły technik i „sznyt” usług ---
const TECH_RULES = [
  { match: ['bark','barki','obręcz','łopatk','dźwigacz','czworoboczny'],
    recs: [
      'Akcent na obręcz barkową: punkty spustowe górnego czworobocznego i dźwigacza łopatki (30–60 s/punkt).',
      'Mobilizacje łopatki (ślizgi scapulothoracic, depresja/rotacja) w odciążeniu.',
      'Forearm sweeping wzdłuż pasm przykręgosłupowych Th; tempo wolne–umiarkowane.'
    ]},
  { match: ['szyj','kark','bóle głowy','migren'],
    recs: [
      'Wydłużenia mięśni podpotylicznych + delikatne trakcje szyjne.',
      'MOS i pochyłe: uciski statyczne 20–30 s z oddechem.',
      'Techniki nerwowo-mięśniowe pasma karku (bez bólu ostrego).'
    ]},
  { match: ['lędźw','lędz','dyskop','rwa kulsz','lumbal','ból plec'],
    cautions: [
      'Unikać długotrwałego ucisku izometrycznego na odcinku lędźwiowym.',
      'Bez agresywnych technik na wyrostki kolczyste.'
    ],
    recs: [
      'Powierzchowne rozluźnienie prostowników grzbietu (forearm glides, 2–3 przejścia).',
      'Kwadratus lumborum: uciski statyczne + wydłużenia w oddechu.',
      'Mobilizacja miednicy w odciążeniu (rocking).'
    ]},
  { match: ['stolarn','praca fizyczna','łokieć','przedrami','nadgarst'],
    recs: [
      'Striping i poprzeczne frikcje zginaczy nadgarstka (30–45 s).',
      'Trakcja/ślizgi promieniowo-łokciowe niskiej amplitudy.',
      'Po: rozciąganie zginaczy nadgarstka 2×30 s.'
    ]},
  { match: ['stres','bezsen','przemęcz','napięcie ogólne'],
    recs: [
      'Effleurage całego ciała w tempie wolnym, z akcentem na wydech.',
      'Sekwencja kojąca na przeponę (kontakt na żebrach dolnych, 4–6 cykli).',
      'Zamknięcie: głaskania powięziowe karku i czoła.'
    ]},
];

const SERVICE_RULES = {
  'Masaż królewski Lomi Lomi': [
    'Długie, płynne sekwencje przedramieniem (Lomi), łączenie segmentów ciała.',
    'Rytm kołyszący; minimalna liczba przestawień rąk.'
  ],
  'Masaż relaksacyjny ciała': [
    'Effleurage globalny; progresja nacisku 1→3/5.',
    'Mniej pracy punktowej, więcej pracy globalnej.'
  ],
  'Masaż ciepłą czekoladą': [
    'Medium podgrzane; praca raczej powierzchowna, bez szybkiego tarcia.',
    'Aromat łagodny; unikać kompozycji konfliktowych z alergiami.'
  ],
  'Aromaterapia': [
    'Bezpieczny dobór nuty (test skórny), niska dawka; tempo spokojne.'
  ],
  '_default': [
    'Rozgrzewka → akcent na obszary problemowe → wyciszenie.'
  ]
};

function deriveTechniques(corpus, serviceName){
  const items = [], cauts = [];
  for (const r of TECH_RULES) {
    if (!(r.match||[]).some(k => corpus.includes(k))) continue;
    if (r.cautions) cauts.push(...r.cautions);
    if (r.recs)     items.push(...r.recs);
  }
  const svc = SERVICE_RULES[serviceName || ''] || SERVICE_RULES._default;
  const all = [...cauts, ...svc, ...items];
  return uniqCap(all, MAX_PLAN_ITEMS + 4); // damy bufor, później przytniemy
}

// --- statystyki z historii (past/upcoming, naj, odstępy) ---
function analyzeHistory(rows){
  const now = new Date();
  const past = rows.filter(r => new Date(r.when) < now && r.status !== 'Anulowana');
  const upcoming = rows.filter(r => new Date(r.when) >= now && r.status !== 'Anulowana')
                       .sort((a,b)=> new Date(a.when)-new Date(b.when));

  let lastVisit=null, avgInterval=null, topService=null;
  if (past.length){
    lastVisit = past.reduce((a,b)=> new Date(a.when)>new Date(b.when)?a:b);
    const sorted=[...past].sort((a,b)=> new Date(a.when)-new Date(b.when));
    const diffs=[]; for (let i=1;i<sorted.length;i++) diffs.push(daysBetween(new Date(sorted[i-1].when), new Date(sorted[i].when)));
    if (diffs.length) avgInterval = Math.round(diffs.reduce((a,b)=>a+b,0)/diffs.length);
    const m=new Map(); for (const r of past) m.set(r.service_name,(m.get(r.service_name)||0)+1);
    topService = [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
  }
  return { past, upcoming, lastVisit, avgInterval, topService, visitCount: past.length };
}

// --- narracja (krótka i konkretna) ---
function buildNarrativeHTML(client, stats, rows){
  const prefs     = csvList(client.prefs, MAX_PREFS);
  const allergies = csvList(client.allergies, MAX_ALLERGIES);
  const contras   = csvList(client.contras, MAX_CONTRAS);

  // scoring na podstawie ostatniego roku
  const score = { shoulder:0, neck:0, thoracic:0, lumbar:0, forearm:0, stress:0, headache:0 };
  const bump = (k,w)=> score[k]+=w;

  for (const r of (rows||[])) {
    const w = recencyWeight(r.when); if (!w) continue;
    const txt = (r.notes||'' + ' ' + (r.service_name||'')).toLowerCase();
    if (/(bark|barki|łopatk|obręcz)/.test(txt)) bump('shoulder', w);
    if (/(szyj|kark)/.test(txt))                bump('neck', w);
    if (/(piersiow)/.test(txt))                 bump('thoracic', w);
    if (/(lędźw|lędz|dyskop|rwa)/.test(txt))    bump('lumbar', w);
    if (/(przedrami|nadgarst|łokieć)/.test(txt))bump('forearm', w);
    if (/(stres|przemęcz|bezsen)/.test(txt))    bump('stress', w);
    if (/(migren|bóle głowy)/.test(txt))        bump('headache', w);
  }
  for (const [k,v] of Object.entries(client.treatmentNotes || {})) {
    const when = String(k).split('|')[0];
    const w = recencyWeight(when || new Date().toISOString());
    const txt = String(v||'').toLowerCase();
    if (/(bark|barki|łopatk|obręcz)/.test(txt)) bump('shoulder', w);
    if (/(szyj|kark)/.test(txt))                bump('neck', w);
    if (/(lędźw|lędz|dyskop|rwa)/.test(txt))    bump('lumbar', w);
  }
  const areasMap = {
    shoulder: 'napięcie obręczy barkowej / górnych pleców',
    neck:     'dyskomfort szyi',
    thoracic: 'sztywność odcinka piersiowego',
    lumbar:   'wrażliwość odcinka lędźwiowego',
    forearm:  'przeciążenia przedramion / nadgarstków',
    stress:   'wysokie napięcie ogólne',
    headache: 'tendencja do bólów głowy'
  };
  const areas = Object.entries(score)
    .sort((a,b)=>b[1]-a[1]).filter(([,v])=>v>0).slice(0, MAX_AREAS)
    .map(([k])=>areasMap[k]);

  const parts = [];
  parts.push(`<p><b>Preferencje:</b> ${prefs.length ? prefs.join(', ') : 'brak szczególnych'}.</p>`);
  const sec=[]; if (allergies.length) sec.push('alergie: '+allergies.join(', '));
  if (contras.length) sec.push('ostrożność: '+contras.join(', '));
  parts.push(`<p><b>Alergie/bezpieczeństwo:</b> ${sec.join('; ') || 'brak danych'}.</p>`);
  const hist=[]; if (stats.visitCount) hist.push(`wizyt: ${stats.visitCount}`);
  if (stats.topService) hist.push(`najczęściej: ${escapeHtml(stats.topService)}`);
  if (stats.lastVisit) hist.push(`ostatnio: ${fmtDatePL(stats.lastVisit.when)}`);
  if (stats.avgInterval) hist.push(`odstęp: ~${stats.avgInterval} dni`);
  parts.push(`<p><b>Historia:</b> ${hist.join(' • ') || 'brak danych'}.</p>`);
  parts.push(`<p><b>Dominujące obszary:</b> ${areas.length ? areas.join(', ') : 'brak jednoznacznych wskazań'}.</p>`);
  return parts.join('\n');
}

// --- plan terapeutyczny na najbliższy zabieg (krótki) ---
function buildPlanList(client, stats, next){
  const likesHeat  = has(client.prefs, 'ciepł','gorąc');
  const avoidCoco  = has(client.allergies, 'kokos');
  const prefStrong = has(client.prefs, 'mocn','głęb');

  const corpus = (
    (client.notes||'')+' '+(client.prefs||'')+' '+(client.contras||'')+' '+
    Object.values(client.treatmentNotes||{}).join(' ')+' '+
    (next?.notes || '')
  ).toLowerCase();

  const base = [];
  // bezpieczeństwo/przygotowanie
  if (likesHeat) base.push('Przygotować wyższy komfort cieplny; medium podgrzane.');
  if (avoidCoco) base.push('Użyć medium bez kokosa; aromat łagodny / neutralny.');
  if (has(client.contras,'ciąża','preg')) base.push('Pozycje bezpieczne dla ciężarnych; bez punktów refleksyjnych.');
  if (has(client.contras,'kręgosł','lędźw','dyskop')) base.push('Odcinek L: praca powierzchowna, bez długich ucisków izometrycznych.');

  // techniki z reguł + „sznyt” usługi
  const tech = deriveTechniques(corpus, next?.service_name);

  // dodatkowe dopasowania
  if (prefStrong) base.push('Nacisk zwiększać stopniowo; kontrola komfortu co 5–10 min.');
  if (next?.notes) base.push(`Uwaga klienta: „${escapeHtml(clip(next.notes))}”.`);
  if (stats.avgInterval) base.push(`Rytm wizyt: co ${stats.avgInterval <= 21 ? '2–3' : '3–4'} tygodnie.`);
  base.push('After-care: nawodnienie + 1–2 ćwiczenia mobilizacji barków / oddech.');

  // priorytety: bezpieczeństwo (base) > techniki
  const merged = uniqCap([...base, ...tech], MAX_PLAN_ITEMS);
  return merged;
}

// --- render sekcji „Sugestie” (plan + narracja) ---
async function renderSuggestions(){
  const box = document.getElementById('cd-section-suggestions'); if (!box) return;

  const out = await fetchClientBookings({ email: client.email, phone: client.phone });
  const stats = analyzeHistory(out.rows || []);
  const next  = stats.upcoming[0] || null;

  const plan = buildPlanList(client, stats, next);
  const narrative = buildNarrativeHTML(client, stats, out.rows || []);

  const nextHdr = next ? `${fmtDatePL(next.when)} • ${escapeHtml(next.service_name||'-')}` : 'brak zaplanowanego zabiegu';

  box.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <h3 style="margin:6px 0">Sugestie terapeutyczne – najbliższa wizyta (${nextHdr})</h3>
      ${plan.length ? `<ul style="margin:6px 0 10px 18px">${plan.map(it=>`<li>${it}</li>`).join('')}</ul>` : '<p>Brak szczególnych zaleceń.</p>'}
      <button id="sg-save-plan" class="btn">Zapisz plan do Notatek</button>
    </div>
    <div class="card">
      <h3 style="margin:6px 0">Narracja kliniczna (podsumowanie klienta)</h3>
      <div id="sg-narrative" style="line-height:1.5">${narrative}</div>
      <div style="margin-top:8px">
        <button id="sg-save-narr" class="btn">Zapisz narrację do Notatek</button>
      </div>
    </div>
  `;

  const saveBlock = (title, text) => {
    const list = clientsLoad(); const idx = list.findIndex(x=>x.id === id); if (idx < 0) return;
    const stamp = new Date().toLocaleDateString('pl-PL');
    list[idx].notes = (list[idx].notes || '') + `\n--- ${title} ${stamp} ---\n` + text + '\n';
    clientsSave(list); client = list[idx]; alert('Zapisano do Notatek.');
  };

  document.getElementById('sg-save-plan')?.addEventListener('click', () => {
    const txt = plan.map(x => '• '+ x.replace(/<[^>]+>/g,'')).join('\n');
    saveBlock('Plan terapeutyczny', txt);
  });
  document.getElementById('sg-save-narr')?.addEventListener('click', () => {
    const raw = document.getElementById('sg-narrative')?.innerText || '';
    const safe = raw.split('\n').map(x => clip(x, 220)).join('\n'); // krótkie linie
    saveBlock('Narracja kliniczna', safe);
  });
}

  // Normalizacja identyfikatorów
  function normEmail(e){ return String(e||'').trim().toLowerCase(); }
  function normPhone(p){ return String(p||'').replace(/[^\d+]/g,''); }

  // ===== LOCAL STORAGE =====
  const CLIENTS_LS_KEY = 'adm_clients_v1';
  function clientsLoad(){
    try { return JSON.parse(localStorage.getItem(CLIENTS_LS_KEY)) || []; }
    catch { return []; }
  }
  function clientsSave(list){
    localStorage.setItem(CLIENTS_LS_KEY, JSON.stringify(list || []));
  }

  // ===== SECTIONS =====
  function showSection(id){
    const ids = [
      'cd-section-suggestions',
      'cd-section-upcoming',
      'cd-section-history',
      'cd-section-contact',
      'cd-section-notes'
    ];
    ids.forEach(x => document.getElementById(x)?.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
  }

  // ===== LOAD CLIENT =====
  const id = qs.get('id');
  let client = clientsLoad().find(x => x.id === id);
  if (!client) {
    document.body.innerHTML = '<div class="container"><p>Nie znaleziono klienta.</p><p><a href="admin.html#clients">Wróć</a></p></div>';
    return;
  }

  // Header + kontakt na starcie
  $('#cd-title').textContent = client.name || 'Szczegóły klienta';
  $('#cd-email').textContent = client.email || '-';
  $('#cd-phone').textContent = client.phone || '-';
  $('#cd-address').textContent = client.address || '-';

  // ===== SUGESTIE =====
  function buildSuggestions(c){
    const out = [];
    const txt = (s)=>String(s||'').toLowerCase();
    if (txt(c.allergies).includes('olej')) out.push('Unikaj olejków zapachowych.');
    if (txt(c.prefs).includes('mocny'))    out.push('Lubi mocny masaż.');
    if (Object.keys(c.treatmentNotes||{}).length > 3) out.push('Klient regularny – zaproponuj pakiet.');
    if (!out.length) out.push('Brak szczególnych zaleceń.');
    return out.join('<br>');
  }
  $('#cd-section-suggestions').innerHTML = buildSuggestions(client);
  showSection('cd-section-suggestions');

  // ===== SUPABASE QUERIES =====
 // pobiera wszystkie zabiegi klienta; resztę filtrujemy lokalnie
async function fetchClientBookings({ email, phone }) {
  const e = normEmail(email);
  const p = normPhone(phone);

  if (!e && !p) return { rows: [], reason: 'Brak e-maila/telefonu u klienta' };

  let q = sb.from('bookings_view')
    .select('*')                                // bierzemy wszystko, w tym 'notes'
    .order('when', { ascending: true });

  const parts = [];
  if (e) parts.push(`client_email.ilike.${e}`);
  if (p) parts.push(`phone.eq.${p}`);
  q = q.or(parts.join(','));

  const { data, error } = await q;
  if (error) return { rows: [], reason: error.message };
  return { rows: data || [], reason: null };
}


  // ===== RENDERERS =====
 function noteFor(r){
  // na wszelki wypadek złap też inne możliwe nazwy
  return r.notes ?? r.note ?? r.admin_notes ?? r.uwagi ?? r.comment ?? r.comments ?? r.remark ?? r.remarks ?? '';
}

async function renderUpcoming(){
  const out = await fetchClientBookings({ email: client.email, phone: client.phone });
  const tbody = document.getElementById('cd-upcoming-rows'); if (!tbody) return;

  if (out.reason && !out.rows.length) {
    tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(out.reason)}</td></tr>`;
    return;
  }

  const now = new Date();
  const rows = out.rows.filter(r => new Date(r.when) >= now && r.status !== 'Anulowana');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4">Brak nadchodzących</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(it => `
    <tr>
      <td>${fmtDatePL(it.when)}</td>
      <td>${escapeHtml(it.service_name || '-')}</td>
      <td>${escapeHtml(it.status || '-')}</td>
      <td>${escapeHtml(noteFor(it) || '-')}</td>
    </tr>
  `).join('');
}

async function renderHistory(){
  const out = await fetchClientBookings({ email: client.email, phone: client.phone });
  const tbody = document.getElementById('cd-history-rows'); if (!tbody) return;

  if (out.reason && !out.rows.length) {
    tbody.innerHTML = `<tr><td colspan="4">${escapeHtml(out.reason)}</td></tr>`;
    return;
  }

  const now = new Date();
  const rows = out.rows
    .filter(r => new Date(r.when) < now && r.status !== 'Anulowana')
    .sort((a,b) => new Date(b.when) - new Date(a.when));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4">Brak historii</td></tr>`;
    return;
  }

  // klucz notatki: preferuj booking_no; fallback: when|service
  const localNotes = (client.treatmentNotes || {});
  tbody.innerHTML = rows.map(it => {
    const key = it.booking_no || `${it.when}|${it.service_name||''}`;
    const curr = localNotes[key] || '';
    return `
      <tr data-key="${encodeURIComponent(key)}">
        <td>${fmtDatePL(it.when)}</td>
        <td>${escapeHtml(it.service_name || '-')}</td>
        <td>${escapeHtml(it.status || '-')}</td>
        <td>
          <div style="display:flex; gap:6px; align-items:flex-start">
            <textarea class="hist-note" rows="2" style="min-width:260px">${escapeHtml(curr)}</textarea>
            <button class="btn" data-save-hist="${encodeURIComponent(key)}">Zapisz</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function setBtnCount(id, baseLabel, n){
  const el = document.getElementById(id);
  if (el) el.textContent = `${baseLabel} (${n})`;
}

async function refreshCounts(){
  const out = await fetchClientBookings({ email: client.email, phone: client.phone });
  const now = new Date();
  const upcoming = out.rows.filter(r => new Date(r.when) >= now && r.status !== 'Anulowana').length;
  const history  = out.rows.filter(r => new Date(r.when) <  now && r.status !== 'Anulowana').length;
  setBtnCount('cd-btn-upcoming', 'Nadchodzące zabiegi', upcoming);
  setBtnCount('cd-btn-history',  'Historia zabiegów',   history);
}


  // ===== NOTES (lokalne) =====
  function loadNotesToForm(){
    $('#cd-prefs').value      = client.prefs || '';
    $('#cd-allergies').value  = client.allergies || '';
    $('#cd-contras').value    = client.contras || '';
    $('#cd-notes').value      = client.notes || '';
  }
  function saveNotesFromForm(){
    const list = clientsLoad();
    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) return;
    list[idx].prefs     = $('#cd-prefs')?.value || '';
    list[idx].allergies = $('#cd-allergies')?.value || '';
    list[idx].contras   = $('#cd-contras')?.value || '';
    list[idx].notes     = $('#cd-notes')?.value || '';
    clientsSave(list);
    client = list[idx]; // odśwież referencję
    alert('Zapisano.');
  }

  // ===== BUTTONS =====
renderUpcoming().then(() => showSection('cd-section-upcoming'));
refreshCounts(); // ← doda liczby do przycisków



  $('#cd-btn-upcoming')?.addEventListener('click', async () => {
    await renderUpcoming();
    showSection('cd-section-upcoming');
  });

  $('#cd-btn-history')?.addEventListener('click', async () => {
    await renderHistory();
    showSection('cd-section-history');
  });
// zapis uwag terapeutki w Historii (localStorage)
document.getElementById('cd-history-rows')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-save-hist]');
  if (!btn) return;
  const key = decodeURIComponent(btn.getAttribute('data-save-hist') || '');
  const tr = btn.closest('tr');
  const val = tr?.querySelector('.hist-note')?.value || '';

  const list = clientsLoad();
  const idx = list.findIndex(x => x.id === id);
  if (idx < 0) return;
  list[idx].treatmentNotes = list[idx].treatmentNotes || {};
  list[idx].treatmentNotes[key] = val;
  clientsSave(list);
  client = list[idx]; // odśwież referencję

  btn.textContent = 'Zapisano';
  setTimeout(() => { btn.textContent = 'Zapisz'; }, 1000);
});

  $('#cd-btn-contact')?.addEventListener('click', () => {
    showSection('cd-section-contact');
  });

  $('#cd-btn-notes')?.addEventListener('click', () => {
    loadNotesToForm();
    showSection('cd-section-notes');
  });

  $('#cd-save')?.addEventListener('click', saveNotesFromForm);

  $('#cd-btn-back')?.addEventListener('click', () => {
    // spróbuj zamknąć; jeśli przeglądarka blokuje, wróć do admin
    window.close();
    setTimeout(() => { location.href = 'admin.html#clients'; }, 200);
  });
  document.getElementById('cd-btn-suggestions')?.addEventListener('click', async () => {
  await renderSuggestions();
  showSection('cd-section-suggestions');
});

})();
