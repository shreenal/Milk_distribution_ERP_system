/*
  Warnings:

  - You are about to drop the column `product_id` on the `product_order_unit` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "product_order_unit" DROP CONSTRAINT "product_order_unit_product_id_fkey";

-- DropIndex
DROP INDEX "product_order_unit_product_id_key";

-- AlterTable
ALTER TABLE "master_product" ADD COLUMN     "product_order_unit_id" INTEGER;

-- AlterTable
ALTER TABLE "product_order_unit" DROP COLUMN "product_id";

-- AddForeignKey
ALTER TABLE "master_product" ADD CONSTRAINT "master_product_product_order_unit_id_fkey" FOREIGN KEY ("product_order_unit_id") REFERENCES "product_order_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
