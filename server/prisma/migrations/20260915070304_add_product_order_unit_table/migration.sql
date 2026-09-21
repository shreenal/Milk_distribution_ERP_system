/*
  Warnings:

  - You are about to drop the column `units_per_package` on the `master_product` table. All the data in the column will be lost.
  - You are about to drop the column `units_per_package` on the `order_sheet_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "master_product" DROP COLUMN "units_per_package";

-- AlterTable
ALTER TABLE "order_sheet_items" DROP COLUMN "units_per_package",
ADD COLUMN     "units_per_order_unit" INTEGER;

-- CreateTable
CREATE TABLE "product_order_unit" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "order_unit_type_id" INTEGER NOT NULL,
    "units_per_order_unit" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_order_unit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_order_unit_product_id_key" ON "product_order_unit"("product_id");

-- CreateIndex
CREATE INDEX "product_order_unit_order_unit_type_id_idx" ON "product_order_unit"("order_unit_type_id");

-- AddForeignKey
ALTER TABLE "product_order_unit" ADD CONSTRAINT "product_order_unit_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_order_unit" ADD CONSTRAINT "product_order_unit_order_unit_type_id_fkey" FOREIGN KEY ("order_unit_type_id") REFERENCES "master_packaging_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
