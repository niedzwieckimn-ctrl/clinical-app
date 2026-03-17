const AUTH_KEY = 'adm_ok';


  // --- UTIL -----------------------------------------------------------------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString('pl-PL', { dateStyle:'medium', timeStyle:'short' }); } catch { return iso||''; } };
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toTelHref(phone){
  const num = String(phone||'').replace(/[^\d+]/g,''); // tylko cyfry i +
  return num ? `tel:${num}` : '';
}
function toMailHref(email, subject='Rezerwacja potwierdzona'){
  const e = String(email||'').trim();
  return e ? `mailto:${encodeURIComponent(e)}?subject=${encodeURIComponent(subject)}` : '';
}
function toMapsHref(address){
  const a = String(address||'').trim();
  return a ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}` : '';
}

  // --- TABS -----------------------------------------------------------------
  function showNav() { const nav = $('#top-tabs'); if (nav) nav.style.display = ''; }
  function showTab(name) {
    const ids = ['bookings','slots','clients','settings'];
    const ids = ['bookings','slots','clients','reports','settings'];
    for (const id of ids) {
      const el = document.getElementById(id+'-screen');
      if (el) el.classList.toggle('hidden', id !== name);
    }
    if      (name==='bookings') initBookings();
    else if (name==='slots')    loadSlots();
    else if (name==='clients')  window.Clients?.render();
    else if (name==='settings') loadSettings();
    else if (name==='reports')  initReports();
    else if (name==='settings' && typeof loadSettings === 'function') loadSettings();
  }
  (function wireTabs(){
    $('#top-tabs')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (!btn) return;
      showTab(btn.dataset.tab);
    });
  })();

  // --- LOGIN ----------------------------------------------------------------
  function wireLogin() {
    const pinScr  = $('#pin-screen');
    const bookScr = document.getElementById('bookings-screen') || document.getElementById('list-screen');

    async function afterLogin() {
      pinScr?.classList.add('hidden');
      bookScr?.classList.remove('hidden');
      showNav();
      showTab('bookings');
    }

    if (localStorage.getItem(AUTH_KEY) === '1') { afterLogin(); return; }

    const btn = $('#pin-btn'), inp = $('#pin-input'), err = $('#pin-err');
    const enter = async () => {
@@ -321,50 +322,424 @@ for (const b of list) {

  const { data, error } = await window.sb
    .from('slots')
    .select('id, when, taken')
    .gte('when', nowIso)                // <— POKAZUJEMY TYLKO PRZYSZŁE
    .order('when', { ascending:true });

  if (error) { tbody.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`; return; }

  tbody.innerHTML = '';
  for (const s of (data || [])) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtWhen(s.when)}</td>
      <td>${s.taken ? 'Zajęty' : 'Wolny'}</td>
      <td><button class="btn" data-slot-del="${s.id}" ${s.taken ? 'disabled':''}>Usuń</button></td>`;
    tbody.appendChild(tr);
  }

  if (!data || data.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="3">Brak przyszłych terminów</td>';
    tbody.appendChild(tr);
  }
}


// =============== RAPORTY PDF ===============
const EXPENSES_KEY = 'adm_expenses_v1';
let reportsState = { rows: [], summary: null, expenses: [] };

function getMonthRange(monthValue) {
  const [y, m] = String(monthValue || '').split('-').map(Number);
  if (!y || !m) return null;
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { startIso: start.toISOString(), endIso: end.toISOString(), label: `${String(m).padStart(2, '0')}-${y}`, ym: `${y}-${String(m).padStart(2, '0')}` };
}

function expensesLoad() {
  try {
    const raw = localStorage.getItem(EXPENSES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function expensesSave(list) {
  localStorage.setItem(EXPENSES_KEY, JSON.stringify(list || []));
}

function monthKeyFromDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthExpenses(monthValue) {
  return expensesLoad().filter((e) => monthKeyFromDate(e.date) === monthValue);
}

function pickAmount(row) {
  const candidates = [row.service_price, row.price, row.amount, row.total, row.revenue];
  for (const val of candidates) {
    const n = Number(val);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

async function fetchMonthlyReport(monthValue) {
  const range = getMonthRange(monthValue);
  if (!range) throw new Error('Niepoprawny miesiąc.');

  const { data, error } = await window.sb
    .from('bookings_view')
    .select('booking_no, when, client_name, service_name, status, service_price, price, amount, total, revenue')
    .gte('when', range.startIso)
    .lt('when', range.endIso)
    .order('when', { ascending: true });

  if (error) throw error;

  const rows = (data || []).map((row) => ({ ...row, calcAmount: pickAmount(row) }));
  const confirmed = rows.filter((r) => String(r.status || '').toLowerCase().includes('potwier'));
  const canceled = rows.filter((r) => String(r.status || '').toLowerCase().includes('anul'));
  const expenses = monthExpenses(range.ym);
  const expensesTotal = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

  return {
    rows,
    expenses,
    summary: {
      totalCount: rows.length,
      confirmedCount: confirmed.length,
      canceledCount: canceled.length,
      revenue: confirmed.reduce((a, b) => a + b.calcAmount, 0),
      expenses: expensesTotal,
      rangeLabel: range.label,
      ym: range.ym
    }
  };
}

function renderExpensesRows() {
  const tbody = document.getElementById('expense-rows');
  if (!tbody) return;
  const expenses = reportsState.expenses || [];
  tbody.innerHTML = '';
  if (!expenses.length) {
    tbody.innerHTML = '<tr><td colspan="5">Brak wydatków w miesiącu.</td></tr>';
    return;
  }

  for (const e of expenses.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(e.date || '-')}</td>
      <td>${esc(e.category || '-')}</td>
      <td>${esc(e.note || '-')}</td>
      <td>${(Number(e.amount) || 0).toFixed(2)} zł</td>
      <td><button class="btn btn-cancel" data-expense-del="${esc(e.id)}">Usuń</button></td>`;
    tbody.appendChild(tr);
  }
}

