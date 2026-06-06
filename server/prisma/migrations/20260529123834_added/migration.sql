/*
  Warnings:

  - You are about to drop the column `distributor_id` on the `master_vehicle` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "master_vehicle" DROP CONSTRAINT "master_vehicle_distributor_id_fkey";

-- DropIndex
DROP INDEX "master_group_vehicle_id_key";

-- AlterTable
ALTER TABLE "master_vehicle" DROP COLUMN "distributor_id";
