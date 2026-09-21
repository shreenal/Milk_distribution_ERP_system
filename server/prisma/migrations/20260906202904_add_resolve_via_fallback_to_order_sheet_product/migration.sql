-- AlterTable
ALTER TABLE "order_sheet_product" ADD COLUMN     "resolved_via_fallback" BOOLEAN NOT NULL DEFAULT false;
