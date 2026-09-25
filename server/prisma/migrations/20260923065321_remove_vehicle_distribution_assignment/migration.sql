/*
  Warnings:

  - You are about to drop the `vehicle_distribution_assignment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "vehicle_distribution_assignment" DROP CONSTRAINT "vehicle_distribution_assignment_distributor_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_distribution_assignment" DROP CONSTRAINT "vehicle_distribution_assignment_vehicle_allocation_paper_i_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_distribution_assignment" DROP CONSTRAINT "vehicle_distribution_assignment_vehicle_id_fkey";

-- DropTable
DROP TABLE "vehicle_distribution_assignment";
