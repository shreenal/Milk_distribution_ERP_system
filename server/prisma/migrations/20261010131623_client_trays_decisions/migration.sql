/*
  Warnings:

  - You are about to drop the column `expected_trays_taken` on the `client_tray_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `remarks` on the `client_tray_transaction` table. All the data in the column will be lost.
  - You are about to drop the column `client_tray_morning_saved_at` on the `order_sheet` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[order_sheet_id,client_id,tray_type_id,category]` on the table `client_tray_transaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category` to the `client_tray_transaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "client_tray_transaction_order_sheet_id_client_id_tray_type__key";

-- AlterTable
ALTER TABLE "client_tray_transaction" DROP COLUMN "expected_trays_taken",
DROP COLUMN "remarks",
ADD COLUMN     "category" "SupplyCategory" NOT NULL;

-- AlterTable
ALTER TABLE "order_sheet" DROP COLUMN "client_tray_morning_saved_at";

-- CreateIndex
CREATE UNIQUE INDEX "client_tray_transaction_order_sheet_id_client_id_tray_type__key" ON "client_tray_transaction"("order_sheet_id", "client_id", "tray_type_id", "category");
