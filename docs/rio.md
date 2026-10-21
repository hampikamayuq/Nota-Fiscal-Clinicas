# Rio de Janeiro e o padrão nacional

O que vale para uma clínica estabelecida no município do Rio de Janeiro
(código IBGE **3304557**). Noutra cidade, confira com o contador o que a
prefeitura exige — em especial o código de tributação municipal.

## Emissão só pelo Emissor Nacional

Desde **01/01/2026** os contribuintes de ISS do Rio emitem NFS-e exclusivamente
no padrão nacional. A Nota Carioca deixou de emitir e ficou disponível apenas
para consulta, cancelamento e substituição de notas com competência até
dezembro de 2025. A guia de ISS passou a ser gerada pelo sistema municipal a
partir do que o ambiente nacional compartilha.

Fontes: Prefeitura do Rio, "Emissão do ISS na Prefeitura terá mudança a partir
de 1º de janeiro de 2026" (prefeitura.rio/fazenda) e o portal
https://nfsenacional.prefeitura.rio/.

Consequência prática: o caminho deste emissor (DPS assinada → API SEFIN
Nacional) não é uma alternativa à Nota Carioca — é o único caminho.

## Código de tributação municipal

O Rio exige o complemento municipal (`cTribMun`, 3 dígitos) junto do código
nacional. A tabela oficial e o recorte de saúde estão em
[`rio-codigos-saude.md`](./rio-codigos-saude.md).

## Retenção de ISS

A tabela de retenções do Rio (`RetencoesRio.xlsx`, jan/2026) lista nove regras
(CTM art. 14). Nenhuma alcança serviço de saúde prestado a pessoa física; a
única ligada a saúde é a retenção por operadoras de planos sobre **corretagem**
de planos (item 10.01.04). Para a clínica, `retencaoIssqn = 1` (não retido).

## Período de transição já encerrado

Para competências de 01/2026 a 04/2026 a prefeitura ainda exigiu a Declaração
de Serviços Prestados com número de RPS. Está fora do escopo deste emissor.

## Exceções municipais

Instituições financeiras (DESIF) e consórcios de pedágio têm tratamento
próprio. Não se aplica à clínica.

## Suporte da prefeitura

nfsenacional.smf@prefeitura.rio
