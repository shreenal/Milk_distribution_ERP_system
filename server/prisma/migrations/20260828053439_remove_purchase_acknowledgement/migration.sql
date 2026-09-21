/*
  Warnings:

  - You are about to drop the `purchase_variance_acknowledgement` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "purchase_variance_acknowledgement" DROP CONSTRAINT "purchase_variance_acknowledgement_acknowledged_by_fkey";

-- DropForeignKey
ALTER TABLE "purchase_variance_acknowledgement" DROP CONSTRAINT "purchase_variance_acknowledgement_purchase_entry_id_fkey";

-- DropIndex
DROP INDEX "distributor_transfer_order_paper_id_supplier_distributor_id_key";

-- DropTable
DROP TABLE "purchase_variance_acknowledgement";

-- DropEnum
DROP TYPE "PurchaseVarianceReason";
