-- AlterTable
ALTER TABLE "client_tray_transaction" ALTER COLUMN "trays_returned" DROP NOT NULL,
ALTER COLUMN "trays_returned" DROP DEFAULT;
