/*
  Warnings:

  - A unique constraint covering the columns `[purchase_paper_id,delivery_session,vehicle_id,product_link_id]` on the table `purchase_entry` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "purchase_entry_purchase_paper_id_vehicle_id_product_link_id_key";

-- AlterTable
ALTER TABLE "purchase_entry" ADD COLUMN     "delivery_session" "DeliverySession";

-- CreateIndex
CREATE UNIQUE INDEX "purchase_entry_purchase_paper_id_delivery_session_vehicle_i_key" ON "purchase_entry"("purchase_paper_id", "delivery_session", "vehicle_id", "product_link_id");
