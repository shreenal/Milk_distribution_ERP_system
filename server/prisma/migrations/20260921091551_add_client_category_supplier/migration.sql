-- DropForeignKey
ALTER TABLE "order_sheet_product"
DROP CONSTRAINT "order_sheet_product_product_link_id_fkey";

-- AlterTable
ALTER TABLE "master_client_category"
ADD COLUMN "supplier_distributor_id" INTEGER;

-- Backfill client-category suppliers
UPDATE "master_client_category" cc
SET "supplier_distributor_id" = r."distributor_id"
FROM "master_client" c
JOIN "master_group_supply_rule" r
  ON r."group_id" = c."delivery_group_id"
 AND r."is_active" = true
WHERE cc."client_id" = c."id"
  AND r."category" = cc."category";

-- AlterTable
ALTER TABLE "order_sheet_product"
ALTER COLUMN "product_link_id"
DROP NOT NULL;

-- CreateIndex
CREATE INDEX "master_client_category_supplier_distributor_id_idx" ON "master_client_category" ("supplier_distributor_id");

-- AddForeignKey
ALTER TABLE "master_client_category" ADD CONSTRAINT "master_client_category_supplier_distributor_id_fkey" FOREIGN KEY ("supplier_distributor_id") REFERENCES "master_distributor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_sheet_product" ADD CONSTRAINT "order_sheet_product_product_link_id_fkey" FOREIGN KEY ("product_link_id") REFERENCES "master_product_link" ("id") ON DELETE SET NULL ON UPDATE CASCADE;