/*
  Warnings:

  - You are about to drop the column `admin_remarks` on the `client_collection` table. All the data in the column will be lost.
  - You are about to drop the column `employee_remarks` on the `client_collection` table. All the data in the column will be lost.
  - You are about to drop the column `office_amount_given` on the `client_collection` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "client_collection" DROP COLUMN "admin_remarks",
DROP COLUMN "employee_remarks",
DROP COLUMN "office_amount_given",
ADD COLUMN     "office_cash_collection" DECIMAL(12,2) NOT NULL DEFAULT 0;
