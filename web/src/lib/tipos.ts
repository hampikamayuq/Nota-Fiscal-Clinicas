/** Formas que a API devolve. Espelham o schema do Prisma; datas vêm como ISO. */
export type Papel = 'ADMIN' | 'RECEPTION' | 'FINANCE' | 'AUDITOR';
export type Usuario = { id: string; name: string; email: string; role: Papel };

export type Empresa = { id: string; slug: string; legalName: string; tradeName: string | null; cnpj: string; productionEnabled: boolean; configured: boolean };

/** Dados da emissora, no formato de empresas/<slug>/config.json (ConfigFiscalSchema no servidor). */
export type Emissora = {
  cnpj: string; razaoSocial: string; nomeFantasia?: string; inscricaoMunicipal?: string;
  codigoMunicipioEmissor: string; codigoMunicipioPrestacao?: string;
  opSimpNac: '1' | '2' | '3'; regApTribSN?: '1' | '2' | '3'; regEspTrib: string;
  codigoTributacaoNacional: string; codigoTributacaoMunicipal?: string; codigoNbs?: string;
  tributacaoIssqn: string; retencaoIssqn: string; aliquotaIss?: number;
  percentualTributosSimples?: number; percentualTributosFederais?: number; percentualTributosEstaduais?: number; percentualTributosMunicipais?: number;
  pisCofins?: { cst: string; tipoRetencao: string } | null;
  ibsCbs?: { codigoIndicadorOperacao: string; cst: string; classificacaoTributaria: string; indicadorDestinatario: string; usoConsumoPessoal?: string } | null;
};

export type TipoPaciente = 'INDIVIDUAL' | 'COMPANY' | 'FOREIGN' | 'UNIDENTIFIED';
export type Paciente = {
  id: string; type: TipoPaciente; name: string; cpf: string | null; cnpj: string | null; foreignDocument: string | null;
  email: string | null; phone: string | null; postalCode: string | null; street: string | null; number: string | null;
  complement: string | null; district: string | null; city: string | null; state: string | null; municipalityCode: string | null; countryCode: string; active: boolean;
};

export type Rqe = { id?: string; number: string; specialty: string };
export type Profissional = { id: string; name: string; cpf: string | null; council: string; crmNumber: string; crmState: string; specialty: string | null; active: boolean; rqes: Rqe[] };

export type ConfigFiscal = {
  id: string; companyId: string; serviceTemplateId: string; nationalTaxCode: string; municipalTaxCode: string | null; nbsCode: string | null;
  issRate: string | null; taxationType: string; issWithholdingType: string; active: boolean;
};
export type Servico = {
  id: string; name: string; defaultDescription: string; tussCode: string | null; tussVersion: string | null; defaultAmountCents: number;
  allowDescriptionEdit: boolean; allowAmountEdit: boolean; favorite: boolean; active: boolean; category: string | null;
  /** A configuração que vale nesta empresa (exceção do serviço ou padrão da empresa) e de onde ela vem. */
  fiscalConfig: ConfigFiscal | null; fiscalSource: 'service' | 'company' | null; serviceFiscalConfig: ConfigFiscal | null;
};

export type StatusNota = 'DRAFT' | 'READY' | 'SUBMITTING' | 'PROCESSING' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLATION_REQUESTED' | 'CANCELLED' | 'CANCELLATION_ERROR';
export type ItemNota = {
  id: string; serviceTemplateId: string | null; serviceNameSnapshot: string; descriptionSnapshot: string; tussCodeSnapshot: string | null;
  quantity: number; unitAmountCents: number; totalAmountCents: number; sortOrder: number;
};
export type FormaPagamento = 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'TRANSFER' | 'CASH' | 'HEALTH_PLAN';
export type Pagamento = { id?: string; method: FormaPagamento; amountCents: number; sortOrder?: number };
export type Situacao = 'issued' | 'cancelled' | 'all';
export type Contagem = { count: number; cents: number };
export type Resumo = {
  month: string; previousMonth: string;
  companies: { companyId: string; name: string; issued: Contagem; cancelled: Contagem; previous: Contagem }[];
  total: { issued: Contagem; cancelled: Contagem; previous: Contagem };
  today: Contagem; processing: number; errors: number; open: number;
};
export type LinhaRelatorio = {
  id: string; issuedAt: string; number: string | null; verificationCode: string | null;
  company: { id: string; name: string; slug: string }; patient: { name: string; document: string };
  professional: string; services: string; totalCents: number; payments: { method: FormaPagamento; amountCents: number }[];
  status: StatusNota; competenceDate: string | null; pdfUrl: string | null; xmlUrl: string | null;
};
export type Relatorio = {
  month: string; truncated: boolean; rows: LinhaRelatorio[];
  totals: { issued: Contagem; cancelled: Contagem; byMethod: Record<FormaPagamento, number>; unassigned: Contagem; mismatched: Contagem };
};
/** `GET /api/reports/trend`: N meses (crescentes, o último é `until`) por empresa, com zero onde não houve nota. */
export type Tendencia = { until: string; months: string[]; companies: { companyId: string; name: string; months: { month: string; issued: Contagem }[] }[] };

export type Nota = {
  id: string; companyId: string; patientId: string; professionalId: string; status: StatusNota; internalReference: string | null;
  professionalNameSnapshot: string; professionalCouncilSnapshot: string; professionalCrmSnapshot: string; professionalCrmStateSnapshot: string; professionalRqeSnapshot: string | null;
  professionalSpecialtySnapshot: string | null; totalAmountCents: number; finalFiscalDescription: string | null; externalNumber: string | null; externalVerificationCode: string | null;
  provider: string | null; providerStatus: string | null; pdfUrl: string | null; xmlUrl: string | null; lastErrorCode: string | null;
  competenceDate: string | null; createdAt: string; updatedAt: string; submittedAt: string | null; authorizedAt: string | null; cancelledAt: string | null;
  lastErrorMessage: string | null; items: ItemNota[]; payments: Pagamento[];
  /** Só para ADMIN/FINANCE: código e texto da Focus/SEFIN da última tentativa com erro. */
  lastAttemptError?: { code: string | null; message: string | null } | null;
  patient?: { id: string; name: string; cpf: string | null; cnpj: string | null; foreignDocument: string | null; phone?: string | null };
  company?: { id: string; legalName: string; tradeName: string | null; cnpj: string };
  history?: { id: string; fromStatus: StatusNota | null; toStatus: StatusNota; reason: string | null; createdAt: string }[];
};

export type Descricao = { text: string; generated: string; custom: boolean; check: { blocking: string[]; warnings: string[] } };
export type Modelo = {
  id: string; name: string; favorite: boolean; active: boolean;
  items: { id: string; serviceTemplateId: string; quantity: number; unitAmountCents: number | null; sortOrder: number; serviceTemplate: { name: string; defaultAmountCents: number; active: boolean } }[];
};
