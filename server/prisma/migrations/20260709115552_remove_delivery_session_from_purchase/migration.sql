/*
  Warnings:

  - You are about to drop the column `allocated_qty` on the `purchase_entry` table. All the data in the column will be lost.
  - You are about to drop the column `delivery_session` on the `purchase_paper` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[order_paper_id]` on the table `purchase_paper` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "purchase_paper_order_paper_id_delivery_session_key";

-- AlterTable
ALTER TABLE "purchase_entry" DROP COLUMN "allocated_qty";

-- AlterTable
ALTER TABLE "purchase_paper" DROP COLUMN "delivery_session";

-- CreateIndex
CREATE UNIQUE INDEX "purchase_paper_order_paper_id_key" ON "purchase_paper"("order_paper_id");
