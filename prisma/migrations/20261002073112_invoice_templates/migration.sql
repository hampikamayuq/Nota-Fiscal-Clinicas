-- CreateTable
CREATE TABLE "InvoiceTemplate" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceTemplateItem" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "serviceTemplateId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountCents" INTEGER,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "InvoiceTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceTemplate_name_key" ON "InvoiceTemplate"("name");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceTemplateItem_templateId_sortOrder_key" ON "InvoiceTemplateItem"("templateId", "sortOrder");

-- AddForeignKey
ALTER TABLE "InvoiceTemplateItem" ADD CONSTRAINT "InvoiceTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InvoiceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceTemplateItem" ADD CONSTRAINT "InvoiceTemplateItem_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

