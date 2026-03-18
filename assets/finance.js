(function () {
  'use strict';

  const STORAGE_KEY = 'adm_finance_v1';
  const SUPABASE_TABLE = 'finance_entries';
  const EMPTY_DATA = { income: [], expenses: [], orders: [] };

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let currentData = { ...EMPTY_DATA };
  let cloudMode = 'local';

  function cloneEmptyData() {
    return { income: [], expenses: [], orders: [] };
  }

  function loadLocalData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        income: Array.isArray(parsed.income) ? parsed.income : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders : []
      };
    } catch {
      return cloneEmptyData();
    }
  }

  function saveLocalData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      income: Array.isArray(data.income) ? data.income : [],
      expenses: Array.isArray(data.expenses) ? data.expenses : [],
      orders: Array.isArray(data.orders) ? data.orders : []
    }));
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'fin-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function monthKey(dateValue) {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function toAmount(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function currency(value) {
    return `${toAmount(value).toFixed(2)} zł`;
  }

  function getCurrentMonthValue() {
    const input = $('#finance-month');
    if (input && input.value) return input.value;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function filterByMonth(list, ym) {
    return list.filter((item) => monthKey(item.date) === ym);
  }

  function totalsForMonth(data, ym) {
    const income = filterByMonth(data.income, ym).reduce((sum, item) => sum + toAmount(item.amount), 0);
    const expenses = filterByMonth(data.expenses, ym).reduce((sum, item) => sum + toAmount(item.amount), 0);
    return {
      income,
      expenses,
      balance: income - expenses
    };
  }

  function ordersTotal(data) {
    return (data.orders || []).reduce((sum, item) => sum + toAmount(item.price), 0);
  }

  function normalizeCloudRows(rows) {
    const data = cloneEmptyData();

    for (const row of rows || []) {
      if (row.entry_type === 'income') {
        data.income.push({
          id: row.id,
          date: row.entry_date || '',
          category: row.category || '',
          amount: toAmount(row.amount),
          note: row.note || ''
        });
      }

      if (row.entry_type === 'expenses') {
        data.expenses.push({
          id: row.id,
          date: row.entry_date || '',
          category: row.category || '',
          amount: toAmount(row.amount),
          note: row.note || ''
        });
      }

      if (row.entry_type === 'orders') {
        data.orders.push({
          id: row.id,
          product: row.product || '',
          price: toAmount(row.price),
          link: row.link || ''
        });
      }
    }

    return data;
  }

  async function loadCloudData() {
    if (!window.sb) throw new Error('Brak klienta Supabase.');

    const { data, error } = await window.sb
      .from(SUPABASE_TABLE)
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return normalizeCloudRows(data || []);
  }

  async function refreshData() {
    try {
      currentData = await loadCloudData();
      saveLocalData(currentData);
      cloudMode = 'supabase';
    } catch (error) {
      console.warn('[finance] fallback local:', error?.message || error);
      currentData = loadLocalData();
      cloudMode = 'local';
    }
    render();
  }

  async function insertCloudRow(payload) {
    if (!window.sb) throw new Error('Brak klienta Supabase.');
    const { error } = await window.sb.from(SUPABASE_TABLE).insert(payload);
    if (error) throw error;
  }

  async function deleteCloudRow(id) {
    if (!window.sb) throw new Error('Brak klienta Supabase.');
    const { error } = await window.sb.from(SUPABASE_TABLE).delete().eq('id', id);
    if (error) throw error;
  }

  function renderMoneyRows(tbodyId, rows, emptyText, type) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5">${esc(emptyText)}</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map((item) => `
      <tr>
        <td>${esc(item.date)}</td>
        <td>${esc(item.category)}</td>
        <td>${esc(item.note || '-')}</td>
        <td>${currency(item.amount)}</td>
        <td>
          <button class="btn btn-cancel" data-finance-delete="${esc(item.id)}" data-finance-type="${esc(type)}">
            Usuń
          </button>
        </td>
      </tr>
    `).join('');
  }

  function renderOrdersList(rows) {
    const list = $('#finance-orders-list');
    if (!list) return;

    if (!rows.length) {
      list.innerHTML = '<li>Brak zamówień.</li>';
      return;
    }

    list.innerHTML = rows.map((item) => {
      const link = String(item.link || '').trim();
      const safeLink = /^https?:\/\//i.test(link) ? link : '';
      const linkHtml = safeLink
        ? ` <a href="${safeLink}" target="_blank" rel="noopener">sklep</a>`
        : '';
      return `
        <li>
          <strong>${esc(item.product)}</strong> — ${currency(item.price)}${linkHtml}
          <button class="btn btn-cancel" data-finance-delete="${esc(item.id)}" data-finance-type="orders" style="margin-left:8px;">Usuń</button>
        </li>
      `;
    }).join('');
  }

  function renderHistory(data, selectedMonth) {
    const tbody = $('#finance-history-rows');
    if (!tbody) return;

    const [year, month] = selectedMonth.split('-').map(Number);
    if (!year || !month) {
      tbody.innerHTML = '<tr><td colspan="4">Brak danych</td></tr>';
      return;
    }

    const rows = [];
    for (let offset = 11; offset >= 0; offset -= 1) {
      const date = new Date(year, month - 1 - offset, 1);
      const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const totals = totalsForMonth(data, ym);

      rows.push(`
        <tr>
          <td>${esc(ym)}</td>
          <td>${currency(totals.income)}</td>
          <td>${currency(totals.expenses)}</td>
          <td><strong>${currency(totals.balance)}</strong></td>
        </tr>
      `);
    }

    tbody.innerHTML = rows.join('');
  }

  function cloudBadge() {
    return cloudMode === 'supabase'
      ? '<span style="color:#166534;font-weight:600;">Chmura Supabase: aktywna</span>'
      : '<span style="color:#b45309;font-weight:600;">Tryb lokalny: brak połączenia z tabelą finance_entries</span>';
  }

  function render() {
    const root = $('#finance-root');
    if (!root) return;

    const selectedMonth = getCurrentMonthValue();
    const incomeRows = filterByMonth(currentData.income, selectedMonth).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const expenseRows = filterByMonth(currentData.expenses, selectedMonth).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const orderRows = (currentData.orders || []).slice();
    const totals = totalsForMonth(currentData, selectedMonth);
    const ordersSum = ordersTotal(currentData);

    root.innerHTML = `
      <div class="card stack" style="background:#fafafa;">
        <div class="row" style="justify-content:space-between;">
          <div class="stack">
            <label for="finance-month">Miesiąc</label>
            <input id="finance-month" type="month" value="${esc(selectedMonth)}" />
          </div>
          <div class="stack">
            <label>&nbsp;</label>
            <button id="finance-pdf-export" class="btn">Generuj PDF miesiąca</button>
          </div>
        </div>
        <div>${cloudBadge()}</div>

        <div class="row">
          <div class="card" style="flex:1; min-width:180px;">
            <h3 style="margin:0 0 8px;">Przychód</h3>
            <div style="font-size:28px; font-weight:700; color:#166534;">${currency(totals.income)}</div>
          </div>
          <div class="card" style="flex:1; min-width:180px;">
            <h3 style="margin:0 0 8px;">Wydatki</h3>
            <div style="font-size:28px; font-weight:700; color:#b91c1c;">${currency(totals.expenses)}</div>
          </div>
          <div class="card" style="flex:1; min-width:180px;">
            <h3 style="margin:0 0 8px;">Bilans</h3>
            <div style="font-size:28px; font-weight:700; color:${totals.balance >= 0 ? '#166534' : '#b91c1c'};">
              ${currency(totals.balance)}
            </div>
          </div>
        </div>
      </div>

      <div class="card stack">
        <h3 style="margin:0;">Dodaj przychód</h3>
        <div class="row">
          <input id="finance-income-date" type="date" />
          <input id="finance-income-category" type="text" placeholder="Np. masaż / zabieg" />
          <input id="finance-income-amount" type="number" step="0.01" min="0" placeholder="Kwota" />
          <input id="finance-income-note" type="text" placeholder="Notatka" />
          <button id="finance-income-add" class="btn btn-confirm">Dodaj przychód</button>
        </div>
      </div>

      <div class="card stack">
        <h3 style="margin:0;">Dodaj wydatek</h3>
        <div class="row">
          <input id="finance-expense-date" type="date" />
          <input id="finance-expense-category" type="text" placeholder="Np. paliwo / kosmetyki / dodatki" />
          <input id="finance-expense-amount" type="number" step="0.01" min="0" placeholder="Kwota" />
          <input id="finance-expense-note" type="text" placeholder="Notatka" />
          <button id="finance-expense-add" class="btn">Dodaj wydatek</button>
        </div>
      </div>

      <div class="card stack">
        <h3 style="margin:0;">Zamówienia</h3>
        <div class="row">
          <input id="finance-order-product" type="text" placeholder="Produkt" />
          <input id="finance-order-price" type="number" step="0.01" min="0" placeholder="Cena" />
          <input id="finance-order-link" type="url" placeholder="Link do sklepu" style="min-width:260px; flex:1;" />
          <button id="finance-order-add" class="btn">Dodaj zamówienie</button>
        </div>
        <p style="margin:0; color:#666;">Łączna wartość zamówień: <strong>${currency(ordersSum)}</strong></p>
        <ul id="finance-orders-list" style="margin:0; padding-left:20px;"></ul>
      </div>

      <div class="card stack">
        <h3 style="margin:0;">Przychody w miesiącu</h3>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Kategoria</th>
              <th>Opis</th>
              <th>Kwota</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody id="finance-income-rows"></tbody>
        </table>
      </div>

      <div class="card stack">
        <h3 style="margin:0;">Wydatki w miesiącu</h3>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Kategoria</th>
              <th>Opis</th>
              <th>Kwota</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody id="finance-expense-rows"></tbody>
        </table>
      </div>

      <div class="card stack">
        <h3 style="margin:0;">Historia 12 miesięcy</h3>
        <table>
          <thead>
            <tr>
              <th>Miesiąc</th>
              <th>Przychód</th>
              <th>Wydatki</th>
              <th>Bilans</th>
            </tr>
          </thead>
          <tbody id="finance-history-rows"></tbody>
        </table>
      </div>
    `;

    const today = new Date().toISOString().slice(0, 10);
    $('#finance-income-date').value = today;
    $('#finance-expense-date').value = today;

    renderMoneyRows('finance-income-rows', incomeRows, 'Brak przychodów w tym miesiącu.', 'income');
    renderMoneyRows('finance-expense-rows', expenseRows, 'Brak wydatków w tym miesiącu.', 'expenses');
    renderOrdersList(orderRows);
    renderHistory(currentData, selectedMonth);
    wireActions();
  }

  function exportMonthPdf() {
    const selectedMonth = getCurrentMonthValue();
    const incomeRows = filterByMonth(currentData.income, selectedMonth);
    const expenseRows = filterByMonth(currentData.expenses, selectedMonth);
    const totals = totalsForMonth(currentData, selectedMonth);

    const reportWindow = window.open('', '_blank', 'width=960,height=800');
    if (!reportWindow) {
      alert('Przeglądarka zablokowała okno raportu PDF.');
      return;
    }

    const rowHtml = (item) => `
      <tr>
        <td>${esc(item.date || '-')}</td>
        <td>${esc(item.category || '-')}</td>
        <td>${esc(item.note || '-')}</td>
        <td>${currency(item.amount)}</td>
      </tr>`;

    reportWindow.document.write(`<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <title>Raport finansowy ${esc(selectedMonth)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
    h1, h2 { margin-bottom: 8px; }
    .summary { margin: 16px 0 24px; padding: 12px; border: 1px solid #ddd; border-radius: 10px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>Massages & Spa Clinical</h1>
  <h2>Raport finansowy za ${esc(selectedMonth)}</h2>
  <div class="summary">
    <p><strong>Przychody:</strong> ${currency(totals.income)}</p>
    <p><strong>Wydatki:</strong> ${currency(totals.expenses)}</p>
    <p><strong>Bilans:</strong> ${currency(totals.balance)}</p>
  </div>

  <h2>Przychody</h2>
  <table>
    <thead>
      <tr><th>Data</th><th>Kategoria</th><th>Opis</th><th>Kwota</th></tr>
    </thead>
    <tbody>
      ${incomeRows.length ? incomeRows.map(rowHtml).join('') : '<tr><td colspan="4">Brak przychodów w wybranym miesiącu.</td></tr>'}
    </tbody>
  </table>

  <h2>Wydatki</h2>
  <table>
    <thead>
      <tr><th>Data</th><th>Kategoria</th><th>Opis</th><th>Kwota</th></tr>
    </thead>
    <tbody>
      ${expenseRows.length ? expenseRows.map(rowHtml).join('') : '<tr><td colspan="4">Brak wydatków w wybranym miesiącu.</td></tr>'}
    </tbody>
  </table>
</body>
</html>`);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  }

  async function addMoneyEntry(type) {
    const isIncome = type === 'income';
    const prefix = isIncome ? 'finance-income' : 'finance-expense';

    const date = $(`#${prefix}-date`)?.value || '';
    const category = $(`#${prefix}-category`)?.value || '';
    const amount = toAmount($(`#${prefix}-amount`)?.value || 0);
    const note = $(`#${prefix}-note`)?.value || '';

    if (!date || !category.trim() || amount <= 0) {
      alert('Uzupełnij datę, kategorię i poprawną kwotę.');
      return;
    }

    const item = {
      id: uid(),
      date,
      category: category.trim(),
      amount,
      note: note.trim()
    };

    currentData[type].push(item);
    saveLocalData(currentData);

    try {
      await insertCloudRow({
        id: item.id,
        entry_type: type,
        entry_date: item.date,
        category: item.category,
        amount: item.amount,
        note: item.note
      });
      cloudMode = 'supabase';
    } catch (error) {
      cloudMode = 'local';
      alert(`Zapisano lokalnie. Supabase błąd: ${error?.message || error}`);
    }

    render();
  }

  async function addOrder() {
    const product = $('#finance-order-product')?.value || '';
    const price = toAmount($('#finance-order-price')?.value || 0);
    const link = $('#finance-order-link')?.value || '';

    if (!product.trim() || price <= 0) {
      alert('Uzupełnij nazwę produktu i poprawną cenę.');
      return;
    }

    const item = {
      id: uid(),
      product: product.trim(),
      price,
      link: link.trim()
    };

    currentData.orders.push(item);
    saveLocalData(currentData);

    try {
      await insertCloudRow({
        id: item.id,
        entry_type: 'orders',
        product: item.product,
        price: item.price,
        link: item.link
      });
      cloudMode = 'supabase';
    } catch (error) {
      cloudMode = 'local';
      alert(`Zapisano lokalnie. Supabase błąd: ${error?.message || error}`);
    }

    render();
  }

  async function deleteEntry(type, id) {
    currentData[type] = currentData[type].filter((item) => item.id !== id);
    saveLocalData(currentData);

    try {
      await deleteCloudRow(id);
      cloudMode = 'supabase';
    } catch (error) {
      cloudMode = 'local';
      alert(`Usunięto lokalnie. Supabase błąd: ${error?.message || error}`);
    }

    render();
  }

  function wireActions() {
    $('#finance-month')?.addEventListener('change', render);
    $('#finance-pdf-export')?.addEventListener('click', exportMonthPdf);
    $('#finance-income-add')?.addEventListener('click', () => addMoneyEntry('income'));
    $('#finance-expense-add')?.addEventListener('click', () => addMoneyEntry('expenses'));
    $('#finance-order-add')?.addEventListener('click', addOrder);

    $('#finance-root')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-finance-delete]');
      if (!button) return;

      const id = button.dataset.financeDelete;
      const type = button.dataset.financeType;
      if (!id || !type) return;

      if (!confirm('Usunąć ten wpis?')) return;
      deleteEntry(type, id);
    });
  }

  function init() {
    refreshData();
  }

  window.AdminFinance = {
    init,
    refresh: refreshData
  };
})();
