/*
  Warnings:

  - You are about to drop the `client_payment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "client_payment" DROP CONSTRAINT "client_payment_client_id_fkey";

-- DropTable
DROP TABLE "client_payment";
