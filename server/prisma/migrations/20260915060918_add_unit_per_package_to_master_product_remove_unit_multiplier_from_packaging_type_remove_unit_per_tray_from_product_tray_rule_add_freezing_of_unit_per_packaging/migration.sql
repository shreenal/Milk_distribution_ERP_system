/*
  Warnings:

  - You are about to drop the column `unit_multiplier` on the `master_packaging_type` table. All the data in the column will be lost.
  - You are about to drop the column `units_per_tray` on the `order_sheet_items` table. All the data in the column will be lost.
  - You are about to drop the column `units_per_tray` on the `product_tray_rule` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "master_packaging_type" DROP COLUMN "unit_multiplier";

-- AlterTable
ALTER TABLE "master_product" ADD COLUMN     "units_per_package" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "order_sheet_items" DROP COLUMN "units_per_tray",
ADD COLUMN     "units_per_package" INTEGER;

-- AlterTable
ALTER TABLE "product_tray_rule" DROP COLUMN "units_per_tray";
