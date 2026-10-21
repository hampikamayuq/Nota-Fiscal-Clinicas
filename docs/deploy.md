# Instalação

Uma instalação por clínica: API + interface num só container
([`Dockerfile`](../Dockerfile)) e um PostgreSQL. Escolha onde ela roda:

| Opção | Para quem | Arquivo | HTTPS |
|---|---|---|---|
| **Local** | um computador da clínica ou servidor na rede interna | [`deploy/docker-compose.local.yml`](../deploy/docker-compose.local.yml) | não (só `localhost` ou rede confiável) |
| **VPS próprio** | servidor vazio (Hostinger, DigitalOcean, Hetzner, AWS Lightsail…) | [`deploy/docker-compose.vps.yml`](../deploy/docker-compose.vps.yml) + [`Caddyfile`](../deploy/Caddyfile) | automático (Caddy + Let's Encrypt) |
| **VPS com Traefik** | servidor que já roda Traefik (n8n, Coolify, Dokploy…) | [`deploy/docker-compose.yml`](../deploy/docker-compose.yml) | do Traefik |
| **Render** | sem servidor para cuidar | [`render.yaml`](../render.yaml) | do Render |
| **Desenvolvimento** | quem mexe no código | `npm run api` + `npm run web` (README) | não |

Qualquer outra plataforma que rode um container (Railway, Fly.io, Coolify, Easypanel)
serve: aponte para o `Dockerfile`, dê um PostgreSQL em `DATABASE_URL` e as
variáveis da tabela abaixo. As migrações rodam sozinhas quando o container sobe.

### Local

Precisa de Docker (Docker Desktop no Windows/macOS).

```bash
cp .env.example .env.local      # preencha POSTGRES_PASSWORD, AUTH_SECRET, CLINIC_NAME, FISCAL_PROVIDER e FOCUS_*
docker compose -f deploy/docker-compose.local.yml --env-file .env.local up -d --build
docker compose -f deploy/docker-compose.local.yml --env-file .env.local exec app node src/api/admin-cli.ts usuario voce@clinica.com.br "Seu nome" ADMIN
```

Abra http://localhost:3100, entre com a senha impressa e cadastre a empresa em
**Empresas → Nova empresa**. O webhook da Focus não alcança um computador local:
o status das notas vem pelo botão **Sincronizar**. Backup:
`ENV_FILE=.env.local COMPOSE_YML=deploy/docker-compose.local.yml ./deploy/backup.sh`.

### VPS próprio (Caddy)

1. Aponte o domínio (ex.: `nfse.suaclinica.com.br`) para o IP do servidor e
   instale o Docker nele.
2. Copie o projeto (`git clone` ou `VPS=root@ip VPS_DIR=/opt/clinica-fiscal ./deploy/deploy.sh`).
3. Crie `.env.production` (modo 600) com a tabela abaixo.
4. `docker compose -f deploy/docker-compose.vps.yml --env-file .env.production up -d --build`
5. Crie o primeiro ADMIN com `... exec app node src/api/admin-cli.ts usuario ...`.

As portas 80 e 443 precisam estar livres e abertas no firewall.

### VPS com Traefik

Igual ao anterior, com `deploy/docker-compose.yml` (o padrão de `deploy.sh` é o
do Caddy: use `COMPOSE_YML=deploy/docker-compose.yml`) e mais `PROXY_NETWORK`,
a rede docker do Traefik. O resolver de certificados se chama `le`; ajuste o
label se o seu tiver outro nome.

### Render

New → Blueprint → este repositório. O Render cria o banco e gera `AUTH_SECRET`
e `FOCUS_WEBHOOK_SECRET`; preencha `CLINIC_NAME` e os tokens da Focus. O disco
não é persistente: cadastre empresas pelo assistente (não por `empresas/`). O
primeiro ADMIN sai pelo Shell do serviço com `node src/api/admin-cli.ts usuario ...`.

## Operação em servidor

- Atualizar: `VPS=usuario@host VPS_DIR=/caminho ./deploy/deploy.sh` (rsync + rebuild),
  ou `git pull` no servidor seguido do `up -d --build`.
- Comandos: `docker compose -f <compose> --env-file .env.production <ps|logs app|restart app>`.
  Mudou o `.env.production`? `up -d app` — `restart` não relê o arquivo.
- Backup: `deploy/backup.sh` diário pelo cron, 30 dias em `backups/`.
  **Os backups ficam no mesmo servidor**: copie-os para fora.

## Antes do primeiro deploy

1. **Empresas.** Depois de subir, pela interface (Empresas → Nova empresa) —
   ou antes, em `empresas/<slug>/config.json` por CNPJ (códigos do contador;
   sem certificado) e, se quiser, `empresas/cadastro.json`, versionados.
2. **Certificado A1 na Focus.** Em cada empresa do painel Focus: Editar → Anexar
   certificado. Sem ele a Focus não assina a DPS, nem em homologação.
3. **Banco.** `prisma migrate deploy` roda quando o container sobe; se falhar, o
   container não sobe com schema velho. O seed **não** roda em produção. As
   empresas de `empresas/` (e o cadastro) entram com `npm run db:clinica`; o
   primeiro usuário ADMIN vem de `admin-cli.ts usuario`.
4. **`.env.production`** (modo 600) com a tabela abaixo.
5. **Webhook na Focus**, um por CNPJ **e por ambiente** (homologação em
   `homologacao.focusnfe.com.br`, produção em `api.focusnfe.com.br`), evento `nfsen`:

   ```bash
   curl -u "$TOKEN:" -H 'content-type: application/json' \
     -d '{"cnpj":"<cnpj>","event":"nfsen","url":"https://<FISCAL_HOST>/api/webhooks/focus","authorization":"<FOCUS_WEBHOOK_SECRET>"}' \
     https://api.focusnfe.com.br/v2/hooks
   ```

   A API só aceita a chamada se o cabeçalho `Authorization` for exatamente esse
   valor, e nunca confia no corpo: consulta a Focus pela referência.
6. **Domínio** apontando para o servidor; HTTPS é do Traefik (Let's Encrypt).

## Variáveis de `.env.production`

| Variável | Valor | Para quê |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | ex.: `clinica-fiscal` | nome dos containers e do volume do banco. **Não mude depois**: outro nome = outro volume, vazio |
| `POSTGRES_USER` / `POSTGRES_DB` | ex.: `fiscal` / `fiscal` | idem: fixos depois do primeiro `up` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` (só hex: entra na URL sem codificação) | senha do banco |
| `FISCAL_HOST` | `nfse.suaclinica.com.br` | domínio do certificado HTTPS (Caddy ou Traefik) |
| `PROXY_NETWORK` | rede docker do Traefik | só no compose com Traefik |
| `CLINIC_NAME` | nome curto da clínica | "<nome> Fiscal" na interface |
| `AUTH_SECRET` | `openssl rand -base64 48` | assina o cookie de sessão |
| `FISCAL_PROVIDER` | `focus` (ou `fake`) | provedor das notas; nunca troca sozinho |
| `FOCUS_ENV` | `production` ou `homologation` | ambiente da Focus, para todas as empresas |
| `ALLOW_PRODUCTION_EMISSION` | `true`/`false` | segunda trava de produção |
| `FOCUS_TOKEN_HOMOLOGACAO_<SLUG>` / `FOCUS_TOKEN_PRODUCAO_<SLUG>` | token da empresa no ambiente | um por pasta em `empresas/` |
| `FOCUS_WEBHOOK_SECRET` | `openssl rand -hex 32` | autentica o webhook |

`API_HOST`, `API_PORT`, `API_COOKIE_SECURE` e `API_TRUST_PROXY` já vêm do
Dockerfile e do compose.

## Instalação feita antes desta versão

O compose deixou de ter nome de projeto, usuário e banco fixos. Antes do próximo
deploy, acrescente ao `.env.production` **os valores que a instalação já usa**
(`docker compose ls` e `docker volume ls` mostram o nome do projeto; o usuário e
o banco estão no compose antigo). Sem eles o compose recusa subir; com valores
diferentes, ele cria um volume novo e vazio — os dados não somem, mas o app sobe
sem eles.

```
COMPOSE_PROJECT_NAME=<nome antigo do projeto>
POSTGRES_USER=<usuário antigo>
POSTGRES_DB=<banco antigo>
PROXY_NETWORK=<rede do Traefik>
FISCAL_HOST=<o host que a instalação já usa>
CLINIC_NAME=<nome da clínica>
```

Também mudaram: o MCP lê `FISCAL_API_URL`/`FISCAL_API_TOKEN`; o cookie de sessão
trocou de nome (todo mundo entra de novo uma vez); `deploy.sh` exige `VPS` e
`VPS_DIR`. Os dados da emissora passaram a viver no banco: rode
`npm run db:clinica` uma vez depois do deploy para importar os `config.json`
existentes (até lá a emissão continua lendo os arquivos).

## Ligar produção numa empresa

As três travas, todas: `FOCUS_ENV=production`, `ALLOW_PRODUCTION_EMISSION=true` e,
por empresa, um ADMIN liga a produção em **Empresas → Ligar produção**, digitando o
CNPJ (fica na auditoria como `PRODUCTION_ENABLED`). Mais `FOCUS_TOKEN_PRODUCAO_<SLUG>`
e o webhook cadastrado em `api.focusnfe.com.br`. Faltando qualquer uma, a emissão é
recusada com a mensagem de qual falta; não há queda silenciosa para homologação.
Desligar: o mesmo botão, com o CNPJ.

## Backup e operação

- `deploy/backup.sh` diário (acima); teste uma restauração de tempos em tempos.
- `GET /api/health` responde 200 só com o banco de pé.
- O limite de tentativas de login é por processo: mantenha **uma** instância, ou
  troque o contador por Redis antes de escalar.
- Logs não levam query string (a busca de pacientes tem nome e CPF), token nem senha.
