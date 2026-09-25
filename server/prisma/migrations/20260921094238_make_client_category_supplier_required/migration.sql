/*
  Warnings:

  - Made the column `supplier_distributor_id` on table `master_client_category` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "master_client_category" ALTER COLUMN "supplier_distributor_id" SET NOT NULL;
