-- DropForeignKey
ALTER TABLE "dairy_tray_paper" DROP CONSTRAINT "dairy_tray_paper_order_paper_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_paper" DROP CONSTRAINT "purchase_paper_order_paper_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_allocation_paper" DROP CONSTRAINT "vehicle_allocation_paper_order_paper_id_fkey";

-- AddForeignKey
ALTER TABLE "vehicle_allocation_paper" ADD CONSTRAINT "vehicle_allocation_paper_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_paper" ADD CONSTRAINT "purchase_paper_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dairy_tray_paper" ADD CONSTRAINT "dairy_tray_paper_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
