-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'READY', 'SUBMITTING', 'PROCESSING', 'AUTHORIZED', 'REJECTED', 'CANCELLATION_REQUESTED', 'CANCELLED', 'CANCELLATION_ERROR');

-- CreateEnum
CREATE TYPE "FiscalAttemptOutcome" AS ENUM ('STARTED', 'AUTHORIZED', 'PROCESSING', 'REJECTED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "createdByUserId" UUID,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "internalReference" TEXT,
    "provider" TEXT,
    "providerReference" TEXT,
    "providerStatus" TEXT,
    "professionalNameSnapshot" TEXT NOT NULL,
    "professionalCrmSnapshot" TEXT NOT NULL,
    "professionalCrmStateSnapshot" TEXT NOT NULL,
    "professionalRqeSnapshot" TEXT,
    "professionalSpecialtySnapshot" TEXT,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "finalFiscalDescription" TEXT,
    "externalNumber" TEXT,
    "externalVerificationCode" TEXT,
    "externalAccessKey" TEXT,
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "competenceDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "serviceTemplateId" UUID,
    "serviceNameSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT NOT NULL,
    "tussCodeSnapshot" TEXT,
    "tussVersionSnapshot" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountCents" INTEGER NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "fiscalConfigSnapshotJson" JSONB,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceStatusHistory" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "fromStatus" "InvoiceStatus",
    "toStatus" "InvoiceStatus" NOT NULL,
    "reason" TEXT,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalAttempt" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "outcome" "FiscalAttemptOutcome" NOT NULL DEFAULT 'STARTED',
    "requestJson" JSONB,
    "responseJson" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "FiscalAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "companyId" UUID,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "companyId" UUID,
    "invoiceId" UUID,
    "providerReference" TEXT,
    "payloadJson" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "Invoice_patientId_idx" ON "Invoice"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_providerReference_key" ON "Invoice"("companyId", "providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_internalReference_key" ON "Invoice"("companyId", "internalReference");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceStatusHistory_invoiceId_idx" ON "InvoiceStatusHistory"("invoiceId");

-- CreateIndex
CREATE INDEX "FiscalAttempt_invoiceId_idx" ON "FiscalAttempt"("invoiceId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_providerReference_idx" ON "WebhookEvent"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_payloadHash_key" ON "WebhookEvent"("provider", "payloadHash");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceStatusHistory" ADD CONSTRAINT "InvoiceStatusHistory_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalAttempt" ADD CONSTRAINT "FiscalAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
