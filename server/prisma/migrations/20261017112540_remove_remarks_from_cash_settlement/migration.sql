/*
  Warnings:

  - You are about to drop the column `remarks` on the `cash_bank_deposit` table. All the data in the column will be lost.
  - You are about to drop the column `remarks` on the `cash_direct_collection` table. All the data in the column will be lost.
  - You are about to drop the column `remarks` on the `cash_route_expense` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "cash_bank_deposit" DROP COLUMN "remarks";

-- AlterTable
ALTER TABLE "cash_direct_collection" DROP COLUMN "remarks";

-- AlterTable
ALTER TABLE "cash_route_expense" DROP COLUMN "remarks";
