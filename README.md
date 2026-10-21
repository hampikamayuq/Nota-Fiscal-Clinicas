# Clínica Fiscal — NFS-e para clínicas de saúde

Interface web e API para a recepção de uma clínica emitir NFS-e do padrão
nacional pela [Focus NFe](https://focusnfe.com.br), com uma ou mais empresas
(CNPJs), cada uma com o próprio certificado (na Focus), o próprio token e o
próprio regime tributário. Serve a qualquer clínica de saúde — médica,
odontológica, de psicologia, fisioterapia, nutrição — porque o profissional
carrega a sigla do próprio conselho (CRM, CRO, CRP, CREFITO…) e a nota sai
pronta para o paciente pedir reembolso ao plano.

Desde 01/01/2026 o Rio de Janeiro emite NFS-e só pelo padrão nacional
([`docs/rio.md`](./docs/rio.md)); outras cidades aderem no próprio ritmo.
Confirme com o contador se a sua já está no padrão nacional.

## O que a clínica personaliza

| O quê | Onde | Quem |
|---|---|---|
| Nome na interface e na aba ("<nome> Fiscal") | `CLINIC_NAME` no `.env` | técnico |
| Empresas (CNPJ, município, regime, códigos do serviço, PIS/COFINS, IBS/CBS) | pela interface (Empresas → Nova empresa, assistente em seis passos) ou `empresas/<slug>/config.json`, um por CNPJ | financeiro, com o contador |
| Profissionais, serviços, modelos de nota | pela interface (Profissionais, Serviços, Modelos) ou `empresas/cadastro.json` na carga inicial | financeiro |
| Padrão fiscal e exceções por serviço | pela interface (Empresas, Serviços) | financeiro |
| Usuários e papéis | `src/api/admin-cli.ts usuario` | técnico |
| Cores e fontes | tokens de `:root` em `web/src/index.css` | quem cuidar do visual |

Nada fiscal é inventado pelo código: código de serviço, regime e tratamento do
ISS vêm do `config.json` preenchido com o contador. Faltando algo obrigatório ou
fora do formato do leiaute, o programa **recusa subir** em vez de emitir uma
nota errada em nome da clínica.

## Antes de qualquer coisa

1. **Certificado A1 (e-CNPJ) de cada empresa anexado na Focus** (painel da
   Focus → empresa → Editar → Anexar certificado). Sem ele a Focus não assina a
   DPS, nem em homologação.
2. **Node 22.12 ou superior** (exigência do Prisma 7; o container usa Node 24) e PostgreSQL.
3. **O contador confirmou os dados fiscais de cada empresa** — pelo assistente
   da tela Empresas ou em `empresas/<slug>/config.json` (modelo em
   [`config.example.json`](./config.example.json); cada campo está comentado em
   `src/config.ts`).

## Instalação

Local (um computador da clínica), VPS próprio com HTTPS automático, VPS que já
tem Traefik, Render ou qualquer plataforma de containers: passo a passo em
[`docs/deploy.md`](./docs/deploy.md). Para desenvolver:

```bash
npm install                 # também gera o cliente Prisma
npm --prefix web install
cp .env.example .env        # banco, CLINIC_NAME, AUTH_SECRET, provedor fiscal
```

`.env` nunca é versionado. Os `config.json` são: CNPJ é dado público, e a
configuração fiscal precisa de histórico.

## Configuração

### Empresas

Dois caminhos levam ao mesmo lugar (a tabela `Company`, de onde a emissão lê os
dados da emissora):

- **Pela interface** — Empresas → **Nova empresa**. O assistente pergunta, em
  seis passos, identificação (CNPJ, razão social, inscrição municipal),
  município (busca pelo CEP e traz o código IBGE), regime tributário, código do
  serviço, tributos (Lei 12.741, PIS/COFINS, IBS/CBS) e mostra a revisão. Os
  códigos do serviço viram o padrão fiscal da empresa, que todo serviço do
  catálogo herda. ADMIN e FINANCE.
- **Por arquivo** — uma pasta por CNPJ em `empresas/`
  ([`empresas/LEIA-ME.md`](./empresas/LEIA-ME.md)) e `npm run db:clinica`.

Nos dois casos a empresa tem um **identificador** (slug) que dá nome ao token da
Focus no `.env`: `FOCUS_TOKEN_HOMOLOGACAO_<SLUG>` / `FOCUS_TOKEN_PRODUCAO_<SLUG>`
(maiúsculas, hífen vira sublinhado). A tela mostra o nome exato da variável.
O que o contador define (campos do `config.json`; o assistente pergunta os
mesmos):

| Campo | O que é | Exemplo (Simples) | Exemplo (sociedade de profissionais) |
|---|---|---|---|
| `opSimpNac` / `regApTribSN` | Simples Nacional | `3` / `1` | `1` (não optante) |
| `regEspTrib` | Regime especial | `0` | `6` = Sociedade de Profissionais |
| `codigoTributacaoNacional` (+ `codigoTributacaoMunicipal` onde a prefeitura exige) | Código do serviço | `040101` (+ `001` no Rio) | idem |
| `codigoNbs` | NBS | `123012100` | idem |
| `pisCofins.cst` | PIS/COFINS | `07` isenta | `01` alíquota básica |
| `aliquotaIss` | ISS destacado | — (Simples sem retenção: o fisco recusa alíquota, E0625) | — (ISS fixo por profissional) |
| `percentualTributosSimples` / `percentualTributosFederais` | Lei 12.741 | `6.00` | `11.33` |
| `ibsCbs` | Reforma tributária | cIndOp `030101`, CST `000`, cClassTrib `000001` | idem |

Pontos a confirmar com o contador em qualquer clínica: a inscrição municipal
(algumas prefeituras exigem), o código de tributação municipal (o Rio exige:
tabela de saúde em [`docs/rio-codigos-saude.md`](./docs/rio-codigos-saude.md))
e o caso de **ISS retido pelo tomador** (empresa ou convênio pagando a nota),
que exige alíquota — hoje a nota sai sempre "não retido".

### Carga inicial

```bash
npm run db:clinica
```

Lê todas as pastas de `empresas/`, cadastra as empresas que faltam (dados da
emissora e padrão fiscal) e, se existir `empresas/cadastro.json` (modelo em
[`cadastro.example.json`](./cadastro.example.json)), os profissionais, serviços
e modelos de nota. Não cria usuário, não liga produção e não sobrescreve o que
um ADMIN já mudou pela interface; pode repetir, inclusive em produção.

Na interface a recepção escolhe o **modelo** (ex.: "Consulta Dra. Silva") ou o
serviço; nome, conselho, número e RQE do profissional entram sozinhos na
descrição. O serviço não leva o nome do profissional: o preço por profissional
fica no modelo.

### Ambiente (`.env`)

`DATABASE_URL`, `CLINIC_NAME`, `AUTH_SECRET`, `FISCAL_PROVIDER` e os tokens da
Focus — comentados em [`.env.example`](./.env.example); produção em
[`docs/deploy.md`](./docs/deploy.md).

## Uso

```bash
npm run api          # terminal 1 — API em 127.0.0.1:3100
npm run web          # terminal 2 — Vite em http://127.0.0.1:5173 (proxy de /api)
```

Telas: Início, Nova nota (empresa → paciente → profissional, com a "nota viva"
ao lado), Nota (modelos e serviços, edição de item, revisão da descrição,
emissão, sincronização, PDF/XML e cancelamento), Notas, Relatórios, Pacientes,
Profissionais, Serviços, Modelos, Empresas (padrão fiscal e interruptor de
produção) e Auditoria. Usuários e empresas sem tela: `src/api/admin-cli.ts`.

## Regras da casa que o código impõe

- **A competência é sempre hoje.** Nota retroativa força reapuração na
  contabilidade; a interface não oferece outra data (a API aceita
  `competenceDate` para exceções, sob responsabilidade de quem chama).
- **Endereço inteiro ou nenhum.** O endereço do paciente só vai à Focus com CEP
  consultado (código IBGE), logradouro e número; faltando um, a nota sai sem
  endereço — pela metade o fisco rejeita.
- **Sem CPF, diga por quê.** Turista → estrangeiro (com ou sem NIF). Sem
  identificação → "não informado" (a nota sai sem tomador).
- **Descrição sem dado de saúde.** Ver [LGPD](#lgpd).
- **Produção só com três travas**: `FOCUS_ENV=production`,
  `ALLOW_PRODUCTION_EMISSION=true` e a empresa ligada por um ADMIN digitando o
  CNPJ (fica na auditoria). Faltando uma, a emissão é recusada dizendo qual.

## Como funciona

```
rascunho → pronta → revisão da descrição → enviando → processando → emitida
                                                        ↘ recusada (motivo da Focus/SEFIN)
```

**A referência é a chave de idempotência.** Cada nota vai à Focus com uma
referência determinística, gravada como "enviando" **antes** da chamada. Queda
de rede nunca vira segunda nota: reenviar a mesma referência devolve a nota que
já existe.

**O status vem do webhook.** A Focus chama `POST /api/webhooks/focus` quando a
SEFIN responde; a API confere o segredo do cabeçalho e **consulta a Focus pela
referência** em vez de confiar no corpo. "Sincronizar" faz a mesma consulta à mão.

**O que vai ao fisco fica congelado na nota.** Nome, conselho, número e RQE do
profissional, descrição, valores e códigos tributários são copiados para a nota
na emissão; mudar o cadastro depois não muda nota emitida.

## Runbook

**"Processando" por mais de alguns minutos.** Clique em Sincronizar. Se
continuar, veja os logs do app (`docs/deploy.md`) e o painel da Focus
(Requisições).

**"Token da Focus ausente" / "Produção não está habilitada".** Falta uma das
travas ou o token daquela empresa no `.env` do servidor. A mensagem diz qual.

**Nota recusada.** O motivo da SEFIN aparece na nota (ex.: `E0207` CPF não
encontrado na Receita; `E0625` alíquota de ISS em optante do Simples). Corrija o
cadastro e emita de novo — a nota recusada não gastou numeração.

**Nota errada já emitida.** Cancele pela própria nota (ADMIN/FINANCE, com
justificativa) e emita outra. Só sai do ar por cancelamento.

**Desligar a produção numa emergência.** Empresas → "Desligar produção" + CNPJ.

**Backup.** `deploy/backup.sh` diário no servidor; copie os backups para fora.
XML e PDF ficam na Focus.

## LGPD

A descrição do serviço vai para o fisco, para o XML guardado por anos e para o
paciente. Dado de saúde é dado pessoal sensível: uma nota que diz o que a
pessoa tem é um vazamento com carimbo oficial.

O emissor **recusa** descrições com diagnóstico, código CID, nome de
procedimento clínico e afins — a lista está em `src/dps/validate.ts`, e a
comparação ignora acentos e caixa. O catálogo de serviços descreve o
profissional e o tipo de atendimento, não a condição do paciente.

## Desenvolvimento

```bash
# banco local (uma vez)
docker run -d --name fiscal-pg -e POSTGRES_USER=fiscal -e POSTGRES_PASSWORD=fiscal \
  -e POSTGRES_DB=fiscal -p 127.0.0.1:5432:5432 postgres:18
docker exec fiscal-pg psql -U fiscal -d fiscal -c "CREATE DATABASE fiscal_test"
cp .env.example .env          # DATABASE_URL e DATABASE_URL_TEST já apontam para ele

npm run db:migrate            # aplica migrations no banco de desenvolvimento
DATABASE_URL=postgresql://fiscal:fiscal@127.0.0.1:5432/fiscal_test npm run db:deploy
npm run db:seed               # só dados fictícios (usuários admin|recepcao|financeiro|auditor@exemplo.local, senha exemplo123); recusa banco remoto
npm run db:clinica            # a clínica de verdade, a partir de empresas/

npm test
npm run typecheck
npm run build
```

Os testes cobrem as regras de nota e os snapshots, o serviço transacional, a
API (`app.inject` + PostgreSQL de teste), o mapeamento e o cliente da Focus com
HTTP falso, o CEP com ViaCEP simulado e a carga da clínica. Nenhum teste toca a
internet. Os testes de integração rodam só quando `DATABASE_URL_TEST` existe;
sem ele, ficam pulados.

### Domínio (PostgreSQL + Prisma 7)

- `prisma/schema.prisma` — User, Company (com os dados da emissora em
  `fiscalConfigJson`, no formato do `config.json`), Patient, Professional (conselho,
  número, UF, RQEs), ServiceTemplate (catálogo compartilhado pelas empresas),
  CompanyFiscalDefault e CompanyServiceFiscalConfig (códigos tributários por
  empresa e exceções por serviço), Invoice e InvoiceItem (1..N serviços por
  nota, valores em centavos, snapshots), InvoiceStatusHistory, FiscalAttempt,
  AuditLog, WebhookEvent, InvoiceTemplate.
- `src/app/invoices/` — regras puras (`invoice-rules.ts`) e o serviço
  transacional (`invoice-service.ts`): total sempre calculado dos itens, nota
  fora de DRAFT/READY é imutável (triggers no banco também), cada mudança gera
  histórico e auditoria.
- `src/fiscal/invoice-provider.ts` — contrato `InvoiceFiscalProvider`;
  implementações em `src/fiscal/providers/` (`fake` e `focus`). O serviço de
  emissão só conhece o contrato.

## API

`npm run api` sobe a API JSON em `http://127.0.0.1:3100`. Código em `src/api/`;
`criarApp()` é a fábrica que os testes usam com `app.inject`.

- Sessão: `POST /api/auth/login` `{email, senha}` grava um cookie HttpOnly
  assinado; `GET /api/auth/me`; `POST /api/auth/logout`. Senhas com Argon2id.
  Login bloqueia após 5 falhas em 15 minutos. `GET /api/branding` é público
  (só o nome da clínica).
- Papéis: todos leem; ADMIN/RECEPTION/FINANCE criam pacientes e operam notas;
  ADMIN/FINANCE cadastram profissionais, serviços e configuração fiscal; só
  ADMIN liga produção.
- Rotas: `GET /api/companies` · `GET|POST /api/patients`, `PATCH
  /api/patients/:id` (`?q=` busca por nome, e-mail, CPF, CNPJ ou telefone) ·
  `GET /api/cep/:cep` (ViaCEP, com o código IBGE) ·
  `POST /api/companies` e `PUT /api/companies/:id/emitter` (assistente de
  empresa: identidade + dados da emissora; `GET /api/companies/:id/emitter`) ·
  `GET|POST /api/professionals`,
  `PATCH /api/professionals/:id` (com `council` e `rqes`) · `GET|POST
  /api/services`, `PATCH /api/services/:id`, `PUT
  /api/companies/:companyId/services/:serviceId/fiscal-config`, `PUT
  /api/companies/:id/fiscal-default` · `GET|POST /api/invoices`, `GET|PATCH
  /api/invoices/:id`, `POST /api/invoices/:id/status` (só DRAFT/READY), `POST
  /api/invoices/:id/items`, `PATCH|DELETE /api/invoices/:id/items/:itemId`,
  `PUT /api/invoices/:id/payments`.
- Emissão: `GET /api/invoices/:id/description`, `POST /api/invoices/:id/issue`,
  `/sync`, `/cancel` (com `confirmation: "CANCELAR"`), `/apply-template`;
  `GET|POST /api/templates`, `PATCH /api/templates/:id`, `POST
  /api/templates/:id/duplicate`; `GET /api/audit`; `GET /api/reports/*`; `POST
  /api/webhooks/focus`; `POST /api/companies/:id/production` (ADMIN + CNPJ);
  `GET /api/health`.
- Erros: 400 validação (`problemas[]`), 401/403 sessão e papel, 404, 409
  valor único repetido, 422 regra de negócio (`mensagem`).

### Token de acesso (somente leitura)

```bash
node src/api/admin-cli.ts token <email> "<nome>"          # imprime o token uma vez
node src/api/admin-cli.ts token-revogar <email> ["<nome>"]
```

`Authorization: Bearer qf_…`. Só o hash fica no banco. Um token só faz GET em
`/api`, tem o papel do usuário e cai se for revogado ou o usuário desativado.

### MCP (somente leitura)

Servidor MCP por stdio que consulta a API com um token de acesso. Variáveis:
`FISCAL_API_URL` (ex.: `http://127.0.0.1:3100`) e `FISCAL_API_TOKEN` (`qf_…`).

```bash
claude mcp add clinica-fiscal -e FISCAL_API_URL=http://127.0.0.1:3100 -e FISCAL_API_TOKEN=qf_… -- node --experimental-strip-types --no-warnings "$PWD/src/mcp/main.ts"
```

Ferramentas: `faturamento_mes`, `relatorio_notas`, `buscar_nota`,
`notas_com_problema`, `exportar_relatorio`. Nenhuma escreve.

### Provedor fiscal

`FISCAL_PROVIDER=fake` (padrão) autoriza tudo em memória, para desenvolver sem
emitir nada. `FISCAL_PROVIDER=focus` usa a Focus NFe (NFS-e Nacional): token por
empresa e ambiente no `.env`, dados da emissora no cadastro da empresa (ou, para
empresa sem cadastro, em `empresas/<slug>/config.json`).
Não há troca automática de provedor. Suposições do mapeamento Focus marcadas
com `ponytail:` em `src/fiscal/providers/focus/`.

## Interface web

`web/` é um projeto Vite separado (React 19, TypeScript, Tailwind v4,
shadcn/ui, TanStack Query, react-router). Em desenvolvimento o Vite faz proxy
de `/api` para a API, então o cookie de sessão vale sem CORS.

```bash
npm run web          # Vite em http://127.0.0.1:5173
npm run web:build    # produção: web/dist (a API serve atrás do mesmo host)
npm run web:test     # testes das funções de formatação
```

O tema padrão está documentado em `DESIGN.md` (tokens em
`web/src/index.css`) e o contexto de produto em `PRODUCT.md`.

## Armadilhas conhecidas

- **`totTrib` é um `choice`**: `pTotTribSN` (Simples) ou o trio `pTotTrib`,
  nunca os dois — mandar os dois rejeita a nota no schema.
- **Optante do Simples sem retenção não informa alíquota de ISS** (`E0625`).
- **Em homologação o CPF do tomador precisa existir na Receita** (`E0207`); use
  um CPF real ou emita sem tomador.
- **2027:** a regra UB12-10 passa a exigir o grupo IBS/CBS completo de optante
  do Simples a partir de 01/2027. O grupo já sai hoje, mas confira a NT vigente.

## Licença

[GNU AGPL-3.0](./LICENSE). Use, modifique e instale em quantas clínicas quiser.
Quem oferecer uma versão modificada como serviço pela internet precisa
disponibilizar o código-fonte dessas modificações aos usuários. Para uma licença
comercial sem essas obrigações, fale com o autor.

## Referências

- [gov.br/nfse — documentação técnica](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica)
- [Focus NFe — campos da NFS-e Nacional](https://campos.focusnfe.com.br/nfse_nacional/EmissaoDPSXml.html)
