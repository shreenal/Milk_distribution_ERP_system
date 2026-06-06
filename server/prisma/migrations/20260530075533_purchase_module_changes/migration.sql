/*
  Warnings:

  - You are about to drop the column `gatepass_number` on the `purchase_entry` table. All the data in the column will be lost.
  - Added the required column `purchase_amount` to the `purchase_entry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `purchase_rate` to the `purchase_entry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serial_number` to the `purchase_entry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "purchase_entry" DROP COLUMN "gatepass_number",
ADD COLUMN     "purchase_amount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "purchase_rate" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "serial_number" TEXT NOT NULL;