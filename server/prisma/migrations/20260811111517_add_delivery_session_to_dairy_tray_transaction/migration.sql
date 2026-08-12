/*
  Warnings:

  - A unique constraint covering the columns `[dairy_tray_paper_id,delivery_session,vehicle_id,tray_type_id]` on the table `dairy_tray_transaction` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "dairy_tray_transaction_dairy_tray_paper_id_vehicle_id_tray__key";

-- AlterTable
ALTER TABLE "dairy_tray_transaction" ADD COLUMN     "delivery_session" "DeliverySession";

-- CreateIndex
CREATE UNIQUE INDEX "dairy_tray_transaction_dairy_tray_paper_id_delivery_session_key" ON "dairy_tray_transaction"("dairy_tray_paper_id", "delivery_session", "vehicle_id", "tray_type_id");
