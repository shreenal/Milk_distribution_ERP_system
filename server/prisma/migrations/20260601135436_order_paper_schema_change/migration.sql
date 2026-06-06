/*
  Warnings:

  - You are about to drop the column `remarks` on the `client_collection` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "client_collection" DROP COLUMN "remarks",
ADD COLUMN     "admin_remarks" TEXT,
ADD COLUMN     "employee_remarks" TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "order_paper" ALTER COLUMN "order_date" SET DATA TYPE DATE,
ALTER COLUMN "sale_date" SET DATA TYPE DATE;
