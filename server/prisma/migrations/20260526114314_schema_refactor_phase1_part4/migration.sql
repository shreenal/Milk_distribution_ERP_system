/*
  Warnings:

  - You are about to drop the column `diary_id` on the `master_brand` table. All the data in the column will be lost.
  - You are about to drop the column `diary_id` on the `tray_gatepass` table. All the data in the column will be lost.
  - You are about to drop the `master_diary` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[order_sheet_id,tray_type_id,dairy_id]` on the table `tray_gatepass` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "master_brand" DROP CONSTRAINT "master_brand_diary_id_fkey";

-- DropForeignKey
ALTER TABLE "tray_gatepass" DROP CONSTRAINT "tray_gatepass_diary_id_fkey";

-- DropIndex
DROP INDEX "tray_gatepass_order_sheet_id_tray_type_id_diary_id_key";

-- AlterTable
ALTER TABLE "master_brand" DROP COLUMN "diary_id",
ADD COLUMN     "dairy_id" INTEGER;

-- AlterTable
ALTER TABLE "tray_gatepass" DROP COLUMN "diary_id",
ADD COLUMN     "dairy_id" INTEGER;

-- DropTable
DROP TABLE "master_diary";

-- CreateTable
CREATE TABLE "master_dairy" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "master_dairy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_dairy_name_key" ON "master_dairy"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tray_gatepass_order_sheet_id_tray_type_id_dairy_id_key" ON "tray_gatepass"("order_sheet_id", "tray_type_id", "dairy_id");

-- AddForeignKey
ALTER TABLE "tray_gatepass" ADD CONSTRAINT "tray_gatepass_dairy_id_fkey" FOREIGN KEY ("dairy_id") REFERENCES "master_dairy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_brand" ADD CONSTRAINT "master_brand_dairy_id_fkey" FOREIGN KEY ("dairy_id") REFERENCES "master_dairy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
