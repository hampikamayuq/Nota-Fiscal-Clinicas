-- Dados da emissora (município, regime, códigos, PIS/COFINS, IBS/CBS, carga
-- tributária) passam a viver no banco, preenchidos pelo assistente "Nova
-- empresa" ou importados de empresas/<slug>/config.json por `db:clinica`.
ALTER TABLE "Company" ADD COLUMN "fiscalConfigJson" JSONB;
