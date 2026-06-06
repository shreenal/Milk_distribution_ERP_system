/*
  Warnings:

  - Made the column `vehicle_id` on table `purchase_entry` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "purchase_entry" DROP CONSTRAINT "purchase_entry_vehicle_id_fkey";

-- AlterTable
ALTER TABLE "purchase_entry" ALTER COLUMN "vehicle_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "purchase_entry" ADD CONSTRAINT "purchase_entry_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "master_vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
