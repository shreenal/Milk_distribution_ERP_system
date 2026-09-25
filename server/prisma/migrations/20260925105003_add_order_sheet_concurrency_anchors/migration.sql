-- AlterTable
ALTER TABLE "order_sheet" ADD COLUMN     "client_trays_updated_at" TIMESTAMP(3),
ADD COLUMN     "collections_updated_at" TIMESTAMP(3),
ADD COLUMN     "order_items_updated_at" TIMESTAMP(3);