async function renderBalanceHistory() {
  const tbody = document.getElementById('balance-history-rows');
  const month = document.getElementById('report-month')?.value;
  if (!tbody || !month) return;

  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 12, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, mon, 1, 0, 0, 0));

  const { data, error } = await window.sb
    .from('bookings_view')
    .select('when, status, service_price, price, amount, total, revenue')
    .gte('when', start.toISOString())
    .lt('when', end.toISOString())
    .order('when', { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4">${esc(error.message)}</td></tr>`;
    return;
  }

  const revMap = new Map();
  for (const row of (data || [])) {
    const ym = String(row.when || '').slice(0, 7);
    if (!String(row.status || '').toLowerCase().includes('potwier')) continue;
    revMap.set(ym, (revMap.get(ym) || 0) + pickAmount(row));
  }

  const expMap = new Map();
  for (const e of expensesLoad()) {
    const ym = monthKeyFromDate(e.date);
    if (!ym) continue;
    expMap.set(ym, (expMap.get(ym) || 0) + (Number(e.amount) || 0));
  }

  tbody.innerHTML = '';
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(year, mon - 1 - i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
    const revenue = revMap.get(ym) || 0;
    const expenses = expMap.get(ym) || 0;
    const balance = revenue - expenses;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${label}</td>
      <td>${revenue.toFixed(2)} zł</td>
      <td>${expenses.toFixed(2)} zł</td>
      <td><b>${balance.toFixed(2)} zł</b></td>`;
    tbody.appendChild(tr);
  }
}

function renderMonthlyReport() {
  const tbody = document.getElementById('report-rows');
  const sum = document.getElementById('report-summary');
  if (!tbody || !sum) return;

  const correction = Number(document.getElementById('report-extra-costs')?.value || 0) || 0;
  const notes = (document.getElementById('report-notes')?.value || '').trim();
  const { rows, summary } = reportsState;

  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5">Brak danych dla wybranego miesiąca.</td></tr>';
  } else {
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtWhen(row.when)}</td>
        <td>${esc(row.client_name || '-')}</td>
        <td>${esc(row.service_name || '-')}</td>
        <td>${row.calcAmount.toFixed(2)} zł</td>
        <td>${esc(row.status || '-')}</td>`;
      tbody.appendChild(tr);
    }
  }

  renderExpensesRows();

  if (!summary) {
    sum.textContent = 'Wybierz miesiąc i kliknij „Przelicz podsumowanie”.';
    return;
  }

  const totalCosts = summary.expenses + correction;
  const profit = summary.revenue - totalCosts;
  sum.innerHTML = `
    Miesiąc: <b>${summary.rangeLabel}</b> • Wizyty: <b>${summary.totalCount}</b> •
    Potwierdzone: <b>${summary.confirmedCount}</b> • Anulowane: <b>${summary.canceledCount}</b><br>
    Przychód: <b>${summary.revenue.toFixed(2)} zł</b> • Wydatki: <b>${summary.expenses.toFixed(2)} zł</b> • Korekta: <b>${correction.toFixed(2)} zł</b> •
    Bilans: <b>${profit.toFixed(2)} zł</b>${notes ? `<br>Notatki: ${esc(notes)}` : ''}`;
}

