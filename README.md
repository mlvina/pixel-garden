# Pixel Garden

Idle-игра про растения. Сервер (`server/`) считает всё сам, сайт (`site/`) только рисует.
`deploy/` — файлы для вашего сервера (на GitHub-обновление они не влияют).

- Автообновление: `bash /srv/docker/plantgame/update.sh --auto` (дальше достаточно пушить в GitHub)
- Обновить сейчас: `bash /srv/docker/plantgame/update.sh`
- Модерация: `bash /srv/docker/plantgame/garden.sh help`
- Данные: `data/garden.db` (SQLite), снимки в `data/backups/`

Папки `site/ui/` и `site/sfx/` (картинки и звуки из купленного/скачанного пака) в репозиторий не входят:
загружаются на сервер один раз вручную. Без них игра работает, но выглядит проще.
