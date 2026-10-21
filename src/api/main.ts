/**
 * Sobe a API. Ambiente: DATABASE_URL, AUTH_SECRET (>= 32 chars), CLINIC_NAME, API_PORT
 * (3100), API_HOST (127.0.0.1 — atrás de um proxy com TLS para sair do host),
 * API_TRUST_PROXY (IP do proxy; obrigatório para req.ip e Secure corretos) e
 * API_COOKIE_SECURE=sim (força Secure no cookie quando o TLS termina no proxy).
 */

import { ConfigError } from '../config.ts';
import { criarPrisma } from '../db/client.ts';
import { criarApp } from './app.ts';
import { criarEmissionDeps } from './fiscal-setup.ts';

try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env */
}

const authSecret = process.env.AUTH_SECRET ?? '';
if (authSecret.length < 32) {
  throw new ConfigError('AUTH_SECRET não definida ou curta demais (mínimo 32 caracteres). Gere com: openssl rand -base64 48');
}

const prisma = criarPrisma();
const emission = criarEmissionDeps();
const app = await criarApp({
  prisma,
  authSecret,
  logger: true,
  emission,
  webDist: process.env.WEB_DIST ?? './web/dist',
  ...(process.env.CLINIC_NAME ? { clinicName: process.env.CLINIC_NAME } : {}),
  ...(process.env.FOCUS_WEBHOOK_SECRET ? { focusWebhookSecret: process.env.FOCUS_WEBHOOK_SECRET } : {}),
  cookieSecure: process.env.API_COOKIE_SECURE === 'sim' ? true : 'auto',
  // 'true' confia no proxy imediatamente à frente (Render); um IP ou faixa restringe a ele.
  ...(process.env.API_TRUST_PROXY ? { trustProxy: process.env.API_TRUST_PROXY === 'true' ? true : process.env.API_TRUST_PROXY } : {}),
});

const encerrar = () => {
  app
    .close()
    .then(() => prisma.$disconnect())
    .finally(() => process.exit(0));
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

app.log.info({ provedorFiscal: emission.providerName, ambienteFocus: process.env.FOCUS_ENV ?? 'homologation' }, 'provedor fiscal');
await app.listen({ port: Number(process.env.API_PORT ?? 3100), host: process.env.API_HOST ?? '127.0.0.1' });
