/*
  Warnings:

  - You are about to drop the column `dairy_id` on the `purchase_entry` table. All the data in the column will be lost.
  - You are about to drop the column `distributor_id` on the `purchase_entry` table. All the data in the column will be lost.
  - You are about to drop the column `gatepass_date` on the `purchase_entry` table. All the data in the column will be lost.
  - You are about to drop the column `serial_number` on the `purchase_entry` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "purchase_entry" DROP CONSTRAINT "purchase_entry_dairy_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_entry" DROP CONSTRAINT "purchase_entry_distributor_id_fkey";

-- DropIndex
DROP INDEX "purchase_entry_purchase_paper_id_distributor_id_vehicle_id_idx";

-- AlterTable
ALTER TABLE "purchase_entry" DROP COLUMN "dairy_id",
DROP COLUMN "distributor_id",
DROP COLUMN "gatepass_date",
DROP COLUMN "serial_number";

-- CreateTable
CREATE TABLE "purchase_vehicle_gatepass" (
    "id" SERIAL NOT NULL,
    "purchase_paper_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "distributor_id" INTEGER NOT NULL,
    "dairy_id" INTEGER NOT NULL,
    "gatepass_date" TIMESTAMP(3) NOT NULL,
    "serial_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_vehicle_gatepass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_vehicle_gatepass_purchase_paper_id_vehicle_id_key" ON "purchase_vehicle_gatepass"("purchase_paper_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "purchase_entry_purchase_paper_id_vehicle_id_idx" ON "purchase_entry"("purchase_paper_id", "vehicle_id");

-- AddForeignKey
ALTER TABLE "purchase_vehicle_gatepass" ADD CONSTRAINT "purchase_vehicle_gatepass_purchase_paper_id_fkey" FOREIGN KEY ("purchase_paper_id") REFERENCES "purchase_paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_vehicle_gatepass" ADD CONSTRAINT "purchase_vehicle_gatepass_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_vehicle_gatepass" ADD CONSTRAINT "purchase_vehicle_gatepass_distributor_id_fkey" FOREIGN KEY ("distributor_id") REFERENCES "master_distributor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_vehicle_gatepass" ADD CONSTRAINT "purchase_vehicle_gatepass_dairy_id_fkey" FOREIGN KEY ("dairy_id") REFERENCES "master_dairy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