function buildPdfDoc() {
  const jspdf = window.jspdf?.jsPDF;
  if (!jspdf) throw new Error('Biblioteka jsPDF nie została załadowana.');
  if (!reportsState.summary) throw new Error('Najpierw przelicz podsumowanie.');

  const doc = new jspdf();
  const correction = Number(document.getElementById('report-extra-costs')?.value || 0) || 0;
  const notes = (document.getElementById('report-notes')?.value || '').trim();
  const { rows, expenses, summary } = reportsState;
  const totalCosts = summary.expenses + correction;
  const profit = summary.revenue - totalCosts;

  let y = 14;
  doc.setFontSize(14);
  doc.text('Massages & Spa Clinical', 10, y);
  y += 6;
  doc.text(`Raport miesięczny: ${summary.rangeLabel}`, 10, y);
  y += 8;
  doc.setFontSize(11);
  doc.text(`Przychód: ${summary.revenue.toFixed(2)} zł | Wydatki: ${summary.expenses.toFixed(2)} zł | Korekta: ${correction.toFixed(2)} zł | Bilans: ${profit.toFixed(2)} zł`, 10, y, { maxWidth: 190 });
  y += 8;

  if (notes) {
    doc.text(`Notatki: ${notes}`, 10, y, { maxWidth: 190 });
    y += 8;
  }

  doc.setFontSize(10);
  doc.text('Wizyty:', 10, y);
  y += 6;
  for (const row of rows) {
    if (y > 280) { doc.addPage(); y = 14; }
    const line = `${fmtWhen(row.when)} | ${row.client_name || '-'} | ${row.service_name || '-'} | ${row.calcAmount.toFixed(2)} zł | ${row.status || '-'}`;
    doc.text(line, 10, y, { maxWidth: 190 });
    y += 6;
  }

  if (expenses.length) {
    if (y > 260) { doc.addPage(); y = 14; }
    y += 4;
    doc.text('Wydatki:', 10, y);
    y += 6;
    for (const e of expenses) {
      if (y > 280) { doc.addPage(); y = 14; }
      doc.text(`${e.date} | ${e.category} | ${(Number(e.amount) || 0).toFixed(2)} zł | ${e.note || '-'}`, 10, y, { maxWidth: 190 });
      y += 6;
    }
  }

  return { doc, fileName: `raport-${summary.rangeLabel}.pdf` };
}

async function refreshMonthlyReport() {
  const month = document.getElementById('report-month')?.value;
  if (!month) {
    alert('Wybierz miesiąc.');
    return;
  }
  reportsState = await fetchMonthlyReport(month);
  renderMonthlyReport();
  await renderBalanceHistory();
}

async function savePdfWithPicker() {
  const { doc, fileName } = buildPdfDoc();
  if (!window.showSaveFilePicker) {
    doc.save(fileName);
    return false;
  }

  const handle = await window.showSaveFilePicker({
    suggestedName: fileName,
    types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
  });
  const writable = await handle.createWritable();
  await writable.write(doc.output('arraybuffer'));
  await writable.close();
  return true;
}

function initReports() {
  const monthEl = document.getElementById('report-month');
  if (monthEl && !monthEl.value) {
    const d = new Date();
    monthEl.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const dateEl = document.getElementById('expense-date');
  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().slice(0, 10);
  }

  renderMonthlyReport();
  refreshMonthlyReport().catch((err) => console.warn('initReports warn:', err?.message || err));
}

