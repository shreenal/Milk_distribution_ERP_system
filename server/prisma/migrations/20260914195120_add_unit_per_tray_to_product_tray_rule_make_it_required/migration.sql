/*
  Warnings:

  - Made the column `units_per_tray` on table `product_tray_rule` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "product_tray_rule" ALTER COLUMN "units_per_tray" SET NOT NULL;
