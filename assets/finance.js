(function () {
  'use strict';

  const STORAGE_KEY = 'adm_finance_v1';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        income: Array.isArray(parsed.income) ? parsed.income : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        orders: Array.isArray(parsed.orders) ? parsed.orders : []
      };
    } catch {
      return { income: [], expenses: [], orders: [] };
    }
  }

  function saveData(data) {
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
    const orders = filterByMonth(data.orders, ym).reduce((sum, item) => sum + toAmount(item.price), 0);
    return {
      income,
      expenses,
      orders,
      balance: income - expenses - orders
    };
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

  function renderOrderRows(rows) {
    const tbody = $('#finance-orders-rows');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5">Brak zamówień w tym miesiącu.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((item) => {
      const link = String(item.link || '').trim();
      const safeLink = /^https?:\/\//i.test(link) ? link : '';
      return `
        <tr>
          <td>${esc(item.date)}</td>
          <td>${esc(item.product)}</td>
          <td>${currency(item.price)}</td>
          <td>${safeLink ? `<a href="${safeLink}" target="_blank" rel="noopener">${esc(link)}</a>` : '-'}</td>
          <td>
            <button class="btn btn-cancel" data-finance-delete="${esc(item.id)}" data-finance-type="orders">
              Usuń
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderHistory(data, selectedMonth) {
    const tbody = $('#finance-history-rows');
    if (!tbody) return;

    const [year, month] = selectedMonth.split('-').map(Number);
    if (!year || !month) {
      tbody.innerHTML = '<tr><td colspan="5">Brak danych</td></tr>';
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
          <td>${currency(totals.orders)}</td>
          <td><strong>${currency(totals.balance)}</strong></td>
        </tr>
      `);
    }

    tbody.innerHTML = rows.join('');
  }

  function render() {
    const root = $('#finance-root');
    if (!root) return;

    const data = loadData();
    const selectedMonth = getCurrentMonthValue();
    const incomeRows = filterByMonth(data.income, selectedMonth).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const expenseRows = filterByMonth(data.expenses, selectedMonth).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const orderRows = filterByMonth(data.orders, selectedMonth).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const totals = totalsForMonth(data, selectedMonth);

    root.innerHTML = `
      <div class="card stack" style="background:#fafafa;">
        <div class="row">
          <div class="stack">
            <label for="finance-month">Miesiąc</label>
            <input id="finance-month" type="month" value="${esc(selectedMonth)}" />
          </div>
        </div>

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
            <h3 style="margin:0 0 8px;">Zamówienia</h3>
            <div style="font-size:28px; font-weight:700; color:#9a3412;">${currency(totals.orders)}</div>
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
          <input id="finance-order-date" type="date" />
          <input id="finance-order-product" type="text" placeholder="Produkt" />
          <input id="finance-order-price" type="number" step="0.01" min="0" placeholder="Cena" />
          <input id="finance-order-link" type="url" placeholder="Link do sklepu" style="min-width:260px; flex:1;" />
          <button id="finance-order-add" class="btn">Dodaj zamówienie</button>
        </div>
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
        <h3 style="margin:0;">Lista zamówień w miesiącu</h3>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Produkt</th>
              <th>Cena</th>
              <th>Link do sklepu</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody id="finance-orders-rows"></tbody>
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
              <th>Zamówienia</th>
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
    $('#finance-order-date').value = today;

    renderMoneyRows('finance-income-rows', incomeRows, 'Brak przychodów w tym miesiącu.', 'income');
    renderMoneyRows('finance-expense-rows', expenseRows, 'Brak wydatków w tym miesiącu.', 'expenses');
    renderOrderRows(orderRows);
    renderHistory(data, selectedMonth);
    wireActions();
  }

  function addMoneyEntry(type) {
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

    const data = loadData();
    data[type].push({
      id: uid(),
      date,
      category: category.trim(),
      amount,
      note: note.trim()
    });
    saveData(data);
    render();
  }

  function addOrder() {
    const date = $('#finance-order-date')?.value || '';
    const product = $('#finance-order-product')?.value || '';
    const price = toAmount($('#finance-order-price')?.value || 0);
    const link = $('#finance-order-link')?.value || '';

    if (!date || !product.trim() || price <= 0) {
      alert('Uzupełnij datę, nazwę produktu i poprawną cenę.');
      return;
    }

    const data = loadData();
    data.orders.push({
      id: uid(),
      date,
      product: product.trim(),
      price,
      link: link.trim()
    });
    saveData(data);
    render();
  }

  function deleteEntry(type, id) {
    const data = loadData();
    data[type] = data[type].filter((item) => item.id !== id);
    saveData(data);
    render();
  }

  function wireActions() {
    $('#finance-month')?.addEventListener('change', render);
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
    render();
  }

  window.AdminFinance = {
    init
  };
})();
