/*
  Warnings:

  - You are about to drop the column `product_link_id` on the `order_sheet_product` table. All the data in the column will be lost.
  - You are about to drop the column `resolved_via_fallback` on the `order_sheet_product` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "order_sheet_product" DROP CONSTRAINT "order_sheet_product_product_link_id_fkey";

-- AlterTable
ALTER TABLE "order_sheet_items" ADD COLUMN     "resolved_via_fallback" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "order_sheet_product" DROP COLUMN "product_link_id",
DROP COLUMN "resolved_via_fallback";
