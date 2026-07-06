/*
  Warnings:

  - You are about to drop the column `distributor_id` on the `master_group` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "master_group" DROP CONSTRAINT "master_group_distributor_id_fkey";

-- DropIndex
DROP INDEX "master_group_distributor_id_name_key";

-- AlterTable
ALTER TABLE "master_group" DROP COLUMN "distributor_id";
