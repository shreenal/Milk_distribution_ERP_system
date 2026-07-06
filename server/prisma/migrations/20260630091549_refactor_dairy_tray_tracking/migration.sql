/*
  Warnings:

  - You are about to drop the `purchase_tray` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tray_summary_paper` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tray_summary_row` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "purchase_tray" DROP CONSTRAINT "purchase_tray_tray_type_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_summary_paper" DROP CONSTRAINT "tray_summary_paper_order_paper_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_summary_row" DROP CONSTRAINT "tray_summary_row_brand_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_summary_row" DROP CONSTRAINT "tray_summary_row_distributor_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_summary_row" DROP CONSTRAINT "tray_summary_row_product_group_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_summary_row" DROP CONSTRAINT "tray_summary_row_tray_summary_paper_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_summary_row" DROP CONSTRAINT "tray_summary_row_tray_type_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_summary_row" DROP CONSTRAINT "tray_summary_row_vehicle_id_fkey";

-- DropTable
DROP TABLE "purchase_tray";

-- DropTable
DROP TABLE "tray_summary_paper";

-- DropTable
DROP TABLE "tray_summary_row";

-- CreateTable
CREATE TABLE "dairy_tray_paper" (
    "id" SERIAL NOT NULL,
    "order_paper_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dairy_tray_paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dairy_tray_transaction" (
    "id" SERIAL NOT NULL,
    "dairy_tray_paper_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "tray_type_id" INTEGER NOT NULL,
    "opening_balance" INTEGER NOT NULL DEFAULT 0,
    "trays_taken" INTEGER NOT NULL DEFAULT 0,
    "trays_returned" INTEGER NOT NULL DEFAULT 0,
    "closing_balance" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dairy_tray_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dairy_tray_paper_order_paper_id_key" ON "dairy_tray_paper"("order_paper_id");

-- CreateIndex
CREATE INDEX "dairy_tray_transaction_vehicle_id_idx" ON "dairy_tray_transaction"("vehicle_id");

-- CreateIndex
CREATE INDEX "dairy_tray_transaction_tray_type_id_idx" ON "dairy_tray_transaction"("tray_type_id");

-- CreateIndex
CREATE INDEX "dairy_tray_transaction_dairy_tray_paper_id_idx" ON "dairy_tray_transaction"("dairy_tray_paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "dairy_tray_transaction_dairy_tray_paper_id_vehicle_id_tray__key" ON "dairy_tray_transaction"("dairy_tray_paper_id", "vehicle_id", "tray_type_id");

-- AddForeignKey
ALTER TABLE "dairy_tray_paper" ADD CONSTRAINT "dairy_tray_paper_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dairy_tray_transaction" ADD CONSTRAINT "dairy_tray_transaction_dairy_tray_paper_id_fkey" FOREIGN KEY ("dairy_tray_paper_id") REFERENCES "dairy_tray_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dairy_tray_transaction" ADD CONSTRAINT "dairy_tray_transaction_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dairy_tray_transaction" ADD CONSTRAINT "dairy_tray_transaction_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "master_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
