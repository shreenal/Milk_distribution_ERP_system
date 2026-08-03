/*
  Warnings:

  - Made the column `delivery_session` on table `purchase_entry` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "purchase_entry" ALTER COLUMN "delivery_session" SET NOT NULL;
