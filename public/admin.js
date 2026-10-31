(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const fmt = ts => { const d = new Date(ts); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const money = n => '$' + n;
  const app = $('#app');
  const state = { tab: 'stock', ticket: null, stats: null, filter: 'all' };

  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function api(path, method = 'GET', body) {
    const res = await fetch('/api' + path, {
      method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'HTTP ' + res.status), { code: data.code, status: res.status });
    return data;
  }

  const STATUS = { free: 'в наличии', reserved: 'бронь', sold: 'продан' };
  const ORDER_S = { pending: 'ждёт оплату', review: 'проверить оплату', paid: 'оплачен', delivered: 'выдан', expired: 'время вышло', rejected: 'отклонён' };
  const TICKET_S = { open: 'ждёт ответа', answered: 'отвечено', closed: 'закрыто' };

  /* ---------- вход ---------- */
  function renderLogin(msg) {
    app.innerHTML = `<div class="adm-card adm-login"><h2>Вход в админку</h2>${msg ? `<p class="err">${esc(msg)}</p>` : ''}
      <form id="lf" novalidate>
        <div class="field"><label for="lu">Логин</label><input id="lu" type="text" autocomplete="username" spellcheck="false" autocapitalize="off"></div>
        <div class="field"><label for="lp">Пароль</label><input id="lp" type="password" autocomplete="current-password"></div>
        <button class="btn btn--primary auth-submit" type="submit">Войти</button>
      </form></div>`;
    $('#lf').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('/login', 'POST', { username: $('#lu').value.trim(), password: $('#lp').value }); init(); }
      catch (ex) { renderLogin(ex.code === 'rate' ? 'Слишком много попыток.' : 'Неверный логин или пароль.'); }
    });
  }

  /* ---------- каркас ---------- */
  function shell(inner) {
    const s = state.stats;
    app.innerHTML = `
      <div class="adm-top"><h1>Админ-панель</h1>
        <div class="tabs" id="admTabs" role="group">
          ${[['stock', 'Сток'], ['orders', 'Заказы' + (s && s.review ? '<span class="adm-badge">' + s.review + '</span>' : '')], ['support', 'Поддержка' + (s && s.openTickets ? ' ' + s.openTickets : '')]]
            .map(([k, l]) => `<button type="button" class="chip" data-tab="${k}" aria-pressed="${state.tab === k}">${l}</button>`).join('')}
        </div></div>
      ${s ? `<div class="adm-stats">
        <div><small>В наличии</small><strong>${s.free}</strong></div><div><small>Продано</small><strong>${s.sold}</strong></div>
        <div><small>Выручка</small><strong>${money(s.revenue)}</strong></div><div><small>Покупателей</small><strong>${s.users}</strong></div></div>` : ''}
      <div id="admBody">${inner}</div>`;
    $('#admTabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      state.tab = b.dataset.tab; state.ticket = null; load();
    });
  }

  /* ---------- сток ---------- */
  async function loadStock() {
    const { items, stats } = await api('/admin/stock');
    state.stats = stats;
    const list = items.filter(i => state.filter === 'all' || i.cat === state.filter);
    shell(`
      <section class="adm-card">
        <h2>Добавить ники</h2>
        <p class="muted-text">По одному в строке: <code>ник | данные для выдачи</code>. Несколько строк данных в одной записи разделяй через <code>;;</code>.</p>
        <form id="addForm" novalidate>
          <div class="adm-row2">
            <div class="field"><label for="aCat">Категория</label>
              <select id="aCat"><option value="4l">4L</option><option value="4c">4C</option></select></div>
            <div class="field"><label for="aPrice">Цена, $</label><input id="aPrice" type="text" inputmode="numeric" value="30" autocomplete="off"></div>
          </div>
          <div class="field"><label for="aLines">Ники</label>
            <textarea id="aLines" rows="5" spellcheck="false" placeholder="abcd | login: mail@x.com;;pass: 12345"></textarea></div>
          <button class="btn btn--primary" type="submit">Добавить в сток</button>
        </form>
      </section>

      <section class="adm-card">
        <div class="adm-head"><h2>Сток <span class="muted-text">${list.length}</span></h2>
          <div class="tabs" id="flt">${[['all', 'Все'], ['4l', '4L'], ['4c', '4C']].map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${state.filter === k}">${l}</button>`).join('')}</div></div>
        <div class="adm-table">${list.length ? list.map(i => `
          <div class="adm-line" data-id="${i.id}">
            <span class="adm-nick"><span class="at">@</span>${esc(i.h)}</span>
            <span class="tag">${i.cat.toUpperCase()}</span>
            <input class="adm-price" type="text" inputmode="numeric" value="${i.price}" aria-label="Цена @${esc(i.h)}">
            <span class="status status--${i.status === 'sold' ? 'delivered' : i.status === 'reserved' ? 'pending' : ''}">${STATUS[i.status]}</span>
            <details class="adm-det"><summary>данные</summary><pre>${esc(i.secret)}</pre></details>
            <button class="btn btn--sm" type="button" data-del="${i.id}" ${i.status !== 'free' ? 'disabled' : ''}>Удалить</button>
          </div>`).join('') : '<p class="muted-text">Пусто.</p>'}</div>
      </section>`);

    $('#addForm').addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const r = await api('/admin/stock', 'POST', { cat: $('#aCat').value, price: Number($('#aPrice').value), lines: $('#aLines').value });
        toast('Добавлено: ' + r.added.length + (r.skipped.length ? '. Пропущено: ' + r.skipped.join(', ') : ''));
        loadStock();
      } catch (ex) { toast(ex.code === 'validation' ? 'Проверь цену (целое число) и категорию.' : 'Ошибка. Попробуй ещё раз.'); }
    });
    $('#flt').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { state.filter = b.dataset.f; loadStock(); } });
    $$('.adm-price').forEach(inp => inp.addEventListener('change', async () => {
      const id = inp.closest('.adm-line').dataset.id;
      try { await api('/admin/stock/' + id, 'POST', { price: Number(inp.value) }); toast('Цена сохранена'); }
      catch { toast('Цена должна быть целым числом'); loadStock(); }
    }));
    $$('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Удалить ник из стока?')) return;
      try { await api('/admin/stock/' + b.dataset.del + '/delete', 'POST', {}); loadStock(); }
      catch { toast('Нельзя удалить: ник в заказе или продан'); }
    }));
  }

  /* ---------- заказы ---------- */
  async function loadOrders() {
    const [{ orders }, st] = await Promise.all([api('/admin/orders'), api('/admin/stock')]);
    state.stats = st.stats;
    const row = o => `
      <div class="adm-line adm-line--o ${o.status === 'review' ? 'adm-line--review' : ''}">
        <strong>${esc(o.id)}</strong><span>${esc(o.username)}</span>
        <span class="adm-items">${o.items.map(h => '<span class="at">@</span>' + esc(h)).join(', ')}</span>
        <span>${money(o.total)} · ${esc(o.method.toUpperCase())}</span>
        <span class="status status--${o.status}">${ORDER_S[o.status]}</span><small class="muted-text">${fmt(o.claimedAt || o.createdAt)}</small>
        ${o.status === 'review' || o.status === 'pending' ? `<span class="adm-actions">
          <button class="btn btn--primary btn--sm" type="button" data-ok="${esc(o.id)}">Деньги пришли — выдать</button>
          <button class="btn btn--sm" type="button" data-no="${esc(o.id)}">Отклонить</button></span>` : ''}
      </div>`;
    const review = orders.filter(o => o.status === 'review'), rest = orders.filter(o => o.status !== 'review');
    shell(`
      <section class="adm-card"><h2>Ждут проверки оплаты <span class="muted-text">${review.length}</span></h2>
        <p class="muted-text">Клиент нажал «оплатил». Проверь, что деньги пришли, и подтверди — только тогда он получит данные.</p>
        <div class="adm-table">${review.length ? review.map(row).join('') : '<p class="muted-text">Новых заявок нет.</p>'}</div></section>
      <section class="adm-card"><h2>Все заказы</h2><div class="adm-table">${rest.length ? rest.map(row).join('') : '<p class="muted-text">Заказов пока нет.</p>'}</div></section>`);
    const act = (attr, path, ask) => $$('[' + attr + ']').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(ask)) return;
      b.disabled = true;
      try { await api('/admin/orders/' + b.getAttribute(attr) + '/' + path, 'POST', {}); toast(path === 'confirm' ? 'Заказ выдан клиенту' : 'Заказ отклонён'); }
      catch { toast('Не получилось (статус уже изменился?)'); }
      loadOrders();
    }));
    act('data-ok', 'confirm', 'Деньги точно пришли? Клиент сразу получит данные.');
    act('data-no', 'reject', 'Отклонить заказ? Ники вернутся в каталог.');
  }

  /* ---------- поддержка ---------- */
  async function loadSupport() {
    const { tickets } = await api('/admin/tickets');
    state.stats = state.stats || (await api('/admin/stock')).stats;
    state.stats.openTickets = tickets.filter(t => t.status === 'open').length;
    const cur = tickets.find(t => t.id === state.ticket);
    shell(`<div class="adm-split">
      <section class="adm-card adm-tl"><h2>Обращения</h2>${tickets.length ? tickets.map(t => `
        <button type="button" class="adm-t ${cur && cur.id === t.id ? 'is-on' : ''}" data-t="${esc(t.id)}">
          <span class="adm-t-top"><strong>${esc(t.subject)}</strong><span class="status status--${t.status === 'answered' ? 'delivered' : t.status}">${TICKET_S[t.status]}</span></span>
          <small class="muted-text">${esc(t.username)} · ${esc(t.id)} · ${fmt(t.updatedAt)}</small></button>`).join('') : '<p class="muted-text">Обращений нет.</p>'}</section>
      <section class="adm-card adm-tv">${cur ? `
        <div class="adm-head"><div><h2>${esc(cur.subject)}</h2><small class="muted-text">${esc(cur.username)} · ${esc(cur.id)}</small></div>
          ${cur.status !== 'closed' ? '<button class="btn btn--sm" type="button" id="closeT">Закрыть</button>' : ''}</div>
        <div class="msgs">${cur.messages.map(m => `<div class="msg msg--${m.from === 'admin' ? 'user' : 'admin'}"><b>${m.from === 'admin' ? 'Вы' : esc(cur.username)} · ${fmt(m.at)}</b><p>${esc(m.text)}</p></div>`).join('')}</div>
        <form id="rf" novalidate><div class="field"><textarea id="rt" rows="3" maxlength="2000" aria-label="Ответ"></textarea></div>
          <button class="btn btn--primary" type="submit">Ответить</button></form>` : '<p class="muted-text">Выбери обращение слева.</p>'}</section></div>`);
    $$('[data-t]').forEach(b => b.addEventListener('click', () => { state.ticket = b.dataset.t; loadSupport(); }));
    const rf = $('#rf');
    if (rf) {
      const box = $('.msgs'); box.scrollTop = box.scrollHeight;
      rf.addEventListener('submit', async e => {
        e.preventDefault();
        const text = $('#rt').value.trim(); if (!text) return;
        try { await api('/admin/tickets/' + cur.id + '/reply', 'POST', { text }); loadSupport(); } catch { toast('Не отправилось'); }
      });
      const c = $('#closeT');
      if (c) c.addEventListener('click', async () => { try { await api('/admin/tickets/' + cur.id + '/close', 'POST', {}); loadSupport(); } catch { toast('Ошибка'); } });
    }
  }

  async function load() {
    try {
      if (state.tab === 'stock') await loadStock();
      else if (state.tab === 'orders') await loadOrders();
      else await loadSupport();
    } catch (ex) {
      if (ex.status === 401 || ex.status === 403) return init();
      app.innerHTML = '<p class="err">Ошибка загрузки. Обнови страницу.</p>';
    }
  }

  async function init() {
    let me;
    try { me = (await api('/me')).user; } catch { me = null; }
    if (!me) return renderLogin();
    if (!me.admin) { app.innerHTML = '<div class="adm-card adm-login"><h2>Нет доступа</h2><p class="muted-text">У этого аккаунта нет прав администратора.</p><a class="btn" href="/">На сайт</a></div>'; return; }
    load();
  }

  /* ---------- уведомление о новых заказах ---------- */
  let lastReview = null;
  setInterval(async () => {
    if (document.hidden && lastReview === null) return;
    try {
      const { stats } = await api('/admin/stock');
      state.stats = stats;
      if (lastReview !== null && stats.review > lastReview) {
        toast('Новый заказ ждёт проверки оплаты: ' + stats.review);
        if (state.tab === 'orders') load();
      }
      lastReview = stats.review;
      document.title = (stats.review ? '(' + stats.review + ') ' : '') + 'Sniper | админ-панель';
    } catch { /* не залогинен — игнор */ }
  }, 8000);

  init();
})();
