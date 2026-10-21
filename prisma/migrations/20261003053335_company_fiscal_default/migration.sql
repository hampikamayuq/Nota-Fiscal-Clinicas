-- CreateTable
CREATE TABLE "CompanyFiscalDefault" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "nationalTaxCode" TEXT NOT NULL,
    "municipalTaxCode" TEXT,
    "nbsCode" TEXT,
    "issRate" DECIMAL(5,2),
    "taxationType" TEXT NOT NULL,
    "issWithholdingType" TEXT NOT NULL,
    "pisCofinsConfigJson" JSONB,
    "ibsCbsConfigJson" JSONB,
    "additionalFiscalConfigJson" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFiscalDefault_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFiscalDefault_companyId_key" ON "CompanyFiscalDefault"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyFiscalDefault" ADD CONSTRAINT "CompanyFiscalDefault_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

