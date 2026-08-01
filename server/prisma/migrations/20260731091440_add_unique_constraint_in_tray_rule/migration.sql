/*
  Warnings:

  - A unique constraint covering the columns `[product_group_id,brand_id,product_type_id,packaging_type_id,tray_type_id]` on the table `product_tray_rule` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "product_tray_rule_product_group_id_brand_id_product_type_id_key" ON "product_tray_rule"("product_group_id", "brand_id", "product_type_id", "packaging_type_id", "tray_type_id");
