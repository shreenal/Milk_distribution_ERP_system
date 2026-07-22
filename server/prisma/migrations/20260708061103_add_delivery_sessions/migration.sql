-- CreateEnum
CREATE TYPE "DeliverySession" AS ENUM ('NIGHT', 'MORNING');

-- AlterTable
ALTER TABLE "master_group" ADD COLUMN     "delivery_session" "DeliverySession" NOT NULL DEFAULT 'NIGHT';
