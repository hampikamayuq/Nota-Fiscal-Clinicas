# Códigos de tributação do Rio de Janeiro — serviços de saúde e estética

Extraído da **Tabela de Códigos de Tributação Nacionais para o Rio de Janeiro, v2.0** (Prefeitura do Rio, fev/2026), publicada em https://nfsenacional.prefeitura.rio/ (link "codtribriov2-0"). Filtro: itens 4 (saúde), 5.01/5.02 (veterinária) e 6.01/6.02 (estética). A tabela completa tem 1.073 linhas.

Na DPS, `cTribNac` recebe o código nacional (6 dígitos) e `cTribMun` o complemento municipal (3 dígitos). O Rio **exige** o complemento. A alíquota é a do município; optante do Simples recolhe o ISS no DAS — o contador decide se destaca `pAliq`.

| Código completo | cTribNac | cTribMun | Cód. municipal | Descrição | ISS % | Dedução |
|---|---|---|---|---|---|---|
| 04.01.01.001 | `040101` | `001` | 04.01.01 | Medicina. | 5 | não |
| 04.01.02.001 | `040102` | `001` | 04.01.02 | Biomedicina. | 5 | não |
| 04.02.01.001 | `040201` | `001` | 04.02.01 | Análises clínicas, patologia ou congênere. | 5 | não |
| 04.02.02.001 | `040202` | `001` | 04.02.01 | Análises clínicas, patologia ou congênere. | 5 | não |
| 04.02.03.001 | `040203` | `001` | 04.02.02 | Eletricidade médica ou congênere. | 5 | não |
| 04.02.04.001 | `040204` | `001` | 04.02.03 | Radioterapia ou congênere. | 5 | não |
| 04.02.04.002 | `040204` | `002` | 04.02.04 | Quimioterapia ou congênere. | 5 | não |
| 04.02.04.003 | `040204` | `003` | 04.02.06 | Hemoterapia. | 5 | não |
| 04.02.04.004 | `040204` | `004` | 04.02.07 | Litotripsia. | 5 | não |
| 04.02.05.001 | `040205` | `001` | 04.02.05 | Ultra-sonografia, ressonância magnética, radiologia, tomografia ou congênere. | 5 | não |
| 04.02.05.002 | `040205` | `002` | 04.02.08 | Exames médicos e de saúde em geral. | 5 | não |
| 04.03.01.001 | `040301` | `001` | 04.03.01 | Serviços prestados por hospital. | 5 | não |
| 04.03.01.002 | `040301` | `002` | 04.03.02 | Serviços de saúde ou de assistência médica prestados por hospital apto a efetuar internações. | 2 | não |
| 04.03.02.001 | `040302` | `001` | 04.03.05 | Serviços de laboratório. | 5 | não |
| 04.03.03.001 | `040303` | `001` | 04.03.03 | Serviços prestados por clínica. | 5 | não |
| 04.03.03.002 | `040303` | `002` | 04.03.04 | Serviços de saúde ou de assistência médica prestados por clínica apta a efetuar internações. | 2 | não |
| 04.03.03.003 | `040303` | `003` | 04.03.06 | Serviços prestados por sanatório. | 5 | não |
| 04.03.03.004 | `040303` | `004` | 04.03.07 | Serviços de saúde ou de assistência médica prestados por sanatório apto a efetuar internações. | 2 | não |
| 04.03.03.005 | `040303` | `005` | 04.03.08 | Serviços prestados por manicômio. | 5 | não |
| 04.03.03.006 | `040303` | `006` | 04.03.09 | Serviços de saúde ou de assistência médica prestados por manicômio apto a efetuar internações. | 2 | não |
| 04.03.03.007 | `040303` | `007` | 04.03.10 | Serviços prestados por casa de saúde. | 5 | não |
| 04.03.03.008 | `040303` | `008` | 04.03.11 | Serviços de saúde ou de assistência médica prestados por casa de saúde apta a efetuar internações. | 2 | não |
| 04.03.03.009 | `040303` | `009` | 04.03.12 | Serviços prestados por pronto-socorro. | 5 | não |
| 04.03.03.010 | `040303` | `010` | 04.03.13 | Serviços de saúde ou de assistência médica prestados por pronto-socorro apto a efetuar internações. | 2 | não |
| 04.03.03.011 | `040303` | `011` | 04.03.14 | Serviços prestados por ambulatórios. | 5 | não |
| 04.03.03.012 | `040303` | `012` | 04.03.15 | Serviços prestados por posto de vacinação. | 5 | não |
| 04.04.01.001 | `040401` | `001` | 04.04.01 | Instrumentação cirúrgica. | 5 | não |
| 04.05.01.001 | `040501` | `001` | 04.05.01 | Acupuntura. | 5 | não |
| 04.06.01.001 | `040601` | `001` | 04.06.01 | Enfermagem. | 5 | não |
| 04.06.01.002 | `040601` | `002` | 04.06.02 | Enfermagem - serviços auxiliares. | 5 | não |
| 04.07.01.001 | `040701` | `001` | 04.07.01 | Serviços farmacêuticos. | 5 | não |
| 04.08.01.001 | `040801` | `001` | 04.08.01 | Terapia ocupacional. | 5 | não |
| 04.08.02.001 | `040802` | `001` | 04.08.02 | Fisioterapia. | 5 | não |
| 04.08.03.001 | `040803` | `001` | 04.08.03 | Fonoaudiologia. | 5 | não |
| 04.09.01.001 | `040901` | `001` | 04.09.01 | Terapias de qualquer espécie destinadas ao tratamento físico, orgânico ou mental. | 5 | não |
| 04.10.01.001 | `041001` | `001` | 04.10.01 | Nutrição. | 5 | não |
| 04.11.01.001 | `041101` | `001` | 04.11.01 | Obstetrícia. | 5 | não |
| 04.12.01.001 | `041201` | `001` | 04.12.01 | Odontologia. | 5 | não |
| 04.13.01.001 | `041301` | `001` | 04.13.01 | Ortóptica. | 5 | não |
| 04.14.01.001 | `041401` | `001` | 04.14.01 | Confecção de próteses. | 5 | não |
| 04.15.01.001 | `041501` | `001` | 04.15.01 | Psicanálise. | 5 | não |
| 04.16.01.001 | `041601` | `001` | 04.16.01 | Psicologia. | 5 | não |
| 04.17.01.001 | `041701` | `001` | 04.17.01 | Serviços de casa de repouso, de recuperação, asilo ou congênere. | 5 | não |
| 04.17.02.001 | `041702` | `001` | 04.17.01 | Serviços de casa de repouso, de recuperação, asilo ou congênere. | 5 | não |
| 04.17.03.001 | `041703` | `001` | 04.17.02 | Serviços de creches ou congênere. | 5 | não |
| 04.17.04.001 | `041704` | `001` | 04.17.01 | Serviços de casa de repouso, de recuperação, asilo ou congênere. | 5 | não |
| 04.18.01.001 | `041801` | `001` | 04.18.01 | Inseminação artificial, fertilização in vitro ou congênere. | 5 | não |
| 04.18.01.002 | `041801` | `002` | 04.18.02 | Reprodução assistida. | 5 | não |
| 04.19.01.001 | `041901` | `001` | 04.19.01 | Serviços de banco de sangue ou congênere. | 5 | não |
| 04.19.01.002 | `041901` | `002` | 04.19.02 | Serviços de banco de leite, cordões umbilicais, pele, olhos, demais órgãos ou tecidos ou congênere. | 5 | não |
| 04.19.01.003 | `041901` | `003` | 04.19.03 | Serviços de banco de óvulos, sêmem ou congênere. | 5 | não |
| 04.20.01.001 | `042001` | `001` | 04.20.01 | Coleta de sangue. | 5 | não |
| 04.20.01.002 | `042001` | `002` | 04.20.02 | Coleta de leite, tecidos, sêmen, órgãos ou materiais biológicos de qualquer espécie. | 5 | não |
| 04.21.01.001 | `042101` | `001` | 04.21.01 | Serviços de unidade de atendimento, assistência ou tratamento móve, ou congênere. | 5 | não |
| 04.22.01.001 | `042201` | `001` | 04.22.01 | Plano de medicina de grupo ou congênere. | 5 | não |
| 04.22.01.002 | `042201` | `002` | 04.22.02 | Plano de medicina individual ou congênere. | 5 | não |
| 04.22.01.003 | `042201` | `003` | 04.22.03 | Convênio para prestação de assistência médica, hospitalar, odontológica e congêneres. | 5 | não |
| 04.23.01.001 | `042301` | `001` | 04.23.01 | Plano de saúde cumprido através de serviços de terceiros contratados, credenciados, cooperados ou apenas pagos pelo operador do plano mediante indicação do beneficiário. | 5 | não |
| 05.01.01.001 | `050101` | `001` | 05.01.01 | Medicina veterinária. | 5 | não |
| 05.01.02.001 | `050102` | `001` | 05.01.02 | Zootecnia. | 5 | não |
| 05.02.01.001 | `050201` | `001` | 05.02.01 | Serviços prestados por hospital veterinário. | 5 | não |
| 05.02.02.002 | `050202` | `002` | 05.02.02 | Serviços prestados por clínica veterinária. | 5 | não |
| 05.02.02.003 | `050202` | `003` | 05.02.03 | Serviços prestados por ambulatório veterinário. | 5 | não |
| 05.02.02.004 | `050202` | `004` | 05.02.04 | Serviços prestados por pronto-socorro veterinário. | 5 | não |
| 05.02.02.005 | `050202` | `005` | 05.02.05 | Serviços prestados por unidade de atendimento não especificada, na área veterinária. | 5 | não |
| 06.01.01.001 | `060101` | `001` | 06.01.01 | Barbearia ou serviço congênere. | 5 | não |
| 06.02.01.001 | `060201` | `001` | 06.02.01 | Serviços de esteticistas, tratamento de pele, depilação ou congênere. | 5 | não |

## Exemplo: clínica dermatológica

- **Clínica**: `040303` + `001` — "Serviços prestados por clínica", 5%.
- **Consulta médica** (profissional): `040101` + `001` — "Medicina", 5%.
- **Estética**: `060201` + `001` — "Serviços de esteticistas, tratamento de pele, depilação ou congênere", 5%.

Quem escolhe é o contador, com base no CNAE e na natureza do serviço. O `config.example.json` e as duas empresas em `empresas/` trazem `040101/001`, que é o que a clínica já usava no portal.
