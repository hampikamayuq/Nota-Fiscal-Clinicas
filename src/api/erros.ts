import type { FastifyRequest } from 'fastify';

/** Erro com status HTTP e corpo pronto. O handler global só repassa. */
export type CorpoErro = { erro: string; mensagem: string; problemas?: string[] };

export class ErroHttp extends Error {
  override name = 'ErroHttp';
  readonly statusCode: number;
  readonly corpo: CorpoErro;
  constructor(statusCode: number, corpo: CorpoErro) {
    super(corpo.mensagem);
    this.statusCode = statusCode;
    this.corpo = corpo;
  }
}

export const naoEncontrado = (o: string) => new ErroHttp(404, { erro: 'nao_encontrado', mensagem: `${o} não encontrado(a).` });
export const invalido = (problemas: string[]) => new ErroHttp(400, { erro: 'validacao', mensagem: 'Dados inválidos.', problemas });

type Tabela = { findUnique(args: { where: { id: string }; select: { id: true } }): PromiseLike<unknown> };
/** 404 antes da regra de negócio: a regra (422) só roda sobre registro que existe. */
export async function exigir(tabela: Tabela, id: string, nome: string): Promise<void> {
  if (!(await tabela.findUnique({ where: { id }, select: { id: true } }))) throw naoEncontrado(nome);
}

/** Quem está logado; as rotas que chamam têm `exigirPapel` antes, então a sessão existe. */
export const usuario = (req: FastifyRequest): string => req.sessao!.userId;

/** Tira as chaves `undefined` (o Prisma e o exactOptionalPropertyTypes não as aceitam). */
export type SemUndefined<T> = { [K in keyof T]: Exclude<T[K], undefined> };
export function semUndefined<T extends object>(o: T): SemUndefined<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as SemUndefined<T>;
}
