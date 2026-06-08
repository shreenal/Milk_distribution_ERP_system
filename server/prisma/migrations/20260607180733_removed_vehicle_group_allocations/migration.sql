/*
  Warnings:

  - You are about to drop the `vehicle_group_allocation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "vehicle_group_allocation" DROP CONSTRAINT "vehicle_group_allocation_group_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_group_allocation" DROP CONSTRAINT "vehicle_group_allocation_vehicle_capacity_paper_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_group_allocation" DROP CONSTRAINT "vehicle_group_allocation_vehicle_id_fkey";

-- DropTable
DROP TABLE "vehicle_group_allocation";
