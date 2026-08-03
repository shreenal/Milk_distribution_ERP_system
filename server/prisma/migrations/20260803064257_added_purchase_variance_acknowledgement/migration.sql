-- CreateEnum
CREATE TYPE "PurchaseVarianceReason" AS ENUM ('SHORT_SUPPLY', 'EXCESS_SUPPLY', 'DAMAGED_PRODUCT', 'QUALITY_REJECTION', 'MANUAL_ADJUSTMENT', 'OTHER');

-- CreateTable
CREATE TABLE "purchase_variance_acknowledgement" (
    "id" SERIAL NOT NULL,
    "purchase_entry_id" INTEGER NOT NULL,
    "reason" "PurchaseVarianceReason" NOT NULL,
    "remarks" TEXT,
    "acknowledged_by" INTEGER NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_variance_acknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_variance_acknowledgement_purchase_entry_id_key" ON "purchase_variance_acknowledgement"("purchase_entry_id");

-- CreateIndex
CREATE INDEX "purchase_variance_acknowledgement_acknowledged_by_idx" ON "purchase_variance_acknowledgement"("acknowledged_by");

-- AddForeignKey
ALTER TABLE "purchase_variance_acknowledgement" ADD CONSTRAINT "purchase_variance_acknowledgement_purchase_entry_id_fkey" FOREIGN KEY ("purchase_entry_id") REFERENCES "purchase_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_variance_acknowledgement" ADD CONSTRAINT "purchase_variance_acknowledgement_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
