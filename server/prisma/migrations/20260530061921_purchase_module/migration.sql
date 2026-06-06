-- CreateEnum
CREATE TYPE "PurchasePaperStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateEnum
CREATE TYPE "GatepassDatePolicy" AS ENUM ('PREVIOUS_DAY', 'SAME_DAY');

-- AlterTable
ALTER TABLE "master_brand" ADD COLUMN     "gatepass_date_policy" "GatepassDatePolicy" NOT NULL DEFAULT 'SAME_DAY';

-- CreateTable
CREATE TABLE "distributor_procurement_rule" (
    "id" SERIAL NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "product_group_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "distributor_procurement_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_paper" (
    "id" SERIAL NOT NULL,
    "order_paper_id" INTEGER NOT NULL,
    "status" "PurchasePaperStatus" NOT NULL DEFAULT 'DRAFT',
    "sale_date" TIMESTAMP(3) NOT NULL,
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_entry" (
    "id" SERIAL NOT NULL,
    "purchase_paper_id" INTEGER NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER,
    "gatepass_date" TIMESTAMP(3) NOT NULL,
    "gatepass_number" TEXT NOT NULL,
    "dairy_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "purchased_qty" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "distributor_procurement_rule_distributor_id_brand_id_produc_key" ON "distributor_procurement_rule"("distributor_id", "brand_id", "product_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_paper_order_paper_id_key" ON "purchase_paper"("order_paper_id");

-- CreateIndex
CREATE INDEX "purchase_entry_purchase_paper_id_distributor_id_vehicle_id_idx" ON "purchase_entry"("purchase_paper_id", "distributor_id", "vehicle_id");

-- AddForeignKey
ALTER TABLE "distributor_procurement_rule" ADD CONSTRAINT "distributor_procurement_rule_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_procurement_rule" ADD CONSTRAINT "distributor_procurement_rule_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_procurement_rule" ADD CONSTRAINT "distributor_procurement_rule_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "master_product_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_paper" ADD CONSTRAINT "purchase_paper_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_purchase_paper_id_fkey" FOREIGN KEY ("purchase_paper_id") REFERENCES "purchase_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_dairy_id_fkey" FOREIGN KEY ("dairy_id") REFERENCES "master_dairy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
