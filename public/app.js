/* =========================================================
   sniper — магазин ников
   Править нужно только CONFIG и ITEMS_RAW.
   ========================================================= */
(() => {
  'use strict';

  /* ---------- 1. CONFIG ---------- */
  const CONFIG = {
    telegram: 'https://t.me/your_support',   // ваша ссылка на Telegram
    email: 'hello@example.com'               // ваша почта
  };

  /* ---------- 2. КАТАЛОГ ----------
     Ники и цены лежат на сервере (stock.json), сюда приходят только доступные. */
  let ITEMS = [];
  const CATS = ['4l', '4c'];

  const PAYMENT_METHODS = [
    { id: 'usdt', key: 'pay.usdt', sub: 'TRC-20 / ERC-20' },
    { id: 'ton',  key: 'pay.ton',  sub: 'Toncoin' }
  ];

  /* ---------- 3. ТЕКСТ ---------- */
  const I18N = {
    ru: {
      'a.cart': 'Открыть корзину', 'a.lang': 'Сменить язык', 'a.user': 'Аккаунт', 'common.close': 'Закрыть',
      'hero.eyebrow': 'Магазин Discord-ников',
      'hero.sub': 'Редкие короткие ники. Всё видно сразу, оплата криптой.',
      'hero.label': 'Найти ник', 'hero.browse': 'Смотреть',
      'hero.idle': 'В наличии: {n}. Введите ник, чтобы проверить.',
      'hero.match': 'Найдено по «{q}»: {n}',
      'hero.none': 'По «{q}» ничего нет.',
      'cat.title': 'Каталог', 'cat.reset': 'Сбросить', 'cat.showing': 'Показано {n} из {total}',
      'tab.4l': '4L', 'tab.4c': '4C',
      'empty.title': 'Ничего не найдено', 'empty.text': 'Попробуйте другой запрос или напишите нам.', 'empty.cta': 'Связаться',
      'plate.buy': 'Купить', 'plate.add': 'В корзину', 'plate.in': 'В корзине', 'plate.stock': 'в наличии',
      'plate.addAria': 'Добавить @{h} в корзину', 'plate.buyAria': 'Купить @{h}', 'plate.inAria': '@{h} в корзине. Открыть корзину',
      'cart.title': 'Корзина', 'cart.empty': 'Корзина пуста', 'cart.emptyText': 'Выберите ник в каталоге.',
      'cart.browse': 'В каталог', 'cart.total': 'Итого', 'cart.checkout': 'Оформить заказ',
      'cart.remove': 'Убрать @{h}', 'cart.added': '@{h} в корзине', 'cart.removed': '@{h} убран',

      'auth.signin': 'Войти', 'auth.title': 'Аккаунт',
      'auth.need': 'Чтобы купить ник, создайте аккаунт. Это быстро.',
      'auth.register': 'Регистрация', 'auth.login': 'Вход',
      'auth.username': 'Имя пользователя', 'auth.email': 'Email', 'auth.id': 'Имя пользователя', 'auth.password': 'Пароль',
      'auth.submitRegister': 'Создать аккаунт', 'auth.submitLogin': 'Войти', 'auth.wait': 'Подождите…',
      'auth.errName': 'От 3 до 20 символов: латиница, цифры, _',
      'auth.errEmail': 'Введите корректный email.',
      'auth.errId': 'Введите имя пользователя.',
      'auth.errPass': 'Минимум 8 символов.',
      'auth.errPassLogin': 'Введите пароль.',
      'auth.errTakenName': 'Это имя уже занято.',
      'auth.errTakenEmail': 'Этот email уже зарегистрирован.',
      'auth.errCreds': 'Неверный логин или пароль.',
      'auth.errNet': 'Не удалось связаться с сервером. Попробуйте ещё раз.',
      'auth.welcome': 'Добро пожаловать, {u}',
      'auth.back': 'С возвращением, {u}',
      'auth.out': 'Вы вышли из аккаунта',
      'prof.title': 'Профиль', 'prof.logout': 'Выйти',
      'auth.password2': 'Повторите пароль', 'auth.errPass2': 'Пароли не совпадают.', 'auth.errRate': 'Слишком много попыток. Подождите немного.',
      'ord.title': 'Мои заказы', 'ord.empty': 'Заказов пока нет.', 'ord.show': 'Показать данные',
      'ord.s.pending': 'Ждём оплату', 'ord.s.paid': 'Оплачен', 'ord.s.delivered': 'Выдан', 'ord.s.expired': 'Время вышло',
      'pay.order': 'Заказ {id}', 'pay.amount': 'Сумма', 'pay.address': 'Адрес для оплаты', 'pay.left': 'Осталось {m} мин',
      'pay.waiting': 'Ждём оплату…', 'pay.expired': 'Время на оплату вышло. Оформите заказ заново.', 'pay.back': 'Закрыть',
      'pay.fake': 'Симулировать оплату (тест)', 'pay.testNote': 'Тестовый режим: деньги не списываются.',
      'co.gone': 'Этот ник уже занят. Каталог обновлён.', 'ok.paid': 'Оплата прошла. Данные ника ниже, они же в «Профиль → Мои заказы».',

      'co.title': 'Оформление', 'co.summary': 'Ваш заказ',
      'co.contact': 'Telegram или email для связи', 'co.pay': 'Оплата',
      'co.terms': 'Я согласен с условиями. Данные ника выдаются после подтверждения оплаты.',
      'co.submit': 'Перейти к оплате', 'co.sending': 'Отправляем…',
      'co.errContact': 'Введите Telegram-ник или email.',
      'co.errTerms': 'Примите условия, чтобы продолжить.',
      'co.errSend': 'Не удалось отправить заказ. Попробуйте ещё раз.',
      'pay.usdt': 'USDT', 'pay.ton': 'TON',
      'ok.title': 'Заказ выдан', 'ok.text': 'Заказ {id} оплачен.', 'ok.close': 'В каталог',
      'contact.title': 'Нужен другой ник?', 'contact.text': 'Напишите, какой ник ищете, и мы постараемся найти.',
      'contact.tg': 'Telegram', 'contact.mail': 'Email'
    },
    en: {
      'a.cart': 'Open cart', 'a.lang': 'Switch language', 'a.user': 'Account', 'common.close': 'Close',
      'hero.eyebrow': 'Discord username shop',
      'hero.sub': 'Rare short usernames. Everything visible upfront, pay in crypto.',
      'hero.label': 'Find a username', 'hero.browse': 'Browse',
      'hero.idle': '{n} in stock. Type one to check it.',
      'hero.match': 'Matches for “{q}”: {n}',
      'hero.none': 'Nothing for “{q}”.',
      'cat.title': 'Catalog', 'cat.reset': 'Reset', 'cat.showing': 'Showing {n} of {total}',
      'tab.4l': '4L', 'tab.4c': '4C',
      'empty.title': 'Nothing found', 'empty.text': 'Try another query or message us.', 'empty.cta': 'Contact us',
      'plate.buy': 'Buy', 'plate.add': 'Add to cart', 'plate.in': 'In cart', 'plate.stock': 'in stock',
      'plate.addAria': 'Add @{h} to cart', 'plate.buyAria': 'Buy @{h}', 'plate.inAria': '@{h} is in your cart. Open cart',
      'cart.title': 'Cart', 'cart.empty': 'Your cart is empty', 'cart.emptyText': 'Pick a username from the catalog.',
      'cart.browse': 'Browse catalog', 'cart.total': 'Total', 'cart.checkout': 'Check out',
      'cart.remove': 'Remove @{h}', 'cart.added': '@{h} added to cart', 'cart.removed': '@{h} removed',

      'auth.signin': 'Sign in', 'auth.title': 'Account',
      'auth.need': 'Create an account to buy a username. It takes a few seconds.',
      'auth.register': 'Sign up', 'auth.login': 'Sign in',
      'auth.username': 'Username', 'auth.email': 'Email', 'auth.id': 'Username', 'auth.password': 'Password',
      'auth.submitRegister': 'Create account', 'auth.submitLogin': 'Sign in', 'auth.wait': 'Please wait…',
      'auth.errName': '3–20 characters: letters, digits, _',
      'auth.errEmail': 'Enter a valid email.',
      'auth.errId': 'Enter your username.',
      'auth.errPass': 'At least 8 characters.',
      'auth.errPassLogin': 'Enter your password.',
      'auth.errTakenName': 'This username is taken.',
      'auth.errTakenEmail': 'This email is already registered.',
      'auth.errCreds': 'Wrong login or password.',
      'auth.errNet': 'Could not reach the server. Please try again.',
      'auth.welcome': 'Welcome, {u}',
      'auth.back': 'Welcome back, {u}',
      'auth.out': 'Signed out',
      'prof.title': 'Profile', 'prof.logout': 'Sign out',
      'auth.password2': 'Repeat password', 'auth.errPass2': 'Passwords do not match.', 'auth.errRate': 'Too many attempts. Please wait a bit.',
      'ord.title': 'My orders', 'ord.empty': 'No orders yet.', 'ord.show': 'Show details',
      'ord.s.pending': 'Awaiting payment', 'ord.s.paid': 'Paid', 'ord.s.delivered': 'Delivered', 'ord.s.expired': 'Expired',
      'pay.order': 'Order {id}', 'pay.amount': 'Amount', 'pay.address': 'Payment address', 'pay.left': '{m} min left',
      'pay.waiting': 'Waiting for payment…', 'pay.expired': 'Payment time is over. Place the order again.', 'pay.back': 'Close',
      'pay.fake': 'Simulate payment (test)', 'pay.testNote': 'Test mode: no money is charged.',
      'co.gone': 'This username is already taken. Catalog updated.', 'ok.paid': 'Payment received. Your details are below and in Profile → My orders.',

      'co.title': 'Check out', 'co.summary': 'Your order',
      'co.contact': 'Telegram or email for contact', 'co.pay': 'Payment',
      'co.terms': 'I agree to the terms. Username details are issued after payment is confirmed.',
      'co.submit': 'Go to payment', 'co.sending': 'Sending…',
      'co.errContact': 'Enter a Telegram username or an email.',
      'co.errTerms': 'Please accept the terms to continue.',
      'co.errSend': 'Could not send the order. Please try again.',
      'pay.usdt': 'USDT', 'pay.ton': 'TON',
      'ok.title': 'Order delivered', 'ok.text': 'Order {id} is paid.', 'ok.close': 'Back to catalog',
      'contact.title': 'Need a different username?', 'contact.text': 'Tell us what you are looking for and we will try to find it.',
      'contact.tg': 'Telegram', 'contact.mail': 'Email'
    }
  };

  /* ---------- 4. Хелперы и состояние ---------- */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };

  const state = {
    cat: '4l', q: '',
    cart: store.get('sn.cart', []) || [],
    lang: store.get('sn.lang', 'ru'),
    user: null,                              // { username }, приходит с сервера
    checkout: { items: [], fromCart: false },
    authMode: 'register',
    afterAuth: null
  };

  const t = (key, vars = {}) => {
    const s = (I18N[state.lang] && I18N[state.lang][key]) ?? I18N.ru[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, n) => (vars[n] ?? ''));
  };

  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const normalizeQuery = v => v.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const byId = id => ITEMS.find(i => i.id === id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const handleHTML = it => '<span class="at">@</span>' + esc(it.h);
  const pad = n => String(n).padStart(2, '0');

  const AVA_COLORS = ['#2f6bff', '#1f9d6b', '#8a5cf6', '#d9822b', '#c2455f', '#2aa3c7'];
  const avaColor = s => AVA_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVA_COLORS.length];

  const ICON = {
    cart: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h2.5l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
    check: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    x: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  function applyStaticText() {
    document.documentElement.lang = state.lang;
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    $('#langBtn').textContent = state.lang === 'ru' ? 'EN' : 'RU';
    document.title = state.lang === 'ru' ? 'Sniper | магазин ников' : 'Sniper | username shop';
    renderUser();
    renderAuthMode();
  }

  /* ---------- 5. Каталог ---------- */
  const matches = it => it.cat === state.cat && (!state.q || it.h.includes(state.q));
  const filtersActive = () => state.q !== '';

  function renderTabs() {
    $('#tabs').innerHTML = CATS.map(c => {
      const n = ITEMS.filter(i => i.cat === c).length;
      return `<button type="button" class="chip" data-cat="${c}" aria-pressed="${state.cat === c}">${t('tab.' + c)}<span class="count">${n}</span></button>`;
    }).join('');
  }

  function plateHTML(it) {
    const inCart = state.cart.includes(it.id);
    return `
      <article class="plate">
        <span class="tag">${t('tab.' + it.cat)}</span>
        <h3 class="plate-handle" aria-label="@${esc(it.h)}">${handleHTML(it)}</h3>
        <div class="plate-foot">
          <span class="price">${money.format(it.price)}</span>
          <div class="plate-actions">
            <button class="btn btn--primary btn--sm" type="button" data-buy="${it.id}" aria-label="${esc(t('plate.buyAria', { h: it.h }))}">${t('plate.buy')}</button>
            <button class="btn btn--sm btn--icon" type="button" data-add="${it.id}"
              title="${esc(inCart ? t('plate.in') : t('plate.add'))}"
              aria-label="${esc(inCart ? t('plate.inAria', { h: it.h }) : t('plate.addAria', { h: it.h }))}">${inCart ? ICON.check : ICON.cart}</button>
          </div>
        </div>
      </article>`;
  }

  function renderGrid() {
    const list = ITEMS.filter(matches);
    const total = ITEMS.filter(i => i.cat === state.cat).length;
    $('#grid').innerHTML = list.map(plateHTML).join('');
    $('#grid').hidden = list.length === 0;
    $('#empty').hidden = list.length > 0;
    $('#resultsText').textContent = t('cat.showing', { n: list.length, total });
    $('#resetBtn').hidden = !filtersActive();
  }

  function updateFinder() {
    const status = $('#finderStatus');
    if (!state.q) { status.textContent = t('hero.idle', { n: ITEMS.length }); return; }
    const n = ITEMS.filter(i => i.h.includes(state.q)).length;
    status.textContent = n ? t('hero.match', { q: state.q, n }) : t('hero.none', { q: state.q });
  }

  function refreshCatalog() { renderTabs(); renderGrid(); updateFinder(); }

  function setQuery(raw) {
    state.q = normalizeQuery(raw);
    if (state.q && !ITEMS.some(matches)) {
      const hit = ITEMS.find(i => i.h.includes(state.q));
      if (hit) state.cat = hit.cat;
    }
    renderTabs(); renderGrid(); updateFinder();
  }

  function resetFilters() {
    state.q = '';
    $('#heroInput').value = '';
    refreshCatalog();
  }

  const scrollToCatalog = () => $('#catalog').scrollIntoView({ block: 'start' });

  /* ---------- 6. Корзина ---------- */
  const cartTotal = items => items.reduce((s, i) => s + i.price, 0);
  const cartItems = () => state.cart.map(byId).filter(Boolean);
  const saveCart = () => store.set('sn.cart', state.cart);

  function renderCart() {
    const items = cartItems();
    const badge = $('#cartCount');
    badge.textContent = items.length;
    badge.hidden = items.length === 0;

    const body = $('#cartBody'), foot = $('#cartFoot');

    if (!items.length) {
      body.innerHTML = `
        <div class="cart-empty">
          <h3>${t('cart.empty')}</h3>
          <p>${t('cart.emptyText')}</p>
          <button class="btn btn--primary" type="button" data-go-catalog>${t('cart.browse')}</button>
        </div>`;
      foot.innerHTML = '';
      return;
    }

    body.innerHTML = `<ul>${items.map(it => `
      <li class="line-item">
        <div class="line-main"><div class="line-handle">${handleHTML(it)}</div></div>
        <span class="line-price">${money.format(it.price)}</span>
        <button class="line-remove" type="button" data-remove="${it.id}" aria-label="${esc(t('cart.remove', { h: it.h }))}">${ICON.x}</button>
      </li>`).join('')}</ul>`;

    foot.innerHTML = `
      <div class="cart-total"><span>${t('cart.total')}</span><strong>${money.format(cartTotal(items))}</strong></div>
      <button class="btn btn--primary cart-foot-btn" type="button" data-checkout-cart>${t('cart.checkout')}</button>`;
  }

  function addToCart(id) {
    const it = byId(id);
    if (!it) return;
    if (state.cart.includes(id)) { openDialog($('#cartDrawer')); return; }
    state.cart.push(id);
    saveCart(); renderCart(); renderGrid();
    toast(t('cart.added', { h: it.h }));
    const badge = $('#cartCount');
    badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
  }

  function removeFromCart(id) {
    const it = byId(id);
    state.cart = state.cart.filter(x => x !== id);
    saveCart(); renderCart(); renderGrid();
    if (it) toast(t('cart.removed', { h: it.h }));
  }

  /* ---------- 7. Диалоги, тост ---------- */
  function openDialog(dlg) { if (!dlg.open) dlg.showModal(); }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------- 8. Аккаунты (сервер, cookie-сессия) ---------- */
  async function api(path, method = 'GET', body) {
    const res = await fetch('/api' + path, {
      method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'HTTP ' + res.status), { code: data.code || 'net', status: res.status });
    return data;
  }

  const validName = v => /^[A-Za-z0-9_]{3,20}$/.test(v);

  async function authRequest(payload) {
    const data = payload.action === 'register'
      ? await api('/register', 'POST', { username: payload.username, password: payload.password, password2: payload.password2 })
      : await api('/login', 'POST', { username: payload.id, password: payload.password });
    return data.user;
  }

  async function loadItems() {
    const data = await api('/items');
    ITEMS = data.items;
    state.cart = state.cart.filter(id => ITEMS.some(i => i.id === id));
    saveCart();
  }

  async function loadMe() {
    try { state.user = (await api('/me')).user; } catch { state.user = null; }
  }

  function renderUser() {
    const label = $('#userLabel');
    label.textContent = state.user ? state.user.username : t('auth.signin');
    $('#userBtn').classList.toggle('is-in', !!state.user);
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    renderAuthMode();
    $$('.err', $('#authForm')).forEach(e => { e.hidden = true; });
    $$('[aria-invalid]', $('#authForm')).forEach(e => e.removeAttribute('aria-invalid'));
  }

  function renderAuthMode() {
    const reg = state.authMode === 'register';
    $$('.auth-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.authTab === state.authMode)));
    $$('#authForm [data-only]').forEach(el => { el.hidden = el.dataset.only !== state.authMode; });
    $('#auPass').setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
    const btn = $('#authSubmit');
    if (!btn.disabled) btn.textContent = reg ? t('auth.submitRegister') : t('auth.submitLogin');
  }

  function openAuth(mode, onSuccess, needed) {
    state.afterAuth = onSuccess || null;
    $('#authForm').reset();
    $('#authSubmit').disabled = false;
    $('#authNote').hidden = !needed;
    setAuthMode(mode || 'register');
    if ($('#cartDrawer').open) $('#cartDrawer').close();
    openDialog($('#authDlg'));
    setTimeout(() => $(state.authMode === 'register' ? '#auName' : '#auId').focus(), 60);
  }

  function showErr(id, msgKey, input) {
    const el = $(id);
    el.textContent = msgKey ? t(msgKey) : '';
    el.hidden = !msgKey;
    if (input) input.setAttribute('aria-invalid', String(!!msgKey));
  }

  async function submitAuth(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const reg = state.authMode === 'register';
    const pass = f.password.value;
    showErr('#errAuth', '');
    let ok = true;

    if (reg) {
      const name = f.username.value.trim(), pass2 = f.password2.value;
      const a = validName(name), c = pass.length >= 8, d = pass === pass2;
      showErr('#errName', a ? '' : 'auth.errName', f.username);
      showErr('#errPass', c ? '' : 'auth.errPass', f.password);
      showErr('#errPass2', d ? '' : 'auth.errPass2', f.password2);
      ok = a && c && d;
      if (!ok) { (!a ? f.username : !c ? f.password : f.password2).focus(); return; }
    } else {
      const id = f.id.value.trim();
      const a = id.length >= 3, c = pass.length > 0;
      showErr('#errId', a ? '' : 'auth.errId', f.id);
      showErr('#errPass', c ? '' : 'auth.errPassLogin', f.password);
      ok = a && c;
      if (!ok) { (!a ? f.id : f.password).focus(); return; }
    }

    const btn = $('#authSubmit');
    btn.disabled = true; btn.textContent = t('auth.wait');

    try {
      const payload = reg
        ? { action: 'register', username: f.username.value.trim(), password: pass, password2: f.password2.value }
        : { action: 'login', id: f.id.value.trim(), password: pass };
      const user = await authRequest(payload);
      state.user = user;
      renderUser();
      $('#authDlg').close();
      toast(t(reg ? 'auth.welcome' : 'auth.back', { u: user.username }));
      const next = state.afterAuth; state.afterAuth = null;
      if (next) next();
    } catch (err) {
      const map = { name: ['#errName', 'auth.errTakenName', f.username], pass2: ['#errPass2', 'auth.errPass2', f.password2] };
      if (map[err.code]) showErr(...map[err.code]);
      else showErr('#errAuth', err.code === 'creds' ? 'auth.errCreds' : err.code === 'rate' ? 'auth.errRate' : 'auth.errNet');
      btn.disabled = false;
      renderAuthMode();
    }
  }

  const statusLabel = st => t('ord.s.' + st);

  function orderHTML(o) {
    const handles = o.items.map(i => '<span class="line-handle">' + handleHTML({ h: i.h }) + '</span>').join(' ');
    const data = o.status === 'delivered'
      ? '<details class="order-data"><summary>' + t('ord.show') + '</summary>' +
        o.items.map(i => '<div class="data-box"><b>@' + esc(i.h) + '</b><pre>' + esc(i.data || '') + '</pre></div>').join('') + '</details>'
      : '';
    return '<div class="order"><div class="order-top"><strong>' + esc(o.id) + '</strong><span class="status status--' + o.status + '">' + statusLabel(o.status) + '</span></div>' +
      '<div class="order-items">' + handles + '</div>' + data + '</div>';
  }

  async function openProfile() {
    const u = state.user;
    $('#profName').textContent = u.username;
    const ava = $('#profAva');
    ava.textContent = u.username[0].toUpperCase();
    ava.style.setProperty('--c', avaColor(u.username));
    const box = $('#profOrders');
    box.innerHTML = '';
    openDialog($('#profileDlg'));
    try {
      const { orders } = await api('/orders');
      box.innerHTML = orders.length ? orders.map(orderHTML).join('') : '<p class="muted-text">' + t('ord.empty') + '</p>';
    } catch { box.innerHTML = '<p class="muted-text">' + t('auth.errNet') + '</p>'; }
  }

  async function logout() {
    try { await api('/logout', 'POST', {}); } catch { /* сессия всё равно сбросится по таймауту */ }
    state.user = null;
    renderUser();
    $('#profileDlg').close();
    toast(t('auth.out'));
  }

  /* ---------- 9. Оформление (нужен аккаунт) ---------- */
  function requireAuth(next) {
    if (state.user) { next(); return; }
    openAuth('register', next, true);
  }

  function renderCheckoutSummary() {
    const items = state.checkout.items;
    $('#coSummary').innerHTML = items.map(it => `
      <li class="line-item">
        <div class="line-main"><div class="line-handle">${handleHTML(it)}</div></div>
        <span class="line-price">${money.format(it.price)}</span>
      </li>`).join('');
    $('#coTotal').textContent = money.format(cartTotal(items));
  }

  function renderPayMethods() {
    const cur = ($('input[name="method"]:checked') || {}).value || PAYMENT_METHODS[0].id;
    $('#payGrid').innerHTML = PAYMENT_METHODS.map(m => `
      <label class="pay-opt">
        <input type="radio" name="method" value="${m.id}" ${m.id === cur ? 'checked' : ''}>
        <span>${t(m.key)}</span><small>${m.sub}</small>
      </label>`).join('');
  }

  function openCheckout(items, fromCart) {
    if (!items.length) return;
    requireAuth(() => {
      state.checkout = { items, fromCart };
      const form = $('#coForm');
      form.reset();
      form.hidden = false;
      $('#coDone').hidden = true;
      $('#coPay').hidden = true;
      stopPoll();
      $$('.err', form).forEach(e => { e.hidden = true; });
      $$('[aria-invalid]', form).forEach(e => e.removeAttribute('aria-invalid'));
      $('#coSubmit').disabled = false;
      $('#coSubmit').textContent = t('co.submit');
      renderCheckoutSummary();
      renderPayMethods();
      if ($('#cartDrawer').open) $('#cartDrawer').close();
      openDialog($('#checkoutDlg'));
    });
  }

  let pollTimer = null;
  const stopPoll = () => { clearInterval(pollTimer); pollTimer = null; };

  function showPay(order) {
    $('#coForm').hidden = true;
    $('#coDone').hidden = true;
    const box = $('#coPay');
    box.hidden = false;
    const left = Math.max(0, Math.ceil((order.expiresAt - Date.now()) / 60000));
    const method = (PAYMENT_METHODS.find(m => m.id === order.method) || {});
    const expired = order.status === 'expired';
    box.innerHTML = `
      <h3 class="mini-title">${esc(t('pay.order', { id: order.id }))}</h3>
      <ul class="summary">${order.items.map(i => `
        <li class="line-item"><div class="line-main"><div class="line-handle">${handleHTML({ h: i.h })}</div></div>
        <span class="line-price">${money.format(i.price)}</span></li>`).join('')}</ul>
      <div class="pay-info">
        <div><small>${t('pay.amount')}</small><strong>${money.format(order.total)} · ${esc(t(method.key || 'pay.usdt'))}</strong></div>
        <div><small>${t('pay.address')}</small><code>${esc(order.address)}</code></div>
      </div>
      <p class="pay-status">${expired ? t('pay.expired') : t('pay.waiting') + ' · ' + t('pay.left', { m: left })}</p>
      ${expired ? `<button class="btn auth-submit" type="button" data-close>${t('pay.back')}</button>` : `
        ${order.testMode ? `<p class="pay-note">${t('pay.testNote')}</p>
        <button class="btn btn--primary auth-submit" type="button" id="fakePayBtn">${t('pay.fake')}</button>` : ''}`}`;

    const fake = $('#fakePayBtn');
    if (fake) fake.addEventListener('click', async () => {
      fake.disabled = true;
      try { onOrderUpdate((await api('/orders/' + order.id + '/fake-pay', 'POST', {})).order); }
      catch { fake.disabled = false; toast(t('co.errSend')); }
    });

    stopPoll();
    if (!expired) pollTimer = setInterval(async () => {
      try { onOrderUpdate((await api('/orders/' + order.id)).order); } catch { /* повторим на следующем тике */ }
    }, 3000);
  }

  function onOrderUpdate(order) {
    if (order.status === 'delivered' || order.status === 'paid') return showDelivered(order);
    if (order.status === 'expired') showPay(order);
  }

  function showDelivered(order) {
    stopPoll();
    state.cart = state.cart.filter(id => !order.items.some(i => i.id === id));
    saveCart(); renderCart();
    loadItems().then(() => { renderTabs(); renderGrid(); updateFinder(); }).catch(() => {});
    $('#coPay').hidden = true;
    $('#coDoneText').textContent = t('ok.paid');
    $('#coDelivery').innerHTML = order.items.map(i =>
      '<div class="data-box"><b>@' + esc(i.h) + '</b><pre>' + esc(i.data || '') + '</pre></div>').join('');
    $('#coDone').hidden = false;
  }

  async function submitOrder(e) {
    e.preventDefault();
    if (!state.user) { $('#checkoutDlg').close(); openAuth('login', null, true); return; }
    const form = e.currentTarget;
    const errTerms = $('#coErrTerms'), errSend = $('#coErrSend');
    errSend.hidden = true;

    const okTerms = form.terms.checked;
    errTerms.hidden = okTerms;
    if (!okTerms) { form.terms.focus(); return; }

    const btn = $('#coSubmit');
    btn.disabled = true; btn.textContent = t('co.sending');

    try {
      const { order } = await api('/orders', 'POST', {
        items: state.checkout.items.map(i => i.id),
        method: form.elements.method.value
      });
      btn.disabled = false; btn.textContent = t('co.submit');
      showPay(order);
    } catch (err) {
      btn.disabled = false; btn.textContent = t('co.submit');
      if (err.code === 'unavailable') {
        $('#checkoutDlg').close();
        await loadItems().catch(() => {});
        refreshCatalog(); renderCart();
        toast(t('co.gone'));
      } else if (err.status === 401) {
        state.user = null; renderUser();
        $('#checkoutDlg').close(); openAuth('login', null, true);
      } else {
        errSend.hidden = false;
      }
    }
  }

  /* ---------- 10. Плейсхолдер ---------- */
  function startPlaceholderTyping(input) {
    const words = ITEMS.map(i => i.h);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      input.placeholder = words[0];
      return;
    }
    let w = 0, i = 0, dir = 1, hold = 0;
    setInterval(() => {
      if (document.hidden || input.value || document.activeElement === input) {
        if (document.activeElement === input) input.placeholder = '';
        return;
      }
      if (hold > 0) { hold--; return; }
      i += dir;
      input.placeholder = words[w].slice(0, i);
      if (i === words[w].length) { dir = -1; hold = 12; }
      else if (i === 0) { dir = 1; w = (w + 1) % words.length; hold = 4; }
    }, 130);
  }

  /* ---------- 11. Подключение ---------- */
  function bind() {
    $('#tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      state.cat = b.dataset.cat; refreshCatalog();
    });
    $('#resetBtn').addEventListener('click', resetFilters);
    $('#emptyReset').addEventListener('click', resetFilters);

    $('#heroInput').addEventListener('input', e => setQuery(e.target.value));
    $('#finder').addEventListener('submit', e => { e.preventDefault(); scrollToCatalog(); });

    $('#grid').addEventListener('click', e => {
      const buy = e.target.closest('[data-buy]');
      const add = e.target.closest('[data-add]');
      if (buy) { const it = byId(Number(buy.dataset.buy)); if (it) openCheckout([it], false); }
      else if (add) addToCart(Number(add.dataset.add));
    });

    $('#cartBtn').addEventListener('click', () => openDialog($('#cartDrawer')));
    $('#cartDrawer').addEventListener('click', e => {
      const rm = e.target.closest('[data-remove]');
      if (rm) return removeFromCart(Number(rm.dataset.remove));
      if (e.target.closest('[data-checkout-cart]')) return openCheckout(cartItems(), true);
      if (e.target.closest('[data-go-catalog]')) { $('#cartDrawer').close(); scrollToCatalog(); }
    });

    $('#userBtn').addEventListener('click', () => { state.user ? openProfile() : openAuth('login', null, false); });
    $$('.auth-tab').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.authTab)));
    $('#authForm').addEventListener('submit', submitAuth);
    $('#logoutBtn').addEventListener('click', logout);

    document.addEventListener('click', e => {
      const dlg = e.target.closest('dialog');
      if (e.target.tagName === 'DIALOG') { e.target.close(); return; }
      if (dlg && e.target.closest('[data-close]')) {
        dlg.close();
        if (dlg.id === 'checkoutDlg' && !$('#coDone').hidden) scrollToCatalog();
      }
    });

    $('#checkoutDlg').addEventListener('close', stopPoll);
    $('#authDlg').addEventListener('close', () => { state.afterAuth = state.afterAuth && state.user ? state.afterAuth : null; });

    $('#coForm').addEventListener('submit', submitOrder);

    $('#langBtn').addEventListener('click', () => {
      state.lang = state.lang === 'ru' ? 'en' : 'ru';
      store.set('sn.lang', state.lang);
      renderAll();
    });
  }

  function renderAll() {
    applyStaticText();
    refreshCatalog();
    renderCart();
    if ($('#checkoutDlg').open && !$('#coForm').hidden) {
      renderCheckoutSummary(); renderPayMethods();
      $('#coSubmit').textContent = t('co.submit');
    }
  }

  async function init() {
    $('#tgLink').href = CONFIG.telegram;
    $('#mailLink').href = 'mailto:' + CONFIG.email;
    bind();
    renderAll();
    await Promise.all([loadItems().catch(() => {}), loadMe()]);
    renderAll();
    startPlaceholderTyping($('#heroInput'));
  }

  init();
})();