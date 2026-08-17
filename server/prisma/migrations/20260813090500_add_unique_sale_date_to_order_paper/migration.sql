/*
  Warnings:

  - A unique constraint covering the columns `[sale_date]` on the table `order_paper` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "order_paper_sale_date_key" ON "order_paper"("sale_date");
