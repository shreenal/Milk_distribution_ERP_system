/*
  Warnings:

  - A unique constraint covering the columns `[vehicle_allocation_paper_id,vehicle_id,category,product_id]` on the table `vehicle_allocation` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "purchase_entry" ADD COLUMN     "source_allocated_qty" DECIMAL(10,2),
ADD COLUMN     "source_allocation_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_allocation_vehicle_allocation_paper_id_vehicle_id_c_key" ON "vehicle_allocation"("vehicle_allocation_paper_id", "vehicle_id", "category", "product_id");

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_source_allocation_id_fkey" FOREIGN KEY ("source_allocation_id") REFERENCES "vehicle_allocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
