#!/usr/bin/env bash
# Обновление Pixel Garden одной командой:   bash /srv/docker/plantgame/update.sh
#   bash update.sh            — скачать свежую версию с GitHub (настройки в update.env)
#   bash update.sh --local    — взять файлы из папки incoming/ (загруженной через панель)
# Скрипт лежит на сервере и сам из GitHub НЕ обновляется; скачанный код на хосте не запускается.
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
[ -f update.env ] && . ./update.env
REPO="${REPO:-}"          # например: mylogin/pixel-garden
REF="${REF:-main}"        # ветка или тег (тег, например v2.0.0, надёжнее)
SITE_DIR="${SITE_DIR:-/srv/docker/caddy/sites/plantgame}"
CONTAINER="${CONTAINER:-plantgame}"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

if [ "${1:-}" = "--local" ]; then
  [ -d incoming ] || { echo "✗ Нет папки incoming/"; exit 1; }
  cp -a incoming/. "$TMP/"
else
  [ -n "$REPO" ] || { echo "✗ Впишите REPO=логин/репозиторий в update.env"; exit 1; }
  echo "→ Скачиваю $REPO ($REF)"
  curl -fsSL --max-time 60 "https://codeload.github.com/$REPO/tar.gz/$REF" | tar -xz -C "$TMP" --strip-components=1
fi
find "$TMP" -type l -delete   # символические ссылки не принимаем

[ -f "$TMP/server/server.js" ] && [ -f "$TMP/site/index.html" ] || { echo "✗ В архиве нет server/server.js или site/index.html"; exit 1; }

echo "→ Проверяю синтаксис (изолированный контейнер без сети)"
docker run --rm --network none -v "$TMP/server:/app:ro" node:22-alpine node --check /app/server.js

echo "→ Копия сохранений"
mkdir -p data backups app
[ -f data/players.json ] && cp data/players.json "backups/players-$(date +%F-%H%M%S).json"
ls -1t backups/players-*.json 2>/dev/null | tail -n +11 | xargs -r rm -f --

echo "→ Устанавливаю"
[ -f app/server.js ] && cp app/server.js app/server.js.prev
install -m 644 "$TMP/server/server.js" app/server.js
mkdir -p "$SITE_DIR"
cp -a "$TMP/site/." "$SITE_DIR/"
chmod -R a+rX "$SITE_DIR"

echo "→ Перезапускаю $CONTAINER"
docker restart "$CONTAINER" >/dev/null
sleep 3
if docker logs --since 15s "$CONTAINER" 2>&1 | grep -q "Pixel Garden API"; then
  echo "✓ Готово. Версия: $(cat "$TMP/VERSION" 2>/dev/null || echo неизвестна)"
else
  echo "✗ Сервер не запустился, откатываю"
  if [ -f app/server.js.prev ]; then cp app/server.js.prev app/server.js; docker restart "$CONTAINER" >/dev/null; echo "Откат выполнен."; fi
  docker logs --tail 15 "$CONTAINER" 2>&1 || true
  exit 1
fi