function addExpense() {
  const date = document.getElementById('expense-date')?.value;
  const category = document.getElementById('expense-category')?.value || 'Inne';
  const amount = Number(document.getElementById('expense-amount')?.value || 0);
  const note = (document.getElementById('expense-note')?.value || '').trim();

  if (!date || !amount) {
    alert('Podaj datę i kwotę wydatku.');
    return false;
  }

  const list = expensesLoad();
  list.push({ id: uid(), date, category, amount, note });
  expensesSave(list);

  document.getElementById('expense-amount').value = '';
  document.getElementById('expense-note').value = '';
  return true;
}

function wireReports() {
  document.getElementById('report-refresh')?.addEventListener('click', async () => {
    try {
      await refreshMonthlyReport();
    } catch (err) {
      alert(`Błąd raportu: ${err?.message || err}`);
    }
  });

  document.getElementById('report-download')?.addEventListener('click', async () => {
    try {
      const { doc, fileName } = buildPdfDoc();
      doc.save(fileName);
    } catch (err) {
      alert(`Błąd PDF: ${err?.message || err}`);
    }
  });

  document.getElementById('report-autosave')?.addEventListener('click', async () => {
    try {
      const saved = await savePdfWithPicker();
      if (!saved) alert('Przeglądarka nie wspiera autozapisu bez pytania. Użyłem standardowego pobierania.');
    } catch (err) {
      alert(`Autzapis nieudany: ${err?.message || err}`);
    }
  });

  document.getElementById('expense-add')?.addEventListener('click', async () => {
    if (!addExpense()) return;
    try {
      await refreshMonthlyReport();
    } catch (err) {
      alert(`Błąd odświeżania: ${err?.message || err}`);
    }
  });

  document.getElementById('expense-rows')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-expense-del]');
    if (!btn) return;
    const id = btn.dataset.expenseDel;
    const list = expensesLoad().filter((x) => x.id !== id);
    expensesSave(list);
    try {
      await refreshMonthlyReport();
    } catch (err) {
      alert(`Błąd odświeżania: ${err?.message || err}`);
    }
  });

  document.getElementById('report-extra-costs')?.addEventListener('input', renderMonthlyReport);
  document.getElementById('report-notes')?.addEventListener('input', renderMonthlyReport);
  document.getElementById('report-month')?.addEventListener('change', async () => {
    try {
      await refreshMonthlyReport();
    } catch (err) {
      alert(`Błąd raportu: ${err?.message || err}`);
    }
  });
}

// =============== KLIENCI ===============

const CLIENTS_LS_KEY = 'adm_clients_v1';
const CLIENTS_EXPORT_VERSION = 2;

// Model klienta
function clientNew() {
  return {
    id: cryptoRandId(),
    name: '', email: '', phone: '', address: '',
    prefs: '', allergies: '', contras: '', notes: '',
    treatmentNotes: {} // notatki przypięte do booking_no
  };
}

// localStorage helpers
function clientsLoad() {
  try {
    const raw = localStorage.getItem(CLIENTS_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function clientsSave(list) {
  localStorage.setItem(CLIENTS_LS_KEY, JSON.stringify(list || []));
}
@@ -595,30 +970,31 @@ function wireClients() {
      const dt = new Date(when);
      dt.setSeconds(0,0);
      const m = dt.getMinutes();
      const rounded = Math.round(m/15)*15;
      dt.setMinutes(rounded);
      const { error } = await window.sb.from('slots').insert({ when: dt.toISOString(), taken: false });
      if (error) { alert(error.message); return; }
      $('#slot-date').value = '';
      loadSlots();
    });

    $('#slots-rows')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-slot-del]'); if (!btn) return;
      const id = btn.getAttribute('data-slot-del');
      if (!confirm('Usunąć ten wolny termin?')) return;
      const { error } = await window.sb.from('slots').delete().eq('id', id).eq('taken', false);
      if (error) { alert(error.message); return; }
      loadSlots();
    });
  })();

  // --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  wireLogin();
  wireClients();
  wireReports();
  window.Clients?.init();
});

/* removed legacy {fname} */
})();
