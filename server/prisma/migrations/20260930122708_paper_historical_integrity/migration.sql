/*
  Warnings:

  - Added the required column `delivery_session` to the `order_sheet` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "dairy_tray_transaction" ALTER COLUMN "trays_returned" DROP NOT NULL,
ALTER COLUMN "trays_returned" DROP DEFAULT;

-- AlterTable
ALTER TABLE "order_sheet" ADD COLUMN     "delivery_session" "DeliverySession" NOT NULL;

-- AlterTable
ALTER TABLE "order_sheet_items" ADD COLUMN     "final_gst_inclusive" BOOLEAN,
ADD COLUMN     "owner_distributor_id" INTEGER;

-- CreateIndex
CREATE INDEX "order_sheet_items_owner_distributor_id_idx" ON "order_sheet_items"("owner_distributor_id");

-- AddForeignKey
ALTER TABLE "order_sheet_items" ADD CONSTRAINT "order_sheet_items_owner_distributor_id_fkey" FOREIGN KEY ("owner_distributor_id") REFERENCES "master_distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
