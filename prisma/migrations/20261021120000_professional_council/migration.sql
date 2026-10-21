-- Conselho profissional. A nota deixa de assumir CRM (médicos) e carimba a
-- sigla do conselho de cada profissional (CRM, CRO, CRP, CREFITO…). O número
-- continua em crmNumber/crmState: o nome da coluna é histórico.
ALTER TABLE "Professional" ADD COLUMN "council" TEXT NOT NULL DEFAULT 'CRM';
ALTER TABLE "Invoice" ADD COLUMN "professionalCouncilSnapshot" TEXT NOT NULL DEFAULT 'CRM';

DROP INDEX "Professional_crmNumber_crmState_key";
CREATE UNIQUE INDEX "Professional_council_crmNumber_crmState_key" ON "Professional"("council", "crmNumber", "crmState");

-- O snapshot do conselho é imutável como os outros (ver harden_invoice_domain).
CREATE OR REPLACE FUNCTION invoice_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('DRAFT', 'READY') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Nota % em % não pode ser excluída', OLD.id, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."patientId" IS DISTINCT FROM OLD."patientId"
     OR NEW."professionalId" IS DISTINCT FROM OLD."professionalId"
     OR NEW."totalAmountCents" IS DISTINCT FROM OLD."totalAmountCents"
     OR NEW."finalFiscalDescription" IS DISTINCT FROM OLD."finalFiscalDescription"
     OR NEW."competenceDate" IS DISTINCT FROM OLD."competenceDate"
     OR NEW."professionalNameSnapshot" IS DISTINCT FROM OLD."professionalNameSnapshot"
     OR NEW."professionalCouncilSnapshot" IS DISTINCT FROM OLD."professionalCouncilSnapshot"
     OR NEW."professionalCrmSnapshot" IS DISTINCT FROM OLD."professionalCrmSnapshot"
     OR NEW."professionalCrmStateSnapshot" IS DISTINCT FROM OLD."professionalCrmStateSnapshot"
     OR NEW."professionalRqeSnapshot" IS DISTINCT FROM OLD."professionalRqeSnapshot"
     OR NEW."professionalSpecialtySnapshot" IS DISTINCT FROM OLD."professionalSpecialtySnapshot" THEN
    RAISE EXCEPTION 'Nota % em % tem dados fiscais imutáveis', OLD.id, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
