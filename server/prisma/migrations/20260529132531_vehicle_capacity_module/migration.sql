-- CreateEnum
CREATE TYPE "VehicleCapacityStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateTable
CREATE TABLE "vehicle_capacity_paper" (
    "id" SERIAL NOT NULL,
    "order_paper_id" INTEGER NOT NULL,
    "status" "VehicleCapacityStatus" NOT NULL DEFAULT 'DRAFT',
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_capacity_paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_capacity_allocation" (
    "id" SERIAL NOT NULL,
    "vehicle_capacity_paper_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "allocated_qty" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_capacity_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_capacity_paper_order_paper_id_key" ON "vehicle_capacity_paper"("order_paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_capacity_allocation_vehicle_capacity_paper_id_vehic_key" ON "vehicle_capacity_allocation"("vehicle_capacity_paper_id", "vehicle_id", "product_id");

-- AddForeignKey
ALTER TABLE "vehicle_capacity_paper" ADD CONSTRAINT "vehicle_capacity_paper_order_paper_id_fkey" FOREIGN KEY ("order_paper_id") REFERENCES "order_paper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_capacity_allocation" ADD CONSTRAINT "vehicle_capacity_allocation_vehicle_capacity_paper_id_fkey" FOREIGN KEY ("vehicle_capacity_paper_id") REFERENCES "vehicle_capacity_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_capacity_allocation" ADD CONSTRAINT "vehicle_capacity_allocation_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_capacity_allocation" ADD CONSTRAINT "vehicle_capacity_allocation_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
