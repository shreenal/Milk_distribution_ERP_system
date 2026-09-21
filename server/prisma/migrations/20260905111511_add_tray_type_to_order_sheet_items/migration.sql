-- AlterTable
ALTER TABLE "order_sheet_items" ADD COLUMN     "tray_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "order_sheet_items" ADD CONSTRAINT "order_sheet_items_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "master_tray_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
