-- CreateEnum
CREATE TYPE "VehicleAllocationAnomalyReason" AS ENUM ('VEHICLE_INACTIVE', 'NOT_REQUIRED', 'LINK_INACTIVE');

-- CreateEnum
CREATE TYPE "VehicleAllocationAnomalyStatus" AS ENUM ('FLAGGED', 'RECONCILED');

-- AlterTable
ALTER TABLE "vehicle_allocation" ADD COLUMN     "required_qty_at_save" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "vehicle_allocation_anomaly" (
    "id" SERIAL NOT NULL,
    "vehicle_allocation_paper_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "category" "SupplyCategory" NOT NULL,
    "product_id" INTEGER NOT NULL,
    "removed_qty" DECIMAL(10,2) NOT NULL,
    "reason" "VehicleAllocationAnomalyReason" NOT NULL,
    "status" "VehicleAllocationAnomalyStatus" NOT NULL DEFAULT 'FLAGGED',
    "flagged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_allocation_anomaly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_allocation_anomaly_vehicle_allocation_paper_id_stat_idx" ON "vehicle_allocation_anomaly"("vehicle_allocation_paper_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_allocation_anomaly_vehicle_allocation_paper_id_vehi_key" ON "vehicle_allocation_anomaly"("vehicle_allocation_paper_id", "vehicle_id", "distributor_id", "category", "product_id");

-- AddForeignKey
ALTER TABLE "vehicle_allocation_anomaly" ADD CONSTRAINT "vehicle_allocation_anomaly_vehicle_allocation_paper_id_fkey" FOREIGN KEY ("vehicle_allocation_paper_id") REFERENCES "vehicle_allocation_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_allocation_anomaly" ADD CONSTRAINT "vehicle_allocation_anomaly_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_allocation_anomaly" ADD CONSTRAINT "vehicle_allocation_anomaly_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_allocation_anomaly" ADD CONSTRAINT "vehicle_allocation_anomaly_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "master_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
