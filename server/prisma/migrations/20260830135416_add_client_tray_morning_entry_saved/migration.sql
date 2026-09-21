/*
  Warnings:

  - You are about to drop the column `morning_entry_saved_at` on the `order_sheet` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "order_sheet" DROP COLUMN "morning_entry_saved_at",
ADD COLUMN     "client_tray_morning_saved_at" TIMESTAMP(3),
ADD COLUMN     "order_morning_entry_saved_at" TIMESTAMP(3);
