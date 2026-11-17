#!/usr/bin/env node
// Консольная утилита модератора. Работает ТОЛЬКО внутри контейнера и говорит с игрой по 127.0.0.1:
// docker exec plantgame node /app/admin.js ban Вася   (короче: garden ban Вася)
'use strict';
const http = require('node:http');
const req = http.request({ host: '127.0.0.1', port: Number(process.env.ADMIN_PORT) || 3001, method: 'POST', path: '/' }, res => {
  let d = ''; res.setEncoding('utf8');
  res.on('data', c => { d += c; });
  res.on('end', () => { process.stdout.write(d.endsWith('\n') ? d : d + '\n'); process.exit(res.statusCode === 200 ? 0 : 1); });
});
req.on('error', e => { console.error('Не удалось связаться с игрой: ' + e.message); process.exit(2); });
req.end(JSON.stringify({ args: process.argv.slice(2) }));
