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
const STOCK = JSON.parse(fs.readFileSync(path.join(__dirname, stockFile), 'utf8'));
const stockById = new Map(STOCK.map(s => [s.id, s]));
console.log(`склад: ${stockFile}, позиций: ${STOCK.length}, оплата: ${PAYMENT_MODE}`);

/* ---------- мини-БД ---------- */
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'db.json');
let db = { users: [], sessions: [], orders: [] };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch { /* первый запуск */ }
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

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

/* ---------- заказы ---------- */
function expireOrders() {
  let changed = false;
  for (const o of db.orders) if (o.status === 'pending' && o.expiresAt <= now()) { o.status = 'expired'; changed = true; }
  if (changed) save();
}
// ник занят, если есть оплаченный/выданный заказ, либо живая бронь
function takenIds(exceptUser) {
  expireOrders();
  const set = new Set();
  for (const o of db.orders) {
    if (o.status === 'paid' || o.status === 'delivered' || (o.status === 'pending' && o.userId !== exceptUser)) o.items.forEach(i => set.add(i));
  }
  return set;
}
function orderView(o, withData) {
  const items = o.items.map(id => { const s = stockById.get(id); return { id, h: s.h, price: s.price, cat: s.cat, ...(withData && o.status === 'delivered' ? { data: s.secret } : {}) }; });
  return {
    id: o.id, status: o.status, method: o.method, total: o.total, address: o.address,
    createdAt: o.createdAt, expiresAt: o.expiresAt, items, testMode: PAYMENT_MODE === 'test'
  };
}

// ЕДИНСТВЕННОЕ место, где заказ становится оплаченным и выдаётся.
// Позже его же вызывает webhook шлюза или воркер блокчейна. Идемпотентно.
function markPaid(order) {
  if (order.status !== 'pending') return order;
  order.status = 'paid'; order.paidAt = now();
  order.status = 'delivered'; order.deliveredAt = now();
  save();
  return order;
}

/* ---------- API ---------- */
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;

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
    return send(res, 200, { items: STOCK.filter(s => !taken.has(s.id)).map(({ id, h, price, cat }) => ({ id, h, price, cat })) });
  }

  if (route === 'GET /api/me') {
    const u = userOf(req);
    return send(res, 200, { user: u ? { username: u.username } : null });
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
    if (!ids.length || ids.length > 10 || !method || ids.some(id => !stockById.has(id))) return fail(res, 400, 'bad order', 'validation');
    // свои прошлые неоплаченные заказы отменяем, чтобы не держать бронь
    db.orders.forEach(o => { if (o.userId === user.id && o.status === 'pending') o.status = 'expired'; });
    const taken = takenIds(user.id);
    if (ids.some(id => taken.has(id))) { save(); return fail(res, 409, 'unavailable', 'unavailable'); }
    const order = {
      id: 'SN-' + rid(3).toUpperCase(), userId: user.id, items: ids, method,
      total: ids.reduce((s, id) => s + stockById.get(id).price, 0),
      address: 'TEST-' + rid(10),            // в live сюда ляжет адрес из шлюза/кошелька
      status: 'pending', createdAt: now(), expiresAt: now() + ORDER_TTL
    };
    db.orders.push(order); save();
    return send(res, 201, { order: orderView(order, true) });
  }

  if (route === 'GET /api/orders') {
    expireOrders();
    const list = db.orders.filter(o => o.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
    return send(res, 200, { orders: list.map(o => orderView(o, true)) });
  }

  const m = url.pathname.match(/^\/api\/orders\/(SN-[0-9A-F]{6})(\/fake-pay)?$/);
  if (m) {
    expireOrders();
    const order = db.orders.find(o => o.id === m[1] && o.userId === user.id);   // чужие заказы не видны
    if (!order) return fail(res, 404, 'not found', 'notfound');
    if (req.method === 'GET' && !m[2]) return send(res, 200, { order: orderView(order, true) });
    if (req.method === 'POST' && m[2]) {
      if (PAYMENT_MODE !== 'test') return fail(res, 404, 'not found', 'notfound');
      if (order.status !== 'pending' && order.status !== 'delivered') return fail(res, 409, 'bad status', 'status');
      return send(res, 200, { order: orderView(markPaid(order), true) });
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
  send(res, 200, { user: { username: user.username } });
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
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
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
server.listen(PORT, () => console.log('http://localhost:' + PORT));
