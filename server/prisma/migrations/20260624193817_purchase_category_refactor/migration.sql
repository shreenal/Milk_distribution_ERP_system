/*
  Safe backfill migration for purchase_category_refactor
*/

-- Drop old unique indexes first
DROP INDEX IF EXISTS "distributor_procurement_rule_distributor_id_brand_id_produc_key";
DROP INDEX IF EXISTS "purchase_entry_purchase_paper_id_distributor_id_vehicle_id__key";

-- 1) Add new columns as NULLABLE first
ALTER TABLE "distributor_procurement_rule"
ADD COLUMN "category" "SupplyCategory";

ALTER TABLE "master_product_group"
ADD COLUMN "category" "SupplyCategory";

ALTER TABLE "purchase_entry"
ADD COLUMN "category" "SupplyCategory";

-- 2) Backfill master_product_group.category
UPDATE "master_product_group"
SET "category" = CASE
  WHEN "name" = 'Milk' THEN 'MILK'::"SupplyCategory"
  ELSE 'NON_MILK'::"SupplyCategory"
END
WHERE "category" IS NULL;

-- 3) Backfill distributor_procurement_rule.category
UPDATE "distributor_procurement_rule" dpr
SET "category" = mpg."category"
FROM "master_product_group" mpg
WHERE dpr."product_group_id" = mpg."id"
  AND dpr."category" IS NULL;

-- 4) Backfill purchase_entry.category
UPDATE "purchase_entry" pe
SET "category" = mpg."category"
FROM "master_product" mp
JOIN "master_product_group" mpg
  ON mpg."id" = mp."product_group_id"
WHERE pe."product_id" = mp."id"
  AND pe."category" IS NULL;

-- 5) Make columns required
ALTER TABLE "distributor_procurement_rule"
ALTER COLUMN "category" SET NOT NULL;

ALTER TABLE "master_product_group"
ALTER COLUMN "category" SET NOT NULL;

ALTER TABLE "purchase_entry"
ALTER COLUMN "category" SET NOT NULL;

-- 6) Recreate new unique indexes
CREATE UNIQUE INDEX "distributor_procurement_rule_distributor_id_category_brand__key"
ON "distributor_procurement_rule"(
  "distributor_id",
  "category",
  "brand_id",
  "product_group_id"
);

CREATE UNIQUE INDEX "purchase_entry_purchase_paper_id_distributor_id_category_ve_key"
ON "purchase_entry"(
  "purchase_paper_id",
  "distributor_id",
  "category",
  "vehicle_id",
  "product_id"
);