# Sniper — тестовая версия с бэкендом

Локально: `node server.js` → http://localhost:3000 (зависимости не нужны).

## Render
1. Залей папку в GitHub (stock.json и data/ в .gitignore).
2. Render → New → Web Service → репозиторий. Build Command: пусто. Start Command: `node server.js`.
3. Environment: `PAYMENT_MODE=test`.
4. Чтобы аккаунты и заказы не пропадали при деплое: Disks → Add Disk, mount path `/var/data`, переменная `DATA_DIR=/var/data`
   (диски только на платном плане; на free всё сбрасывается при перезапуске).

## Ники
Реальные данные — в `stock.json` (по образцу `stock.example.json`), не коммитить. Пока используется example с тестовыми данными.

## Настоящая крипта потом
Вся выдача идёт через одну функцию `markPaid(order)` в server.js. Сейчас её вызывает фейк-кнопка,
позже — webhook шлюза или воркер блокчейна. При `PAYMENT_MODE=live` фейк-оплата отключена.
