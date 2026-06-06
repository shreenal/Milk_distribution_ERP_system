/*
  Warnings:

  - You are about to drop the column `finalized_at` on the `purchase_paper` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `purchase_paper` table. All the data in the column will be lost.
  - You are about to drop the column `finalized_at` on the `vehicle_capacity_paper` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `vehicle_capacity_paper` table. All the data in the column will be lost.
  - You are about to drop the `tray_gatepass` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "tray_gatepass" DROP CONSTRAINT "tray_gatepass_dairy_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_gatepass" DROP CONSTRAINT "tray_gatepass_order_sheet_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_gatepass" DROP CONSTRAINT "tray_gatepass_tray_type_id_fkey";

-- AlterTable
ALTER TABLE "purchase_paper" DROP COLUMN "finalized_at",
DROP COLUMN "status";

-- AlterTable
ALTER TABLE "vehicle_capacity_paper" DROP COLUMN "finalized_at",
DROP COLUMN "status";

-- DropTable
DROP TABLE "tray_gatepass";

-- DropEnum
DROP TYPE "PurchasePaperStatus";

-- DropEnum
DROP TYPE "VehicleCapacityStatus";

-- CreateTable
CREATE TABLE "purchase_gatepass_tray" (
    "id" SERIAL NOT NULL,
    "purchase_vehicle_gatepass_id" INTEGER NOT NULL,
    "tray_type_id" INTEGER NOT NULL,
    "trays_issued" INTEGER NOT NULL,
    "trays_returned" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_gatepass_tray_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tray_summary_paper" (
    "id" SERIAL NOT NULL,
    "order_paper_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tray_summary_paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tray_summary_row" (
    "id" SERIAL NOT NULL,
    "tray_summary_paper_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "product_group_id" INTEGER NOT NULL,
    "tray_type_id" INTEGER NOT NULL,
    "opening_balance" INTEGER NOT NULL,
    "expected_trays_taken" INTEGER NOT NULL,
    "trays_taken" INTEGER NOT NULL,
    "trays_returned" INTEGER NOT NULL,
    "closing_balance" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tray_summary_row_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_gatepass_tray_purchase_vehicle_gatepass_id_tray_ty_key" ON "purchase_gatepass_tray"("purchase_vehicle_gatepass_id", "tray_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "tray_summary_paper_order_paper_id_key" ON "tray_summary_paper"("order_paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "tray_summary_row_tray_summary_paper_id_vehicle_id_distribut_key" ON "tray_summary_row"("tray_summary_paper_id", "vehicle_id", "distributor_id", "brand_id", "product_group_id", "tray_type_id");

-- AddForeignKey
ALTER TABLE "purchase_gatepass_tray" ADD CONSTRAINT "purchase_gatepass_tray_purchase_vehicle_gatepass_id_fkey" FOREIGN KEY ("purchase_vehicle_gatepass_id") REFERENCES "purchase_vehicle_gatepass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_gatepass_tray" ADD CONSTRAINT "purchase_gatepass_tray_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "master_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tray_summary_paper" ADD CONSTRAINT "tray_summary_paper_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tray_summary_row" ADD CONSTRAINT "tray_summary_row_tray_summary_paper_id_fkey" FOREIGN KEY ("tray_summary_paper_id") REFERENCES "tray_summary_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tray_summary_row" ADD CONSTRAINT "tray_summary_row_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tray_summary_row" ADD CONSTRAINT "tray_summary_row_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tray_summary_row" ADD CONSTRAINT "tray_summary_row_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tray_summary_row" ADD CONSTRAINT "tray_summary_row_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "master_product_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tray_summary_row" ADD CONSTRAINT "tray_summary_row_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "master_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
