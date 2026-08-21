/*
  Warnings:

  - You are about to drop the column `billing_group_id` on the `distributor_transfer` table. All the data in the column will be lost.
  - You are about to drop the column `billing_group_id` on the `master_client` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[order_paper_id,supplier_distributor_id,owner_distributor_id,product_id]` on the table `distributor_transfer` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "distributor_transfer" DROP CONSTRAINT "distributor_transfer_billing_group_id_fkey";

-- DropForeignKey
ALTER TABLE "master_client" DROP CONSTRAINT "master_client_billing_group_id_fkey";

-- DropIndex
DROP INDEX "distributor_transfer_billing_group_id_idx";

-- DropIndex
DROP INDEX "distributor_transfer_order_paper_id_supplier_distributor_id_key";

-- AlterTable
ALTER TABLE "distributor_transfer" DROP COLUMN "billing_group_id";

-- AlterTable
ALTER TABLE "master_client" DROP COLUMN "billing_group_id";

-- CreateIndex
CREATE UNIQUE INDEX "distributor_transfer_order_paper_id_supplier_distributor_id_key" ON "distributor_transfer"("order_paper_id", "supplier_distributor_id", "owner_distributor_id", "product_id");
