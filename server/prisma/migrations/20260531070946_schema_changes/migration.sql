/*
  Warnings:

  - You are about to drop the column `group_id` on the `master_client` table. All the data in the column will be lost.
  - Added the required column `billing_group_id` to the `master_client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `delivery_group_id` to the `master_client` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "master_client" DROP CONSTRAINT "master_client_group_id_fkey";

-- AlterTable
ALTER TABLE "master_client" DROP COLUMN "group_id",
ADD COLUMN     "billing_group_id" INTEGER NOT NULL,
ADD COLUMN     "delivery_group_id" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "purchase_entry" ADD COLUMN     "allocated_qty" DECIMAL(10,2);

-- AddForeignKey
ALTER TABLE "master_client" ADD CONSTRAINT "master_client_billing_group_id_fkey" FOREIGN KEY ("billing_group_id") REFERENCES "master_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_client" ADD CONSTRAINT "master_client_delivery_group_id_fkey" FOREIGN KEY ("delivery_group_id") REFERENCES "master_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
