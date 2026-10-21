# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Recepção da clínica** (usuária principal). Emite a nota logo depois do
  atendimento (e cancela quando preciso), no computador do balcão, com o
  paciente esperando; e também pelo celular, fora do balcão ou no fim do dia. O
  celular precisa funcionar de verdade, não só "caber".
- **Financeiro / administração** (sócios, gerente e, no futuro, o contador).
  Revisa, cancela, cadastra profissionais e serviços e mantém a configuração
  fiscal de cada empresa. Trabalha no desktop.
- **Auditoria** (perfil de leitura). Vê notas e trilha, não altera nada.

A recepção não conhece nem deve precisar conhecer vocabulário tributário
(cTribNac, ISSQN, regime). Esse vocabulário existe só nas telas de ADMIN/FINANCE.

## Product Purpose

Emitir e acompanhar as NFS-e (notas fiscais de serviço) de uma clínica de saúde
em poucos passos: empresa, paciente, profissional, serviços, revisão, emissão.
Cada nota sai completa para o paciente pedir reembolso ao plano: nome do
profissional, conselho (CRM, CRO, CRP…), número e UF, RQE quando houver,
procedimentos com código TUSS e valor por item.

O que o produto substitui é a digitação à mão no portal da prefeitura/nacional,
campo a campo, com os dados do paciente. É contra isso que ele é medido: tempo
até a nota pronta, zero redigitação de paciente recorrente, zero nota duplicada,
zero erro de código fiscal escolhido na hora.

Sucesso: a recepção emite uma nota típica (consulta + um procedimento) em menos
de um minuto, sem tocar em campo tributário, e a nota serve ao reembolso sem
retorno do plano.

## Positioning

Um aplicativo operacional de clínica, não um formulário de prefeitura nem um ERP
fiscal. O que outro emissor genérico não copia sem ser reescrito:

- **Várias empresas, um catálogo.** Uma clínica pode faturar por mais de um CNPJ,
  com regimes tributários diferentes. O catálogo de serviços é um só; o que muda
  por empresa é a configuração fiscal, e ela fica escondida da recepção.
- **A nota é documento de reembolso.** Profissional (conselho, número, UF, RQE),
  TUSS e valores individualizados são de primeira classe, copiados em snapshot no
  momento da emissão: mudar o cadastro nunca muda nota antiga.
- **Instalação própria por clínica.** Nome, empresas, profissionais, serviços,
  modelos e tema são da clínica; o código é o mesmo para todas.

## Operating Context

- Clínica de saúde de qualquer especialidade — médica, odontológica, psicologia,
  fisioterapia, nutrição — com consultas e procedimentos. Pacientes pessoa física
  na maioria; às vezes convênio (PJ) ou estrangeiro sem CPF.
- O fluxo real: o atendimento termina, a recepção abre a nota, escolhe a empresa
  (quando há mais de uma), encontra o paciente pela busca, escolhe o
  profissional, adiciona um ou mais serviços (favoritos primeiro), ajusta valor
  ou descrição se preciso, revisa e emite. Pode salvar como rascunho e voltar
  depois.
- Ambientes fiscais: homologação primeiro; produção desabilitada por padrão e
  protegida por mais de uma trava. Todo teste acontece em homologação.
- Depois de emitida, a nota é imutável. Correção é cancelar e emitir outra, com
  motivo e justificativa.
- Ferramentas ao redor: portal nacional da NFS-e, painel da Focus NFe, agenda e
  CRM da clínica como integrações futuras; contabilidade externa define os
  códigos tributários.

## Capabilities and Constraints

- Entidades: empresas, usuários com papéis (ADMIN, RECEPTION, FINANCE, AUDITOR),
  pacientes, profissionais com conselho e um ou mais RQE, catálogo de serviços
  com TUSS e valor padrão, configuração fiscal por empresa (padrão e exceções
  por serviço), modelos de nota, notas com itens e pagamentos, histórico de
  estados, tentativas fiscais, auditoria e eventos de webhook.
- Estados da nota: rascunho, pronta, enviando, processando, emitida, erro,
  cancelando, cancelada, erro no cancelamento. Só rascunho e pronta aceitam
  edição.
- Valores em centavos inteiros; total sempre calculado dos itens.
- Vocabulário da interface em português; nomes de código em inglês (Invoice,
  Patient).
- Terminologia que a recepção vê: nota, paciente (não "tomador"), profissional,
  serviço, pronta, emitida. "Tomador", "emitente", "competência" só aparecem no
  documento da nota e nas telas de ADMIN/FINANCE.
- O sistema não é prontuário: não existem campos para diagnóstico, CID,
  anamnese, resultado de exame ou foto clínica, e a descrição da nota recusa
  quando algo assim é digitado.
- Decisão em aberto: vínculo usuário–empresa. Hoje toda a equipe vê todas as
  empresas da instalação.

## Brand Commitments

- Nome do produto: **Clínica Fiscal**. Na interface aparece como
  "<nome da clínica> Fiscal" (`CLINIC_NAME`).
- Tema padrão documentado em `DESIGN.md`: bancada morna, superfícies brancas,
  grafite nas ações, taupe e blush como apoio; plano por padrão, sem gradientes
  decorativos, sem glassmorphism, sem cartões dentro de cartões. Cada clínica
  troca os tokens de cor em `web/src/index.css`; as fontes são Bricolage
  Grotesque nos títulos e Geist no texto e nos números.
- Voz: direta, em português do Brasil, sem promessa publicitária e sem
  sensacionalismo médico. Botões dizem o que acontece ("Deixar pronta", "Emitir
  NFS-e"); erros dizem o que fazer.

## Evidence on Hand

- Códigos tributários de exemplo em `config.example.json` e nos testes; os reais
  vêm do contador de cada clínica e vivem em `empresas/<slug>/config.json` e na
  configuração fiscal por empresa.
- Dados reais de empresas e profissionais nunca entram no código: ficam em
  `empresas/` (da instalação) e no banco.
- Não há depoimentos, métricas de uso nem capturas de tela de produção. Não
  inventar nenhum.

## Product Principles

1. **A recepção vê paciente, profissional e serviços; o imposto fica atrás da porta.** Qualquer campo tributário numa tela de emissão é defeito.
2. **O documento é a verdade.** O que a nota vai dizer aparece antes de emitir, igual ao que sai, e depois de emitida nada muda.
3. **Idempotente por desenho.** Duplo clique, refresh, retry e webhook repetido nunca geram segunda nota.
4. **Nada fiscal é inventado.** Códigos, alíquotas e regimes vêm do contador e são copiados; a interface só confere formato.
5. **Produção é uma decisão, não um padrão.** Homologação é o chão; produção exige travas explícitas e deixa rastro.
6. **A clínica é configuração, não código.** Nome, empresas, profissionais, serviços e tema mudam sem tocar em código.

## Accessibility & Inclusion

Uso no balcão com pressa e no celular: alvos de toque de pelo menos 44 px, foco
visível, contraste AA em texto pequeno (taupe `#A28A7F` nunca como texto pequeno
sobre claro; `#735F56` para texto pequeno de marca), zoom nunca bloqueado, nada
dependente de hover. Números (CPF, CNPJ, valores) em dígitos tabulares para
conferência rápida.
