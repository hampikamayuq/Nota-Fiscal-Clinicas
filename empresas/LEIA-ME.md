# Empresas

O caminho mais simples é a interface: Empresas → **Nova empresa**, um
assistente que pergunta tudo que a nota precisa. Esta pasta é o outro caminho:
uma pasta por empresa (CNPJ), com o `config.json` que o contador define
(município, regime, códigos do serviço, PIS/COFINS, IBS/CBS, carga tributária),
importado para o banco por `npm run db:clinica`. Modelo: `config.example.json`
na raiz.

- O **slug** é o nome da pasta (minúsculas, dígitos e hífen). Ele vira o nome
  da variável do token da Focus: `FOCUS_TOKEN_<AMBIENTE>_<SLUG>`, slug em
  maiúsculas e hífen trocado por sublinhado (`clinica-norte` →
  `FOCUS_TOKEN_PRODUCAO_CLINICA_NORTE`).
- `npm run db:clinica` lê todas as pastas, cadastra as empresas que faltam e o
  padrão fiscal de cada uma. Não liga produção, não cria usuário e não
  sobrescreve o que um ADMIN mudou pela interface.
- O certificado A1 **não** fica aqui: está anexado na Focus. Token no `.env`.

Opcional: `cadastro.json` nesta pasta com profissionais, serviços e modelos de
nota para a carga inicial (modelo: `cadastro.example.json` na raiz). Tudo isso
também se cadastra pela interface.

Com mais de uma empresa, confirmar por qual empresa é a nota é o primeiro
passo da recepção, sempre.
