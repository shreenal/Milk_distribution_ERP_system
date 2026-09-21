/*
  Warnings:

  - A unique constraint covering the columns `[group_id,product_id,distributor_id]` on the table `distributor_product_priority` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[group_id,product_id,priority]` on the table `distributor_product_priority` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `group_id` to the `distributor_product_priority` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "distributor_product_priority_product_id_distributor_id_key";

-- AlterTable
ALTER TABLE "distributor_product_priority" ADD COLUMN     "group_id" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "distributor_product_priority_group_id_product_id_priority_idx" ON "distributor_product_priority"("group_id", "product_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_product_priority_group_id_product_id_distributo_key" ON "distributor_product_priority"("group_id", "product_id", "distributor_id");

-- CreateIndex
CREATE UNIQUE INDEX "distributor_product_priority_group_id_product_id_priority_key" ON "distributor_product_priority"("group_id", "product_id", "priority");

-- AddForeignKey
ALTER TABLE "distributor_product_priority" ADD CONSTRAINT "distributor_product_priority_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "master_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
