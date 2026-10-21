-- Cada DROP pede lock exclusivo na tabela: desiste em vez de enfileirar atrás de uma consulta longa.
SET lock_timeout = '5s';
-- Colunas que nenhum código lia ou gravava.
ALTER TABLE "Company" DROP COLUMN "active";
ALTER TABLE "ProfessionalRQE" DROP COLUMN "active";
ALTER TABLE "ApiToken" DROP COLUMN "lastUsedAt";
ALTER TABLE "Invoice" DROP COLUMN "externalAccessKey";
ALTER TABLE "WebhookEvent" DROP COLUMN "externalEventId";
