/*
  Warnings:

  - Made the column `brand_id` on table `product_tray_rule` required. This step will fail if there are existing NULL values in that column.
  - Made the column `product_type_id` on table `product_tray_rule` required. This step will fail if there are existing NULL values in that column.
  - Made the column `packaging_type_id` on table `product_tray_rule` required. This step will fail if there are existing NULL values in that column.
  - Made the column `diary_id` on table `tray_gatepass` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "product_tray_rule" DROP CONSTRAINT "product_tray_rule_brand_id_fkey";

-- DropForeignKey
ALTER TABLE "product_tray_rule" DROP CONSTRAINT "product_tray_rule_packaging_type_id_fkey";

-- DropForeignKey
ALTER TABLE "product_tray_rule" DROP CONSTRAINT "product_tray_rule_product_type_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_gatepass" DROP CONSTRAINT "tray_gatepass_diary_id_fkey";

-- AlterTable
ALTER TABLE "product_tray_rule" ALTER COLUMN "brand_id" SET NOT NULL,
ALTER COLUMN "product_type_id" SET NOT NULL,
ALTER COLUMN "packaging_type_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "tray_gatepass" ALTER COLUMN "diary_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "tray_gatepass" ADD CONSTRAINT "tray_gatepass_diary_id_fkey" FOREIGN KEY ("diary_id") REFERENCES "master_diary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "master_product_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_packaging_type_id_fkey" FOREIGN KEY ("packaging_type_id") REFERENCES "master_packaging_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
