/*
  Warnings:

  - You are about to drop the `master_rate_product` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[purchase_paper_id,vehicle_id,product_id]` on the table `purchase_entry` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `purchase_vehicle_gatepass_id` to the `purchase_entry` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "master_rate_product" DROP CONSTRAINT "master_rate_product_product_id_fkey";

-- AlterTable
ALTER TABLE "purchase_entry" ADD COLUMN     "purchase_vehicle_gatepass_id" INTEGER NOT NULL;

-- DropTable
DROP TABLE "master_rate_product";

-- CreateTable
CREATE TABLE "distributor_product_rate" (
    "id" SERIAL NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "purchase_rate" DECIMAL(10,2) NOT NULL,
    "selling_rate" DECIMAL(10,2) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "distributor_product_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "distributor_product_rate_distributor_id_product_id_effectiv_key" ON "distributor_product_rate"("distributor_id", "product_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_entry_purchase_paper_id_vehicle_id_product_id_key" ON "purchase_entry"("purchase_paper_id", "vehicle_id", "product_id");

-- AddForeignKey
ALTER TABLE "distributor_product_rate" ADD CONSTRAINT "distributor_product_rate_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distributor_product_rate" ADD CONSTRAINT "distributor_product_rate_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_purchase_vehicle_gatepass_id_fkey" FOREIGN KEY ("purchase_vehicle_gatepass_id") REFERENCES "purchase_vehicle_gatepass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
