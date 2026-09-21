/*
  Warnings:

  - A unique constraint covering the columns `[order_sheet_id,client_id,product_id]` on the table `order_sheet_items` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "order_sheet_items_order_sheet_id_client_id_product_id_key" ON "order_sheet_items"("order_sheet_id", "client_id", "product_id");
