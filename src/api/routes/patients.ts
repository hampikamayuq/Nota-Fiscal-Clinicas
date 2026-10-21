import { z } from 'zod';
import { cnpjValido, cpfValido } from '../../dps/validate.ts';
import type { Rotas } from '../app.ts';
import { PODE, exigirPapel } from '../auth.ts';
import { auditar } from '../auditoria.ts';
import { ErroHttp, invalido, naoEncontrado, semUndefined } from '../erros.ts';
import { CepError, consultarCep } from '../../cep.ts';

const digitos = (s: string) => s.replace(/\D/g, '');
const texto = (max: number) => z.string().trim().max(max).optional().nullable();

const Patient = z.object({
  type: z.enum(['INDIVIDUAL', 'COMPANY', 'FOREIGN', 'UNIDENTIFIED']),
  name: z.string().trim().min(2).max(200),
  cpf: z.string().transform(digitos).refine(cpfValido, 'CPF inválido').optional().nullable(),
  cnpj: z.string().transform(digitos).refine(cnpjValido, 'CNPJ inválido').optional().nullable(),
  foreignDocument: texto(60),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: z.string().transform(digitos).refine((v) => v.length >= 10 && v.length <= 13, 'telefone inválido').optional().nullable(),
  /** CEP (Brasil) ou código postal do exterior; o formato é conferido por tipo em `conferirEndereco`. */
  postalCode: z.string().trim().max(11).optional().nullable(),
  street: texto(120),
  number: texto(20),
  complement: texto(60),
  district: texto(80),
  city: texto(80),
  /** UF (Brasil) ou estado/província/região do exterior. */
  state: z.string().trim().max(60).optional().nullable(),
  municipalityCode: z.string().regex(/^\d{7}$/, 'código IBGE do município tem 7 dígitos').optional().nullable(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'país: código ISO de 2 letras (ex.: US)').optional(),
  active: z.boolean().optional(),
});
const PatientPatch = Patient.partial();
const Params = z.object({ id: z.string().uuid() });
const Busca = z.object({ q: z.string().trim().max(100).optional(), todos: z.enum(['1']).optional() });

/** Pessoa física tem CPF, pessoa jurídica tem CNPJ. Vale no cadastro e na edição (sobre o resultado). */
function conferirDocumento(p: { type: string; cpf?: string | null; cnpj?: string | null }): void {
  if (p.type === 'INDIVIDUAL' && !p.cpf) throw invalido(['cpf: pessoa física precisa de CPF']);
  if (p.type === 'COMPANY' && !p.cnpj) throw invalido(['cnpj: pessoa jurídica precisa de CNPJ']);
}

/** Endereço no Brasil: CEP de 8 dígitos e UF de 2 letras. No exterior, como digitado (o leiaute aceita até 11 e 60). */
function conferirEndereco<T extends { postalCode?: string | null; state?: string | null }>(tipo: string, d: T): T {
  if (tipo === 'FOREIGN') return d;
  const problemas: string[] = [];
  const cep = d.postalCode ? digitos(d.postalCode) : d.postalCode;
  if (cep && cep.length !== 8) problemas.push('postalCode: CEP tem 8 dígitos');
  const uf = d.state ? d.state.toUpperCase() : d.state;
  if (uf && !/^[A-Z]{2}$/.test(uf)) problemas.push('state: UF com 2 letras');
  if (problemas.length) throw invalido(problemas);
  return { ...d, ...(d.postalCode !== undefined ? { postalCode: cep } : {}), ...(d.state !== undefined ? { state: uf } : {}) };
}

export const rotasPatients: Rotas = async (app, ctx) => {
  /** Preenche o endereço no cadastro e traz o IBGE, sem o qual o endereço não vai na nota. */
  app.get('/api/cep/:cep', { preHandler: exigirPapel(PODE.cadastrarPacientes) }, async (req) => {
    const { cep } = z.object({ cep: z.string() }).parse(req.params);
    try {
      return await consultarCep(cep);
    } catch (erro) {
      if (erro instanceof CepError) throw new ErroHttp(400, { erro: 'cep', mensagem: erro.message });
      throw erro;
    }
  });

  app.get('/api/patients', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const { q, todos } = Busca.parse(req.query);
    const d = q ? digitos(q) : '';
    return ctx.prisma.patient.findMany({
      where: {
        ...(todos ? {} : { active: true }),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q, mode: 'insensitive' as const } },
                ...(d.length >= 3 ? [{ cpf: { contains: d } }, { cnpj: { contains: d } }, { phone: { contains: d } }] : []),
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
  });

  app.post('/api/patients', { preHandler: exigirPapel(PODE.cadastrarPacientes) }, async (req, reply) => {
    const lido = semUndefined(Patient.parse(req.body));
    conferirDocumento(lido);
    const dados = conferirEndereco(lido.type, lido);
    const p = await ctx.prisma.patient.create({ data: dados });
    await auditar(ctx.prisma, req, { action: 'PATIENT_CREATED', entityType: 'Patient', entityId: p.id });
    return reply.code(201).send(p);
  });

  /** Um paciente pelo id: a "Nova nota para este paciente" chega por `?paciente=<id>` e precisa do cadastro inteiro. */
  app.get('/api/patients/:id', { preHandler: exigirPapel(PODE.ler) }, async (req) => {
    const { id } = Params.parse(req.params);
    const p = await ctx.prisma.patient.findUnique({ where: { id } });
    if (!p) throw naoEncontrado('Paciente');
    return p;
  });

  app.patch('/api/patients/:id', { preHandler: exigirPapel(PODE.cadastrarPacientes) }, async (req) => {
    const { id } = Params.parse(req.params);
    const lido = semUndefined(PatientPatch.parse(req.body));
    const atual = await ctx.prisma.patient.findUnique({ where: { id } });
    if (!atual) throw naoEncontrado('Paciente');
    conferirDocumento({ ...atual, ...lido });
    const tipo = lido.type ?? atual.type;
    // Tipo mudou (ex.: estrangeiro → pessoa física): CEP e UF antigos têm de valer para o tipo novo.
    const patch = conferirEndereco(tipo, { ...(tipo !== atual.type ? { postalCode: atual.postalCode, state: atual.state } : {}), ...lido });
    const p = await ctx.prisma.patient.update({ where: { id }, data: patch });
    await auditar(ctx.prisma, req, { action: 'PATIENT_UPDATED', entityType: 'Patient', entityId: id, metadata: { campos: Object.keys(patch) } });
    return p;
  });
};
