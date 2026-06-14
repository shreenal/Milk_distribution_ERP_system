/*
  Warnings:

  - You are about to drop the column `purchase_vehicle_gatepass_id` on the `purchase_entry` table. All the data in the column will be lost.
  - You are about to drop the column `sale_date` on the `purchase_paper` table. All the data in the column will be lost.
  - You are about to drop the `purchase_gatepass_tray` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `purchase_vehicle_gatepass` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[purchase_paper_id,distributor_id,vehicle_id,product_id]` on the table `purchase_entry` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `distributor_id` to the `purchase_entry` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "purchase_entry" DROP CONSTRAINT "purchase_entry_purchase_vehicle_gatepass_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_gatepass_tray" DROP CONSTRAINT "purchase_gatepass_tray_purchase_vehicle_gatepass_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_gatepass_tray" DROP CONSTRAINT "purchase_gatepass_tray_tray_type_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_vehicle_gatepass" DROP CONSTRAINT "purchase_vehicle_gatepass_dairy_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_vehicle_gatepass" DROP CONSTRAINT "purchase_vehicle_gatepass_distributor_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_vehicle_gatepass" DROP CONSTRAINT "purchase_vehicle_gatepass_purchase_paper_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_vehicle_gatepass" DROP CONSTRAINT "purchase_vehicle_gatepass_vehicle_id_fkey";

-- DropIndex
DROP INDEX "purchase_entry_purchase_paper_id_vehicle_id_product_id_key";

-- AlterTable
ALTER TABLE "purchase_entry" DROP COLUMN "purchase_vehicle_gatepass_id",
ADD COLUMN     "distributor_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "purchase_paper" DROP COLUMN "sale_date";

-- DropTable
DROP TABLE "purchase_gatepass_tray";

-- DropTable
DROP TABLE "purchase_vehicle_gatepass";

-- CreateTable
CREATE TABLE "vehicle_distribution_assignment" (
    "id" SERIAL NOT NULL,
    "vehicle_allocation_paper_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_distribution_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_tray" (
    "id" SERIAL NOT NULL,
    "tray_type_id" INTEGER NOT NULL,
    "trays_issued" INTEGER NOT NULL,
    "trays_returned" INTEGER NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_tray_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_distribution_assignment_vehicle_allocation_paper_id_key" ON "vehicle_distribution_assignment"("vehicle_allocation_paper_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "purchase_entry_distributor_id_idx" ON "purchase_entry"("distributor_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_entry_purchase_paper_id_distributor_id_vehicle_id__key" ON "purchase_entry"("purchase_paper_id", "distributor_id", "vehicle_id", "product_id");

-- AddForeignKey
ALTER TABLE "vehicle_distribution_assignment" ADD CONSTRAINT "vehicle_distribution_assignment_vehicle_allocation_paper_i_fkey" FOREIGN KEY ("vehicle_allocation_paper_id") REFERENCES "vehicle_allocation_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_distribution_assignment" ADD CONSTRAINT "vehicle_distribution_assignment_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_distribution_assignment" ADD CONSTRAINT "vehicle_distribution_assignment_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_tray" ADD CONSTRAINT "purchase_tray_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "master_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
