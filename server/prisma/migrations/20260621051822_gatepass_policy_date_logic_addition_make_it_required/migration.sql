/*
  Warnings:

  - Made the column `gatepass_date` on table `purchase_entry` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "purchase_entry" ALTER COLUMN "gatepass_date" SET NOT NULL;
