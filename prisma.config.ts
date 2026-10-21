import { defineConfig } from 'prisma/config';

// Node 20+ lê .env sem dependência; sem o arquivo, vale só o ambiente.
try {
  process.loadEnvFile('.env');
} catch {
  /* sem .env */
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --experimental-strip-types prisma/seed.ts',
  },
  // process.env direto (e não env()) para `prisma generate` funcionar sem banco.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
