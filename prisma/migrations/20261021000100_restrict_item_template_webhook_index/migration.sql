-- Apagar um serviço do catálogo anularia o item de nota emitida, e a trigger de
-- imutabilidade recusaria a anulação: só RESTRICT é coerente (o app desativa, não apaga).
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_serviceTemplateId_fkey";
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- O webhook procura a nota pela referência do provedor, sem a empresa.
CREATE INDEX "Invoice_providerReference_idx" ON "Invoice"("providerReference");
