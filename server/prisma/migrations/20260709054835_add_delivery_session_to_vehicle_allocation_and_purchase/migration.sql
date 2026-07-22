/*
  Warnings:

  - A unique constraint covering the columns `[order_paper_id,delivery_session]` on the table `purchase_paper` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[order_paper_id,delivery_session]` on the table `vehicle_allocation_paper` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `delivery_session` to the `purchase_paper` table without a default value. This is not possible if the table is not empty.
  - Added the required column `delivery_session` to the `vehicle_allocation_paper` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "purchase_paper_order_paper_id_key";

-- DropIndex
DROP INDEX "vehicle_allocation_paper_order_paper_id_key";

-- AlterTable
ALTER TABLE "purchase_paper" ADD COLUMN     "delivery_session" "DeliverySession" NOT NULL;

-- AlterTable
ALTER TABLE "vehicle_allocation_paper" ADD COLUMN     "delivery_session" "DeliverySession" NOT NULL;

-- CreateIndex
CREATE INDEX "purchase_paper_order_paper_id_idx" ON "purchase_paper"("order_paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_paper_order_paper_id_delivery_session_key" ON "purchase_paper"("order_paper_id", "delivery_session");

-- CreateIndex
CREATE INDEX "vehicle_allocation_paper_order_paper_id_idx" ON "vehicle_allocation_paper"("order_paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_allocation_paper_order_paper_id_delivery_session_key" ON "vehicle_allocation_paper"("order_paper_id", "delivery_session");
