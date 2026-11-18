#!/usr/bin/env bash
# Pixel Garden — обновление с GitHub.
#   bash update.sh            обновить сейчас
#   bash update.sh --auto     включить автообновление (проверка раз в 5 минут, ставится в crontab текущего пользователя)
#   bash update.sh --auto-off выключить автообновление
#   bash update.sh --status   что установлено и когда проверяли
#   bash update.sh --self     заменить сам update.sh/garden.sh версиями из репозитория (только вручную)
#   bash update.sh --local    взять файлы из папки incoming/ (если GitHub не нужен)
# Скачанный код на хосте НЕ запускается: он копируется в папки, а перед установкой проверяется в изолированном контейнере без сети.
set -euo pipefail
export PATH="$PATH:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"   # cron запускает со скудным PATH
cd "$(dirname "$(readlink -f "$0")")"
HERE="$(pwd)"
[ -f update.env ] && . ./update.env
REPO="${REPO:-}"          # например: mylogin/pixel-garden
REF="${REF:-main}"        # ветка или тег; для осторожности можно завести ветку release и держать REF=release
SITE_DIR="${SITE_DIR:-/srv/docker/caddy/sites/plantgame}"
CONTAINER="${CONTAINER:-plantgame}"
MODE="${1:-now}"
CRON_MARK="update.sh --cron"
say() { echo "[$(date '+%F %T')] $*"; }

case "$MODE" in
  --auto)
    command -v crontab >/dev/null || { echo "✗ Нужен cron: sudo apt install cron"; exit 1; }
    [ -n "$REPO" ] || { echo "✗ Сначала впишите REPO=логин/репозиторий в update.env"; exit 1; }
    ( crontab -l 2>/dev/null | grep -vF "$CRON_MARK" || true; echo "*/5 * * * * bash $HERE/update.sh --cron >> $HERE/update.log 2>&1" ) | crontab -
    echo "✓ Автообновление включено: раз в 5 минут сервер сверяется с GitHub ($REPO, $REF). Журнал: $HERE/update.log"
    exec bash "$HERE/update.sh" ;;
  --auto-off)
    ( crontab -l 2>/dev/null | grep -vF "$CRON_MARK" || true ) | crontab - ; echo "✓ Автообновление выключено"; exit 0 ;;
  --status)
    echo "Репозиторий: ${REPO:-не задан} ($REF)"; echo "Установлено: $(cat .installed-sha 2>/dev/null || echo неизвестно)  версия $(cat .installed-version 2>/dev/null || echo ?)"
    echo "Автообновление: $(crontab -l 2>/dev/null | grep -qF "$CRON_MARK" && echo включено || echo выключено)"
    [ -f update.log ] && { echo "--- последние строки update.log ---"; tail -n 8 update.log; }; exit 0 ;;
esac

exec 9>"$HERE/.update.lock"
flock -n 9 || { [ "$MODE" = "--cron" ] && exit 0; echo "✗ Обновление уже идёт"; exit 1; }

TARGET="$REF"
if [ "$MODE" = "--cron" ]; then
  [ -f update.log ] && [ "$(stat -c%s update.log)" -gt 200000 ] && { tail -n 200 update.log > update.log.tmp; mv update.log.tmp update.log; }
  REMOTE="$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github.sha' "https://api.github.com/repos/$REPO/commits/$REF" 2>/dev/null | grep -Eo '^[0-9a-f]{40}$' || true)"
  [ -n "$REMOTE" ] || exit 0                                   # GitHub недоступен — тихо выходим, попробуем через 5 минут
  [ "$REMOTE" = "$(cat .installed-sha 2>/dev/null || true)" ] && exit 0
  say "Найдена новая версия ${REMOTE:0:8}"; TARGET="$REMOTE"
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ "$MODE" = "--local" ]; then
  [ -d incoming ] || { echo "✗ Нет папки incoming/"; exit 1; }
  cp -a incoming/. "$TMP/"
else
  [ -n "$REPO" ] || { echo "✗ Впишите REPO=логин/репозиторий в update.env"; exit 1; }
  [ "$TARGET" = "$REF" ] && TARGET="$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github.sha' "https://api.github.com/repos/$REPO/commits/$REF" 2>/dev/null | grep -Eo '^[0-9a-f]{40}$' || echo "$REF")"
  say "Скачиваю $REPO (${TARGET:0:12})"
  curl -fsSL --max-time 90 "https://codeload.github.com/$REPO/tar.gz/$TARGET" | tar -xz -C "$TMP" --strip-components=1
fi
find "$TMP" -type l -delete   # символические ссылки не принимаем

if [ "$MODE" = "--self" ]; then
  for f in update.sh garden.sh; do
    [ -f "$TMP/deploy/$f" ] && bash -n "$TMP/deploy/$f" && cp "$TMP/deploy/$f" "$f.new" && mv "$f.new" "$f" && echo "✓ $f обновлён"
  done; exit 0
fi

[ -f "$TMP/server/server.js" ] && [ -f "$TMP/site/index.html" ] || { say "✗ В архиве нет server/server.js или site/index.html"; exit 1; }

say "Пробный запуск нового кода (изолированный контейнер без сети)"
OUT="$(docker run --rm --network none --tmpfs /tmp -e DATA_DIR=/tmp/d -e PORT=3999 -e ADMIN_PORT=3998 \
  -v "$TMP/server:/app:ro" node:22-alpine sh -c 'for f in /app/*.js; do node --check "$f" || exit 1; done; timeout 5 node /app/server.js' 2>&1 || true)"
echo "$OUT" | grep -q "Pixel Garden API" || { say "✗ Новый код не запускается, обновление отменено:"; echo "$OUT" | tail -15; exit 1; }

say "Снимок сохранений"
mkdir -p data backups app
if docker exec "$CONTAINER" node /app/admin.js backup >/dev/null 2>&1; then :
elif [ -f data/players.json ]; then cp data/players.json "backups/players-$(date +%F-%H%M%S).json"; echo "Старый players.json сохранён в backups/"; fi

say "Устанавливаю"
rm -rf app.prev && cp -a app app.prev
cp -a "$TMP/server/." app/
mkdir -p "$SITE_DIR"
cp -a "$TMP/site/." "$SITE_DIR/"      # папки ui/ и sfx/, загруженные вручную, не удаляются
chmod -R a+rX app "$SITE_DIR"

say "Перезапускаю $CONTAINER"
docker restart "$CONTAINER" >/dev/null
sleep 4
if docker logs --since 20s "$CONTAINER" 2>&1 | grep -q "Pixel Garden API"; then
  echo "${TARGET}" | grep -Eq '^[0-9a-f]{40}$' && echo "$TARGET" > .installed-sha
  cat "$TMP/VERSION" > .installed-version 2>/dev/null || true
  say "✓ Готово. Версия: $(cat .installed-version 2>/dev/null || echo ?)"
  [ -f "$TMP/deploy/update.sh" ] && ! cmp -s "$TMP/deploy/update.sh" update.sh && say "ℹ В репозитории новый update.sh. Принять его: bash update.sh --self"
else
  say "✗ Сервер не запустился, откатываю"
  cp -a app.prev/. app/; docker restart "$CONTAINER" >/dev/null; say "Откат выполнен."
  docker logs --tail 15 "$CONTAINER" 2>&1 || true
  exit 1
fi
