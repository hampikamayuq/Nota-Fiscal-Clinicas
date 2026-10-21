#!/usr/bin/env bash
# Backup diário do PostgreSQL (formato custom do pg_dump). Usuário e banco vêm do arquivo de ambiente.
# Cron sugerido: 30 3 * * * /caminho/do/projeto/deploy/backup.sh >> /caminho/do/projeto/backups/backup.log 2>&1
# Variáveis: COMPOSE_YML (padrão deploy/docker-compose.vps.yml) e ENV_FILE (padrão .env.production;
# na instalação local, ENV_FILE=.env.local COMPOSE_YML=deploy/docker-compose.local.yml).
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
COMPOSE="${COMPOSE_YML:-deploy/docker-compose.vps.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
valor() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }
PGUSER="$(valor POSTGRES_USER)"
PGDB="$(valor POSTGRES_DB)"
# A instalação local tem usuário e banco fixos.
[ "$COMPOSE" = deploy/docker-compose.local.yml ] && { PGUSER=fiscal; PGDB=fiscal; }
[ -n "$PGUSER" ] && [ -n "$PGDB" ] || { echo "defina POSTGRES_USER e POSTGRES_DB em $ENV_FILE" >&2; exit 1; }
mkdir -p backups
arquivo="backups/$PGDB-$(date +%Y%m%d-%H%M%S).dump"
trap 'rm -f "$arquivo.tmp"' EXIT
# Escreve num temporário e só renomeia no fim: uma queda no meio não deixa um .dump truncado com cara de válido.
docker compose -f "$COMPOSE" --env-file "$ENV_FILE" exec -T db pg_dump -U "$PGUSER" -Fc "$PGDB" > "$arquivo.tmp"
test -s "$arquivo.tmp"
mv "$arquivo.tmp" "$arquivo"
# Guarda 30 dias.
find backups -name "$PGDB-*.dump" -mtime +30 -delete
echo "$(date -Is) ok $arquivo $(du -h "$arquivo" | cut -f1)"
