#!/usr/bin/env bash
# Консоль модератора:  bash /srv/docker/plantgame/garden.sh <команда>     (список: garden.sh help)
exec docker exec "${CONTAINER:-plantgame}" node /app/admin.js "$@"
