/**
 * Carga inicial da clínica (empresas de empresas/<slug>/config.json e, se
 * existir, empresas/cadastro.json com profissionais, serviços e modelos).
 *
 *   npm run db:clinica
 *
 * Roda também no banco de produção: não cria usuário e só acrescenta o que falta
 * (ver src/db/clinica.ts). Pode repetir.
 */

import { criarPrisma } from '../src/db/client.ts';
import { carregarClinica } from '../src/db/clinica.ts';

try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env */
}

const prisma = criarPrisma();
carregarClinica(prisma, process.env.NFSE_EMPRESAS_DIR ?? './empresas')
  .then((novos) => console.log('clínica ok — criados agora:', novos))
  .catch((erro: unknown) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
