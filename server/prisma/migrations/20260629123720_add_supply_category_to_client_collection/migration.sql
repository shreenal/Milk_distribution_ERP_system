/*
  Warnings:

  - A unique constraint covering the columns `[order_sheet_id,client_id,category]` on the table `client_collection` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category` to the `client_collection` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "client_collection_order_sheet_id_client_id_key";

-- AlterTable
ALTER TABLE "client_collection" ADD COLUMN     "category" "SupplyCategory" NOT NULL;

-- CreateIndex
CREATE INDEX "client_collection_category_idx" ON "client_collection"("category");

-- CreateIndex
CREATE UNIQUE INDEX "client_collection_order_sheet_id_client_id_category_key" ON "client_collection"("order_sheet_id", "client_id", "category");
