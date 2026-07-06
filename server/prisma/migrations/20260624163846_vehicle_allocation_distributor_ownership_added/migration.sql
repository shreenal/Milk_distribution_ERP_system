/*
  Warnings:

  - A unique constraint covering the columns `[vehicle_allocation_paper_id,vehicle_id,distributor_id,category,product_id]` on the table `vehicle_allocation` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category` to the `vehicle_allocation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `distributor_id` to the `vehicle_allocation` table without a default value. This is not possible if the table is not empty.

*/

-- DropIndex
DROP INDEX "vehicle_allocation_vehicle_allocation_paper_id_vehicle_id_p_key";

-- old vehicle_allocation rows are invalid under new ownership model
DELETE FROM "vehicle_allocation";

-- AlterTable
ALTER TABLE "vehicle_allocation"
ADD COLUMN "category" "SupplyCategory" NOT NULL,
ADD COLUMN "distributor_id" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_allocation_vehicle_allocation_paper_id_vehicle_id_d_key"
ON "vehicle_allocation"("vehicle_allocation_paper_id", "vehicle_id", "distributor_id", "category", "product_id");

-- AddForeignKey
ALTER TABLE "vehicle_allocation"
ADD CONSTRAINT "vehicle_allocation_distributor_id_fkey"
FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;