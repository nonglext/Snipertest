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
  function tabLabels() {
    const s = state.stats;
    return [['stock', 'Сток'],
      ['orders', 'Заказы' + (s && s.review ? '<span class="adm-badge">' + s.review + '</span>' : '')],
      ['support', 'Поддержка' + (s && s.openTickets ? '<span class="adm-badge">' + s.openTickets + '</span>' : '')]];
  }
  function paintTabs() {
    const box = $('#admTabs'); if (!box) return;
    tabLabels().forEach(([k, l]) => { const b = box.querySelector('[data-tab="' + k + '"]'); if (b) b.innerHTML = l; });
    const n = (state.stats && state.stats.review) || 0;
    document.title = (n ? '(' + n + ') ' : '') + 'Sniper | админ-панель';
  }
  function shell(inner) {
    const s = state.stats;
    app.innerHTML = `
      <div class="adm-top"><h1>Админ-панель</h1>
        <div class="tabs" id="admTabs" role="group">
          ${tabLabels().map(([k, l]) => `<button type="button" class="chip" data-tab="${k}" aria-pressed="${state.tab === k}">${l}</button>`).join('')}
        </div></div>
      ${s ? `<div class="adm-stats">
        <div><small>В наличии</small><strong>${s.free}</strong></div><div><small>Продано</small><strong>${s.sold}</strong></div>
        <div><small>Выручка</small><strong>${money(s.revenue)}</strong></div><div><small>Покупателей</small><strong>${s.users}</strong></div></div>` : ''}
      <div id="admBody">${inner}</div>`;
    paintTabs();
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
        <p class="muted-text">По одному в строке: <code>ник | данные для выдачи</code>. Несколько строк данных в одной записи разделяй через <code>;;</code>. Данные можно не указывать: ник попадёт в каталог, а данные ты впишешь, когда придёт заказ.</p>
        <form id="addForm" novalidate>
          <div class="adm-row2">
            <div class="field"><label for="aCat">Категория</label>
              <select id="aCat"><option value="4l">4L</option><option value="4c">4C</option></select></div>
            <div class="field"><label for="aPrice">Цена, $</label><input id="aPrice" type="text" inputmode="numeric" value="30" autocomplete="off"></div>
          </div>
          <div class="field"><label for="aLines">Ники</label>
            <textarea id="aLines" rows="5" spellcheck="false" placeholder="abcd | login: mail@x.com;;pass: 12345&#10;efgh   ← можно без данных, впишешь при заказе"></textarea></div>
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
            ${i.secret ? `<details class="adm-det"><summary>данные</summary><pre>${esc(i.secret)}</pre></details>` : '<span class="tag tag--warn">нет данных</span>'}
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
    const itemsOf = o => o.items.map(i => '<span class="at">@</span>' + esc(i.h)).join(', ');
    const row = o => {
      const open = o.status === 'review' || o.status === 'pending';
      return `
      <div class="adm-order ${o.status === 'review' ? 'adm-line--review' : ''}" data-oid="${esc(o.id)}">
        <div class="adm-order-top">
          <strong>${esc(o.id)}</strong><span>${esc(o.username)}</span>
          <span class="adm-items">${itemsOf(o)}</span>
          <span>${money(o.total)} · ${esc(o.method.toUpperCase())}</span>
          <span class="status status--${o.status}">${ORDER_S[o.status]}</span><small class="muted-text">${fmt(o.claimedAt || o.createdAt)}</small>
        </div>
        ${open ? `<div class="adm-deliver">
          ${o.items.map(i => `<div class="adm-dl">
            <label><span class="at">@</span>${esc(i.h)} <button class="btn btn--sm" type="button" data-copy="${esc(i.h)}">копировать ник</button></label>
            <textarea rows="2" spellcheck="false" data-dl="${i.id}" placeholder="данные выдачи: login: ...;;pass: ...">${esc(i.secret.replace(/\n/g, ';;'))}</textarea></div>`).join('')}
          <div class="adm-actions">
            <button class="btn btn--primary btn--sm" type="button" data-ok="${esc(o.id)}">Деньги пришли — выдать</button>
            <button class="btn btn--sm" type="button" data-no="${esc(o.id)}">Отклонить</button></div>
        </div>` : ''}
      </div>`;
    };
    const review = orders.filter(o => o.status === 'review'), rest = orders.filter(o => o.status !== 'review');
    shell(`
      <section class="adm-card"><h2>Ждут проверки оплаты <span class="muted-text">${review.length}</span></h2>
        <p class="muted-text">Клиент нажал «оплатил». Проверь, что деньги пришли, и подтверди — только тогда он получит данные.</p>
        <div class="adm-table">${review.length ? review.map(row).join('') : '<p class="muted-text">Новых заявок нет.</p>'}</div></section>
      <section class="adm-card"><h2>Все заказы</h2><div class="adm-table">${rest.length ? rest.map(row).join('') : '<p class="muted-text">Заказов пока нет.</p>'}</div></section>`);
    $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast('Скопировано: ' + b.dataset.copy); } catch { toast('Не удалось скопировать'); }
    }));
    $$('[data-no]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Отклонить заказ? Ники вернутся в каталог.')) return;
      b.disabled = true;
      try { await api('/admin/orders/' + b.dataset.no + '/reject', 'POST', {}); toast('Заказ отклонён'); }
      catch { toast('Не получилось (статус уже изменился?)'); }
      loadOrders();
    }));
    $$('[data-ok]').forEach(b => b.addEventListener('click', async () => {
      const card = b.closest('.adm-order'), data = {};
      $$('[data-dl]', card).forEach(t => { data[t.dataset.dl] = t.value; });
      if ($$('[data-dl]', card).some(t => !t.value.trim())) { toast('Впиши данные выдачи для каждого ника'); return; }
      if (!confirm('Деньги точно пришли? Клиент сразу получит эти данные.')) return;
      b.disabled = true;
      try { await api('/admin/orders/' + b.dataset.ok + '/confirm', 'POST', { data }); toast('Заказ выдан клиенту'); }
      catch (ex) { toast(ex.code === 'need_data' ? 'Нет данных выдачи' : ex.code === 'validation' ? 'Данные слишком длинные (до 500 символов)' : 'Не получилось (статус уже изменился?)'); }
      loadOrders();
    }));
  }

  /* ---------- поддержка ---------- */
  async function loadSupport() {
    const { tickets } = await api('/admin/tickets');
    state.stats = state.stats || (await api('/admin/stock')).stats;
    state.stats.openTickets = tickets.filter(t => t.status === 'open').length;
    const cur = tickets.find(t => t.id === state.ticket);
    const draft = cur && $('#rt') && state.draftFor === cur.id ? $('#rt').value : '';
    const hadFocus = !!(document.activeElement && document.activeElement.id === 'rt');
    shell(`<div class="adm-split">
      <section class="adm-card adm-tl"><h2>Обращения</h2>${tickets.length ? tickets.map(t => `
        <button type="button" class="adm-t ${cur && cur.id === t.id ? 'is-on' : ''}" data-t="${esc(t.id)}">
          <span class="adm-t-top"><strong>${esc(t.subject)}</strong><span class="status status--${t.status === 'answered' ? 'delivered' : t.status}">${TICKET_S[t.status]}</span></span>
          <small class="muted-text">${esc(t.username)} · ${esc(t.id)} · ${fmt(t.updatedAt)}</small></button>`).join('') : '<p class="muted-text">Обращений нет.</p>'}</section>
      <section class="adm-card adm-tv">${cur ? `
        <div class="adm-head"><div><h2>${esc(cur.subject)}</h2><small class="muted-text">${esc(cur.username)} · ${esc(cur.id)}</small></div>
          ${cur.status !== 'closed' ? '<button class="btn btn--sm" type="button" id="closeT">Закрыть</button>' : ''}</div>
        <div class="msgs">${cur.messages.map(m => `<div class="msg msg--${m.from === 'admin' ? 'user' : 'admin'}"><b>${m.from === 'admin' ? 'Вы' : esc(cur.username)} · ${fmt(m.at)}</b><p>${esc(m.text)}</p></div>`).join('')}</div>
        ${cur.status === 'closed' ? '<p class="muted-text">Обращение закрыто, писать в него нельзя.</p>' : `<form id="rf" novalidate><div class="field"><textarea id="rt" rows="3" maxlength="2000" aria-label="Ответ"></textarea></div>
          <button class="btn btn--primary" type="submit" id="rb">Ответить</button></form>`}` : '<p class="muted-text">Выбери обращение слева.</p>'}</section></div>`);
    $$('[data-t]').forEach(b => b.addEventListener('click', () => { state.ticket = b.dataset.t; loadSupport(); }));
    const rf = $('#rf');
    if (rf) {
      const box = $('.msgs'); box.scrollTop = box.scrollHeight;
      state.draftFor = cur.id;
      $('#rt').value = draft; if (hadFocus) $('#rt').focus();
      let busy = false;
      const send = async () => {
        if (busy) return;                              // защита от двойной отправки
        const text = $('#rt').value.trim(); if (!text) return;
        busy = true; $('#rb').disabled = true; $('#rt').readOnly = true;
        try { await api('/admin/tickets/' + cur.id + '/reply', 'POST', { text }); $('#rt').value = ''; state.draftFor = null; }
        catch (ex) { toast(ex.code === 'closed' ? 'Тикет уже закрыт' : 'Не отправилось'); }
        busy = false; loadSupport();
      };
      rf.addEventListener('submit', e => { e.preventDefault(); send(); });
      $('#rt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!e.repeat) send(); } });
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
    wsConnect(); load();
  }

  /* ---------- WebSocket: заявки и сообщения приходят сразу ---------- */
  const ws = { sock: null, open: false, retry: 0, timer: null };
  async function refreshStats() {
    try { const { stats } = await api('/admin/stock'); state.stats = stats; paintTabs(); } catch { /* не вошли */ }
  }
  function wsConnect() {
    clearTimeout(ws.timer);
    if (ws.sock) { ws.sock.onclose = null; try { ws.sock.close(); } catch { /* ignore */ } }
    let sck;
    try { sck = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch { return; }
    ws.sock = sck;
    let was = ws.retry > 0;
    sck.onopen = () => { ws.open = true; ws.retry = 0; if (was) { refreshStats(); if (state.tab !== 'stock') load(); } };
    sck.onmessage = async e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'orders') {
        if (m.ev === 'review') toast('Новый заказ ждёт проверки оплаты');
        if (state.tab === 'orders') await load(); else await refreshStats();
        if (state.tab === 'orders') paintTabs();
      } else if (m.t === 'ticket') {
        const k = m.ticket, last = k.messages[k.messages.length - 1];
        if (last && last.from === 'user' && !(state.tab === 'support' && state.ticket === k.id && !document.hidden)) toast('Новое сообщение в поддержке: ' + k.subject);
        if (state.tab === 'support') await load(); else await refreshStats();
      }
    };
    sck.onclose = () => { if (ws.sock !== sck) return; ws.open = false; ws.timer = setTimeout(wsConnect, Math.min(15000, 1000 * 2 ** ws.retry++)); };
  }
  // запасной вариант, пока сокет не подключён
  setInterval(() => { if (!ws.open && state.stats) refreshStats(); }, 15000);

  init();
})();
