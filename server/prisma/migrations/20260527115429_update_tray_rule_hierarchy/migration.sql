-- DropForeignKey
ALTER TABLE "product_tray_rule" DROP CONSTRAINT "product_tray_rule_brand_id_fkey";

-- DropForeignKey
ALTER TABLE "product_tray_rule" DROP CONSTRAINT "product_tray_rule_packaging_type_id_fkey";

-- DropForeignKey
ALTER TABLE "product_tray_rule" DROP CONSTRAINT "product_tray_rule_product_group_id_fkey";

-- DropForeignKey
ALTER TABLE "product_tray_rule" DROP CONSTRAINT "product_tray_rule_product_type_id_fkey";

-- DropIndex
DROP INDEX "product_tray_rule_product_group_id_brand_id_product_type_id_key";

-- AlterTable
ALTER TABLE "product_tray_rule" ALTER COLUMN "product_group_id" DROP NOT NULL,
ALTER COLUMN "brand_id" DROP NOT NULL,
ALTER COLUMN "product_type_id" DROP NOT NULL,
ALTER COLUMN "packaging_type_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "product_tray_rule_product_group_id_brand_id_product_type_id_idx" ON "product_tray_rule"("product_group_id", "brand_id", "product_type_id", "packaging_type_id");

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "master_product_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "master_brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_product_type_id_fkey" FOREIGN KEY ("product_type_id") REFERENCES "master_product_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tray_rule" ADD CONSTRAINT "product_tray_rule_packaging_type_id_fkey" FOREIGN KEY ("packaging_type_id") REFERENCES "master_packaging_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;
