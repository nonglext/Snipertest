'use strict';
/* Sniper — сервер. Без зависимостей: только встроенный Node.
   Тестовая версия: данные в JSON-файле, оплата фейковая (PAYMENT_MODE=test). */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const PORT = Number(process.env.PORT) || 3000;
const PAYMENT_MODE = process.env.PAYMENT_MODE === 'live' ? 'live' : 'test';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ORDER_TTL = 30 * 60 * 1000;
const SESSION_TTL = 30 * 24 * 3600 * 1000;
const PUBLIC = path.join(__dirname, 'public');

/* ---------- склад (секретные данные только тут, в браузер не уходят) ---------- */
const stockFile = fs.existsSync(path.join(__dirname, 'stock.json')) ? 'stock.json' : 'stock.example.json';
const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, stockFile), 'utf8'));

/* ---------- БД: Postgres (если задан DATABASE_URL) или JSON-файл ---------- */
const DATABASE_URL = process.env.DATABASE_URL || '';
(async function main() {
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'db.json');
let db = { users: [], sessions: [], orders: [], stock: null, tickets: [] };
let pool = null;
const readFileDb = () => { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return null; } };

if (DATABASE_URL) {
  const { Pool } = require('pg');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);
  pool = new Pool({ connectionString: DATABASE_URL, max: 3, ssl: (local || process.env.PGSSL === 'off') ? false : { rejectUnauthorized: false } });
  pool.on('error', e => console.error('pg:', e.message));
  await pool.query('CREATE TABLE IF NOT EXISTS app_state (id INT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const r = await pool.query('SELECT data FROM app_state WHERE id = 1');
  if (r.rows[0]) db = { ...db, ...r.rows[0].data };
  else { const old = readFileDb(); if (old) { db = { ...db, ...old }; console.log('данные из db.json перенесены в Postgres'); } }
} else {
  const old = readFileDb(); if (old) db = { ...db, ...old };     // иначе первый запуск
}

