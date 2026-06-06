/*
  Warnings:

  - Added the required column `sale_date` to the `order_paper` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "order_paper" ADD COLUMN     "sale_date" TIMESTAMP(3) NOT NULL;
