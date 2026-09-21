/*
  Warnings:

  - Added the required column `pricing_quantity` to the `order_sheet_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pricing_unit` to the `order_sheet_items` table without a default value. This is not possible if the table is not empty.
  - Made the column `units_per_order_unit` on table `order_sheet_items` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `pricing_quantity` to the `product_order_unit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pricing_unit` to the `product_order_unit` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pricing_quantity` to the `purchase_entry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pricing_unit` to the `purchase_entry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `units_per_order_unit` to the `purchase_entry` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('L', 'KG');

-- AlterTable
ALTER TABLE "order_sheet_items" ADD COLUMN     "pricing_quantity" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "pricing_unit" "PricingUnit" NOT NULL,
ALTER COLUMN "units_per_order_unit" SET NOT NULL;

-- AlterTable
ALTER TABLE "product_order_unit" ADD COLUMN     "pricing_quantity" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "pricing_unit" "PricingUnit" NOT NULL;

-- AlterTable
ALTER TABLE "purchase_entry" ADD COLUMN     "pricing_quantity" DECIMAL(10,3) NOT NULL,
ADD COLUMN     "pricing_unit" "PricingUnit" NOT NULL,
ADD COLUMN     "units_per_order_unit" INTEGER NOT NULL;
