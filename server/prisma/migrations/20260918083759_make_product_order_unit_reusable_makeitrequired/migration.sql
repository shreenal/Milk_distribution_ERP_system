/*
  Warnings:

  - Made the column `product_order_unit_id` on table `master_product` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "master_product" DROP CONSTRAINT "master_product_product_order_unit_id_fkey";

-- AlterTable
ALTER TABLE "master_product" ALTER COLUMN "product_order_unit_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "master_product" ADD CONSTRAINT "master_product_product_order_unit_id_fkey" FOREIGN KEY ("product_order_unit_id") REFERENCES "product_order_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
