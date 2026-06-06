/*
  Warnings:

  - You are about to drop the column `bill_amount` on the `order_sheet_items` table. All the data in the column will be lost.
  - You are about to drop the column `final_qty` on the `order_sheet_items` table. All the data in the column will be lost.
  - You are about to drop the column `night_qty` on the `order_sheet_items` table. All the data in the column will be lost.
  - You are about to drop the column `trays_received` on the `tray_gatepass` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[product_group_id,brand_id,product_type_id,packaging_type_id]` on the table `product_tray_rule` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[order_sheet_id,tray_type_id,diary_id]` on the table `tray_gatepass` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `trays_issued` to the `tray_gatepass` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "tray_gatepass_order_sheet_id_tray_type_id_key";

-- AlterTable
ALTER TABLE "client_tray_transaction" ADD COLUMN     "expected_trays_taken" INTEGER;

-- AlterTable
ALTER TABLE "master_client_rate_product" ADD COLUMN     "effective_to" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "master_product" ADD COLUMN     "gst_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "is_gst_inclusive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "master_rate_product" ADD COLUMN     "effective_to" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "order_sheet_items" DROP COLUMN "bill_amount",
DROP COLUMN "final_qty",
DROP COLUMN "night_qty",
ADD COLUMN     "delivered_qty" DECIMAL(10,2),
ADD COLUMN     "final_bill_amount" DECIMAL(12,2),
ADD COLUMN     "gst_amount" DECIMAL(12,2),
ADD COLUMN     "gst_percentage" DECIMAL(5,2),
ADD COLUMN     "ordered_qty" DECIMAL(10,2),
ADD COLUMN     "taxable_amount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "tray_gatepass" DROP COLUMN "trays_received",
ADD COLUMN     "diary_id" INTEGER,
ADD COLUMN     "trays_issued" INTEGER NOT NULL,
ADD COLUMN     "trays_returned" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "product_tray_rule_product_group_id_brand_id_product_type_id_key" ON "product_tray_rule"("product_group_id", "brand_id", "product_type_id", "packaging_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "tray_gatepass_order_sheet_id_tray_type_id_diary_id_key" ON "tray_gatepass"("order_sheet_id", "tray_type_id", "diary_id");

-- AddForeignKey
ALTER TABLE "tray_gatepass" ADD CONSTRAINT "tray_gatepass_diary_id_fkey" FOREIGN KEY ("diary_id") REFERENCES "master_diary"("id") ON DELETE SET NULL ON UPDATE CASCADE;
