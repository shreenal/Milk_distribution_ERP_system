-- AlterTable
ALTER TABLE "master_product" ADD COLUMN     "display_order" INTEGER,
ADD COLUMN     "show_by_default" BOOLEAN NOT NULL DEFAULT false;
