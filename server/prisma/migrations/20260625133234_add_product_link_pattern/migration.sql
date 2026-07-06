/*
  Warnings:

  - You are about to drop the column `distributor_id` on the `distributor_product_rate` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `distributor_product_rate` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `master_client_rate_product` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[product_link_id,effective_from]` on the table `distributor_product_rate` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[client_id,product_link_id,effective_from]` on the table `master_client_rate_product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[order_sheet_id,client_id,product_link_id]` on the table `order_sheet_items` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[purchase_paper_id,vehicle_id,product_link_id]` on the table `purchase_entry` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `product_link_id` to the `distributor_product_rate` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product_link_id` to the `master_client_rate_product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product_link_id` to the `order_sheet_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `product_link_id` to the `purchase_entry` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "distributor_product_rate" DROP CONSTRAINT "distributor_product_rate_distributor_id_fkey";

-- DropForeignKey
ALTER TABLE "distributor_product_rate" DROP CONSTRAINT "distributor_product_rate_product_id_fkey";

-- DropForeignKey
ALTER TABLE "master_client_rate_product" DROP CONSTRAINT "master_client_rate_product_product_id_fkey";

-- DropIndex
DROP INDEX "distributor_product_rate_distributor_id_product_id_effectiv_key";

-- DropIndex
DROP INDEX "master_client_rate_product_client_id_product_id_effective_f_key";

-- DropIndex
DROP INDEX "order_sheet_items_order_sheet_id_client_id_product_id_key";

-- DropIndex
DROP INDEX "purchase_entry_purchase_paper_id_distributor_id_category_ve_key";

-- AlterTable
ALTER TABLE "distributor_product_rate" DROP COLUMN "distributor_id",
DROP COLUMN "product_id",
ADD COLUMN     "product_link_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "master_client_rate_product" DROP COLUMN "product_id",
ADD COLUMN     "product_link_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "order_sheet_items" ADD COLUMN     "product_link_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "purchase_entry" ADD COLUMN     "product_link_id" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "master_product_link" (
    "id" SERIAL NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_product_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "master_product_link_product_id_idx" ON "master_product_link"("product_id");

-- CreateIndex
CREATE INDEX "master_product_link_distributor_id_idx" ON "master_product_link"("distributor_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_product_link_distributor_id_product_id_key" ON "master_product_link"("distributor_id", "product_id");

-- CreateIndex
CREATE INDEX "distributor_product_rate_product_link_id_idx" ON "distributor_product_rate"("product_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_product_rate_product_link_id_effective_from_key" ON "distributor_product_rate"("product_link_id", "effective_from");

-- CreateIndex
CREATE INDEX "master_client_rate_product_client_id_idx" ON "master_client_rate_product"("client_id");

-- CreateIndex
CREATE INDEX "master_client_rate_product_product_link_id_idx" ON "master_client_rate_product"("product_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "master_client_rate_product_client_id_product_link_id_effect_key" ON "master_client_rate_product"("client_id", "product_link_id", "effective_from");

-- CreateIndex
CREATE INDEX "order_sheet_items_product_link_id_idx" ON "order_sheet_items"("product_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_sheet_items_order_sheet_id_client_id_product_link_id_key" ON "order_sheet_items"("order_sheet_id", "client_id", "product_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_entry_purchase_paper_id_vehicle_id_product_link_id_key" ON "purchase_entry"("purchase_paper_id", "vehicle_id", "product_link_id");

-- AddForeignKey
ALTER TABLE "master_client_rate_product" ADD CONSTRAINT "master_client_rate_product_product_link_id_fkey" FOREIGN KEY ("product_link_id") REFERENCES "master_product_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product_link" ADD CONSTRAINT "master_product_link_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_product_link" ADD CONSTRAINT "master_product_link_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_product_rate" ADD CONSTRAINT "distributor_product_rate_product_link_id_fkey" FOREIGN KEY ("product_link_id") REFERENCES "master_product_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sheet_items" ADD CONSTRAINT "order_sheet_items_product_link_id_fkey" FOREIGN KEY ("product_link_id") REFERENCES "master_product_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_product_link_id_fkey" FOREIGN KEY ("product_link_id") REFERENCES "master_product_link"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
