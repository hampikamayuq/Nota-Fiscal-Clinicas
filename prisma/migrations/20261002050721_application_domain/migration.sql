-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'RECEPTION', 'FINANCE', 'AUDITOR');

-- CreateEnum
CREATE TYPE "PatientType" AS ENUM ('INDIVIDUAL', 'COMPANY', 'FOREIGN', 'UNIDENTIFIED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "passwordHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "cnpj" TEXT NOT NULL,
    "productionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "type" "PatientType" NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "cnpj" TEXT,
    "foreignDocument" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "postalCode" TEXT,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'BR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professional" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "crmNumber" TEXT NOT NULL,
    "crmState" TEXT NOT NULL,
    "specialty" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Professional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalRQE" (
    "id" UUID NOT NULL,
    "professionalId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessionalRQE_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTemplate" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "defaultDescription" TEXT NOT NULL,
    "tussCode" TEXT,
    "tussVersion" TEXT,
    "defaultAmountCents" INTEGER NOT NULL,
    "allowDescriptionEdit" BOOLEAN NOT NULL DEFAULT true,
    "allowAmountEdit" BOOLEAN NOT NULL DEFAULT true,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyServiceFiscalConfig" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "serviceTemplateId" UUID NOT NULL,
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

    CONSTRAINT "CompanyServiceFiscalConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_cpf_key" ON "Patient"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Patient_cnpj_key" ON "Patient"("cnpj");

-- CreateIndex
CREATE INDEX "Patient_name_idx" ON "Patient"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Professional_cpf_key" ON "Professional"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Professional_crmNumber_crmState_key" ON "Professional"("crmNumber", "crmState");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalRQE_professionalId_number_key" ON "ProfessionalRQE"("professionalId", "number");

-- CreateIndex
CREATE INDEX "ServiceTemplate_favorite_active_idx" ON "ServiceTemplate"("favorite", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyServiceFiscalConfig_companyId_serviceTemplateId_key" ON "CompanyServiceFiscalConfig"("companyId", "serviceTemplateId");

-- AddForeignKey
ALTER TABLE "ProfessionalRQE" ADD CONSTRAINT "ProfessionalRQE_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyServiceFiscalConfig" ADD CONSTRAINT "CompanyServiceFiscalConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyServiceFiscalConfig" ADD CONSTRAINT "CompanyServiceFiscalConfig_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
