/*
  Warnings:

  - Made the column `delivery_session` on table `dairy_tray_transaction` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "dairy_tray_transaction" ALTER COLUMN "delivery_session" SET NOT NULL;
