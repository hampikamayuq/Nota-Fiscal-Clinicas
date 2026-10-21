#!/usr/bin/env bash
# Envia o código para o VPS e reconstrói o container. Rodar da raiz do repositório:
#   VPS=usuario@host VPS_DIR=/caminho/no/servidor ./deploy/deploy.sh
# COMPOSE_YML escolhe a topologia (padrão deploy/docker-compose.vps.yml; com Traefik, deploy/docker-compose.yml).
# Nunca envia .env, certificados, dados nem backups (e --delete não os apaga lá).
set -euo pipefail
HOST="${VPS:?defina VPS=usuario@host}"
DIR="${VPS_DIR:?defina VPS_DIR=/caminho/no/servidor}"
COMPOSE="${COMPOSE_YML:-deploy/docker-compose.vps.yml}"
rsync -az --delete \
  --exclude .git --exclude node_modules --exclude web/node_modules --exclude dist --exclude web/dist \
  --exclude src/generated --exclude '.env' --exclude '.env.*' --exclude dados --exclude backups \
  --exclude '*.pfx' --exclude '*.p12' --exclude .impeccable \
  ./ "$HOST:$DIR/"
ssh "$HOST" "cd $DIR && docker compose -f $COMPOSE --env-file .env.production up -d --build && docker compose -f $COMPOSE --env-file .env.production ps"
