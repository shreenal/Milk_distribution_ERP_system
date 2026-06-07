-- CreateTable
CREATE TABLE "vehicle_group_allocation" (
    "id" SERIAL NOT NULL,
    "vehicle_capacity_paper_id" INTEGER NOT NULL,
    "group_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_group_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_group_allocation_vehicle_capacity_paper_id_group_id_key" ON "vehicle_group_allocation"("vehicle_capacity_paper_id", "group_id");

-- AddForeignKey
ALTER TABLE "vehicle_group_allocation" ADD CONSTRAINT "vehicle_group_allocation_vehicle_capacity_paper_id_fkey" FOREIGN KEY ("vehicle_capacity_paper_id") REFERENCES "vehicle_capacity_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_group_allocation" ADD CONSTRAINT "vehicle_group_allocation_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "master_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_group_allocation" ADD CONSTRAINT "vehicle_group_allocation_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
