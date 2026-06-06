/*
  Warnings:

  - Made the column `dairy_id` on table `master_brand` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "master_brand" DROP CONSTRAINT "master_brand_dairy_id_fkey";

-- AlterTable
ALTER TABLE "master_brand" ALTER COLUMN "dairy_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "master_brand" ADD CONSTRAINT "master_brand_dairy_id_fkey" FOREIGN KEY ("dairy_id") REFERENCES "master_dairy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
