/*
  Warnings:

  - You are about to drop the column `distributor_id` on the `master_client` table. All the data in the column will be lost.
  - You are about to drop the column `supply_distributor_id` on the `master_client` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "master_client" DROP CONSTRAINT "master_client_distributor_id_fkey";

-- DropForeignKey
ALTER TABLE "master_client" DROP CONSTRAINT "master_client_supply_distributor_id_fkey";

-- AlterTable
ALTER TABLE "master_client" DROP COLUMN "distributor_id",
DROP COLUMN "supply_distributor_id";
