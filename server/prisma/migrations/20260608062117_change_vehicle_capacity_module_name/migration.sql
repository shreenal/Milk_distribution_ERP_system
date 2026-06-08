/*
  Warnings:

  - You are about to drop the `vehicle_capacity_allocation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vehicle_capacity_paper` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "vehicle_capacity_allocation" DROP CONSTRAINT "vehicle_capacity_allocation_product_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_capacity_allocation" DROP CONSTRAINT "vehicle_capacity_allocation_vehicle_capacity_paper_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_capacity_allocation" DROP CONSTRAINT "vehicle_capacity_allocation_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_capacity_paper" DROP CONSTRAINT "vehicle_capacity_paper_order_paper_id_fkey";

-- DropTable
DROP TABLE "vehicle_capacity_allocation";

-- DropTable
DROP TABLE "vehicle_capacity_paper";

-- CreateTable
CREATE TABLE "vehicle_allocation_paper" (
    "id" SERIAL NOT NULL,
    "order_paper_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_allocation_paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_allocation" (
    "id" SERIAL NOT NULL,
    "vehicle_allocation_paper_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "allocated_qty" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_allocation_paper_order_paper_id_key" ON "vehicle_allocation_paper"("order_paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_allocation_vehicle_allocation_paper_id_vehicle_id_p_key" ON "vehicle_allocation"("vehicle_allocation_paper_id", "vehicle_id", "product_id");

-- AddForeignKey
ALTER TABLE "vehicle_allocation_paper" ADD CONSTRAINT "vehicle_allocation_paper_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_allocation" ADD CONSTRAINT "vehicle_allocation_vehicle_allocation_paper_id_fkey" FOREIGN KEY ("vehicle_allocation_paper_id") REFERENCES "vehicle_allocation_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_allocation" ADD CONSTRAINT "vehicle_allocation_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_allocation" ADD CONSTRAINT "vehicle_allocation_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