const PG_UPSERT = 'INSERT INTO app_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()';
let pgDirty = false, pgBusy = false;
async function pgFlush() {                      // записи идут по очереди; пока пишем, новые изменения копятся и уходят следующим заходом
  if (pgBusy) return;
  pgBusy = true;
  try {
    while (pgDirty) { pgDirty = false; await pool.query(PG_UPSERT, [JSON.stringify(db)]); }
    pgBusy = false;
  } catch (e) {
    console.error('pg save:', e.message);
    pgDirty = true;
    setTimeout(() => { pgBusy = false; pgFlush(); }, 2000).unref();   // повторим через 2 с
  }
}
function save() {
  if (pool) { pgDirty = true; pgFlush(); return; }
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
async function shutdown() {                     // Render шлёт SIGTERM при деплое — дописываем последнее состояние
  try { if (pool) await pool.query(PG_UPSERT, [JSON.stringify(db)]); } catch (e) { console.error('pg final save:', e.message); }
  process.exit(0);
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

// склад хранится в БД и правится из админки; стартовые позиции берутся из stock.json (или примера) один раз
if (!Array.isArray(db.stock)) { db.stock = SEED.map(x => ({ ...x })); save(); }
const getStock = id => db.stock.find(x => x.id === id);
const nextStockId = () => db.stock.reduce((m, x) => Math.max(m, x.id), 0) + 1;
console.log(`склад: ${db.stock.filter(x => !x.removed).length} позиций, оплата: ${PAYMENT_MODE}, хранилище: ${pool ? 'Postgres' : 'файл'}`);

/* ---------- хелперы ---------- */
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const rid = n => crypto.randomBytes(n).toString('hex');
const now = () => Date.now();

async function hashPass(pass, saltHex) {
  return (await scrypt(pass, Buffer.from(saltHex, 'hex'), 64)).toString('hex');
}
const safeEq = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const hits = new Map();   // простой rate limit
function limited(ip, key, max, windowMs) {
  const k = key + ':' + ip, t = now();
  const arr = (hits.get(k) || []).filter(x => t - x < windowMs);
  arr.push(t); hits.set(k, arr);
  return arr.length > max;
}
setInterval(() => { const t = now(); for (const [k, a] of hits) if (!a.some(x => t - x < 3600e3)) hits.delete(k); }, 600e3).unref();

function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function setSession(res, req, token, maxAgeSec) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${secure}`);
}
function userOf(req) {
  const tok = cookies(req).sid;
  if (!tok) return null;
  const h = sha(tok), s = db.sessions.find(x => x.h === h && x.exp > now());
  return s ? db.users.find(u => u.id === s.uid) || null : null;
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
const fail = (res, code, error, c) => send(res, code, { error, code: c || 'error' });

function readJSON(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 20000) { reject(new Error('big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/* ---------- WebSocket (RFC 6455, без зависимостей) ----------
   Сервер → клиент: {t:'ticket'|'order'|'orders'|'catalog'}. Клиент ничего важного не шлёт, все действия идут через обычный API. */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const wsClients = new Set();
const wsPerIp = new Map();
function wsFrame(op, payload) {
  const len = payload.length; let head;
  if (len < 126) head = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
function wsSend(c, obj) {
  if (c.socket.destroyed || !c.socket.writable) return;
  try { c.socket.write(wsFrame(1, Buffer.from(JSON.stringify(obj)))); } catch { /* сокет умер, уберёт close */ }
}
function wsClose(c, code) {
  try { const b = Buffer.alloc(2); b.writeUInt16BE(code || 1000); c.socket.end(wsFrame(8, b)); } catch { /* ignore */ }
  setTimeout(() => c.socket.destroy(), 1000).unref();
}
function wsParse(c, chunk) {
  c.buf = Buffer.concat([c.buf, chunk]);
  if (c.buf.length > 65536 * 2) return wsClose(c, 1009);
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const op = b[0] & 0x0f, masked = !!(b[1] & 0x80);
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; const big = b.readBigUInt64BE(2); if (big > 65536n) return wsClose(c, 1009); len = Number(big); off = 10; }
    if (!masked) return wsClose(c, 1002);                 // клиентские кадры обязаны быть замаскированы
    if (len > 65536) return wsClose(c, 1009);
    if (b.length < off + 4 + len) return;
    const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    c.buf = b.subarray(off + 4 + len);
    if (op === 8) return wsClose(c, 1000);
    if (op === 9) c.socket.write(wsFrame(10, data));       // ping → pong
    else if (op === 10) c.alive = true;                    // pong
    // текстовые кадры от клиента игнорируем
  }
}
function wsUpgrade(req, socket) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const key = req.headers['sec-websocket-key'], origin = req.headers.origin;
  let url; try { url = new URL(req.url, 'http://x'); } catch { return socket.destroy(); }
  let okOrigin = true;
  if (origin) { try { okOrigin = new URL(origin).host === req.headers.host; } catch { okOrigin = false; } }   // защита от чужих сайтов
  if (url.pathname !== '/ws' || !key || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !okOrigin || (wsPerIp.get(ip) || 0) >= 10) {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return socket.destroy();
  }
  const user = userOf(req);
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const c = { socket, ip, userId: user ? user.id : null, admin: isAdmin(user), buf: Buffer.alloc(0), alive: true };
  wsClients.add(c); wsPerIp.set(ip, (wsPerIp.get(ip) || 0) + 1);
  let gone = false;
  const cleanup = () => { if (gone) return; gone = true; wsClients.delete(c); const n = (wsPerIp.get(ip) || 1) - 1; if (n > 0) wsPerIp.set(ip, n); else wsPerIp.delete(ip); };
  socket.on('data', d => wsParse(c, d));
  socket.on('close', cleanup); socket.on('error', () => { cleanup(); socket.destroy(); });
  wsSend(c, { t: 'hello', admin: c.admin });
}
setInterval(() => {                                        // пинг раз в 25 с; кто не ответил — отключаем
  for (const c of wsClients) {
    if (!c.alive) { c.socket.destroy(); continue; }
    c.alive = false;
    try { c.socket.write(wsFrame(9, Buffer.alloc(0))); } catch { /* ignore */ }
  }
}, 25000).unref();
const pushUser = (uid, msg) => { for (const c of wsClients) if (c.userId === uid) wsSend(c, msg); };
const pushAdmins = msg => { for (const c of wsClients) if (c.admin) wsSend(c, msg); };
const pushAll = msg => { for (const c of wsClients) wsSend(c, msg); };
const pushTicket = t => { pushUser(t.userId, { t: 'ticket', ticket: ticketView(t) }); pushAdmins({ t: 'ticket', ticket: ticketView(t, true) }); };
const pushOrder = o => pushUser(o.userId, { t: 'order', order: orderView(o, true) });

/* ---------- заказы ---------- */
function expireOrders() {
  let changed = false;
  for (const o of db.orders) if (o.status === 'pending' && o.expiresAt <= now()) { o.status = 'expired'; changed = true; pushOrder(o); }
  if (changed) { save(); pushAll({ t: 'catalog' }); pushAdmins({ t: 'orders' }); }
}
// ник занят, если есть оплаченный/выданный заказ, либо живая бронь
function takenIds(exceptUser) {
  expireOrders();
  const set = new Set();
  for (const o of db.orders) {
    if (o.status === 'paid' || o.status === 'delivered' || o.status === 'review' || (o.status === 'pending' && o.userId !== exceptUser)) o.items.forEach(i => set.add(i));
  }
  return set;
}
function orderView(o, withData) {
  const items = o.items.map(id => { const s = getStock(id); return { id, h: s.h, price: s.price, cat: s.cat, ...(withData && o.status === 'delivered' ? { data: s.secret } : {}) }; });
  return {
    id: o.id, status: o.status, method: o.method, total: o.total, address: o.address,
    createdAt: o.createdAt, expiresAt: o.expiresAt, items, testMode: PAYMENT_MODE === 'test'
  };
}

// Клиент нажал «я оплатил» (в тесте это фейк-кнопка): заказ уходит админу на проверку, данные НЕ выдаются.
// Позже тут можно автоматически вызывать markPaid из webhook шлюза.
function markReview(order) {
  if (order.status !== 'pending') return order;
  order.status = 'review'; order.claimedAt = now();
  save();
  pushOrder(order); pushAdmins({ t: 'orders', ev: 'review', id: order.id }); pushAll({ t: 'catalog' });
  return order;
}

// ЕДИНСТВЕННОЕ место, где заказ становится оплаченным и выдаётся. Вызывает админ после проверки поступления
// (или webhook шлюза). Идемпотентно.
function markPaid(order, adminName) {
  if (order.status !== 'pending' && order.status !== 'review') return order;
  order.status = 'paid'; order.paidAt = now();
  order.status = 'delivered'; order.deliveredAt = now();
  if (adminName) order.confirmedBy = adminName;
  save();
  pushOrder(order); pushAdmins({ t: 'orders' }); pushAll({ t: 'catalog' });
  return order;
}

/* ---------- API ---------- */
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;

/* ---------- админы: ADMINS="ник1:пароль1,ник2:пароль2" (в Environment на Render) ----------
   Аккаунты создаются при старте, эти ники в обычной регистрации заняты. */
const ADMINS = new Set();
(process.env.ADMINS || '').split(',').map(x => x.trim()).filter(Boolean).forEach(pair => {
  const i = pair.indexOf(':');
  const name = pair.slice(0, i), pass = pair.slice(i + 1);
  if (i < 1 || !NAME_RE.test(name) || pass.length < 8) { console.warn('ADMINS: пропущена запись (ник 3-20 символов, пароль от 8)'); return; }
  const h = (salt) => crypto.scryptSync(pass, Buffer.from(salt, 'hex'), 64).toString('hex');
  let u = db.users.find(x => x.username.toLowerCase() === name.toLowerCase());
  if (!u) { const salt = rid(16); u = { id: rid(8), username: name, salt, hash: h(salt), createdAt: now() }; db.users.push(u); }
  else if (!safeEq(h(u.salt), u.hash)) u.hash = h(u.salt);          // смена пароля через env
  ADMINS.add(name.toLowerCase());
});
save();
console.log('админов:', ADMINS.size);
const isAdmin = u => !!u && ADMINS.has(u.username.toLowerCase());

const TEXT_MAX = 2000;
const ticketView = (t, withUser) => ({
  id: t.id, subject: t.subject, status: t.status, createdAt: t.createdAt, updatedAt: t.updatedAt, messages: t.messages,
  ...(withUser ? { username: (db.users.find(u => u.id === t.userId) || {}).username || '?' } : {})
});

function stockStatus(id) {
  expireOrders();
  let st = 'free';
  for (const o of db.orders) if (o.items.includes(id)) {
    if (o.status === 'paid' || o.status === 'delivered') return 'sold';
    if (o.status === 'pending' || o.status === 'review') st = 'reserved';
  }
  return st;
}

function adminApi(req, res, url, body, adminName) {
  const route = req.method + ' ' + url.pathname;

  if (route === 'GET /api/admin/stock') {
    const items = db.stock.filter(x => !x.removed).map(x => ({ id: x.id, h: x.h, price: x.price, cat: x.cat, secret: x.secret, status: stockStatus(x.id) }));
    const delivered = db.orders.filter(o => o.status === 'delivered');
    return send(res, 200, {
      items,
      stats: {
        free: items.filter(x => x.status === 'free').length, sold: items.filter(x => x.status === 'sold').length,
        revenue: delivered.reduce((a, o) => a + o.total, 0), orders: delivered.length,
        users: db.users.filter(u => !isAdmin(u)).length,
        openTickets: db.tickets.filter(t => t.status === 'open').length,
        review: db.orders.filter(o => o.status === 'review').length
      }
    });
  }

  if (route === 'POST /api/admin/stock') {          // массовое добавление: строки «ник | данные»
    const cat = body.cat, price = Number(body.price);
    if (!['4l', '4c'].includes(cat) || !Number.isInteger(price) || price < 1 || price > 100000) return fail(res, 400, 'bad price/cat', 'validation');
    const lines = String(body.lines || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 200);
    const have = new Set(db.stock.filter(x => !x.removed).map(x => x.h));
    const added = [], skipped = [];
    for (const line of lines) {
      const i = line.indexOf('|');
      const h = (i < 0 ? line : line.slice(0, i)).trim().toLowerCase(), secret = i < 0 ? '' : line.slice(i + 1).trim();
      if (!/^[a-z0-9_.]{2,32}$/.test(h) || secret.length > 500) { skipped.push(h || line.slice(0, 20) + ' (формат)'); continue; }
      if (have.has(h)) { skipped.push(h + ' (уже есть)'); continue; }
      have.add(h);
      db.stock.push({ id: nextStockId(), h, price, cat, secret: secret.replace(/\s*;;\s*/g, '\n') });
      added.push(h);
    }
    save(); pushAll({ t: 'catalog' });
    return send(res, 200, { added, skipped });
  }

  const sm = url.pathname.match(/^\/api\/admin\/stock\/(\d+)(\/delete)?$/);
  if (sm && req.method === 'POST') {
    const item = getStock(Number(sm[1]));
    if (!item || item.removed) return fail(res, 404, 'not found', 'notfound');
    if (sm[2]) {
      if (stockStatus(item.id) !== 'free') return fail(res, 409, 'в заказе или продан', 'busy');
      item.removed = true; save(); pushAll({ t: 'catalog' });
      return send(res, 200, { ok: true });
    }
    if (body.price !== undefined) { const pr = Number(body.price); if (!Number.isInteger(pr) || pr < 1 || pr > 100000) return fail(res, 400, 'price', 'validation'); item.price = pr; }
    if (body.cat !== undefined) { if (!['4l', '4c'].includes(body.cat)) return fail(res, 400, 'cat', 'validation'); item.cat = body.cat; }
    if (body.secret !== undefined) { const sc = String(body.secret).trim(); if (!sc || sc.length > 500) return fail(res, 400, 'secret', 'validation'); item.secret = sc; }
    save(); pushAll({ t: 'catalog' });
    return send(res, 200, { ok: true });
  }

  if (route === 'GET /api/admin/orders') {
    expireOrders();
    const list = db.orders.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 200).map(o => ({
      id: o.id, status: o.status, total: o.total, method: o.method, createdAt: o.createdAt, claimedAt: o.claimedAt, address: o.address,
      username: (db.users.find(u => u.id === o.userId) || {}).username || '?',
      items: o.items.map(id => { const x = getStock(id) || {}; return { id, h: x.h || '?', secret: x.secret || '' }; })
    }));
    return send(res, 200, { orders: list });
  }

  const om = url.pathname.match(/^\/api\/admin\/orders\/(SN-[0-9A-F]{6})\/(confirm|reject)$/);
  if (om && req.method === 'POST') {
    expireOrders();
    const order = db.orders.find(o => o.id === om[1]);
    if (!order) return fail(res, 404, 'not found', 'notfound');
    if (om[2] === 'confirm') {
      if (order.status === 'delivered') return send(res, 200, { ok: true, status: order.status });
      if (order.status !== 'review' && order.status !== 'pending') return fail(res, 409, 'bad status', 'status');
      // данные выдачи можно вписать прямо при подтверждении (купил у другого поставщика → вставил сюда)
      const given = body.data && typeof body.data === 'object' ? body.data : {};
      const next = {}, missing = [];
      for (const id of order.items) {
        const item = getStock(id);
        const raw = given[id] !== undefined ? String(given[id]).trim().replace(/\s*;;\s*/g, '\n') : item.secret;
        if (!raw) { missing.push(item.h); continue; }
        if (raw.length > 500) return fail(res, 400, 'data too long', 'validation');
        next[id] = raw;
      }
      if (missing.length) return send(res, 400, { error: 'нет данных выдачи', code: 'need_data', missing });
      for (const id of order.items) getStock(id).secret = next[id];
      markPaid(order, adminName);
    } else {
      if (order.status !== 'review' && order.status !== 'pending') return fail(res, 409, 'bad status', 'status');
      order.status = 'rejected'; order.rejectedAt = now(); order.rejectedBy = adminName; save();
      pushOrder(order); pushAdmins({ t: 'orders' }); pushAll({ t: 'catalog' });
    }
    return send(res, 200, { ok: true, status: order.status });
  }

  if (route === 'GET /api/admin/tickets') {
    const list = db.tickets.slice().sort((a, b) => b.updatedAt - a.updatedAt).map(t => ticketView(t, true));
    return send(res, 200, { tickets: list });
  }

  const tm = url.pathname.match(/^\/api\/admin\/tickets\/(T-[0-9A-F]{6})\/(reply|close)$/);
  if (tm && req.method === 'POST') {
    const t = db.tickets.find(x => x.id === tm[1]);
    if (!t) return fail(res, 404, 'not found', 'notfound');
    if (t.status === 'closed') return fail(res, 409, 'closed', 'closed');          // в закрытый тикет не пишем (и не переоткрываем случайно)
    if (tm[2] === 'reply') {
      const text = String(body.text || '').trim();
      if (!text || text.length > TEXT_MAX) return fail(res, 400, 'text', 'validation');
      t.messages.push({ from: 'admin', text, at: now() });
      t.status = 'answered';
    } else t.status = 'closed';
    t.updatedAt = now(); save(); pushTicket(t);
    return send(res, 200, { ticket: ticketView(t, true) });
  }

  return fail(res, 404, 'not found', 'notfound');
}

async function api(req, res, url) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const route = req.method + ' ' + url.pathname;

  if (req.method === 'POST') {            // лёгкая CSRF-защита: Origin должен совпадать с хостом
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== req.headers.host) return fail(res, 403, 'forbidden', 'csrf'); } catch { return fail(res, 403, 'forbidden', 'csrf'); } }
  }

  let body = {};
  if (req.method === 'POST') { try { body = await readJSON(req); } catch { return fail(res, 400, 'bad json', 'json'); } }

  if (route === 'GET /api/items') {
    const me = userOf(req), taken = takenIds(me && me.id);
    return send(res, 200, { items: db.stock.filter(s => !s.removed && !taken.has(s.id)).map(({ id, h, price, cat }) => ({ id, h, price, cat })) });
  }

  if (route === 'GET /api/me') {
    const u = userOf(req);
    return send(res, 200, { user: u ? { username: u.username, admin: isAdmin(u) } : null });
  }

  if (route === 'POST /api/register') {
    if (limited(ip, 'reg', 8, 3600e3)) return fail(res, 429, 'too many', 'rate');
    const username = String(body.username || '').trim(), password = String(body.password || ''), password2 = String(body.password2 || '');
    if (!NAME_RE.test(username)) return fail(res, 400, 'name', 'validation_name');
    if (password.length < 8 || password.length > 72) return fail(res, 400, 'pass', 'validation_pass');
    if (password !== password2) return fail(res, 400, 'pass2', 'pass2');
    if (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return fail(res, 409, 'taken', 'name');
    const salt = rid(16);
    const user = { id: rid(8), username, salt, hash: await hashPass(password, salt), createdAt: now() };
    db.users.push(user);
    return startSession(req, res, user);
  }

  if (route === 'POST /api/login') {
    if (limited(ip, 'login', 10, 600e3)) return fail(res, 429, 'too many', 'rate');
    const username = String(body.username || '').trim(), password = String(body.password || '');
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    const hash = await hashPass(password, user ? user.salt : '00'.repeat(16));   // одинаковое время ответа
    if (!user || !safeEq(hash, user.hash)) return fail(res, 401, 'creds', 'creds');
    return startSession(req, res, user);
  }

  if (route === 'POST /api/logout') {
    const tok = cookies(req).sid;
    if (tok) { const h = sha(tok); db.sessions = db.sessions.filter(s => s.h !== h); save(); }
    setSession(res, req, '', 0);
    return send(res, 200, { ok: true });
  }

  /* дальше только для вошедших */
  const user = userOf(req);
  if (!user) return fail(res, 401, 'auth', 'auth');

  if (route === 'POST /api/orders') {
    if (limited(ip, 'order', 20, 3600e3)) return fail(res, 429, 'too many', 'rate');
    const ids = Array.isArray(body.items) ? [...new Set(body.items.map(Number))] : [];
    const method = ['usdt', 'ton'].includes(body.method) ? body.method : null;
    if (!ids.length || ids.length > 10 || !method || ids.some(id => !getStock(id) || getStock(id).removed)) return fail(res, 400, 'bad order', 'validation');
    // свои прошлые неоплаченные заказы отменяем, чтобы не держать бронь
    db.orders.forEach(o => { if (o.userId === user.id && o.status === 'pending') { o.status = 'expired'; pushOrder(o); } });
    const taken = takenIds(user.id);
    if (ids.some(id => taken.has(id))) { save(); return fail(res, 409, 'unavailable', 'unavailable'); }
    const order = {
      id: 'SN-' + rid(3).toUpperCase(), userId: user.id, items: ids, method,
      total: ids.reduce((s, id) => s + getStock(id).price, 0),
      address: 'TEST-' + rid(10),            // в live сюда ляжет адрес из шлюза/кошелька
      status: 'pending', createdAt: now(), expiresAt: now() + ORDER_TTL
    };
    db.orders.push(order); save();
    pushAll({ t: 'catalog' }); pushAdmins({ t: 'orders' });
    return send(res, 201, { order: orderView(order, true) });
  }

  if (route === 'GET /api/orders') {
    expireOrders();
    const list = db.orders.filter(o => o.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
    return send(res, 200, { orders: list.map(o => orderView(o, true)) });
  }

  if (url.pathname.startsWith('/api/admin/')) {
    if (!isAdmin(user)) return fail(res, 403, 'forbidden', 'forbidden');
    return adminApi(req, res, url, body, user.username);
  }

  /* поддержка */
  if (route === 'GET /api/tickets') {
    return send(res, 200, { tickets: db.tickets.filter(t => t.userId === user.id).sort((a, b) => b.updatedAt - a.updatedAt).map(t => ticketView(t)) });
  }
  if (route === 'POST /api/tickets') {
    if (limited(ip, 'ticket', 10, 3600e3)) return fail(res, 429, 'too many', 'rate');
    const subject = String(body.subject || '').trim().slice(0, 80), text = String(body.message || '').trim();
    if (subject.length < 3 || !text || text.length > TEXT_MAX) return fail(res, 400, 'bad ticket', 'validation');
    if (db.tickets.filter(t => t.userId === user.id && t.status !== 'closed').length >= 5) return fail(res, 409, 'limit', 'limit');
    const t = { id: 'T-' + rid(3).toUpperCase(), userId: user.id, subject, status: 'open', createdAt: now(), updatedAt: now(), messages: [{ from: 'user', text, at: now() }] };
    db.tickets.push(t); save(); pushTicket(t);
    return send(res, 201, { ticket: ticketView(t) });
  }
  const tk = url.pathname.match(/^\/api\/tickets\/(T-[0-9A-F]{6})(\/messages)?$/);
  if (tk) {
    const t = db.tickets.find(x => x.id === tk[1] && x.userId === user.id);
    if (!t) return fail(res, 404, 'not found', 'notfound');
    if (req.method === 'GET' && !tk[2]) return send(res, 200, { ticket: ticketView(t) });
    if (req.method === 'POST' && tk[2]) {
      if (t.status === 'closed') return fail(res, 409, 'тикет закрыт', 'closed');     // закрытый тикет: писать нельзя
      if (limited(ip, 'tmsg', 30, 3600e3) || limited(user.id, 'tmsg-burst', 5, 30000)) return fail(res, 429, 'too many', 'rate');
      const text = String(body.text || '').trim();
      if (!text || text.length > TEXT_MAX || t.messages.length >= 200) return fail(res, 400, 'text', 'validation');
      const last = t.messages[t.messages.length - 1], tt = now();
      if (last && last.from === 'user') {                                            // антиспам: пауза и защита от дубля
        if (tt - last.at < 1500) return fail(res, 429, 'slow down', 'fast');
        if (last.text === text && tt - last.at < 30000) return send(res, 200, { ticket: ticketView(t) });
      }
      t.messages.push({ from: 'user', text, at: tt });
      t.status = 'open'; t.updatedAt = tt; save(); pushTicket(t);
      return send(res, 200, { ticket: ticketView(t) });
    }
  }

  const m = url.pathname.match(/^\/api\/orders\/(SN-[0-9A-F]{6})(\/fake-pay)?$/);
  if (m) {
    expireOrders();
    const order = db.orders.find(o => o.id === m[1] && o.userId === user.id);   // чужие заказы не видны
    if (!order) return fail(res, 404, 'not found', 'notfound');
    if (req.method === 'GET' && !m[2]) return send(res, 200, { order: orderView(order, true) });
    if (req.method === 'POST' && m[2]) {
      if (PAYMENT_MODE !== 'test') return fail(res, 404, 'not found', 'notfound');
      if (order.status !== 'pending' && order.status !== 'review' && order.status !== 'delivered') return fail(res, 409, 'bad status', 'status');
      return send(res, 200, { order: orderView(markReview(order), true) });
    }
  }

  return fail(res, 404, 'not found', 'notfound');
}

function startSession(req, res, user) {
  const token = rid(32);
  db.sessions = db.sessions.filter(s => s.exp > now());
  db.sessions.push({ h: sha(token), uid: user.id, exp: now() + SESSION_TTL });
  save();
  setSession(res, req, token, SESSION_TTL / 1000);
  send(res, 200, { user: { username: user.username, admin: isAdmin(user) } });
}

/* ---------- статика ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  const host = /^[a-z0-9.\-:\[\]]+$/i.test(req.headers.host || '') ? req.headers.host : '';
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'" + (host ? ' ws://' + host + ' wss://' + host : '') + "; frame-ancestors 'none'");
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, 500, 'server error', 'server');
  }
});
server.on('upgrade', wsUpgrade);
setInterval(expireOrders, 30000).unref();    // истёкшие брони → пуш клиентам
server.listen(PORT, () => console.log('http://localhost:' + PORT));
})().catch(e => { console.error('Не удалось запустить:', e.message); process.exit(1); });
