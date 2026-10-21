-- DropForeignKey
ALTER TABLE "FiscalAttempt" DROP CONSTRAINT "FiscalAttempt_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceStatusHistory" DROP CONSTRAINT "InvoiceStatusHistory_invoiceId_fkey";

-- CreateIndex
CREATE INDEX "Invoice_professionalId_idx" ON "Invoice"("professionalId");

-- CreateIndex
CREATE INDEX "Invoice_createdByUserId_idx" ON "Invoice"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceItem_invoiceId_sortOrder_key" ON "InvoiceItem"("invoiceId", "sortOrder");

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceStatusHistory" ADD CONSTRAINT "InvoiceStatusHistory_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalAttempt" ADD CONSTRAINT "FiscalAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Imutabilidade no banco ──────────────────────────────────────────────────
-- O serviço já recusa; isto cobre qualquer outro caminho de escrita (SQL
-- direto, outro processo). Nota fora de DRAFT/READY: itens não mudam, nota
-- não some, dados fiscais não mudam. Status, carimbos e campos do provedor
-- continuam livres, porque é por eles que a nota avança.

CREATE OR REPLACE FUNCTION invoice_item_guard() RETURNS trigger AS $$
DECLARE
  nota uuid := COALESCE(NEW."invoiceId", OLD."invoiceId");
  st "InvoiceStatus";
BEGIN
  SELECT status INTO st FROM "Invoice" WHERE id = nota;
  IF st IS NOT NULL AND st NOT IN ('DRAFT', 'READY') THEN
    RAISE EXCEPTION 'Nota % em % tem itens imutáveis', nota, st USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_item_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceItem"
  FOR EACH ROW EXECUTE FUNCTION invoice_item_guard();

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
     OR NEW."professionalCrmSnapshot" IS DISTINCT FROM OLD."professionalCrmSnapshot"
     OR NEW."professionalCrmStateSnapshot" IS DISTINCT FROM OLD."professionalCrmStateSnapshot"
     OR NEW."professionalRqeSnapshot" IS DISTINCT FROM OLD."professionalRqeSnapshot"
     OR NEW."professionalSpecialtySnapshot" IS DISTINCT FROM OLD."professionalSpecialtySnapshot" THEN
    RAISE EXCEPTION 'Nota % em % tem dados fiscais imutáveis', OLD.id, OLD.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_immutable
  BEFORE UPDATE OR DELETE ON "Invoice"
  FOR EACH ROW EXECUTE FUNCTION invoice_guard();
