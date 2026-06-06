/*
  Warnings:

  - You are about to drop the column `gst_amount` on the `order_sheet_items` table. All the data in the column will be lost.
  - You are about to drop the column `gst_percentage` on the `order_sheet_items` table. All the data in the column will be lost.
  - You are about to drop the column `selling_rate` on the `order_sheet_items` table. All the data in the column will be lost.
  - You are about to drop the column `taxable_amount` on the `order_sheet_items` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[product_id,effective_from]` on the table `master_rate_product` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "order_sheet_items" DROP COLUMN "gst_amount",
DROP COLUMN "gst_percentage",
DROP COLUMN "selling_rate",
DROP COLUMN "taxable_amount",
ADD COLUMN     "final_gst_amount" DECIMAL(12,2),
ADD COLUMN     "final_gst_percentage" DECIMAL(5,2),
ADD COLUMN     "final_selling_rate" DECIMAL(10,2),
ADD COLUMN     "final_taxable_amount" DECIMAL(12,2),
ADD COLUMN     "night_bill_amount" DECIMAL(12,2),
ADD COLUMN     "night_selling_rate" DECIMAL(10,2);

-- CreateIndex
CREATE UNIQUE INDEX "master_rate_product_product_id_effective_from_key" ON "master_rate_product"("product_id", "effective_from");
