/**
 * Tarefas de administração que não têm tela (o seed recusa banco remoto):
 *
 *   node src/api/admin-cli.ts usuario <email> "<nome>" <ADMIN|RECEPTION|FINANCE|AUDITOR>
 *       Cria o usuário (ou redefine a senha, se já existe) e imprime a senha
 *       gerada UMA vez. Guarde-a num gerenciador de senhas.
 *   node src/api/admin-cli.ts empresa <slug> <cnpj> "<razão social>" ["<nome fantasia>"]
 *       Cria ou atualiza a empresa (sem os dados da emissora: esses entram pelo
 *       assistente da tela Empresas ou por empresas/<slug>/config.json + db:clinica).
 *   node src/api/admin-cli.ts token <email> "<nome>"
 *       Cria um token de acesso somente leitura (Bearer) e o imprime UMA vez.
 *   node src/api/admin-cli.ts token-revogar <email> ["<nome>"]
 *       Revoga os tokens do usuário (só o de mesmo nome, se informado).
 *
 * No VPS: docker compose -f deploy/docker-compose.yml --env-file .env.production exec app node src/api/admin-cli.ts ...
 */

import { randomBytes } from 'node:crypto';
import { UserRole } from '../generated/prisma/client.ts';
import { cnpjValido } from '../dps/validate.ts';
import { criarPrisma } from '../db/client.ts';
import { gerarToken, hashSenha, hashToken } from './auth.ts';

const PAPEIS = Object.values(UserRole);
type Papel = UserRole;

function falhar(msg: string): never {
  console.error(msg);
  process.exit(2);
}

const [comando, ...args] = process.argv.slice(2);
const prisma = criarPrisma();
try {
  if (comando === 'usuario') {
    const [emailBruto, nome, papel] = args;
    const email = emailBruto?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !nome?.trim() || !PAPEIS.includes(papel as Papel)) {
      falhar(`Uso: usuario <email> "<nome>" <${PAPEIS.join('|')}>`);
    }
    const senha = randomBytes(12).toString('base64url');
    const passwordHash = await hashSenha(senha);
    const u = await prisma.user.upsert({
      where: { email },
      update: { name: nome.trim(), role: papel as Papel, passwordHash, active: true },
      create: { email, name: nome.trim(), role: papel as Papel, passwordHash },
    });
    console.log(`Usuário ${u.email} (${u.role}) pronto. Senha: ${senha}`);
  } else if (comando === 'empresa') {
    const [slug, cnpjBruto, razao, fantasia] = args;
    const cnpj = (cnpjBruto ?? '').replace(/\D/g, '');
    if (!slug || !/^[a-z0-9-]+$/.test(slug) || !cnpjValido(cnpj) || !razao?.trim()) {
      falhar('Uso: empresa <slug-em-minusculas> <cnpj válido> "<razão social>" ["<nome fantasia>"]');
    }
    const dados = { cnpj, legalName: razao.trim(), tradeName: fantasia?.trim() || null };
    const e = await prisma.company.upsert({ where: { slug }, update: dados, create: { slug, ...dados } });
    console.log(`Empresa ${e.slug}: ${e.legalName} (${e.cnpj}), produção ${e.productionEnabled ? 'LIGADA' : 'desligada'}.`);
  } else if (comando === 'token' || comando === 'token-revogar') {
    const [emailBruto, nome] = args;
    const email = emailBruto?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || (comando === 'token' && !nome?.trim())) {
      falhar(comando === 'token' ? 'Uso: token <email> "<nome>"' : 'Uso: token-revogar <email> ["<nome>"]');
    }
    const u = await prisma.user.findUnique({ where: { email } });
    // Revogar vale para inativos também: reativar o usuário não pode reviver tokens antigos.
    if (!u || (comando === 'token' && !u.active)) falhar(`Usuário ${comando === 'token' ? 'ativo ' : ''}${email} não encontrado.`);
    if (comando === 'token') {
      const token = gerarToken();
      await prisma.apiToken.create({ data: { userId: u.id, name: nome!.trim(), tokenHash: hashToken(token) } });
      console.log(`Token "${nome!.trim()}" de ${email}: ${token}\nGuarde agora; ele não aparece de novo.`);
    } else {
      const { count } = await prisma.apiToken.updateMany({
        where: { userId: u.id, revokedAt: null, ...(nome?.trim() ? { name: nome.trim() } : {}) },
        data: { revokedAt: new Date() },
      });
      console.log(`${count} token(s) revogado(s) de ${email}.`);
    }
  } else {
    falhar('Comandos: usuario | empresa | token | token-revogar. Veja o comentário no topo de src/api/admin-cli.ts.');
  }
} catch (erro) {
  if ((erro as { code?: string }).code === 'P2002') falhar('Já existe outro registro com esse e-mail, slug ou CNPJ.');
  throw erro;
} finally {
  await prisma.$disconnect();
}
