# Pixel Garden

Idle-игра про растения. Сервер (`server/`) считает всё сам, сайт (`site/`) только рисует.
`deploy/` — файлы для вашего сервера (на GitHub-обновление они не влияют).

- Обновление на сервере: `bash /srv/docker/plantgame/update.sh`
- Модерация (на сервере): `bash /srv/docker/plantgame/garden.sh help`
- Данные: `data/garden.db` (SQLite), снимки в `data/backups/`
