/**
 * Formas das respostas da Focus NFe para a NFS-e Nacional (`/v2/nfsen`).
 *
 * Tolerantes a campos extras (`passthrough`), rígidas no que lemos. Fonte:
 * doc.focusnfe.com.br/reference/{emitir_dps,consultar_nfse,cancelar_nfse}_nacional.
 */

import { z } from 'zod';

/** A Focus manda números ora como texto, ora como inteiro (ex.: `numero_rps`). */
const texto = z.union([z.string(), z.number()]).transform(String);

/** Corpo de erro HTTP (400, 404, 422): `{ codigo, mensagem }`. */
export const FocusErrorBodySchema = z.object({ codigo: z.string(), mensagem: z.string() }).passthrough();

/** Item de `erros[]` em erro_autorizacao / erro_cancelamento. */
export const FocusErroSchema = z
  .object({ codigo: texto.nullish(), mensagem: z.string(), correcao: z.string().nullish() })
  .passthrough();

/** 200 do GET /v2/nfsen/{ref} em qualquer status (também cobre o 202 da emissão). */
export const FocusStatusBodySchema = z
  .object({
    status: z.string().min(1),
    numero: texto.nullish(),
    codigo_verificacao: texto.nullish(),
    data_emissao: z.string().nullish(),
    url: z.string().nullish(),
    url_danfse: z.string().nullish(),
    caminho_xml_nota_fiscal: z.string().nullish(),
    erros: z.array(FocusErroSchema).nullish(),
  })
  .passthrough();

/** 200 do DELETE /v2/nfsen/{ref}. */
export const FocusCancelBodySchema = z
  .object({ status: z.string().min(1), erros: z.array(FocusErroSchema).nullish() })
  .passthrough();

export type FocusErro = z.infer<typeof FocusErroSchema>;
export type FocusStatusBody = z.infer<typeof FocusStatusBodySchema>;
