/*
  Warnings:

  - You are about to drop the column `uupdated_at` on the `master_tray_type` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "master_tray_type" DROP COLUMN "uupdated_at",
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "tray_gatepass" (
    "id" SERIAL NOT NULL,
    "order_sheet_id" INTEGER NOT NULL,
    "tray_type_id" INTEGER NOT NULL,
    "trays_received" INTEGER NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tray_gatepass_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tray_gatepass_order_sheet_id_idx" ON "tray_gatepass"("order_sheet_id");

-- CreateIndex
CREATE INDEX "tray_gatepass_tray_type_id_idx" ON "tray_gatepass"("tray_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "tray_gatepass_order_sheet_id_tray_type_id_key" ON "tray_gatepass"("order_sheet_id", "tray_type_id");

-- AddForeignKey
ALTER TABLE "tray_gatepass" ADD CONSTRAINT "tray_gatepass_order_sheet_id_fkey" FOREIGN KEY ("order_sheet_id") REFERENCES "order_sheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tray_gatepass" ADD CONSTRAINT "tray_gatepass_tray_type_id_fkey" FOREIGN KEY ("tray_type_id") REFERENCES "master_tray_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
