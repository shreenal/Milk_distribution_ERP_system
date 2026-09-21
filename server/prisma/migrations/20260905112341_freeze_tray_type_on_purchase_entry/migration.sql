-- AlterTable
ALTER TABLE "purchase_entry" ADD COLUMN     "tray_type_id" INTEGER;

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "master_tray_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
